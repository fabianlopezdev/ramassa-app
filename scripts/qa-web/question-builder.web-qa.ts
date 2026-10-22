/**
 * The question builder (RAPP-307): an admin builds a screen with a question in
 * Settings, a question the app needs cannot be hidden, and staff read a
 * player's answers on her page with an archived option marked. Every expected
 * value comes from psql; what this spec creates is removed again.
 */

import { expect, test } from '@playwright/test';
import { queryDatabase, signIn, STAFF_EMAIL } from './session';

const ADMIN_EMAIL = 'laia.ferrer@example.test';
const PLAYER_ID = '5eed0000-0000-4000-8000-000000000011';
const runTag = `q${Date.now().toString(36)}`;

test.afterAll(() => {
  queryDatabase(`
    delete from public.intake_screens where title ->> 'ca' = 'Pantalla ${runTag}';
  `);
});

test('an admin builds a screen with a question, and its type then locks', async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  await page.goto('/settings?tab=questions');
  const builder = page.getByTestId('question-builder');
  await expect(builder).toBeVisible({ timeout: 15_000 });
  await expect(builder).toContainText(/Com arribes als entrenaments|How you get to training/);

  await builder
    .getByRole('button', { name: /^(new screen|pantalla nova|pantalla nueva)$/i })
    .click();
  const screenForm = page.getByTestId('screen-form');
  await screenForm.locator('[name="screen-title.ca"]').fill(`Pantalla ${runTag}`);
  await screenForm.locator('[name="screen-after"]').selectOption('background');
  await screenForm.getByRole('button', { name: /save the screen|desa la pantalla/i }).click();
  await expect
    .poll(
      () =>
        queryDatabase(
          `select after_screen from public.intake_screens where title ->> 'ca' = 'Pantalla ${runTag}'`,
        ),
      { timeout: 15_000 },
    )
    .toBe('background');

  const screenId = queryDatabase(
    `select id from public.intake_screens where title ->> 'ca' = 'Pantalla ${runTag}'`,
  );
  const screen = page.getByTestId(`builder-screen-${screenId}`);
  await screen.getByRole('button', { name: /add a question|afegeix una pregunta/i }).click();
  const questionForm = page.getByTestId('question-form');
  await questionForm.locator('[name="question-label.ca"]').fill(`Pregunta ${runTag}`);
  await questionForm.locator('[name="question-privacy"]').selectOption('sensitive');
  await questionForm.locator('[name="question-placement-staff"]').check();
  await questionForm.getByRole('button', { name: /save the question|desa la pregunta/i }).click();
  await expect
    .poll(
      () =>
        queryDatabase(
          `select question_type || '|' || privacy || '|' || array_to_string(placements, ',')
             from public.custom_questions where label ->> 'ca' = 'Pregunta ${runTag}'`,
        ),
      { timeout: 15_000 },
    )
    .toBe('short_text|sensitive|wizard,staff');

  // Open it again: the type and the privacy level are locked, and the form says why.
  const questionId = queryDatabase(
    `select id from public.custom_questions where label ->> 'ca' = 'Pregunta ${runTag}'`,
  );
  await page
    .getByTestId(`builder-question-${questionId}`)
    .getByRole('button', { name: /^(edit|edita)$/i })
    .click();
  await expect(page.getByTestId('question-form').locator('[name="question-type"]')).toBeDisabled();
  await expect(
    page.getByTestId('question-form').locator('[name="question-privacy"]'),
  ).toBeDisabled();
  expect(
    Number(
      queryDatabase(
        `select count(*) from public.audit_log where action = 'intake.question_save' and target_id = '${questionId}'`,
      ),
    ),
  ).toBe(1);
});

test('a question the app needs cannot be hidden, and the form says why', async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  await page.goto('/settings?tab=questions');
  await page.getByTestId('builder-builtin-first_name').getByRole('button').click();
  const form = page.getByTestId('builtin-form');
  await expect(form.locator('[name="builtin-hidden"]')).toBeDisabled();
  // A required question is never hidden (RAPP-611): the form says so.
  await expect(form).toContainText(/is required|és obligatòria|es obligatoria/i);
});

test("staff read a player's answers, an archived option marked", async ({ page }) => {
  await signIn(page, STAFF_EMAIL);
  await page.goto(`/participants/${PLAYER_ID}`);
  const section = page.getByTestId('participant-custom-answers');
  await expect(section).toBeVisible({ timeout: 15_000 });
  await expect(
    section.getByTestId('custom-answer-5eed0000-0000-4000-8045-000000000002'),
  ).toContainText(/(Un cartell \(arxivada\)|A poster \(archived\))/);
  // The seeded staff hold the Sensitive level: her seasonal answer is read, decrypted.
  await expect(
    section.getByTestId('custom-answer-5eed0000-0000-4000-8045-000000000003'),
  ).toContainText('Treballo els dijous a la tarda.');
});
