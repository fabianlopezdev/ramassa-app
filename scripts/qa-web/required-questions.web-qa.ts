/**
 * Required or optional for every question (RAPP-611), end to end in real
 * browsers. On the onboarding page the design role sees her first name
 * locked as required with the reason, makes both sizes optional and makes a
 * staff question required; every change is audited. The seeded test player,
 * with her name, background and document already answered, then continues
 * past the sizes without choosing one, and her summary refuses to confirm
 * until she answers the staff question, sending her to that screen.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ONBOARDING_DESIGNER_EMAIL, TEST_PLAYER_EMAIL } from '@ramassa/shared/testing';
import { PLAYER_ORIGIN, queryDatabase, signIn, signInPlayer } from './session';

const ORG = '5eed0000-0000-4000-8000-000000000000';
const HER = `(select id from auth.users where email = '${TEST_PLAYER_EMAIL}')`;
// The seeded "public transport?" question on the travel screen: her wizard and the referral form.
const SCREEN = '5eed0000-0000-4000-8044-000000000001';
const QUESTION = '5eed0000-0000-4000-8045-000000000001';
const onboardingIn = (language: string) =>
  JSON.parse(
    readFileSync(`packages/shared/i18n/locales/${language}/onboarding.json`, 'utf8'),
  ) as Record<string, string>;
const onboardingEn = onboardingIn('en');

test.use({ actionTimeout: 15_000 });
test.describe.configure({ mode: 'serial' });

function resetHer(): void {
  queryDatabase(`
    begin;
    delete from public.intake_required_questions where org_id = '${ORG}' and question <> 'phone';
    update public.custom_questions set is_required = false where id = '${QUESTION}';
    update public.profiles set date_of_birth = null, place_of_birth = null, nationality = null,
           document_type = null where id = ${HER};
    delete from public.profile_answers where profile_id = ${HER};
    delete from public.custom_answers where profile_id = ${HER};
    commit;
  `);
}

test.beforeAll(() => {
  resetHer();
  // Staff gave her name, background and document (RAPP-300).
  queryDatabase(`
    begin;
    update public.profiles set date_of_birth = '1999-03-04', place_of_birth = 'Bamako',
           nationality = 'Mali', document_type = 'none' where id = ${HER};
    insert into public.profile_answers (profile_id, org_id, question, source)
    select ${HER}, '${ORG}', question, 'staff'
      from unnest(array['first_name', 'last_name', 'date_of_birth', 'place_of_birth',
                        'nationality', 'document']) question
    on conflict (profile_id, question) do nothing;
    commit;
  `);
});
test.afterAll(resetHer);

test('the design role makes the sizes optional and a staff question required', async ({ page }) => {
  await signIn(page, ONBOARDING_DESIGNER_EMAIL);
  await page.goto('/onboarding');
  const builder = page.getByTestId('question-builder');
  await expect(builder).toBeVisible({ timeout: 30_000 });

  // Her first name is always required, and the switch says why.
  const firstName = builder.getByTestId('builtin-required-first_name');
  await expect(firstName).toBeChecked();
  await expect(firstName).toBeDisabled();
  await expect(builder.locator('#builtin-required-first_name-lock')).toBeVisible();

  for (const question of ['clothing_size', 'shoe_size']) {
    const size = builder.getByTestId(`builtin-required-${question}`);
    await expect(size).toBeChecked();
    await size.click();
    await expect
      .poll(() =>
        queryDatabase(
          `select is_required from public.intake_required_questions
            where org_id = '${ORG}' and question = '${question}'`,
        ),
      )
      .toBe('f');
    await expect(builder.getByTestId(`builtin-required-${question}`)).not.toBeChecked();
  }

  const own = builder.getByTestId(`custom-required-${QUESTION}`);
  await expect(own).not.toBeChecked();
  await own.click();
  await expect
    .poll(() =>
      queryDatabase(`select is_required from public.custom_questions where id = '${QUESTION}'`),
    )
    .toBe('t');
  expect(
    queryDatabase(
      `select count(*) from public.audit_log
        where action in ('intake.required_question_save', 'intake.custom_required_save')
          and created_at > now() - interval '5 minutes'`,
    ),
  ).not.toBe('0');
});

// Pending fixes 20 and 21: a blocked Continue says under the question what is
// missing and moves focus there; "(optional)" follows the required list.
for (const language of ['ca', 'ar'] as const) {
  test(`in ${language}, Continue marks the missing dependants answer and focuses it`, async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const words = onboardingIn(language);
    const player = await (await browser.newContext({ locale: language })).newPage();
    await signInPlayer(player, TEST_PLAYER_EMAIL, language);
    await expect(player).toHaveURL(`${PLAYER_ORIGIN}/onboarding/logistics`, { timeout: 60_000 });
    // The phone is optional by default: its label says so, from the list.
    await expect(
      player.getByText(words.optionalFieldLabel!.replace('{{label}}', words.phoneLabel!), {
        exact: true,
      }),
    ).toBeVisible();
    // The organisation answered, the dependants question left out.
    await player.getByRole('radio', { name: words.noOption, exact: true }).first().click();
    await player.getByRole('button', { name: words.continueAction, exact: true }).click();
    const dependants = player.getByTestId('question-dependents');
    await expect(dependants.getByText(words.errorRequired!, { exact: true })).toBeVisible();
    await expect(
      player.getByTestId('question-reference_entity').getByText(words.errorRequired!),
    ).toHaveCount(0);
    await expect(dependants.getByText(words.errorRequired!, { exact: true })).toBeFocused();
    await expect(dependants).toBeInViewport();
    await expect(player).toHaveURL(`${PLAYER_ORIGIN}/onboarding/logistics`);
  });
}

test('she skips the optional sizes, and the summary sends her to the required staff question', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const player = await (await browser.newContext({ locale: 'en' })).newPage();
  await signInPlayer(player, TEST_PLAYER_EMAIL, 'en');
  await expect(player).toHaveURL(`${PLAYER_ORIGIN}/onboarding/logistics`, { timeout: 60_000 });

  // The organisation and dependants questions stay required: she answers No to both.
  await player.getByRole('radio', { name: onboardingEn.noOption, exact: true }).first().click();
  await player.getByRole('radio', { name: onboardingEn.noOption, exact: true }).last().click();
  await player.getByRole('button', { name: onboardingEn.continueAction, exact: true }).click();
  await expect(player).toHaveURL(`${PLAYER_ORIGIN}/onboarding/equipment`, { timeout: 30_000 });

  // No size chosen: optional now, so she goes on.
  await player.getByRole('button', { name: onboardingEn.continueAction, exact: true }).click();
  await expect(player).not.toHaveURL(`${PLAYER_ORIGIN}/onboarding/equipment`, {
    timeout: 30_000,
  });

  // Straight to the summary: confirming is refused for the staff question.
  await player.goto(`${PLAYER_ORIGIN}/onboarding/summary`);
  await player
    .getByRole('button', { name: onboardingEn.summaryConfirmAction, exact: true })
    .click();
  await expect(player).toHaveURL(`${PLAYER_ORIGIN}/onboarding/custom/${SCREEN}?edit=1`, {
    timeout: 30_000,
  });
  // On its screen, Continue without an answer says it is missing.
  await player.getByRole('button', { name: onboardingEn.continueAction, exact: true }).click();
  await expect(player.getByText(onboardingEn.errorRequired!).first()).toBeVisible();
});
