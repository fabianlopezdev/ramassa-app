/**
 * The onboarding screen editor picks fields from the Fitxa (RAPP-651). On the
 * Talles screen the design account:
 *   - opens "Add a field": the screen's own fields are ticked, a field asked
 *     on another screen says which step, and a free field of another section
 *     is added;
 *   - makes a new field with "New field…", which lands on the Fitxa and on
 *     the screen in one go;
 *   - words the added field for her in Catalan only, and her phone in Arabic
 *     falls back to the field's own Arabic name;
 *   - takes a field off the screen: the field stays on the Fitxa.
 * The list never asks a type or a privacy level, and its rows keep one height
 * with every name at one x. Every expected value comes from psql; what this
 * spec creates is removed again.
 */

import { expect, test, type Page } from '@playwright/test';
import { ONBOARDING_DESIGNER_EMAIL } from '@ramassa/shared/testing';
import { queryDatabase, signIn } from './session';

const ORG_ID = '5eed0000-0000-4000-8000-000000000000';
const runTag = `p${Date.now().toString(36)}`;
const FREE_FIELD = `Al·lèrgies ${runTag}`;
const FREE_FIELD_AR = `حساسية ${runTag}`;
const NEW_FIELD = `Talla de guants ${runTag}`;
const WORDING = `Quina talla de guants portes? ${runTag}`;

const fieldId = (name: string) =>
  queryDatabase(
    `select id from public.profile_fields where org_id = '${ORG_ID}' and label ->> 'ca' = '${name}'`,
  );
const placementOf = (name: string) =>
  queryDatabase(
    `select coalesce(string_agg(p.screen_key || '|' || coalesce(p.label_override ->> 'ca', '') || '|' || coalesce(p.label_override ->> 'ar', ''), ','), '')
       from public.field_placements p join public.profile_fields f on f.id = p.field_id
      where f.label ->> 'ca' = '${name}' and p.surface = 'onboarding'`,
  );

test.setTimeout(180_000);

test.beforeAll(() => {
  // A field of another section that no surface asks yet.
  queryDatabase(`
    insert into public.profile_fields (org_id, section_id, kind, question_type, label, privacy)
    select '${ORG_ID}', id, 'custom', 'short_text',
           jsonb_build_object('ca', '${FREE_FIELD}', 'ar', '${FREE_FIELD_AR}'), 'sensitive'
      from public.profile_sections where org_id = '${ORG_ID}' and key = 'health_needs';
  `);
});

test.afterAll(() => {
  queryDatabase(`
    delete from public.staff_notifications where event = 'field_created'
       and source_id in (select id from public.profile_fields
                          where label ->> 'ca' in ('${FREE_FIELD}', '${NEW_FIELD}'));
    delete from public.profile_fields where label ->> 'ca' in ('${FREE_FIELD}', '${NEW_FIELD}');
  `);
});

/** Every row one height and every name at one x. */
async function expectSymmetry(page: Page) {
  const rows = page.locator(
    ':is([data-testid^="builtin-row-"], [data-testid^="placement-row-"]):not([data-testid$="-edit"], [data-testid$="-remove"], [data-testid$="-field"])',
  );
  const heights = new Set<number>();
  const nameXs = new Set<number>();
  for (let index = 0; index < (await rows.count()); index += 1) {
    const row = rows.nth(index).locator('> div').first();
    heights.add(Math.round((await row.boundingBox())!.height));
    nameXs.add(Math.round((await row.locator('p').first().boundingBox())!.x));
  }
  expect([heights.size, nameXs.size]).toEqual([1, 1]);
}

