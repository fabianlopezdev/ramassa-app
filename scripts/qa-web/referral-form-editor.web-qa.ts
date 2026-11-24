/**
 * The entity referral form, composed from the Fitxa (RAPP-652) on the form
 * engine's board (RAPP-938):
 *   - the admin opens Formulari de derivació, sees its screens as phones,
 *     opens the first one in the screen editor, adds a Personal and a
 *     Sensible field with the picker, makes the Personal one required, words
 *     it for the entity, and sees the phone follow; the app's own fields are
 *     offered like any other, and her names cannot be removed;
 *   - the admin adds a second screen from the board's add card and moves
 *     the required field onto it, wording and required kept;
 *   - the entity's portal walks the two screens: Continua waits for her
 *     names, the second screen asks the moved field and refuses the referral
 *     while it is empty, then both answers go in one call;
 *   - staff invite her from the referral: both answers are hers at once,
 *     with the entity as their source, the Sensible one encrypted.
 * Rows keep one height and every name one x. Every expected value comes from
 * psql; what this spec creates is removed again.
 */

import { expect, test, type Page } from '@playwright/test';
import { ENTITY_EMAIL, queryDatabase, signIn } from './session';

const ADMIN_EMAIL = 'laia.ferrer@example.test';
const ORG_ID = '5eed0000-0000-4000-8000-000000000000';
const ENTITY_USER_ID = '5eed0000-0000-4000-8000-000000000004';
// Seeded Ramassà fields: Personal short text (team only), Sensible single choice.
const PERSONAL = '5eed0000-0000-4000-8045-000000000004';
const SENSIBLE = '5eed0000-0000-4000-8045-000000000005';
const runTag = `r${Date.now().toString(36)}`;
const WORDING = `On agafa el metro? ${runTag}`;
const WORDING_EN = `Nearest metro stop? ${runTag}`;
const LAST_NAME = `Derivada ${runTag}`;
const EMAIL = `derivada.${runTag}@example.test`;
const SCREEN_NAME = `Pantalla ${runTag}`;

let referralId = '';
let screenId = '';

const sql = (value: string) => `'${value.replaceAll("'", "''")}'`;
const placementOf = (fieldId: string) =>
  queryDatabase(
    `select coalesce(string_agg(required::text || '|' || coalesce(label_override ->> 'ca', ''), ','), '')
       from public.field_placements where field_id = '${fieldId}' and surface = 'entity_form'`,
  );

/** Every row one height and every name at one x. */
async function expectSymmetry(page: Page) {
  const rows = page
    .getByTestId('entity-placement-list')
    .locator(
      '[data-testid^="entity-placement-"]:not([data-testid$="-edit"], [data-testid$="-remove"])',
    )
    .filter({ has: page.locator('[data-testid^="entity-required-"]') });
  const heights = new Set<number>();
  const nameXs = new Set<number>();
  for (let index = 0; index < (await rows.count()); index += 1) {
    const row = rows.nth(index).locator('> div').first();
    heights.add(Math.round((await row.boundingBox())!.height));
    nameXs.add(Math.round((await row.locator('p').first().boundingBox())!.x));
  }
  expect([heights.size, nameXs.size]).toEqual([1, 1]);
}

test.setTimeout(240_000);

test.afterAll(() => {
  queryDatabase(`
    begin;
    delete from public.field_placements
     where surface = 'entity_form' and field_id in ('${PERSONAL}', '${SENSIBLE}');
    update public.custom_form_screens set is_archived = true where id = nullif(${sql(screenId)}, '')::uuid;
    delete from public.audit_log where target_id = nullif(${sql(referralId)}, '')::uuid;
    create temporary table qa_invited on commit drop as
      select id from auth.users where email = ${sql(EMAIL)};
    delete from public.invites where email = ${sql(EMAIL)};
    delete from public.entity_referrals where id = nullif(${sql(referralId)}, '')::uuid;
    delete from public.profiles where id in (select id from qa_invited);
    delete from auth.identities where user_id in (select id from qa_invited);
    delete from auth.users where id in (select id from qa_invited);
    commit;
  `);
});

