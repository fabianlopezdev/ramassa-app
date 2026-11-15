/**
 * Dades de les jugadores (RAPP-650), Organization › Player data: the
 * onboarding design account adds a field, which records her as its creator
 * and rings the admin's bell. Nothing moves on the page (RAPP-658): no grips,
 * a staff field after the app's own fields, sections renamed in place, and a
 * search that keeps only the sections with a match. The admin then reads the
 * creator, and archives the field behind a confirm that says what it keeps.
 * An app field opens with Edit, and a new type asks first with the database's
 * counts (RAPP-665); Cancel saves nothing. Rows and section headers keep one
 * height and names one start. A staff member without a design permission
 * cannot open the page. Every expected value comes from psql; what this spec
 * changes is put back.
 */

import { expect, test, type Page } from '@playwright/test';
import { ONBOARDING_DESIGNER_EMAIL } from '@ramassa/shared/testing';
import { queryDatabase, signIn, STAFF_EMAIL } from './session';

const ADMIN_EMAIL = 'laia.ferrer@example.test';
const STAFF_ID = '5eed0000-0000-4000-8000-000000000002';
const ORG_ID = '5eed0000-0000-4000-8000-000000000000';
const runTag = `f${Date.now().toString(36)}`;
const FIELD_NAME = `Talla de guants ${runTag}`;

const sectionOrder = () =>
  queryDatabase(
    `select string_agg(key, ',' order by sort_order) from public.profile_sections where org_id = '${ORG_ID}'`,
  );
let originalOrder = '';

test.setTimeout(120_000);

test.beforeAll(() => {
  originalOrder = sectionOrder();
});

test.afterAll(() => {
  queryDatabase(`
    delete from public.staff_notifications where event = 'field_created'
       and source_id in (select id from public.profile_fields where label ->> 'ca' = '${FIELD_NAME}');
    delete from public.profile_fields where label ->> 'ca' = '${FIELD_NAME}';
    update public.profile_sections set title = jsonb_set(title, '{ca}', '"Talles"')
     where org_id = '${ORG_ID}' and key = 'sizes';
    update public.profile_sections s set sort_order = array_position(string_to_array('${originalOrder}', ','), s.key) - 1
     where s.org_id = '${ORG_ID}';
    delete from public.team_member_permissions
     where profile_id = '${STAFF_ID}' and permission_code = 'settings.documents';
  `);
});

/** Every row one height, every name and badge at one x, every header one height. */
async function expectSymmetry(page: Page) {
  const rows = page.locator('[data-testid^="profile-field-"]:not([data-testid*="edit"])');
  const count = await rows.count();
  expect(count).toBeGreaterThan(10);
  const heights = new Set<number>();
  const nameXs = new Set<number>();
  const badgeXs = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    heights.add(Math.round((await row.boundingBox())!.height));
    nameXs.add(Math.round((await row.locator('p').first().boundingBox())!.x));
    badgeXs.add(Math.round((await row.locator('[data-slot="badge"]').first().boundingBox())!.x));
  }
  expect([heights.size, nameXs.size, badgeXs.size]).toEqual([1, 1, 1]);
  const headers = page.locator('[data-testid^="profile-section-"] > header');
  const headerHeights = new Set<number>();
  for (let index = 0; index < (await headers.count()); index += 1) {
    headerHeights.add(Math.round((await headers.nth(index).boundingBox())!.height));
  }
  expect(headerHeights.size).toBe(1);
}