test.describe.serial('the onboarding field picker', () => {
  test('the design role adds a field from another section and a new one', async ({ page }) => {
    await signIn(page, ONBOARDING_DESIGNER_EMAIL);
    await page.goto('/onboarding/screens/equipment');
    const questions = page.getByTestId('screen-questions');
    await expect(questions).toBeVisible({ timeout: 30_000 });
    // No type or privacy is chosen in this editor.
    await expect(page.locator('[name="question-type"], [name="question-privacy"]')).toHaveCount(0);

    await questions.getByTestId('screen-questions-add').click();
    const picker = page.getByTestId('field-picker');
    await expect(picker).toBeVisible();
    // It opens on the screen's own section, with its fields ticked.
    await expect(picker.getByTestId('field-picker-section-sizes')).toHaveAttribute(
      'aria-current',
      'true',
    );
    const placed = picker.locator('[data-state="placed"]');
    await expect(placed).toHaveCount(2);
    for (const each of await placed.all()) {
      await expect(each).toHaveAttribute('aria-selected', 'true');
    }

    // A built-in field of another screen says its step.
    await picker.getByTestId('field-picker-section-identity').click();
    await expect(picker.locator('[data-state="blocked"]').first()).toContainText(
      /step \d+|Pas \d+/,
    );

    // The free field, found by search, from another section.
    await picker.getByTestId('field-picker-search').fill(runTag);
    const free = picker.getByTestId(`field-picker-field-${fieldId(FREE_FIELD)}`);
    await free.focus();
    await page.keyboard.press('Space');
    await expect(free).toHaveAttribute('aria-selected', 'true');
    await picker.getByTestId('field-picker-confirm').click();
    await expect.poll(() => placementOf(FREE_FIELD), { timeout: 15_000 }).toBe('equipment||');

    // A new field through "New field…", in the screen's section.
    await questions.getByTestId('screen-questions-add').click();
    await picker.getByTestId('field-picker-new').click();
    const form = page.getByTestId('field-form');
    await form.locator('[name="question-label.ca"]').fill(NEW_FIELD);
    await form.getByTestId('field-form-save').click();
    await expect.poll(() => fieldId(NEW_FIELD), { timeout: 15_000 }).toMatch(/^[0-9a-f-]{36}$/);
    await expect(picker.getByTestId(`field-picker-field-${fieldId(NEW_FIELD)}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await picker.getByTestId('field-picker-confirm').click();
    await expect.poll(() => placementOf(NEW_FIELD), { timeout: 15_000 }).toBe('equipment||');
    expect(
      queryDatabase(
        `select s.key from public.profile_fields f join public.profile_sections s on s.id = f.section_id
          where f.label ->> 'ca' = '${NEW_FIELD}'`,
      ),
    ).toBe('sizes');
    await expectSymmetry(page);
  });

  test('a Catalan wording leaves Arabic on the field name, and remove keeps the field', async ({
    page,
  }) => {
    await signIn(page, ONBOARDING_DESIGNER_EMAIL);
    await page.goto('/onboarding/screens/equipment');
    const id = fieldId(FREE_FIELD);
    const row = page.getByTestId(`placement-row-${id}`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByTestId(`placement-row-${id}-edit`).click();
    await row.locator('[name="placement-label.ca"]').fill(WORDING);
    await expect(page.getByTestId(`phone-question-${id}`)).toContainText(WORDING);
    await row.getByTestId('placement-wording-save').click();
    await expect
      .poll(() => placementOf(FREE_FIELD), { timeout: 15_000 })
      .toBe(`equipment|${WORDING}|`);

    await page.getByTestId('phone-language').getByRole('tab').filter({ hasText: /^ar$/ }).click();
    await expect(page.getByTestId(`phone-question-${id}`)).toContainText(FREE_FIELD_AR);
    await expect(page.getByTestId('phone-preview').locator('[dir]').first()).toHaveAttribute(
      'dir',
      'rtl',
    );

    await row.getByTestId(`placement-row-${id}-remove`).click();
    await page.getByTestId('confirm-delete').click();
    await expect.poll(() => placementOf(FREE_FIELD), { timeout: 15_000 }).toBe('');
    // The field stays on the Fitxa.
    expect(fieldId(FREE_FIELD)).toBe(id);
    await page.goto('/profile-layout');
    await expect(page.getByTestId(`profile-field-${id}`)).toBeVisible({ timeout: 30_000 });
  });
});
