/**
 * Live permissions in the web admin (RAPP-237): when someone changes a team
 * member's permissions, her open tab follows at once, with no reload and no
 * sign-out. The change is written the way every permission write lands: her
 * permission rows change and her team_member_access row moves, which is the
 * Realtime event the app listens to.
 */
import { expect, test } from '@playwright/test';
import { queryDatabase, signIn } from './session';

const MEMBER_EMAIL = 'nuria.serra@example.test';
const MEMBER_ID = '5eed0000-0000-4000-8000-000000000003';
const ORG_ID = '5eed0000-0000-4000-8000-000000000000';

test.setTimeout(120_000);

function setFeedbackView(granted: boolean): void {
  queryDatabase(
    granted
      ? `insert into public.team_member_permissions (org_id, profile_id, permission_code)
         values ('${ORG_ID}', '${MEMBER_ID}', 'feedback.view') on conflict do nothing;
         update public.team_member_access set updated_at = now() where profile_id = '${MEMBER_ID}';`
      : `delete from public.team_member_permissions
          where profile_id = '${MEMBER_ID}' and permission_code = 'feedback.view';
         update public.team_member_access set updated_at = now() where profile_id = '${MEMBER_ID}';`,
  );
}

test.afterAll(() => setFeedbackView(true));

test('a permission change reaches her open tab without a reload', async ({ page }) => {
  await signIn(page, MEMBER_EMAIL);
  const nav = page.getByRole('navigation').first();
  const feedback = nav.getByRole('link', { name: 'Feedback' });
  await expect(feedback).toBeVisible({ timeout: 30_000 });
  // The Realtime channel subscribes after the profile loads; give it a moment.
  await page.waitForTimeout(2_000);

  const marker = await page.evaluate(() => {
    const value = crypto.randomUUID();
    (globalThis as unknown as { __noReload: string }).__noReload = value;
    return value;
  });

  setFeedbackView(false);
  await expect(feedback).toHaveCount(0, { timeout: 15_000 });

  setFeedbackView(true);
  await expect(nav.getByRole('link', { name: 'Feedback' })).toBeVisible({ timeout: 15_000 });

  // The same page all along: nothing reloaded it.
  expect(
    await page.evaluate(() => (globalThis as unknown as { __noReload?: string }).__noReload),
  ).toBe(marker);
});