test.describe.serial('the entity referral form', () => {
  test('the admin composes a screen from the Fitxa and the phone follows', async ({ page }) => {
    await signIn(page, ADMIN_EMAIL);
    await page.goto('/entities/referral-form');
    // The board: its screens as phones, the add card first (RAPP-938).
    const firstScreen = queryDatabase(
      `select s.id from public.custom_form_screens s
         join public.custom_forms f on f.id = s.form_id and f.system_key = 'entity_referral'
        where f.org_id = '${ORG_ID}' and not s.is_archived order by s.sort_order, s.created_at limit 1`,
    );
    await expect(page.getByTestId('screen-board')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('board-add-screen')).toBeVisible();
    await page.getByTestId(`board-edit-${firstScreen}`).click();
    await expect(page).toHaveURL(new RegExp(`/entities/referral-form/screens/${firstScreen}$`));
    const fields = page.getByTestId('referral-form-fields');
    await expect(fields).toBeVisible({ timeout: 30_000 });
    // Type and privacy belong to the field: never asked here.
    await expect(page.locator('[name="question-type"], [name="question-privacy"]')).toHaveCount(0);

    // Her names stay on the form, required.
    const firstName = queryDatabase(
      `select id from public.profile_fields where org_id = '${ORG_ID}' and system_key = 'first_name'`,
    );
    await expect(page.getByTestId(`entity-placement-${firstName}-remove`)).toHaveCount(0);
    await expect(page.getByTestId(`entity-required-${firstName}`)).toBeDisabled();

    await fields.getByTestId('referral-form-add').click();
    const picker = page.getByTestId('referral-form-picker');
    await expect(picker).toBeVisible();
    // The app's own fields go on the form like any field (RAPP-665): the
    // sizes are offered. Only a file or a signature stays hers to give.
    await picker.getByTestId('referral-form-picker-section-sizes').click();
    const clothingSize = queryDatabase(
      `select id from public.profile_fields where org_id = '${ORG_ID}' and system_key = 'clothing_size'`,
    );
    await expect(picker.getByTestId(`referral-form-picker-field-${clothingSize}`)).toHaveAttribute(
      'data-state',
      'free',
    );
    for (const id of [PERSONAL, SENSIBLE]) {
      const name = queryDatabase(
        `select label ->> 'ca' from public.profile_fields where id = '${id}'`,
      );
      await picker.getByTestId('referral-form-picker-search').fill(name.slice(0, 12));
      const row = picker.getByTestId(`referral-form-picker-field-${id}`);
      await row.focus();
      await page.keyboard.press('Space');
      await expect(row).toHaveAttribute('aria-selected', 'true');
    }
    await picker.getByTestId('referral-form-picker-confirm').click();
    await expect.poll(() => placementOf(PERSONAL), { timeout: 15_000 }).toBe('false|');
    await expect.poll(() => placementOf(SENSIBLE), { timeout: 15_000 }).toBe('false|');

    // Required on this form, and worded for the entity.
    await page.getByTestId(`entity-required-${PERSONAL}`).click();
    await expect.poll(() => placementOf(PERSONAL), { timeout: 15_000 }).toBe('true|');
    const row = page.getByTestId(`entity-placement-${PERSONAL}`);
    await row.getByTestId(`entity-placement-${PERSONAL}-edit`).click();
    await row.locator('[name="placement-label.ca"]').fill(WORDING);
    const preview = page.getByTestId('phone-screen');
    await expect(preview).toContainText(WORDING);
    await row.getByTestId(`entity-wording-${PERSONAL}-save`).click();
    await expect.poll(() => placementOf(PERSONAL), { timeout: 15_000 }).toBe(`true|${WORDING}`);
    // The entity reads its own language: the English wording too.
    await page
      .getByTestId('editor-language')
      .getByRole('radio')
      .filter({ hasText: /^en$/ })
      .click();
    await row.getByTestId(`entity-placement-${PERSONAL}-edit`).click();
    await row.locator('[name="placement-label.en"]').fill(WORDING_EN);
    await row.getByTestId(`entity-wording-${PERSONAL}-save`).click();
    await expect
      .poll(
        () =>
          queryDatabase(
            `select label_override ->> 'en' from public.field_placements where field_id = '${PERSONAL}' and surface = 'entity_form'`,
          ),
        { timeout: 15_000 },
      )
      .toBe(WORDING_EN);

    // The phone in Arabic reads right to left, the field's own Arabic name or its Catalan one.
    await page.getByTestId('phone-language').getByRole('radio').filter({ hasText: /^ar$/ }).click();
    await expect(preview).toHaveAttribute('dir', 'rtl');
    await expectSymmetry(page);
  });

  test('the admin adds a screen and moves a field onto it', async ({ page }) => {
    await signIn(page, ADMIN_EMAIL);
    await page.goto('/entities/referral-form');
    await page.getByTestId('board-add-screen').click();
    await page.getByTestId('new-screen-name').fill(SCREEN_NAME);
    // Its screens always show: a new one depends on no answer.
    await expect(page.getByTestId('new-screen-depends')).toHaveCount(0);
    await page.getByTestId('new-screen-create').click();
    await expect(page).toHaveURL(/\/entities\/referral-form\/screens\/[0-9a-f-]+$/, {
      timeout: 20_000,
    });
    screenId = queryDatabase(
      `select id from public.custom_form_screens where title ->> 'ca' = ${sql(SCREEN_NAME)}`,
    );
    const fields = page.getByTestId('referral-form-fields');
    await fields.getByTestId('referral-form-add').click();
    const picker = page.getByTestId('referral-form-picker');
    const name = queryDatabase(
      `select label ->> 'ca' from public.profile_fields where id = '${PERSONAL}'`,
    );
    await picker.getByTestId('referral-form-picker-search').fill(name.slice(0, 12));
    const row = picker.getByTestId(`referral-form-picker-field-${PERSONAL}`);
    await expect(row).toHaveAttribute('data-state', 'moves');
    await row.focus();
    await page.keyboard.press('Space');
    await picker.getByTestId('referral-form-picker-confirm').click();
    await expect
      .poll(
        () =>
          queryDatabase(
            `select screen_key from public.field_placements where field_id = '${PERSONAL}' and surface = 'entity_form'`,
          ),
        { timeout: 15_000 },
      )
      .toBe(screenId);
    expect(placementOf(PERSONAL)).toBe(`true|${WORDING}`);
    await expect(page.getByTestId(`entity-placement-${PERSONAL}`)).toBeVisible();
  });

  test('the entity walks the screens, refused while the required field is empty', async ({
    page,
  }) => {
    await signIn(page, ENTITY_EMAIL);
    await page.goto('/portal/referrals/new');
    const form = page.getByTestId('referral-form');
    await expect(form).toBeVisible({ timeout: 30_000 });
    const second = page.getByTestId('referral-screen-2');
    await expect(second).toBeHidden();
    // Continua waits for what the first screen asks: her names.
    await page.getByTestId('referral-continue').click();
    await expect(
      page
        .getByTestId('referral-screen-1')
        .getByText(/complete this field|completa aquest camp/i)
        .first(),
    ).toBeVisible();
    // The check is asynchronous: give a wrong move to the next screen the time to happen.
    await page.waitForTimeout(1_000);
    await expect(second).toBeHidden();
    await expect(page.getByTestId('referral-screen-1')).toBeVisible();
    await page.locator('#referral-first-name').fill('Amina');
    await page.locator('#referral-last-name').fill(LAST_NAME);
    const option = queryDatabase(
      `select id from public.custom_question_options where question_id = '${SENSIBLE}' order by sort_order limit 1`,
    );
    await page.locator(`#referral-field-${SENSIBLE}`).selectOption(option);
    await page.getByTestId('referral-continue').click();
    await expect(second).toBeVisible();
    await expect(second).toContainText(SCREEN_NAME);
    // Arriving sends nothing: no message of the last screen shows yet.
    await page.waitForTimeout(1_000);
    await expect(page.locator('#referral-consent')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(second).toContainText(`${WORDING_EN} *`);
    await page.locator('#referral-email').fill(EMAIL);
    await page.locator('#referral-consent').check();
    await page.getByTestId('referral-submit').click();
    await expect(form.getByText(/complete this field|completa aquest camp/i)).toBeVisible();
    expect(
      queryDatabase(
        `select count(*) from public.entity_referrals where referred_last_name = ${sql(LAST_NAME)}`,
      ),
    ).toBe('0');

    await page.locator(`#referral-field-${PERSONAL}`).fill('Sants Estació');
    await page.getByTestId('referral-submit').click();
    await expect(page).toHaveURL(/\/portal\/referrals\/[0-9a-f-]+$/, { timeout: 30_000 });
    referralId = queryDatabase(
      `select id from public.entity_referrals
        where entity_user_id = '${ENTITY_USER_ID}' and referred_last_name = ${sql(LAST_NAME)}`,
    );
    expect(
      queryDatabase(
        `select count(*) from public.referral_custom_answers where referral_id = '${referralId}'`,
      ),
    ).toBe('2');
  });

  test('staff invite her and the answers are hers, from the entity', async ({ page }) => {
    await signIn(page, ADMIN_EMAIL);
    await page.goto(`/participants/new?referral=${referralId}`);
    await expect(page.getByTestId('referral-prefill')).toContainText(LAST_NAME, {
      timeout: 30_000,
    });
    await page
      .getByRole('button', {
        name: /què se li preguntarà|what she will be asked|qué se le preguntará/i,
      })
      .click();
    await expect(page.getByTestId('invite-questions-review')).toBeVisible({ timeout: 15_000 });
    await page
      .getByRole('button', { name: /crea la invitació|create the invitation|crea la invitación/i })
      .click();
    await expect(
      page.getByRole('heading', { name: /invitació creada|invitation created|invitación creada/i }),
    ).toBeVisible({ timeout: 20_000 });

    // The form's answers come from the entity. Her entity is an answer by
    // field since RAPP-661, given by the staff member who invites her.
    expect(
      queryDatabase(
        `select string_agg(a.question_id::text || '/' || a.source || '/' || (a.value is null)::text, ',' order by a.question_id)
           from public.custom_answers a join auth.users u on u.id = a.profile_id
          where u.email = ${sql(EMAIL)} and a.question_id in ('${PERSONAL}', '${SENSIBLE}')`,
      ),
    ).toBe(`${PERSONAL}/entity/false,${SENSIBLE}/entity/true`);
    expect(
      queryDatabase(
        `select a.source || '/' || (a.value #>> '{}') from public.custom_answers a
           join auth.users u on u.id = a.profile_id
           join public.profile_fields f on f.id = a.question_id and f.system_key = 'reference_entity'
          where u.email = ${sql(EMAIL)}`,
      ),
    ).toBe('staff/Creu Roja Osona');
    expect(
      queryDatabase(
        `select count(*) from public.referral_custom_answers where referral_id = '${referralId}'`,
      ),
    ).toBe('0');
  });
});
