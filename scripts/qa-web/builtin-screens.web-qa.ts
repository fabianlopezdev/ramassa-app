/**
 * Built-in onboarding screens editable (RAPP-612), end to end in real
 * browsers: with the season screen first in the flow, the design role words
 * its title and help in Arabic in its screen editor (RAPP-641), sees the
 * phone preview right to left, and the seeded test player, opening the app in
 * Arabic, starts her registration on that screen as step 1 with the staff
 * wording. A language staff left empty shows the app's own text. The old
 * order list of Settings is gone (RAPP-656): the Onboarding board orders the
 * screens.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ONBOARDING_DESIGNER_EMAIL, TEST_PLAYER_EMAIL } from '@ramassa/shared/testing';
import { PLAYER_ORIGIN, queryDatabase, signIn, signInPlayer } from './session';

const RUN_TAG = Date.now().toString(36);
const ARABIC_TITLE = `وضعكِ اليوم ${RUN_TAG}`;
const ARABIC_HELP = `اختاري ما ينطبق عليكِ ${RUN_TAG}`;
const ORG = '5eed0000-0000-4000-8000-000000000000';
const SEED_ORDER = `array['identity', 'background', 'documentation', 'logistics', 'equipment',
  'custom:5eed0000-0000-4000-8044-000000000001', 'custom:5eed0000-0000-4000-8044-000000000002',
  'custom:5eed0000-0000-4000-8044-000000000003', 'season', 'supporting-entities',
  'participation-support', 'specific-needs']`;
const HER = `(select id from auth.users where email = '${TEST_PLAYER_EMAIL}')`;
const onboardingAr = JSON.parse(
  readFileSync('packages/shared/i18n/locales/ar/onboarding.json', 'utf8'),
) as Record<string, string>;

test.use({ actionTimeout: 15_000 });
test.describe.configure({ mode: 'serial' });

test.afterAll(() => {
  // Back to the seed: the app's own order, the staff screens after equipment,
  // no wording on the season screen, the test player with nothing answered.
  queryDatabase(`
    begin;
    update public.intake_flow_orders set step_order = ${SEED_ORDER} where org_id = '${ORG}';
    update public.intake_screens set after_screen = 'logistics',
           sort_order = right(id::text, 1)::integer - 1
     where org_id = '${ORG}' and id::text like '5eed0000-0000-4000-8044-%';
    delete from public.intake_builtin_screens where org_id = '${ORG}' and screen = 'season';
    delete from public.profile_answers where profile_id = ${HER};
    commit;
  `);
});

test('the design role words the season screen in Arabic, previewed right to left', async ({
  page,
}) => {
  // The season first, as the board saves an order.
  queryDatabase(`
    update public.intake_flow_orders
       set step_order = array['season'] || array_remove(${SEED_ORDER}, 'season')
     where org_id = '${ORG}'`);
  await signIn(page, ONBOARDING_DESIGNER_EMAIL);
  await page.goto('/onboarding/screens/season');
  const wording = page.getByTestId('wording-season');
  await expect(wording).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('editor-language').getByRole('tab').filter({ hasText: /^ar$/ }).click();
  await expect(wording.locator('#wording-season-title')).toHaveAttribute('dir', 'rtl');
  await wording.locator('#wording-season-title').fill(ARABIC_TITLE);
  await wording.locator('#wording-season-help').fill(ARABIC_HELP);
  const preview = page.getByTestId('phone-preview');
  await expect(preview.locator('[dir]').first()).toHaveAttribute('dir', 'rtl');
  await expect(preview.getByTestId('phone-title')).toHaveText(ARABIC_TITLE);
  await expect(preview).toContainText(ARABIC_HELP);
  await page.getByTestId('wording-save-season').click();
  await expect
    .poll(() =>
      queryDatabase(
        `select texts -> 'title' ->> 'ar' from public.intake_builtin_screens where org_id = '${ORG}' and screen = 'season'`,
      ),
    )
    .toBe(ARABIC_TITLE);
  expect(
    queryDatabase(
      `select changes ->> 'screen' from public.audit_log where action = 'intake.builtin_screen_save' order by created_at desc limit 1`,
    ),
  ).toBe('season');
});

test('the test player starts on the season screen, step 1, with the Arabic wording', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const player = await (await browser.newContext({ locale: 'ar' })).newPage();
  await signInPlayer(player, TEST_PLAYER_EMAIL, 'ar');
  await expect(player).toHaveURL(`${PLAYER_ORIGIN}/onboarding/season`, { timeout: 60_000 });
  await expect(player.getByText(ARABIC_TITLE)).toBeVisible({ timeout: 30_000 });
  await expect(player.getByText(ARABIC_HELP)).toBeVisible();
  await expect(player.getByTestId('wizard-step-1')).toBeVisible();
  await expect(
    player.getByRole('button', { name: onboardingAr.continueAction, exact: true }),
  ).toBeVisible();
});
