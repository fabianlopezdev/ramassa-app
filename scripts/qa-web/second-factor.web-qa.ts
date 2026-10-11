/**
 * The second factor through the web admin (RAPP-233): a wrong code is
 * explained, and an admin's reset makes the next sign-in set up a new one.
 */
import { expect, test } from '@playwright/test';
import {
  completeSecondFactor,
  forgetSecondFactorSecret,
  queryDatabase,
  signIn,
  signOut,
  STAFF_EMAIL,
  waitForHydration,
} from './session';
import { totpCode } from './totp';

const ADMIN_EMAIL = 'laia.ferrer@example.test';
const STAFF_ID = '5eed0000-0000-4000-8000-000000000002';
const startedAt = new Date().toISOString();

test.setTimeout(120_000);

test.afterAll(() => {
  // Back to the seed's authenticator, whatever the reset test left behind.
  queryDatabase(`
    delete from auth.mfa_factors where user_id = '${STAFF_ID}';
    insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
    values (gen_random_uuid(), '${STAFF_ID}', 'Ramassà (seed)', 'totp', 'verified', 'JBSWY3DPEHPK3PXP', now(), now());
    delete from public.audit_log where created_at >= '${startedAt}'::timestamptz and action = 'team.second_factor_reset';
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
    await page.goto('/settings?tab=staff');
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
});
