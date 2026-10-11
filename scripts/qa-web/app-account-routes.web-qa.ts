/**
 * Where each account type lands in the app (RAPP-232), through the real app's
 * web build and its real email-code sign-in.
 */
import { expect, test } from '@playwright/test';
import { PARTICIPANT_FIXTURES } from '@ramassa/shared/testing';
import { ENTITY_EMAIL, queryDatabase, signInPlayer, STAFF_EMAIL } from './session';

const STAFF_ID = '5eed0000-0000-4000-8000-000000000002';
const ORG_ID = '5eed0000-0000-4000-8000-000000000000';

test.setTimeout(120_000);

function giveStaffOnly(codes: readonly string[]): void {
  queryDatabase(`
    delete from public.team_member_permissions where profile_id = '${STAFF_ID}';
    insert into public.team_member_permissions (org_id, profile_id, permission_code)
    select '${ORG_ID}'::uuid, '${STAFF_ID}'::uuid, unnest(array[${codes.map((code) => `'${code}'`).join(', ')}]::text[]);
  `);
}

/** Back to the seed: the Staff preset plus the RAPP-230 adjustment. */
function restoreStaff(): void {
  queryDatabase(`
    delete from public.team_member_permissions where profile_id = '${STAFF_ID}';
    insert into public.team_member_permissions (org_id, profile_id, permission_code)
    select '${ORG_ID}'::uuid, '${STAFF_ID}'::uuid, permission_code
      from public.permission_preset_defaults where builtin_key = 'staff'
    union select '${ORG_ID}'::uuid, '${STAFF_ID}'::uuid, unnest(array['participants.view_sensitive', 'rgpd.erase']);
  `);
}

test.afterAll(restoreStaff);

test.describe.serial('app areas by account type', () => {
  test('a player lands in the player tabs', async ({ page }) => {
    await signInPlayer(page, PARTICIPANT_FIXTURES[0]!.email);
    await expect(page.getByRole('tab', { name: 'Home', exact: true })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('an entity contact sees the web portal notice, never the player tabs', async ({ page }) => {
    await signInPlayer(page, ENTITY_EMAIL);
    await expect(page.getByTestId('entity-portal-notice')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('tab', { name: 'Home', exact: true })).toHaveCount(0);
  });

  test('a team member with attendance lands on attendance', async ({ page }) => {
    restoreStaff();
    await signInPlayer(page, STAFF_EMAIL);
    await expect(page.getByTestId('attendance-sign-out')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('attendance-open-messages')).toBeVisible();
  });

  test('attendance without the inbox hides the messages link', async ({ page }) => {
    giveStaffOnly(['attendance.mark']);
    await signInPlayer(page, STAFF_EMAIL);
    await expect(page.getByTestId('attendance-sign-out')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('attendance-open-messages')).toHaveCount(0);
  });

  test('the inbox alone lands on the conversations', async ({ page }) => {
    giveStaffOnly(['messages.inbox']);
    await signInPlayer(page, STAFF_EMAIL);
    await expect(page.getByTestId('staff-conversations-back')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('attendance-sign-out')).toHaveCount(0);
  });

  test('a team member with no app screen is pointed to the web dashboard', async ({ page }) => {
    giveStaffOnly(['settings.branding']);
    await signInPlayer(page, STAFF_EMAIL);
    await expect(page.getByTestId('team-home-notice')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('team-home-notice-sign-out').click();
    await expect(page).toHaveURL(/\/$|\/email-login|\/\?/, { timeout: 30_000 });
  });
});
