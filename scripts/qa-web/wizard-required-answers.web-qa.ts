/**
 * A required answer is never skipped (RAPP-612), end to end on the player web
 * app: the seeded test player has her name, background and document already
 * answered, so her wizard opens at logistics. Staff then move the sizes and
 * the season screens before her name. When she opens the app again she
 * resumes at the sizes, which she never answered, and the summary refuses to
 * confirm while they are missing and sends her there.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { TEST_PLAYER_EMAIL } from '@ramassa/shared/testing';
import { PLAYER_ORIGIN, queryDatabase, signInPlayer } from './session';

const ORG = '5eed0000-0000-4000-8000-000000000000';
const HER = `(select id from auth.users where email = '${TEST_PLAYER_EMAIL}')`;
const SEED_ORDER = `array['identity', 'background', 'documentation', 'logistics', 'equipment',
  'custom:5eed0000-0000-4000-8044-000000000001', 'custom:5eed0000-0000-4000-8044-000000000002',
  'custom:5eed0000-0000-4000-8044-000000000003', 'season', 'supporting-entities',
  'participation-support', 'specific-needs']`;
const onboardingEn = JSON.parse(
  readFileSync('packages/shared/i18n/locales/en/onboarding.json', 'utf8'),
) as Record<string, string>;

test.use({ actionTimeout: 15_000 });
test.describe.configure({ mode: 'serial' });

function resetHer(): void {
  queryDatabase(`
    begin;
    update public.intake_flow_orders set step_order = ${SEED_ORDER} where org_id = '${ORG}';
    update public.profiles set date_of_birth = null, place_of_birth = null, nationality = null,
           document_type = null where id = ${HER};
    delete from public.profile_answers where profile_id = ${HER};
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

test('a screen staff move before her step is where she resumes, and the summary refuses without it', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const player = await (await browser.newContext({ locale: 'en' })).newPage();
  await signInPlayer(player, TEST_PLAYER_EMAIL, 'en');
  await expect(player).toHaveURL(`${PLAYER_ORIGIN}/onboarding/logistics`, { timeout: 60_000 });

  // Staff move the sizes and the season screens before her name.
  queryDatabase(`
    update public.intake_flow_orders
       set step_order = array['equipment', 'season', 'identity', 'background', 'documentation',
                              'logistics']
     where org_id = '${ORG}'
  `);
  await player.goto(`${PLAYER_ORIGIN}/onboarding`);
  await expect(player).toHaveURL(`${PLAYER_ORIGIN}/onboarding/equipment`, { timeout: 60_000 });

  // Straight to the summary: confirming is refused and she is sent to the sizes.
  await player.goto(`${PLAYER_ORIGIN}/onboarding/summary`);
  await player
    .getByRole('button', { name: onboardingEn.summaryConfirmAction, exact: true })
    .click();
  await expect(player).toHaveURL(`${PLAYER_ORIGIN}/onboarding/equipment?edit=1`, {
    timeout: 30_000,
  });
});
