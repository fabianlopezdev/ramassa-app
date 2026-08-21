import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PARTICIPANT_FIXTURES, SEED_ACCOUNT_PASSWORD, seedUserId } from '@ramassa/shared/testing';
import { queryDatabase, signIn, STAFF_EMAIL } from './session';

const playerOrigin = `http://localhost:${process.env.RAMASSA_QA_PLAYER_PORT ?? '4194'}`;
const arabicPlayer = PARTICIPANT_FIXTURES.find((fixture) => fixture.ordinal === 11)!;
const catalanPlayer = PARTICIPANT_FIXTURES.find((fixture) => fixture.ordinal === 27)!;
const playerIds = [seedUserId(arabicPlayer.ordinal), seedUserId(catalanPlayer.ordinal)];
const surveyId = '5eed0000-0000-4000-8040-000000000001';
const arabicAnswer = 'تجربة واضحة ومفيدة';
const catalanAnswer = 'Una experiència clara i útil';

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function signInPlayer(
  page: Page,
  player: (typeof PARTICIPANT_FIXTURES)[number],
): Promise<void> {
  await page.goto(`${playerOrigin}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const usePassword = page
    .getByRole('button', { name: /password|contrasenya|contraseña/i })
    .first();
  await expect(usePassword).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await usePassword.click();
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await page.locator('input[type="email"]').fill(player.email);
  await page.locator('input[type="password"]').fill(SEED_ACCOUNT_PASSWORD);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByTestId('open-knowledge-base')).toBeVisible({ timeout: 30_000 });
}

test.afterAll(() => {
  queryDatabase(`
    begin;
    delete from public.audit_log
     where action = 'survey_response_completed'
       and actor_id = any(array[${playerIds.map((id) => `${sqlLiteral(id)}::uuid`).join(',')}])
       and target_id = ${sqlLiteral(surveyId)}::uuid;
    delete from public.survey_responses
     where survey_id = ${sqlLiteral(surveyId)}::uuid
       and player_id = any(array[${playerIds.map((id) => `${sqlLiteral(id)}::uuid`).join(',')}]);
    commit;
  `);
});

test('Catalan and Arabic players complete every control and staff sees attributed aggregates and CSV', async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  await signInPlayer(page, arabicPlayer);
  await page.goto(`${playerOrigin}/profile`);
  await page.getByTestId('profile-language-ar').click();
  await page.goto(playerOrigin);
  await expect(page.getByText('رأيك في التدريب', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'أجيبي الآن: رأيك في التدريب' }).click();

  await expect(page.getByText('هذا الرد ليس مجهولاً. يمكن للفريق معرفة من أجاب.')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('radio', { name: '4 من 5 نجوم' }).click();
  await page.getByTestId('survey-next').click();
  await page.getByRole('radio', { name: 'التدريب' }).click();
  await page.getByTestId('survey-next').click();
  await page.getByRole('radio', { name: 'نعم' }).click();
  await page.getByTestId('survey-next').click();
  await page.getByLabel('اكتبي تعليقك').fill(arabicAnswer);
  await page.getByTestId('survey-next').click();
  await expect(page.getByText('شكراً لمشاركة رأيك')).toBeVisible({
    timeout: 30_000,
  });

  expect(
    queryDatabase(
      `select status || '|' || (public.decrypt_field(answers_encrypted)::jsonb->>'5eed0000-0000-4000-8041-000000000004')
       from public.survey_responses
        where survey_id = ${sqlLiteral(surveyId)}::uuid
          and player_id = ${sqlLiteral(seedUserId(arabicPlayer.ordinal))}::uuid`,
    ),
  ).toBe(`completed|${arabicAnswer}`);

  const catalanContext = await browser.newContext();
  const catalanPage = await catalanContext.newPage();
  await signInPlayer(catalanPage, catalanPlayer);
  await catalanPage.goto(`${playerOrigin}/profile`);
  await catalanPage.getByTestId('profile-language-ca').click();
  await catalanPage.goto(playerOrigin);
  await expect(
    catalanPage.getByText('La teva opinió sobre la formació', { exact: true }),
  ).toBeVisible({
    timeout: 30_000,
  });
  await catalanPage
    .getByRole('button', { name: 'Respondre ara: La teva opinió sobre la formació' })
    .click();
  await expect(
    catalanPage.getByText("Aquesta resposta no és anònima. L'equip podrà veure qui ha respost."),
  ).toBeVisible({ timeout: 30_000 });
  await catalanPage.getByRole('radio', { name: '5 de 5 estrelles' }).click();
  await catalanPage.getByTestId('survey-next').click();
  await catalanPage.getByRole('radio', { name: 'Acompanyament' }).click();
  await catalanPage.getByTestId('survey-next').click();
  await catalanPage.getByRole('radio', { name: 'Sí' }).click();
  await catalanPage.getByTestId('survey-next').click();
  await catalanPage.getByLabel('Escriu el teu comentari').fill(catalanAnswer);
  await catalanPage.getByTestId('survey-next').click();
  await expect(catalanPage.getByText('Gràcies per compartir la teva opinió')).toBeVisible({
    timeout: 30_000,
  });
  await catalanContext.close();

  expect(
    queryDatabase(
      `select status || '|' || (public.decrypt_field(answers_encrypted)::jsonb->>'5eed0000-0000-4000-8041-000000000004')
         from public.survey_responses
        where survey_id = ${sqlLiteral(surveyId)}::uuid
          and player_id = ${sqlLiteral(seedUserId(catalanPlayer.ordinal))}::uuid`,
    ),
  ).toBe(`completed|${catalanAnswer}`);

  await signIn(page, STAFF_EMAIL);
  await page.goto('/surveys');
  await expect(page.getByRole('heading', { name: 'Surveys', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: /Your training feedback/ }).click();
  await expect(page.getByText(arabicAnswer, { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(arabicPlayer.firstName, { exact: false }).first()).toBeVisible();
  await expect(page.getByText(catalanAnswer, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(catalanPlayer.firstName, { exact: false }).first()).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = readFileSync(path!);
  expect(bytes.subarray(0, 3).toString('hex')).toBe('efbbbf');
  expect(bytes.toString('utf8')).toContain(arabicAnswer);
  expect(bytes.toString('utf8')).toContain(arabicPlayer.firstName);
  expect(bytes.toString('utf8')).toContain(catalanAnswer);
  expect(bytes.toString('utf8')).toContain(catalanPlayer.firstName);
});