test.describe.serial('Dades de les jugadores', () => {
  test('the design role opens it from the menu, adds, renames and searches', async ({ page }) => {
    await signIn(page, ONBOARDING_DESIGNER_EMAIL);
    // Its own item in the Organization group (RAPP-654).
    const menu = page.getByRole('navigation', { name: 'Staff navigation' });
    await menu.getByRole('link', { name: 'Player data' }).click();
    await expect(page).toHaveURL(/\/profile-layout$/, { timeout: 30_000 });
    const layout = page.getByTestId('profile-layout');
    await expect(layout).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole('heading', { name: 'Player data to collect', level: 1 }),
    ).toBeVisible();
    await expectSymmetry(page);

    await page.getByTestId('profile-section-add-sizes').click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('[name="question-label.ca"]').fill(FIELD_NAME);
    await dialog.getByTestId('field-form-save').click();
    const row = page.locator('[data-testid^="profile-field-"]').filter({ hasText: FIELD_NAME });
    await expect(row).toContainText('created by Pau Dissenya', { timeout: 20_000 });
    await expect(row).toContainText('Team only');
    expect(
      queryDatabase(
        `select p.email from public.profile_fields f join auth.users p on p.id = f.created_by
          where f.label ->> 'ca' = '${FIELD_NAME}'`,
      ),
    ).toBe(ONBOARDING_DESIGNER_EMAIL);

    // Nothing moves (RAPP-658): no grip on a field or a section.
    await expect(layout.getByRole('button', { name: /Move field|Move section/ })).toHaveCount(0);
    // A staff field comes after the app's own fields of its section.
    const sizes = page.getByTestId('profile-section-sizes');
    await expect(
      sizes.locator('[data-testid^="profile-field-"]:not([data-testid*="edit"])').last(),
    ).toContainText(FIELD_NAME);

    // Renamed in place, in Catalan.
    await page.getByTestId('profile-section-rename-sizes').click();
    await page.locator('[name="section-title.ca"]').fill('Talles i mides');
    await page.getByTestId('section-rename-save').click();
    await expect
      .poll(() =>
        queryDatabase(
          `select title ->> 'ca' from public.profile_sections where org_id = '${ORG_ID}' and key = 'sizes'`,
        ),
      )
      .toBe('Talles i mides');

    // The search keeps only the sections with a matching field.
    await page.getByTestId('profile-layout-search').fill(runTag);
    await expect(
      layout.locator('[data-testid^="profile-field-"]:not([data-testid*="edit"])'),
    ).toHaveCount(1);
    await expect(sizes).toContainText(FIELD_NAME);
    await page.getByTestId('profile-layout-search').fill(`${runTag}zz`);
    await expect(page.getByTestId('profile-layout-no-results')).toBeVisible();
  });

  test('the admin is told, reads the creator, and archives the field', async ({ page }) => {
    expect(
      queryDatabase(
        `select n.path from public.staff_notifications n join auth.users u on u.id = n.recipient_id
          where n.event = 'field_created' and u.email = '${ADMIN_EMAIL}'
            and n.source_id = (select id from public.profile_fields where label ->> 'ca' = '${FIELD_NAME}')`,
      ),
    ).toBe('/profile-layout');

    await signIn(page, ADMIN_EMAIL);
    // An address from before the Fitxa had its own page still forwards to it.
    await page.goto('/settings?tab=profile-layout');
    await expect(page).toHaveURL(/\/profile-layout$/, { timeout: 30_000 });
    await page.getByRole('button', { name: /Notifications/ }).click();
    await expect(page.getByText(`New field in Player data: ${FIELD_NAME}`)).toBeVisible({
      timeout: 20_000,
    });
    await page.keyboard.press('Escape');

    const row = page.locator('[data-testid^="profile-field-"]').filter({ hasText: FIELD_NAME });
    await expect(row).toContainText('created by Pau Dissenya');
    await row.getByRole('button', { name: `Edit ${FIELD_NAME}` }).click();
    const dialog = page.getByRole('dialog');
    // No answers yet: the privacy level can still change.
    await expect(dialog.getByTestId('question-privacy-change')).toBeVisible();
    await dialog.getByTestId('field-archive').click();
    await expect(page.getByRole('alertdialog')).toContainText('It has no answers.');
    await page.getByTestId('confirm-archive').click();
    await expect(row).toHaveCount(0, { timeout: 20_000 });
    expect(
      queryDatabase(
        `select is_archived from public.profile_fields where label ->> 'ca' = '${FIELD_NAME}'`,
      ),
    ).toBe('t');
  });

  test('an app field opens with Edit, and a new type asks first with real counts (RAPP-665)', async ({
    page,
  }) => {
    const nationality = queryDatabase(
      `select id from public.profile_fields where org_id = '${ORG_ID}' and system_key = 'nationality'`,
    );
    // Her answers and the pending referrals' answers: both convert (RAPP-665).
    const answers = queryDatabase(
      `select (select count(*) from public.custom_answers where question_id = '${nationality}')
            + (select count(*) from public.referral_custom_answers where question_id = '${nationality}')`,
    );
    await signIn(page, ADMIN_EMAIL);
    await page.goto('/profile-layout');
    await expect(page.getByText('Fixed by the app')).toHaveCount(0, { timeout: 30_000 });
    await page.getByTestId(`profile-field-edit-${nationality}`).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByTestId('question-type-change').click();
    await page.getByTestId('question-type-option-short_text').click();
    await dialog.getByTestId('field-form-save').click();
    const change = page.getByTestId('field-change-dialog');
    await expect(change).toContainText(`It has ${answers} answers.`, { timeout: 20_000 });
    await expect(change).toContainText('Impact report: nationalities');
    await page.getByTestId('field-change-cancel').click();
    await expect(change).toHaveCount(0);
    // Cancel saves nothing.
    expect(
      queryDatabase(`select question_type from public.profile_fields where id = '${nationality}'`),
    ).toBe('country');
  });

  test('a staff member who does not design it cannot open it (RAPP-658)', async ({ page }) => {
    // A Settings permission no longer opens the page: only its editors see it.
    queryDatabase(`
      insert into public.team_member_permissions (org_id, profile_id, permission_code)
      values ('${ORG_ID}', '${STAFF_ID}', 'settings.documents') on conflict do nothing;
    `);
    await signIn(page, STAFF_EMAIL);
    const menu = page.getByRole('navigation', { name: 'Staff navigation' });
    await expect(menu).toBeVisible({ timeout: 30_000 });
    await expect(menu.getByRole('link', { name: 'Player data' })).toHaveCount(0);
    await page.goto('/profile-layout');
    await expect(page).not.toHaveURL(/\/profile-layout/, { timeout: 30_000 });
    await expect(page.getByTestId('profile-layout')).toHaveCount(0);
  });
});
