/**
 * The onboarding design role in the admin (RAPP-615), signed in as the seeded
 * design account: it lands on the onboarding page, its menu holds the
 * onboarding and the test players only, every other admin URL sends it back,
 * and its roster holds test players only.
 */

import { expect, test } from '@playwright/test';
import {
  ONBOARDING_DESIGNER_EMAIL,
  PARTICIPANT_FIXTURES,
  seedUserId,
  TEST_PLAYER_EMAIL,
  TEST_PLAYER_NAME,
} from '@ramassa/shared/testing';
import {
  completeSecondFactor,
  countInDatabase,
  signIn,
  signInFirstFactor,
  STAFF_EMAIL,
} from './session';

test.setTimeout(120_000);

test.describe.serial('the onboarding design role', () => {
  test('lands on the onboarding page and its menu holds its two areas only', async ({ page }) => {
    await signIn(page, ONBOARDING_DESIGNER_EMAIL);
    await expect(page).toHaveURL(/\/onboarding$/, { timeout: 30_000 });
    await expect(page.getByTestId('onboarding-design-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Registration', level: 1 })).toBeVisible();
    // The question builder and the authorization are both on the page.
    await expect(page.getByRole('heading', { name: 'Questions', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Authorization', level: 2 })).toBeVisible();

    const menu = page.getByRole('navigation', { name: 'Staff navigation' });
    const items = menu.getByRole('link');
    await expect(items).toHaveCount(2);
    await expect(menu.getByRole('link', { name: 'Participants' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Registration' })).toBeVisible();
  });

  test('every other admin URL sends it back to the onboarding', async ({ page }) => {
    // The data each forbidden page's loader asks for. The redirect is thrown in
    // the staff layout's beforeLoad, so none of these requests may leave the
    // browser, from the first step of signing in on (RAPP-615). The listener
    // is attached before signing in, so the landing after the second factor
    // is recorded too.
    const forbiddenDataRequests = [
      '/rest/v1/rpc/get_impact_report',
      '/rest/v1/rpc/list_staff_conversations',
      '/rest/v1/rpc/list_staff_members',
      '/rest/v1/invites',
    ];
    const requested: string[] = [];
    page.on('request', (request) => {
      requested.push(new URL(request.url()).pathname);
    });
    await signIn(page, ONBOARDING_DESIGNER_EMAIL);
    await expect(page).toHaveURL(/\/onboarding$/, { timeout: 30_000 });
    for (const path of ['/dashboard', '/settings', '/data', '/participants/invites', '/messages']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/onboarding$/, { timeout: 20_000 });
      await expect(page.getByTestId('onboarding-design-page')).toBeVisible({ timeout: 20_000 });
    }
    // The guard itself asked who she is: the recording works.
    expect(requested).toContain('/rest/v1/rpc/my_permissions');
    expect(requested.filter((pathname) => forbiddenDataRequests.includes(pathname))).toEqual([]);
  });

  test('a staff member asks for no page data before her second factor', async ({ page }) => {
    // Attached before the first step: the password form, a page opened by URL
    // while she is not verified yet, the second factor and the landing are all
    // recorded, in order.
    const requested: string[] = [];
    page.on('request', (request) => {
      requested.push(new URL(request.url()).pathname);
    });
    await signInFirstFactor(page, STAFF_EMAIL);
    await expect(page.getByTestId('second-factor')).toBeVisible({ timeout: 30_000 });
    // Opened by URL at aal1: the staff layout sends her back to the second
    // factor before the dashboard's loader runs.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/, { timeout: 20_000 });
    await completeSecondFactor(page, STAFF_EMAIL);
    // Then the page she asked for.
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await expect
      .poll(() => requested.includes('/rest/v1/rpc/get_impact_report'), { timeout: 20_000 })
      .toBe(true);
    const verified = requested.findIndex((pathname) =>
      /^\/auth\/v1\/factors\/[^/]+\/verify$/.test(pathname),
    );
    expect(verified).toBeGreaterThan(-1);
    // The dashboard's data is asked for only once the session is verified.
    expect(requested.indexOf('/rest/v1/rpc/get_impact_report')).toBeGreaterThan(verified);
    // Navigating on asks the database nothing more for the guard.
    const readsBefore = requested.filter(
      (pathname) => pathname === '/rest/v1/rpc/my_permissions',
    ).length;
    const menu = page.getByRole('navigation', { name: 'Staff navigation' });
    await menu.locator('a[href="/participants"]').click();
    await expect(page).toHaveURL(/\/participants/, { timeout: 20_000 });
    await menu.locator('a[href="/dashboard"]').click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
    expect(requested.filter((pathname) => pathname === '/rest/v1/rpc/my_permissions')).toHaveLength(
      readsBefore,
    );
  });

  test('its roster holds the test player only, marked as a test', async ({ page }) => {
    await signIn(page, ONBOARDING_DESIGNER_EMAIL);
    await page.goto('/participants');
    await expect(page.getByRole('heading', { name: 'Test players' })).toBeVisible({
      timeout: 20_000,
    });
    const testPlayer = page.getByRole('row').filter({
      hasText: `${TEST_PLAYER_NAME.firstName} ${TEST_PLAYER_NAME.lastName}`,
    });
    await expect(testPlayer).toBeVisible();
    await expect(testPlayer.getByText('Test', { exact: true })).toBeVisible();
    const realPlayer = PARTICIPANT_FIXTURES[0]!;
    await expect(page.getByText(realPlayer.lastName)).toHaveCount(0);
    // The queues and the invitation list hold real participants: not offered.
    await expect(page.getByRole('link', { name: 'Invitations' })).toHaveCount(0);

    // Opened by URL, a real player is not found.
    await page.goto(`/participants/${seedUserId(realPlayer.ordinal)}`);
    await expect(
      page.getByRole('heading', { name: 'We could not find this participant' }),
    ).toBeVisible({
      timeout: 20_000,
    });
  });

  test('a new participant is a test player, with the option locked on', async ({ page }) => {
    await signIn(page, ONBOARDING_DESIGNER_EMAIL);
    await page.goto('/participants/new');
    const option = page.getByRole('checkbox', { name: 'Test player' });
    await expect(option).toBeChecked({ timeout: 20_000 });
    await expect(option).toBeDisabled();
  });

  // RAPP-617: delete her, and create her again with the same address.
  test('deletes the test player completely and creates her again', async ({ page }) => {
    const fullName = `${TEST_PLAYER_NAME.firstName} ${TEST_PLAYER_NAME.lastName}`;
    await signIn(page, ONBOARDING_DESIGNER_EMAIL);
    await page.goto('/participants');
    await page.getByRole('link', { name: fullName }).click();
    await expect(page.getByRole('heading', { name: fullName, level: 1 })).toBeVisible({
      timeout: 20_000,
    });
    // A real player has no such button; the test player does.
    await page.getByRole('button', { name: 'Delete the test player' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('This cannot be undone.');
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page).toHaveURL(/\/participants\/?(\?.*)?$/, { timeout: 30_000 });
    expect(
      countInDatabase(`select count(*) from auth.users where email = '${TEST_PLAYER_EMAIL}'`),
    ).toBe(0);

    await page.goto('/participants/new');
    await page.getByLabel('First name').fill(TEST_PLAYER_NAME.firstName);
    await page.getByLabel('Last name').fill(TEST_PLAYER_NAME.lastName);
    await page.getByLabel('Email').fill(TEST_PLAYER_EMAIL);
    await page.getByRole('button', { name: 'Create the invitation' }).click();
    await expect(page.getByRole('heading', { name: 'Invitation created', level: 2 })).toBeVisible({
      timeout: 20_000,
    });
    expect(
      countInDatabase(
        `select count(*) from public.profiles p join auth.users u on u.id = p.id where u.email = '${TEST_PLAYER_EMAIL}' and p.is_test_account`,
      ),
    ).toBe(1);
  });

  test('a real player has no delete button for an admin either', async ({ page }) => {
    await signIn(page, 'laia.ferrer@example.test');
    await page.goto(`/participants/${seedUserId(PARTICIPANT_FIXTURES[0]!.ordinal)}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Delete the test player' })).toHaveCount(0);
  });
});
