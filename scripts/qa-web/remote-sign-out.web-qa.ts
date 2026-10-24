/**
 * Remote sign-out through the web admin (RAPP-234): an admin ends a staff
 * member's sessions, and her already open tab is signed out on its next check.
 */
import { expect, test } from '@playwright/test';
import { queryDatabase, signIn, STAFF_EMAIL } from './session';

const ADMIN_EMAIL = 'laia.ferrer@example.test';
const STAFF_ID = '5eed0000-0000-4000-8000-000000000002';
const startedAt = new Date().toISOString();

test.setTimeout(120_000);

test.afterAll(() => {
  queryDatabase(`
    update public.profiles set sessions_valid_after = null where id = '${STAFF_ID}';
    delete from public.audit_log
     where created_at >= '${startedAt}'::timestamptz and action = 'sessions.sign_out_everywhere';
  `);
});

test('an admin signs a staff member out everywhere, and her open tab ends', async ({
  page,
  browser,
}) => {
  const staffContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const staffPage = await staffContext.newPage();
  await signIn(staffPage, STAFF_EMAIL);
  await expect(staffPage.getByRole('navigation').first()).toBeVisible();

  await signIn(page, ADMIN_EMAIL);
  await page.goto('/team');
  await page.getByRole('button', { name: `Sign out everywhere ${STAFF_EMAIL}` }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('status').filter({ hasText: /\S/ })).toContainText(
    'Signed out everywhere.',
  );
  expect(queryDatabase(`select count(*) from auth.sessions where user_id = '${STAFF_ID}'`)).toBe(
    '0',
  );

  // Her tab checks its session when she comes back to it, or on reload.
  await staffPage.reload();
  await expect(staffPage).toHaveURL(/\/login/, { timeout: 30_000 });
  await staffContext.close();
});
