/**
 * An activity's sign-up questions on the form engine (RAPP-941):
 *   - an admin opens an activity and, from its editor's row, makes its sign-up
 *     form and lands on the board, named by the activity, with no versions and
 *     no Publica; she adds two screens from the add card (no condition is
 *     offered), a question on one, rewords it, and reorders the screens;
 *   - Altres formularis lists the form with its activity's title, and the
 *     design role opens it from there and adds a question of the form's own;
 *     the activity itself stays closed to her;
 *   - a player signs up through the call her phone uses, answering both;
 *   - the activity's page shows who signed up with each answer under its
 *     question.
 * Every expected value comes from psql; what this spec creates is removed again.
 */

import { expect, test, type Page } from '@playwright/test';
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
const PLAYER_ID = '5eed0000-0000-4000-8000-000000000011';
const ORG_ID = '5eed0000-0000-4000-8000-000000000000';
const runTag = `s${Date.now().toString(36)}`;
const ACTIVITY = `Sortida a la platja ${runTag}`;
const FIRST_SCREEN = `Transport ${runTag}`;
const SECOND_SCREEN = `Samarreta ${runTag}`;
const QUESTION = `Necessites seient al bus? ${runTag}`;
const REWORDED = `Vols seient al bus? ${runTag}`;
const DESIGNER_QUESTION = `Quina talla fas? ${runTag}`;
const ANSWER = `Sí, un seient ${runTag}`;
const DESIGNER_ANSWER = `M ${runTag}`;

let eventId = '';
let formId = '';

const sql = (value: string) => `'${value.replaceAll("'", "''")}'`;

test.setTimeout(240_000);

test.beforeAll(() => {
  eventId = queryDatabase(`
    with made as (
    insert into public.events (org_id, category_id, title, location, starts_at, signup_mode, status, published_at)
    values (${sql(ORG_ID)},
            (select id from public.event_categories where org_id = ${sql(ORG_ID)} order by sort_order limit 1),
            jsonb_build_object('ca', ${sql(ACTIVITY)}, 'es', ${sql(ACTIVITY)}, 'en', ${sql(ACTIVITY)},
                               'fr', ${sql(ACTIVITY)}, 'ar', ${sql(ACTIVITY)}, 'fa', ${sql(ACTIVITY)}),
            'Barceloneta', now() + interval '20 days', 'confirm', 'published', now() - interval '1 hour')
    returning id)
    select id from made`);
});

test.afterAll(() => {
  queryDatabase(`
    begin;
    delete from public.events where id = nullif(${sql(eventId)}, '')::uuid;
    delete from public.custom_forms where id = nullif(${sql(formId)}, '')::uuid;
    commit;
  `);
});

/** Adds a question with the question dialog a survey uses, as short text. */
async function addQuestion(page: Page, label: string) {
  await page.getByTestId('screen-questions').getByTestId('screen-questions-add').click();
  const dialog = page.getByTestId('survey-question-dialog');
  await expect(dialog).toBeVisible();
  // The type picker opens from its card, or shows its cards in place.
  const change = dialog.getByTestId('question-type-change');
  if ((await change.count()) > 0) await change.click();
  await page.getByTestId('question-type-option-short_text').click();
  await dialog.locator('[name="question-label.ca"]').fill(label);
  await dialog.getByTestId('survey-question-form-save').click();
  await expect(dialog).toHaveCount(0, { timeout: 15_000 });
}

/** Adds a screen from the board's add card; its editor opens. */
async function addScreen(page: Page, name: string): Promise<string> {
  await page.getByTestId('board-add-screen').click();
  await page.getByTestId('new-screen-name').fill(name);
  // Its screens always show: a new one depends on no answer.
  await expect(page.getByTestId('new-screen-depends')).toHaveCount(0);
  await page.getByTestId('new-screen-create').click();
  await expect(page).toHaveURL(/\/forms\/custom\/[0-9a-f-]+\/screens\/[0-9a-f-]+$/, {
    timeout: 20_000,
  });
  return queryDatabase(
    `select id from public.custom_form_screens where title ->> 'ca' = ${sql(name)}`,
  );
}

const questionOf = (label: string) =>
  `select f.kind || '|' || f.survey_form_id || '|' || p.screen_key
     from public.profile_fields f
     join public.field_placements p on p.field_id = f.id and p.surface = 'custom_form'
    where f.label ->> 'ca' = ${sql(label)}`;

