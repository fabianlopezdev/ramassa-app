/**
 * The suggestions form on the form engine's board (RAPP-939):
 *   - the onboarding design role opens Formulari de suggeriments from the
 *     menu and sees its screens as phones: the fixed screen first, drawing
 *     the type, the text and the photo, with no way to delete it;
 *   - she adds a screen from the board's add card and a question on it with
 *     the question dialog a survey uses: the question is the form's own;
 *   - a player sends a suggestion answering it, through the call her phone
 *     uses;
 *   - the inbox shows the answer under its question.
 * Every expected value comes from psql; what this spec creates is removed again.
 */

import { expect, test } from '@playwright/test';
import { ONBOARDING_DESIGNER_EMAIL } from '@ramassa/shared/testing';
import {
  accessTokenFor,
  queryDatabase,
  SEED_PASSWORD,
  signIn,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from './session';

const ADMIN_EMAIL = 'laia.ferrer@example.test';
const PLAYER_EMAIL = 'amina.alhassan@example.test';
const ORG_ID = '5eed0000-0000-4000-8000-000000000000';
const runTag = `s${Date.now().toString(36)}`;
const SCREEN_NAME = `Pantalla ${runTag}`;
const QUESTION = `Quin dia et va millor? ${runTag}`;
const ANSWER = `Dimarts ${runTag}`;

let screenId = '';
let questionId = '';
let submissionId = '';

const sql = (value: string) => `'${value.replaceAll("'", "''")}'`;

test.setTimeout(240_000);

test.afterAll(() => {
  queryDatabase(`
    begin;
    delete from public.feedback_submissions where id = nullif(${sql(submissionId)}, '')::uuid;
    delete from public.field_placements where field_id = nullif(${sql(questionId)}, '')::uuid;
    delete from public.profile_fields where id = nullif(${sql(questionId)}, '')::uuid;
    update public.custom_form_screens set is_archived = true where id = nullif(${sql(screenId)}, '')::uuid;
    commit;
  `);
});

test.describe.serial('the suggestions form', () => {
  test('the design role builds it on the board of screens', async ({ page }) => {
    await signIn(page, ONBOARDING_DESIGNER_EMAIL);
    await page.goto('/forms/feedback');
    const fixed = queryDatabase(
      `select s.id from public.custom_form_screens s
         join public.custom_forms f on f.id = s.form_id and f.system_key = 'feedback'
        where f.org_id = '${ORG_ID}' and s.system_screen = 'feedback_message' and not s.is_archived`,
    );
    await expect(page.getByTestId('screen-board')).toBeVisible({ timeout: 30_000 });
    // Named in the menu as on the page.
    await expect(
      page.getByRole('link', { name: /Formulari de suggeriments|Suggestions form/ }),
    ).toBeVisible();
    // The fixed screen draws the type, the text and the photo, and is never deleted.
    const fixedCard = page.getByTestId(`board-step-${fixed}`);
    await expect(fixedCard).toContainText(/De què es tracta\?|What is this about\?/);
    await expect(page.getByTestId(`board-remove-${fixed}`)).toHaveCount(0);

    await page.getByTestId('board-add-screen').click();
    await page.getByTestId('new-screen-name').fill(SCREEN_NAME);
    // Its screens always show: a new one depends on no answer.
    await expect(page.getByTestId('new-screen-depends')).toHaveCount(0);
    await page.getByTestId('new-screen-create').click();
    await expect(page).toHaveURL(/\/forms\/feedback\/screens\/[0-9a-f-]+$/, { timeout: 20_000 });
    screenId = queryDatabase(
      `select id from public.custom_form_screens where title ->> 'ca' = ${sql(SCREEN_NAME)}`,
    );

    await page.getByTestId('screen-questions').getByTestId('screen-questions-add').click();
    const dialog = page.getByTestId('survey-question-dialog');
    await expect(dialog).toBeVisible();
    // The type picker opens from its card, or shows its cards in place.
    const change = dialog.getByTestId('question-type-change');
    if ((await change.count()) > 0) await change.click();
    await page.getByTestId('question-type-option-short_text').click();
    await dialog.locator('[name="question-label.ca"]').fill(QUESTION);
    await dialog.getByTestId('survey-question-form-save').click();
    await expect
      .poll(
        () =>
          queryDatabase(
            `select f.id || '|' || f.kind || '|' || p.screen_key
               from public.profile_fields f
               join public.field_placements p on p.field_id = f.id and p.surface = 'custom_form'
              where f.label ->> 'ca' = ${sql(QUESTION)}`,
          ),
        { timeout: 15_000 },
      )
      .toMatch(new RegExp(`\\|survey\\|${screenId}$`));
    questionId = queryDatabase(
      `select id from public.profile_fields where label ->> 'ca' = ${sql(QUESTION)}`,
    );
    await expect(page.getByTestId('phone-screen')).toContainText(QUESTION);
  });

  test('a player answers it and the inbox shows the answer under its question', async ({
    page,
  }) => {
    const token = await accessTokenFor(PLAYER_EMAIL, SEED_PASSWORD);
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/send_feedback_submission`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        p_type: 'idea',
        p_content: `Un taller ${runTag}`,
        p_image_url: null,
        p_answers: { [questionId]: ANSWER },
      }),
    });
    const body = await response.text();
    expect(response.ok, body).toBe(true);
    submissionId = JSON.parse(body) as string;

    await signIn(page, ADMIN_EMAIL);
    await page.goto('/feedback');
    const answers = page.getByTestId(`feedback-answers-${submissionId}`);
    await expect(answers).toContainText(QUESTION, { timeout: 30_000 });
    await expect(answers).toContainText(ANSWER);
  });
});
