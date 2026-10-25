/**
 * Builder question types match every field kind the app uses (RAPP-610), end
 * to end in real browsers:
 *   - an admin adds a number field with its range and a long searchable list
 *     pasted one per line on the Fitxa, reading what each type asks; the
 *     spec places them and the other types on a new Ramassà screen (RAPP-656);
 *   - the design role fills the test player's staff questions of every type
 *     with valid samples from her page, and her page reads each one: a date
 *     and a number in words, a list joined, a consent with its time, a
 *     signature as signed with the drawing on request, a file by its name
 *     with a private link;
 *   - the test player opens the app in Arabic on the new screen, and an
 *     answer out of range is refused in her words before she continues.
 * What this spec creates is removed again; she is left as the seed had her.
 */

import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ONBOARDING_DESIGNER_EMAIL, TEST_PLAYER_EMAIL } from '@ramassa/shared/testing';
import { queryDatabase, signIn, signInPlayer } from './session';

const ADMIN_EMAIL = 'laia.ferrer@example.test';
const ORG = '5eed0000-0000-4000-8000-000000000000';
const runTag = `t${Date.now().toString(36)}`;
const SCREEN_TITLE = `Tipus ${runTag}`;
const HER = `(select id from auth.users where email = '${TEST_PLAYER_EMAIL}')`;
const onboardingAr = JSON.parse(
  readFileSync('packages/shared/i18n/locales/ar/onboarding.json', 'utf8'),
) as Record<string, string>;

test.use({ actionTimeout: 15_000 });
test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

const screenId = () =>
  queryDatabase(`select id from public.intake_screens where title ->> 'ca' = '${SCREEN_TITLE}'`);
const questionId = (label: string) =>
  queryDatabase(
    `select id from public.profile_fields where kind = 'custom' and label ->> 'ca' = '${label} ${runTag}'`,
  );

test.afterAll(() => {
  queryDatabase(`
    begin;
    delete from public.custom_answers where profile_id = ${HER};
    delete from public.staff_notifications where event = 'field_created' and source_id in (
      select id from public.profile_fields where org_id = '${ORG}' and label ->> 'ca' like '% ${runTag}');
    delete from public.profile_fields where org_id = '${ORG}' and label ->> 'ca' like '% ${runTag}';
    update public.intake_flow_orders
       set step_order = array_remove(step_order, 'custom:' || (
         select id::text from public.intake_screens where title ->> 'ca' = '${SCREEN_TITLE}'))
     where org_id = '${ORG}';
    delete from public.intake_screens where title ->> 'ca' = '${SCREEN_TITLE}';
    update public.profiles set preferred_language = 'ca', role = 'invited', terms_accepted_at = null
     where id = ${HER};
    commit;
  `);
});