test.describe.serial('an activity sign-up questions', () => {
  test('an admin makes them from the activity and builds them on the board', async ({ page }) => {
    await signIn(page, ADMIN_EMAIL);
    await page.goto(`/content/events/${eventId}`);
    const row = page.getByTestId('event-signup-questions');
    await expect(row).toContainText(/Preguntes de la inscripció|Signup questions/, {
      timeout: 30_000,
    });
    await row.getByTestId('event-signup-questions-open').click();
    await expect(page).toHaveURL(/\/forms\/custom\/[0-9a-f-]+$/, { timeout: 20_000 });
    formId = queryDatabase(
      `select id from public.custom_forms where event_id = ${sql(eventId)} and kind = 'signup' and not is_archived`,
    );
    expect(page.url()).toContain(formId);

    // Named by the activity; back to the activity; no versions, no Publica, no settings.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(ACTIVITY);
    await expect(page.getByTestId('custom-form-back')).toHaveAttribute(
      'href',
      `/content/events/${eventId}`,
    );
    await expect(page.getByTestId('custom-form-back')).toContainText(ACTIVITY);
    await expect(page.getByTestId('screen-board')).toBeVisible();
    await expect(page.getByTestId('custom-form-versions')).toHaveCount(0);
    await expect(page.getByTestId('custom-form-publish')).toHaveCount(0);

    const first = await addScreen(page, FIRST_SCREEN);
    // A screen of a sign-up form always shows: no hide switch, no condition.
    await expect(page.locator('[data-testid^="screen-condition"]')).toHaveCount(0);
    await addQuestion(page, QUESTION);
    await expect
      .poll(() => queryDatabase(questionOf(QUESTION)), { timeout: 15_000 })
      .toBe(`survey|${formId}|${first}`);
    await expect(page.getByTestId('phone-screen')).toContainText(QUESTION);

    // She rewords the question with the same dialog.
    const questionId = queryDatabase(
      `select id from public.profile_fields where label ->> 'ca' = ${sql(QUESTION)}`,
    );
    await page.getByTestId(`placement-row-${questionId}-edit`).click();
    await page.getByTestId(`placement-row-${questionId}-field`).click();
    const dialog = page.getByTestId('survey-question-dialog');
    await dialog.locator('[name="question-label.ca"]').fill(REWORDED);
    await dialog.getByTestId('survey-question-form-save').click();
    await expect
      .poll(
        () =>
          queryDatabase(
            `select label ->> 'ca' from public.profile_fields where id = ${sql(questionId)}`,
          ),
        {
          timeout: 15_000,
        },
      )
      .toBe(REWORDED);

    await page.goto(`/forms/custom/${formId}`);
    const second = await addScreen(page, SECOND_SCREEN);
    await page.goto(`/forms/custom/${formId}`);
    await expect(page.getByTestId(`board-step-${second}`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId(`board-hide-${second}`)).toHaveCount(0);
    await expect(page.getByTestId(`board-add-dependent-${second}`)).toHaveCount(0);

    // A drag by keyboard puts the second screen first.
    const grip = page.getByTestId(`board-step-${second}`).locator('header button.cursor-grab');
    await grip.focus();
    // The keyboard sensor picks the card up, moves it and drops it, one step at a time.
    for (const key of ['Space', 'ArrowLeft', 'Space']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(400);
    }
    await expect
      .poll(
        () =>
          queryDatabase(
            `select string_agg(id::text, ',' order by sort_order) from public.custom_form_screens
              where form_id = ${sql(formId)} and not is_archived`,
          ),
        { timeout: 15_000 },
      )
      .toBe(`${second},${first}`);
  });

  test('Altres formularis lists it, and the design role builds it from there', async ({ page }) => {
    await signIn(page, ONBOARDING_DESIGNER_EMAIL);
    await page.goto('/forms/custom');
    const listed = page.getByTestId(`custom-form-row-${formId}`);
    await expect(listed).toContainText(ACTIVITY, { timeout: 30_000 });
    await expect(listed).toContainText(/Preguntes de la inscripció|Signup questions/);
    await listed.click();
    await expect(page).toHaveURL(new RegExp(`/forms/custom/${formId}$`), { timeout: 20_000 });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(ACTIVITY);
    // She cannot open the activity: her way back is the list.
    await expect(page.getByTestId('custom-form-back')).toHaveAttribute('href', '/forms/custom');

    const second = queryDatabase(
      `select id from public.custom_form_screens where title ->> 'ca' = ${sql(SECOND_SCREEN)}`,
    );
    await page.getByTestId(`board-edit-${second}`).click();
    await expect(page).toHaveURL(new RegExp(`/screens/${second}$`), { timeout: 20_000 });
    await addQuestion(page, DESIGNER_QUESTION);
    await expect
      .poll(() => queryDatabase(questionOf(DESIGNER_QUESTION)), { timeout: 15_000 })
      .toBe(`survey|${formId}|${second}`);

    // The activity and its sign-ups are not hers.
    await page.goto(`/content/events/${eventId}`);
    await expect(page.getByTestId('event-signups')).toHaveCount(0);
    await expect(page.getByTestId('event-signup-questions')).toHaveCount(0);
  });

  test('a player signs up answering them, and the activity shows her answers', async ({ page }) => {
    const reworded = queryDatabase(
      `select id from public.profile_fields where label ->> 'ca' = ${sql(REWORDED)}`,
    );
    const size = queryDatabase(
      `select id from public.profile_fields where label ->> 'ca' = ${sql(DESIGNER_QUESTION)}`,
    );
    const token = await accessTokenFor(PLAYER_EMAIL, SEED_PASSWORD);
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sign_up_for_event`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        p_event_id: eventId,
        p_answers: { [reworded]: ANSWER, [size]: DESIGNER_ANSWER },
      }),
    });
    const body = await response.text();
    expect(response.ok, body).toBe(true);
    expect(
      queryDatabase(
        `select state || '|' || (answers_encrypted is not null) from public.event_signups
          where event_id = ${sql(eventId)} and player_id = ${sql(PLAYER_ID)}`,
      ),
    ).toBe('confirmed|true');

    await signIn(page, ADMIN_EMAIL);
    await page.goto(`/content/events/${eventId}`);
    const answers = page.getByTestId(`event-signup-answers-${PLAYER_ID}`);
    await expect(answers).toContainText(REWORDED, { timeout: 30_000 });
    await expect(answers).toContainText(ANSWER);
    await expect(answers).toContainText(DESIGNER_QUESTION);
    await expect(answers).toContainText(DESIGNER_ANSWER);
    await expect(page.getByTestId('event-signups')).toContainText(
      /Inscripcions \(1\)|Signups \(1\)/,
    );
  });
});
