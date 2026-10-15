/**
 * The team's access in the app (RAPP-405), through the web build: an admin
 * gives a staff member the Coach preset plus one switch, and it reads as
 * adjusted; a new preset is created, edited while a person uses it, applied
 * to her by choice, and deleted. Expected values come from the database.
 */
import { expect, test, type Page } from '@playwright/test';
import { completeSecondFactor, queryDatabase, SEED_TOTP_SECRET, signInPlayer } from './session';
import { totpCode } from './totp';

test.setTimeout(240_000);

const ADMIN_EMAIL = 'laia.ferrer@example.test';
const MEMBER_ID = '5eed0000-0000-4000-8000-000000000003';
const ORG_ID = '5eed0000-0000-4000-8000-000000000000';
const PRESET_NAME = `Material app ${Date.now().toString(36)}`;
const startedAt = new Date().toISOString();

/** Back to the seed: the Staff preset plus the RAPP-230 adjustment. */
function restoreMember(): void {
  queryDatabase(`
    delete from public.team_member_permissions where profile_id = '${MEMBER_ID}';
    insert into public.team_member_permissions (org_id, profile_id, permission_code)
    select '${ORG_ID}'::uuid, '${MEMBER_ID}'::uuid, permission_code
      from public.permission_preset_defaults where builtin_key = 'staff'
    union select '${ORG_ID}'::uuid, '${MEMBER_ID}'::uuid, unnest(array['participants.view_sensitive', 'rgpd.erase']);
    update public.team_member_access
       set preset_id = (select id from public.permission_presets where org_id = '${ORG_ID}' and builtin_key = 'staff')
     where profile_id = '${MEMBER_ID}';
  `);
}

test.afterAll(() => {
  restoreMember();
  queryDatabase(`
    delete from public.permission_presets where name = '${PRESET_NAME}';
    delete from public.audit_log
     where created_at >= '${startedAt}'::timestamptz and action like 'team.%';
  `);
});

async function answerStepUpIfAsked(page: Page): Promise<void> {
  const prompt = page.getByTestId('step-up-code');
  if (await prompt.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await prompt.fill(totpCode(SEED_TOTP_SECRET));
    await page.getByTestId('step-up-confirm').click();
  }
}

const grants = () =>
  queryDatabase(`
    select string_agg(permission_code, ',' order by permission_code)
      from public.team_member_permissions where profile_id = '${MEMBER_ID}';
  `).trim();

test('a person gets a preset plus a switch, and a new preset is applied by choice', async ({
  page,
}) => {
  page.on('dialog', (dialog) => void dialog.accept());
  await signInPlayer(page, ADMIN_EMAIL);
  await completeSecondFactor(page, ADMIN_EMAIL);
  await page.getByTestId('team-sidebar-more').click({ timeout: 30_000 });
  await page.getByTestId('team-more-staff').click({ timeout: 30_000 });

  await page.getByTestId(`staff-edit-access-${MEMBER_ID}`).click({ timeout: 30_000 });
  const sheet = page.getByTestId('member-access-sheet');
  await sheet.getByTestId('member-access-preset-coach').click();
  await sheet.getByTestId('member-access-use-preset').click();
  await expect(
    sheet.getByTestId('permission-participants.view_sensitive').locator('input'),
  ).not.toBeChecked();
  await sheet.getByTestId('permission-feedback.view').locator('input').click();
  await sheet.getByTestId('member-access-save').click();
  await answerStepUpIfAsked(page);
  await expect(page.getByTestId('staff-notice')).toHaveText('Access saved.', { timeout: 30_000 });
  await expect(page.getByTestId(`staff-access-${MEMBER_ID}`)).toContainText('Coach, adjusted');
  expect(grants()).toBe(
    'attendance.mark,attendance.reports,equipment.handover,feedback.view,messages.inbox,participants.view',
  );

  // React Native's Switch renders its checkbox inside the element with the test id.
  // A new preset, then the person on it, then an edit that is applied by choice.
  await page.getByTestId('preset-new').click();
  await page.getByTestId('preset-name').fill(PRESET_NAME);
  await page.getByTestId('permission-attendance.mark').locator('input').click();
  await page.getByTestId('preset-save').click();
  await answerStepUpIfAsked(page);
  await expect(page.getByTestId('staff-notice')).toHaveText('Preset saved.', { timeout: 30_000 });
  const presetId = queryDatabase(
    `select id from public.permission_presets where name = '${PRESET_NAME}';`,
  ).trim();

  await page.getByTestId(`staff-edit-access-${MEMBER_ID}`).click();
  await sheet.getByTestId(`member-access-preset-${presetId}`).click();
  await sheet.getByTestId('member-access-use-preset').click();
  await sheet.getByTestId('member-access-save').click();
  await expect(page.getByTestId('staff-notice')).toHaveText('Access saved.', { timeout: 30_000 });
  expect(grants()).toBe('attendance.mark');

  await page.getByTestId(`preset-edit-${presetId}`).click();
  await page.getByTestId('permission-messages.inbox').locator('input').click();
  await page.getByTestId('preset-save').click();
  await expect(page.getByTestId('apply-preset-sheet')).toBeVisible({ timeout: 30_000 });
  // Not yet applied: the change reaches her only on confirmation.
  expect(grants()).toBe('attendance.mark');
  await page.getByTestId('apply-preset-everyone').click();
  await page.getByTestId('apply-preset-save').click();
  await expect(page.getByTestId('staff-notice')).toHaveText('Applied to 1 person.', {
    timeout: 30_000,
  });
  expect(grants()).toBe('attendance.mark,messages.inbox');

  // A preset in use can still be deleted; the person keeps her switches.
  await page.getByTestId(`preset-delete-${presetId}`).click();
  await expect(page.getByTestId('staff-notice')).toHaveText('Preset deleted.', {
    timeout: 30_000,
  });
  expect(
    queryDatabase(
      `select count(*) from public.permission_presets where id = '${presetId}';`,
    ).trim(),
  ).toBe('0');
});