test('an admin adds a number and a long list on the Fitxa, placed with the others on a screen', async ({
  page,
}) => {
  await signIn(page, ADMIN_EMAIL);
  await page.goto('/profile-layout');
  await expect(page.getByTestId('profile-layout')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('profile-section-add-support').click();
  let dialog = page.getByRole('dialog');
  await dialog.getByTestId('question-type-change').click();
  await dialog.getByTestId('question-type-option-number').click();
  await expect(dialog.getByTestId('type-description')).toContainText(
    /whole or decimal|sencer o amb decimals/i,
  );
  await dialog.locator('[name="question-label.ca"]').fill(`Fills ${runTag}`);
  await dialog.locator('[name="setting-integer"]').check();
  await dialog.locator('[name="setting-min"]').fill('0');
  await dialog.locator('[name="setting-max"]').fill('15');
  await dialog.getByTestId('field-form-save').click();
  await expect
    .poll(
      () =>
        queryDatabase(
          `select question_type || '|' || settings::text from public.profile_fields
            where label ->> 'ca' = 'Fills ${runTag}'`,
        ),
      { timeout: 15_000 },
    )
    .toBe('number|{"max": 15, "min": 0, "integer": true}');

  await page.getByTestId('profile-section-add-support').click();
  dialog = page.getByRole('dialog');
  await dialog.getByTestId('question-type-change').click();
  await dialog.getByTestId('question-type-option-search_choice').click();
  await dialog.locator('[name="question-label.ca"]').fill(`Barri ${runTag}`);
  await dialog.locator('[name="options-paste"]').fill('Gràcia\nSants\nHorta\nGràcia');
  await dialog.getByTestId('field-form-save').click();
  await expect
    .poll(
      () =>
        queryDatabase(
          `select string_agg(o.label ->> 'ca', ',' order by o.sort_order)
             from public.custom_question_options o
             join public.profile_fields f on f.id = o.question_id
            where f.label ->> 'ca' = 'Barri ${runTag}'`,
        ),
      { timeout: 15_000 },
    )
    .toBe('Gràcia,Sants,Horta');

  // A Ramassà screen after the logistics step, with the other types, as the
  // Fitxa writes them; then every field is placed on it in order.
  queryDatabase(`
    begin;
    insert into public.intake_screens (org_id, title, after_screen, sort_order)
    values ('${ORG}', '{"ca": "${SCREEN_TITLE}"}', 'logistics', 99);
    insert into public.profile_fields (org_id, section_id, kind, question_type, label, privacy, settings, sort_order)
    select '${ORG}', s.id, 'custom', v.type, jsonb_build_object('ca', v.label || ' ${runTag}'), v.privacy, v.settings::jsonb, v.position
      from (values
        ('date', 'Arribada', 'personal', '{"min_age": 16}', 902),
        ('item_list', 'Idiomes', 'normal', '{"max_items": 3}', 903),
        ('consent', 'Cotxe', 'normal', '{"text": {"ca": "Accepto que em portin"}}', 904),
        ('signature', 'Signatura', 'personal', '{}', 905),
        ('file_upload', 'Informe', 'sensitive', '{"accept": "document"}', 906),
        ('yes_no', 'Bici', 'normal', '{}', 907),
        ('phone', 'Telèfon', 'personal', '{}', 908),
        ('email', 'Correu', 'personal', '{}', 909)
      ) as v(type, label, privacy, settings, position)
      join public.profile_sections s on s.org_id = '${ORG}' and s.key = 'support';
    insert into public.field_placements (org_id, field_id, surface, screen_key, sort_order)
    select '${ORG}', f.id, 'onboarding', (select id::text from public.intake_screens where title ->> 'ca' = '${SCREEN_TITLE}'),
           row_number() over (order by f.sort_order, f.created_at) - 1
      from public.profile_fields f
     where f.org_id = '${ORG}' and f.label ->> 'ca' like '% ${runTag}';
    commit;
  `);
  await expect.poll(screenId, { timeout: 15_000 }).toMatch(/^[0-9a-f-]{36}$/);
});

test('the design role fills every type for the test player, and her page reads each one', async ({
  page,
}) => {
  queryDatabase(`update public.profiles set preferred_language = 'ar' where id = ${HER}`);
  await signIn(page, ONBOARDING_DESIGNER_EMAIL);
  await page.goto(`/participants/${queryDatabase(`select ${HER}`)}`);
  const scenario = page.getByTestId('test-player-scenario');
  await expect(scenario).toBeVisible({ timeout: 30_000 });
  await scenario.getByRole('button', { name: 'Fill all', exact: true }).click();
  await expect(scenario.getByTestId('test-scenario-answer-shoe_size')).toHaveAttribute(
    'data-answered',
    'true',
    { timeout: 20_000 },
  );
  const custom = page.getByTestId('test-scenario-custom');
  await custom.getByRole('button', { name: 'Fill them all' }).click();
  await expect(custom.getByTestId(`test-scenario-custom-${questionId('Informe')}`)).toHaveAttribute(
    'data-answered',
    'true',
    { timeout: 20_000 },
  );
  // Every type of this screen got a valid sample, the database checked each.
  expect(
    queryDatabase(`
      select string_agg(f.question_type, ',' order by p.sort_order)
        from public.custom_answers a
        join public.profile_fields f on f.id = a.question_id
        join public.field_placements p on p.field_id = f.id and p.surface = 'onboarding'
       where a.profile_id = ${HER} and p.screen_key = '${screenId()}'`),
  ).toBe('number,search_choice,date,item_list,consent,signature,file_upload,yes_no,phone,email');

  // Her answers sit on their Fitxa fields (RAPP-653).
  const answers = page.getByTestId('participant-fitxa');
  const answer = (name: string) => answers.getByTestId(`fitxa-field-${questionId(name)}-value`);
  await expect(answer('Fills')).toHaveText('0');
  await expect(answer('Idiomes')).toHaveText('عنصر اختبار');
  await expect(answer('Arribada')).toHaveText(/^\d{1,2}\/\d{1,2}\/\d{4}$/);
  await expect(answer('Cotxe')).toHaveText(/^(Yes|Sí) \(.+\)$/);
  const signature = answer('Signatura');
  await expect(signature).toContainText(/Signed|Signat/);
  await signature.getByRole('button', { name: /Show the signature|Mostra la signatura/ }).click();
  await expect(page.getByRole('dialog').locator('svg')).toBeVisible();
  await page.keyboard.press('Escape');
  const file = answer('Informe');
  await expect(file).toContainText('prova.pdf');
  await expect(file.getByRole('button', { name: /Open the file|Obre el fitxer/ })).toBeVisible();
});

test('in Arabic, the new screen refuses a number out of range in her words', async ({
  browser,
}) => {
  // Her answers to this screen go, so her wizard opens on it.
  queryDatabase(`
    delete from public.custom_answers a using public.field_placements p
     where p.field_id = a.question_id and p.surface = 'onboarding' and a.profile_id = ${HER}
       and p.screen_key = '${screenId()}'`);
  const player = await (await browser.newContext({ locale: 'ar' })).newPage();
  await signInPlayer(player, TEST_PLAYER_EMAIL, 'ar');
  const screen = player.getByTestId(`wizard-custom-${screenId()}`);
  await expect(screen).toBeVisible({ timeout: 90_000 });
  await expect(player.locator('html')).toHaveAttribute('dir', 'rtl');
  const number = player.getByTestId(`custom-question-${questionId('Fills')}-input`);
  await number.fill('20');
  await player.getByRole('button', { name: onboardingAr.continueAction, exact: true }).click();
  await expect(
    player.getByText(
      onboardingAr.customErrorNumberRange!.replace('{{min}}', '0').replace('{{max}}', '15'),
    ),
  ).toBeVisible();
  expect(new URL(player.url()).pathname).toContain('custom');
  await number.fill('3');
  await player.getByRole('button', { name: onboardingAr.continueAction, exact: true }).click();
  // She moves on to the summary (the screen she left stays mounted under it).
  await expect(player).not.toHaveURL(/\/custom\//, { timeout: 30_000 });
  await player.context().close();
});
