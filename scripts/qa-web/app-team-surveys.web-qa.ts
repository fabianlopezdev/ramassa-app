/**
 * Surveys in the app (RAPP-384), through the web build: the seeded survey's
 * results show the stars, the choices, yes and no, and the written answers
 * with who wrote them; then a new survey with a rating and a choice question
 * is saved only once all five languages are approved, and the results are
 * shared as a CSV that the database records (RAPP-402). Expected values come
 * from the database.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer, STAFF_EMAIL } from './session';

test.setTimeout(240_000);

const SURVEY = '5eed0000-0000-4000-8040-000000000001';
const RATING = '5eed0000-0000-4000-8041-000000000001';
const CHOICE = '5eed0000-0000-4000-8041-000000000002';
const YES_NO = '5eed0000-0000-4000-8041-000000000003';
const FREE_TEXT = '5eed0000-0000-4000-8041-000000000004';
const title = `Enquesta app ${Date.now().toString(36)}`;

const sql = (value: string) => `'${value.replaceAll("'", "''")}'`;

test.afterAll(() => {
  queryDatabase(`delete from public.surveys where title->>'ca' = ${sql(title)};`);
});

async function openSurveys(page: Page): Promise<void> {
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);
  await page.getByTestId('team-sidebar-more').click({ timeout: 30_000 });
  await page.getByTestId('team-more-surveys').click({ timeout: 30_000 });
  await expect(page.getByTestId(`team-survey-${SURVEY}`)).toBeVisible({ timeout: 30_000 });
}

/** How many completed responses gave this answer to this question. */
function answered(questionId: string, answer: string): number {
  return Number(
    queryDatabase(`
      select count(*) from public.survey_responses
       where survey_id = ${sql(SURVEY)} and status = 'completed'
         and (public.decrypt_field(answers_encrypted)::jsonb -> ${sql(questionId)}) = ${sql(answer)}::jsonb;
    `).trim(),
  );
}

test('the seeded results are attributed, and a new survey needs every language approved', async ({
  page,
}) => {
  await openSurveys(page);
  const completed = queryDatabase(`
    select count(*) from public.survey_responses
     where survey_id = ${sql(SURVEY)} and status = 'completed';
  `).trim();
  await expect(page.getByTestId(`team-survey-${SURVEY}`)).toContainText(`${completed} completed`);

  await page.getByTestId(`team-survey-${SURVEY}`).click();
  await expect(page.getByTestId('survey-results-counts')).toContainText(`${completed} completed`, {
    timeout: 30_000,
  });
  for (const rating of ['5', '3']) {
    await expect(page.getByTestId(`survey-result-${RATING}-${rating}`)).toContainText(
      String(answered(RATING, rating)),
    );
  }
  await expect(page.getByTestId(`survey-result-${CHOICE}-training`)).toContainText(
    String(answered(CHOICE, '"training"')),
  );
  await expect(page.getByTestId(`survey-result-${YES_NO}-yes`)).toContainText(
    String(answered(YES_NO, 'true')),
  );
  const writer = queryDatabase(`
    select profile.id || '|' || profile.first_name
      from public.survey_responses as response
      join public.profiles as profile on profile.id = response.player_id
     where response.id = '5eed0000-0000-4000-8042-000000000002';
  `)
    .trim()
    .split('|');
  await expect(page.getByTestId(`survey-result-${FREE_TEXT}-${writer[0]}`)).toContainText(
    writer[1]!,
  );
  await expect(page.getByTestId(`survey-result-${FREE_TEXT}-${writer[0]}`)).toContainText(
    'Molt útil',
  );
  await page.getByTestId('team-survey-results-back').click();

  await page.getByTestId('team-surveys-new').click();
  await page.getByTestId('survey-title-source').fill(title);
  await page.getByTestId('survey-question-0-prompt-source').fill('Com valores el taller?');
  await page.getByTestId('survey-add-question').click();
  await page.getByTestId('survey-question-1-type-multiple_choice').click();
  await page.getByTestId('survey-question-1-prompt-source').fill('Quin horari prefereixes?');
  await page.getByTestId('survey-question-1-choice-0-source').fill('Matí');
  await page.getByTestId('survey-question-1-choice-1-source').fill('Tarda');
  await page.getByTestId('survey-question-1-add-choice').click();
  await page.getByTestId('survey-question-1-choice-2-source').fill('Vespre');
  await page.getByTestId('survey-question-1-choice-2-remove').click();
  await expect(page.getByTestId('survey-question-1-choice-2-source')).toHaveCount(0);

  // Not before every language is approved.
  await page.getByTestId('survey-save').click();
  await expect(page.getByTestId('survey-notice')).toHaveText(
    'Review and approve all five languages before publishing.',
  );

  await page.getByTestId('survey-generate').click();
  for (const field of [
    'survey-title',
    'survey-question-0-prompt',
    'survey-question-1-prompt',
    'survey-question-1-choice-0',
    'survey-question-1-choice-1',
  ]) {
    await page.getByTestId(`${field}-approve-all`).click({ timeout: 60_000 });
  }
  await page.getByTestId('survey-save').click();
  await expect(page.getByTestId('team-surveys')).toBeVisible({ timeout: 30_000 });

  const saved = queryDatabase(`
    select survey.id || '|' || survey.audience_kind || '|' ||
           (select count(*) from jsonb_object_keys(survey.title)) || '|' ||
           string_agg(
             question.question_type || ':' || question.required || ':' ||
             coalesce((
               select string_agg(choice->>'id' || '=' ||
                        (select count(*) from jsonb_object_keys(choice->'label')), ',')
                 from jsonb_array_elements(question.options) as choice
             ), '-'),
             ';' order by question.sort_order)
      from public.surveys as survey
      join public.survey_questions as question on question.survey_id = survey.id
     where survey.title->>'ca' = ${sql(title)}
     group by survey.id, survey.audience_kind, survey.title;
  `)
    .trim()
    .split('|');
  expect(saved.slice(1)).toEqual([
    'all',
    '5',
    'rating:true:-;multiple_choice:true:option_1=5,option_2=5',
  ]);
  await expect(page.getByTestId(`team-survey-${saved[0]}`)).toBeVisible({ timeout: 30_000 });
});

test('the results are shared as a CSV, and the database records the export', async ({ page }) => {
  await openSurveys(page);
  await page.getByTestId(`team-survey-${SURVEY}`).click();
  const names = queryDatabase(`
    select string_agg(profile.first_name, ',') from public.survey_responses as response
      join public.profiles as profile on profile.id = response.player_id
     where response.survey_id = ${sql(SURVEY)};
  `)
    .trim()
    .split(',');
  const before = Number(
    queryDatabase(`
      select count(*) from public.audit_log
       where action = 'survey_export' and target_id = ${sql(SURVEY)};
    `).trim(),
  );

  // The web build downloads the file where the phone opens the share sheet.
  const download = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByTestId('survey-export-csv').click({ timeout: 30_000 });
  const file = await download;
  const text = readFileSync((await file.path()) ?? '', 'utf8').replace(/^\uFEFF/, '');
  const lines = text.trim().split('\r\n');
  expect(lines[0]).toContain('"player_name"');
  expect(lines).toHaveLength(names.length + 1);
  for (const name of names) expect(text).toContain(name);
  await expect(page.getByTestId('survey-export-notice')).toContainText(String(names.length));
  expect(
    Number(
      queryDatabase(`
        select count(*) from public.audit_log
         where action = 'survey_export' and target_id = ${sql(SURVEY)};
      `).trim(),
    ),
  ).toBe(before + 1);
});
