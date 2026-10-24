/**
 * The Fitxa de la jugadora (RAPP-650), Organization › Player profile: the
 * onboarding design account adds a field, which records her as its creator
 * and rings the admin's bell; she drags it into another section, renames a
 * section and moves it with the keyboard. The admin then reads the creator,
 * and archives the field behind a confirm that says what it keeps. Rows and
 * section headers keep one height and names one start, whether a row ends in
 * a lock or a button. A staff member without a design permission reads the
 * page with no grips and no buttons. Every expected value comes from psql;
 * what this spec changes is put back.
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

test.describe.serial('the Fitxa de la jugadora', () => {
  test('the design role opens it from the menu and adds, drags and renames', async ({ page }) => {
    await signIn(page, ONBOARDING_DESIGNER_EMAIL);
    // Its own item in the Organization group (RAPP-654).
    const menu = page.getByRole('navigation', { name: 'Staff navigation' });
    await menu.getByRole('link', { name: 'Player profile' }).click();
    await expect(page).toHaveURL(/\/profile-layout$/, { timeout: 30_000 });
    const layout = page.getByTestId('profile-layout');
    await expect(layout).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Player profile', level: 1 })).toBeVisible();
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

    // Dragged by its grip into Identity.
    const grip = row.getByRole('button', { name: /Move field/ });
    const target = page.locator('[data-testid="profile-section-identity"] li').first();
    const from = (await grip.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y - 30, { steps: 5 });
    await page.mouse.move(to.x + 40, to.y + to.height / 2, { steps: 25 });
    await page.mouse.up();
    await expect
      .poll(
        () =>
          queryDatabase(
            `select s.key from public.profile_fields f join public.profile_sections s on s.id = f.section_id
              where f.label ->> 'ca' = '${FIELD_NAME}'`,
          ),
        { timeout: 20_000 },
      )
      .toBe('identity');

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

    // Moved up one place with the keyboard.
    const before = sectionOrder().split(',');
    await page
      .getByTestId('profile-section-sizes')
      .getByRole('button', { name: /Move section/ })
      .focus();
    const index = before.indexOf('sizes');
    // Each key waits for its announcement: an arrow pressed before the drag
    // has started is dropped, and the section lands where it was.
    const live = page.locator('[id^="DndLiveRegion-"]');
    await page.keyboard.press('Space');
    await expect(live).toContainText(`at position ${index + 1}.`);
    await page.keyboard.press('ArrowUp');
    await expect(live).toContainText(`at position ${index}.`);
    await page.keyboard.press('Space');
    const expected = [...before];
    expected.splice(index, 1);
    expected.splice(index - 1, 0, 'sizes');
    await expect.poll(sectionOrder, { timeout: 20_000 }).toBe(expected.join(','));
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
    await expect(page.getByText(`New field in the player profile: ${FIELD_NAME}`)).toBeVisible({
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

  test('a staff member who does not design it reads it without grips or buttons', async ({
    page,
  }) => {
    // The Fitxa opens for her through a Settings permission, given for this test.
    queryDatabase(`
      insert into public.team_member_permissions (org_id, profile_id, permission_code)
      values ('${ORG_ID}', '${STAFF_ID}', 'settings.documents') on conflict do nothing;
    `);
    await signIn(page, STAFF_EMAIL);
    await page.goto('/profile-layout');
    const layout = page.getByTestId('profile-layout');
    await expect(layout).toBeVisible({ timeout: 30_000 });
    await expect(layout.getByRole('button')).toHaveCount(0);
    await expectSymmetry(page);
  });
});
