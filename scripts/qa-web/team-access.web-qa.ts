/**
 * The Team screen through the web admin (RAPP-231): an admin gives a staff
 * member one job, and that person's menus, routes and settings follow it.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { queryDatabase, signIn } from './session';

const ADMIN_EMAIL = 'laia.ferrer@example.test';
const MEMBER_EMAIL = 'nuria.serra@example.test';
const MEMBER_ID = '5eed0000-0000-4000-8000-000000000003';
const ORG_ID = '5eed0000-0000-4000-8000-000000000000';
const PRESET_NAME = `Material ${Date.now().toString(36)}`;
const startedAt = new Date().toISOString();

test.setTimeout(180_000);

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

async function openTeam(page: Page): Promise<void> {
  await page.goto('/settings?tab=staff');
  await expect(page.getByTestId('team-access')).toBeVisible({ timeout: 30_000 });
}

async function memberPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await signIn(page, MEMBER_EMAIL);
  return page;
}

test.describe.serial('the Team screen', () => {
  test('an admin gives a staff member the Coach preset plus one toggle, and it reads as adjusted', async ({
    page,
  }) => {
    await signIn(page, ADMIN_EMAIL);
    await openTeam(page);
    await page.getByRole('button', { name: `Edit access for ${MEMBER_EMAIL}` }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: 'Preset' }).selectOption({ label: 'Coach' });
    await dialog.getByRole('button', { name: 'Use this preset' }).click();
    await expect(dialog.getByTestId('permission-participants.view_sensitive')).not.toBeChecked();
    await dialog.getByTestId('permission-feedback.view').check();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toContainText('Access saved.');
    await expect(page.getByTestId(`team-access-${MEMBER_ID}`)).toHaveText('Coach, adjusted');

    expect(
      queryDatabase(`select string_agg(permission_code, ',' order by permission_code)
        from public.team_member_permissions where profile_id = '${MEMBER_ID}'`),
    ).toBe(
      'attendance.mark,attendance.reports,equipment.handover,feedback.view,messages.inbox,participants.view',
    );
    expect(
      queryDatabase(`select count(*) from public.audit_log
        where action = 'team.permissions_update' and target_id = '${MEMBER_ID}'
          and created_at >= '${startedAt}'::timestamptz`),
    ).toBe('1');
  });

  test('that person sees only her jobs in the menu, and Settings sends her home', async ({
    browser,
  }) => {
    const page = await memberPage(browser);
    const nav = page.getByRole('navigation').first();
    await expect(nav.getByRole('link', { name: 'Attendance' })).toBeVisible({ timeout: 30_000 });
    await expect(nav.getByRole('link', { name: 'Feedback' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Settings' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Forum' })).toHaveCount(0);
    await page.goto('/settings');
    await expect.poll(() => new URL(page.url()).pathname).toBe('/dashboard');
    await page.context().close();
  });

  test('branding alone opens Settings with the organization details locked', async ({
    browser,
  }) => {
    queryDatabase(`
      delete from public.team_member_permissions where profile_id = '${MEMBER_ID}';
      insert into public.team_member_permissions (org_id, profile_id, permission_code)
      values ('${ORG_ID}', '${MEMBER_ID}', 'settings.branding');
    `);
    const page = await memberPage(browser);
    await page.goto('/settings');
    await expect(page.getByTestId('organization-settings-form')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('tab', { name: 'Team' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Documents' })).toHaveCount(0);
    await expect(page.getByLabel('Organization name')).toBeDisabled();
    await expect(page.getByLabel('Primary color hex')).toBeEnabled();
    await page.context().close();
    restoreMember();
  });

  test('an admin creates a preset, and deletes it again', async ({ page }) => {
    await signIn(page, ADMIN_EMAIL);
    await openTeam(page);
    await page.getByRole('button', { name: 'New preset' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name', { exact: true }).fill(PRESET_NAME);
    await dialog.getByTestId('permission-area-material').check();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toContainText('Preset saved.');
    expect(
      queryDatabase(`select count(*) from public.permission_preset_permissions pp
        join public.permission_presets p on p.id = pp.preset_id where p.name = '${PRESET_NAME}'`),
    ).toBe('4');
    await page.getByRole('button', { name: `Delete preset ${PRESET_NAME}` }).click();
    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toContainText(
      'Preset deleted.',
    );
    expect(
      queryDatabase(`select count(*) from public.permission_presets where name = '${PRESET_NAME}'`),
    ).toBe('0');
  });

  test('the last person with Team management cannot switch it off, and is told why', async ({
    page,
  }) => {
    await signIn(page, ADMIN_EMAIL);
    await openTeam(page);
    await page.getByRole('button', { name: `Edit access for ${ADMIN_EMAIL}` }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByTestId('permission-team.manage').uncheck();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByRole('alert')).toContainText(
      'At least one active person must keep Team management',
    );
    expect(
      queryDatabase(`select count(*) from public.team_member_permissions grant_row
        join auth.users account on account.id = grant_row.profile_id
        where account.email = '${ADMIN_EMAIL}' and grant_row.permission_code = 'team.manage'`),
    ).toBe('1');
  });
});
