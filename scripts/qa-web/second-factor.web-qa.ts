/**
 * The second factor through the web admin (RAPP-233): a wrong code is
 * explained, and an admin's reset makes the next sign-in set up a new one. On
 * staging, with the switch on, a test account skips it and a real one does not
 * (RAPP-628).
 */
import { expect, test } from '@playwright/test';
import { ONBOARDING_DESIGNER_EMAIL } from '@ramassa/shared/testing';
import {
  completeSecondFactor,
  forgetSecondFactorSecret,
  queryDatabase,
  signIn,
  signInFirstFactor,
  signOut,
  STAFF_EMAIL,
  waitForHydration,
} from './session';
import { totpCode } from './totp';

const ADMIN_EMAIL = 'laia.ferrer@example.test';
const STAFF_ID = '5eed0000-0000-4000-8000-000000000002';
const startedAt = new Date().toISOString();
const SWITCH_OFF = `delete from private.staging_switches where name = 'test_accounts_skip_second_factor';`;

test.setTimeout(120_000);

test.afterAll(() => {
  // Back to the seed's authenticator, whatever the reset test left behind.
  queryDatabase(`
    delete from auth.mfa_factors where user_id = '${STAFF_ID}';
    insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
    values (gen_random_uuid(), '${STAFF_ID}', 'Ramassà (seed)', 'totp', 'verified', 'JBSWY3DPEHPK3PXP', now(), now());
    delete from public.audit_log where created_at >= '${startedAt}'::timestamptz and action = 'team.second_factor_reset';
    ${SWITCH_OFF}
  `);
  // Later specs in this worker sign her in with the seed secret again.
  forgetSecondFactorSecret(STAFF_EMAIL);
});

test.describe.serial('the second factor', () => {
  test('a wrong code is refused with plain words and its code', async ({ page }) => {
    await signOut(page);
    await page.goto('/login');
    await waitForHydration(page);
    // The same steps signIn takes, stopping before the second factor.
    const usePassword = page.getByRole('button', { name: /password/i }).first();
    await expect(async () => {
      await usePassword.click();
      await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await page.locator('input[type="email"]').fill(STAFF_EMAIL);
    await page.locator('input[type="password"]').fill('ramassa-dev-password');
    await page.locator('button[type="submit"]').click();
    const screen = page.getByTestId('second-factor');
    await expect(screen).toBeVisible({ timeout: 30_000 });
    const wrong = totpCode('JBSWY3DPEHPK3PXP') === '000000' ? '111111' : '000000';
    await page.locator('#second-factor-code').fill(wrong);
    await screen.locator('button[type="submit"]').click();
    await expect(screen.getByRole('alert')).toContainText('That code did not match');
    await expect(screen.getByRole('alert')).toContainText('AUTH-8');
    await completeSecondFactor(page);
    await expect(page.getByRole('navigation').first()).toBeVisible();
  });

  test('after an admin resets it, the next sign-in sets up a new authenticator', async ({
    page,
    browser,
  }) => {
    await signIn(page, ADMIN_EMAIL);
    await page.goto('/team');
    await page.getByRole('button', { name: `Reset second factor ${STAFF_EMAIL}` }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toContainText(
      'Second factor reset',
    );
    expect(
      queryDatabase(`select count(*) from auth.mfa_factors where user_id = '${STAFF_ID}'`),
    ).toBe('0');

    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const staffPage = await context.newPage();
    await signIn(staffPage, STAFF_EMAIL);
    // signIn completed the new set-up through the secret the screen showed.
    await expect(staffPage.getByRole('navigation').first()).toBeVisible();
    expect(
      queryDatabase(`select count(*) from auth.mfa_factors
        where user_id = '${STAFF_ID}' and status = 'verified' and secret <> 'JBSWY3DPEHPK3PXP'`),
    ).toBe('1');
    await context.close();
  });

  test('on staging, a test account skips the authenticator step and a real one does not', async ({
    page,
    browser,
  }) => {
    queryDatabase(`
      insert into private.staging_switches (name, enabled)
      values ('test_accounts_skip_second_factor', true)
      on conflict (name) do update set enabled = excluded.enabled, changed_at = now();
    `);
    try {
      // Records whether the authenticator step was ever drawn, even for a frame.
      await page.addInitScript({
        content: `new MutationObserver(() => {
          if (document.querySelector('[data-testid="second-factor"]') !== null) {
            sessionStorage.setItem('rapp628-saw-second-factor', 'yes');
          }
        }).observe(document, { childList: true, subtree: true });`,
      });
      await signInFirstFactor(page, ONBOARDING_DESIGNER_EMAIL);
      await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
      await expect(page.getByRole('navigation').first()).toBeVisible();
      await expect(page.getByTestId('second-factor')).toHaveCount(0);
      expect(
        await page.evaluate<string | null>("sessionStorage.getItem('rapp628-saw-second-factor')"),
      ).toBeNull();

      const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
      const staffPage = await context.newPage();
      await signInFirstFactor(staffPage, STAFF_EMAIL);
      await expect(staffPage.getByTestId('second-factor')).toBeVisible({ timeout: 30_000 });
      await context.close();
    } finally {
      queryDatabase(SWITCH_OFF);
    }
  });
});
