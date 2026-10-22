/**
 * Builder question types match every field kind the app uses (RAPP-610), end
 * to end in real browsers:
 *   - an admin builds a number question with its range and a long searchable
 *     list pasted one per line, reading what each type asks and her phone's
 *     preview in Arabic, right to left;
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
    `select id from public.custom_questions where label ->> 'ca' = '${label} ${runTag}'`,
  );

test.afterAll(() => {
  queryDatabase(`
    begin;
    delete from public.custom_answers where profile_id = ${HER};
    update public.intake_flow_orders
       set step_order = array_remove(step_order, 'custom:' || (
         select id::text from public.intake_screens where title ->> 'ca' = '${SCREEN_TITLE}'))
     where org_id = '${ORG}';
    delete from public.intake_screens where title ->> 'ca' = '${SCREEN_TITLE}';
    delete from public.profile_answers where profile_id = ${HER};
    update public.profiles set preferred_language = 'ca', role = 'invited', terms_accepted_at = null
     where id = ${HER};
    commit;
  `);
});

test('an admin builds a number and a long list, and previews her phone in Arabic', async ({
  page,
}) => {
  await signIn(page, ADMIN_EMAIL);
  await page.goto('/onboarding');
  const builder = page.getByTestId('question-builder');
  await expect(builder).toBeVisible({ timeout: 30_000 });
  await builder
    .getByRole('button', { name: /^(new screen|pantalla nova|pantalla nueva)$/i })
    .click();
  const screenForm = page.getByTestId('screen-form');
  await screenForm.locator('[name="screen-title.ca"]').fill(SCREEN_TITLE);
  await screenForm.locator('[name="screen-after"]').selectOption('logistics');
  await screenForm.getByRole('button', { name: /save the screen|desa la pantalla/i }).click();
  await expect.poll(screenId, { timeout: 15_000 }).toMatch(/^[0-9a-f-]{36}$/);

  const screen = page.getByTestId(`builder-screen-${screenId()}`);
  await screen.getByRole('button', { name: /add a question|afegeix una pregunta/i }).click();
  let form = page.getByTestId('question-form');
  await form.locator('[name="question-type"]').selectOption('number');
  await expect(form.getByTestId('type-description')).toContainText(
    /whole or decimal|sencer o amb decimals/i,
  );
  await form.locator('[name="question-label.ca"]').fill(`Fills ${runTag}`);
  await form.locator('[name="setting-integer"]').check();
  await form.locator('[name="setting-min"]').fill('0');
  await form.locator('[name="setting-max"]').fill('15');

  // Her phone in Arabic: right to left, and the Catalan label until one is written.
  const preview = page.getByTestId('question-preview');
  await expect(preview).toHaveAttribute('dir', 'ltr');
  await page.getByTestId('question-preview-language').selectOption('ar');
  await expect(preview).toHaveAttribute('dir', 'rtl');
  await expect(page.getByTestId('question-preview-fallback')).toBeVisible();
  await expect(page.getByTestId('question-preview-label')).toHaveText(`Fills ${runTag}`);
  await form.locator('[name="question-label.ar"]').fill('كم عدد الأطفال؟');
  await expect(page.getByTestId('question-preview-label')).toHaveText('كم عدد الأطفال؟');
  await expect(page.getByTestId('question-preview-fallback')).toHaveCount(0);

  await form.getByRole('button', { name: /save the question|desa la pregunta/i }).click();
  await expect
    .poll(
      () =>
        queryDatabase(
          `select question_type || '|' || settings::text from public.custom_questions
            where label ->> 'ca' = 'Fills ${runTag}'`,
        ),
      { timeout: 15_000 },
    )
    .toBe('number|{"max": 15, "min": 0, "integer": true}');

  await screen.getByRole('button', { name: /add a question|afegeix una pregunta/i }).click();
  form = page.getByTestId('question-form');
  await form.locator('[name="question-type"]').selectOption('search_choice');
  await form.locator('[name="question-label.ca"]').fill(`Barri ${runTag}`);
  await form.locator('[name="options-paste"]').fill('Gràcia\nSants\nHorta\nGràcia');
  // This stack runs the media service: no warning on a file question.
  await form.getByRole('button', { name: /save the question|desa la pregunta/i }).click();
  await expect
    .poll(
      () =>
        queryDatabase(
          `select string_agg(o.label ->> 'ca', ',' order by o.sort_order)
             from public.custom_question_options o
             join public.custom_questions q on q.id = o.question_id
            where q.label ->> 'ca' = 'Barri ${runTag}'`,
        ),
      { timeout: 15_000 },
    )
    .toBe('Gràcia,Sants,Horta');

  // The other types, straight into the screen, as the builder saves them.
  queryDatabase(`
    insert into public.custom_questions (org_id, screen_id, question_type, label, privacy, placements, settings, sort_order)
    values
      ('${ORG}', '${screenId()}', 'date', '{"ca": "Arribada ${runTag}"}', 'personal', '{wizard}', '{"min_age": 16}', 2),
      ('${ORG}', '${screenId()}', 'item_list', '{"ca": "Idiomes ${runTag}"}', 'normal', '{wizard}', '{"max_items": 3}', 3),
      ('${ORG}', '${screenId()}', 'consent', '{"ca": "Cotxe ${runTag}"}', 'normal', '{wizard}', '{"text": {"ca": "Accepto que em portin"}}', 4),
      ('${ORG}', '${screenId()}', 'signature', '{"ca": "Signatura ${runTag}"}', 'personal', '{wizard}', '{}', 5),
      ('${ORG}', '${screenId()}', 'file_upload', '{"ca": "Informe ${runTag}"}', 'sensitive', '{wizard}', '{"accept": "document"}', 6),
      ('${ORG}', '${screenId()}', 'yes_no', '{"ca": "Bici ${runTag}"}', 'normal', '{wizard}', '{}', 7),
      ('${ORG}', '${screenId()}', 'phone', '{"ca": "Telèfon ${runTag}"}', 'personal', '{wizard}', '{}', 8),
      ('${ORG}', '${screenId()}', 'email', '{"ca": "Correu ${runTag}"}', 'personal', '{wizard}', '{}', 9);
  `);
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
      select string_agg(q.question_type, ',' order by q.sort_order)
        from public.custom_answers a join public.custom_questions q on q.id = a.question_id
       where a.profile_id = ${HER} and q.screen_id = '${screenId()}'`),
  ).toBe('number,search_choice,date,item_list,consent,signature,file_upload,yes_no,phone,email');

  const answers = page.getByTestId('participant-custom-answers');
  await expect(answers.getByTestId(`custom-answer-${questionId('Fills')}`)).toHaveText('0');
  await expect(answers.getByTestId(`custom-answer-${questionId('Idiomes')}`)).toHaveText(
    'عنصر اختبار',
  );
  await expect(answers.getByTestId(`custom-answer-${questionId('Arribada')}`)).toHaveText(
    /^\d{1,2}\/\d{1,2}\/\d{4}$/,
  );
  await expect(answers.getByTestId(`custom-answer-${questionId('Cotxe')}`)).toHaveText(
    /^(Yes|Sí) \(.+\)$/,
  );
  const signature = answers.getByTestId(`custom-answer-${questionId('Signatura')}`);
  await expect(signature).toContainText(/Signed|Signat/);
  await signature.getByText(/Show the signature|Mostra la signatura/).click();
  await expect(signature.locator('svg')).toBeVisible();
  const file = answers.getByTestId(`custom-answer-${questionId('Informe')}`);
  await expect(file).toContainText('prova.pdf');
  await expect(file.getByRole('button', { name: /Open the file|Obre el fitxer/ })).toBeVisible();
});

test('in Arabic, the new screen refuses a number out of range in her words', async ({
  browser,
}) => {
  // Her answers to this screen go, so her wizard opens on it.
  queryDatabase(`
    delete from public.custom_answers a using public.custom_questions q
     where q.id = a.question_id and a.profile_id = ${HER} and q.screen_id = '${screenId()}'`);
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
