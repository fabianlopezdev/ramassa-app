/**
 * Built-in onboarding screens editable (RAPP-612), end to end in real
 * browsers: the design role moves the season screen to the front of the flow
 * on the onboarding page, words its title and help in Arabic, sees the phone
 * preview right to left, and the seeded test player, opening the app in
 * Arabic, starts her registration on that screen as step 1 with the staff
 * wording. A language staff left empty shows the app's own text.
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

test('the design role puts the season first and words it in Arabic, previewed right to left', async ({
  page,
}) => {
  await signIn(page, ONBOARDING_DESIGNER_EMAIL);
  await page.goto('/onboarding');
  const order = page.getByTestId('flow-order');
  await expect(order).toBeVisible({ timeout: 30_000 });

  // The seed order has eight steps before the season.
  const season = order.getByTestId('flow-step-season');
  for (let step = 0; step < 8; step += 1) {
    await season.getByRole('button').first().click();
  }
  await expect(order.getByTestId('flow-order-steps').locator('li').first()).toHaveAttribute(
    'data-testid',
    'flow-step-season',
  );
  // The summary and the terms stay locked at the end.
  await expect(order.getByTestId('flow-order-fixed')).toBeVisible();
  await order.getByTestId('flow-order-save').click();
  await expect
    .poll(() =>
      queryDatabase(`select step_order[1] from public.intake_flow_orders where org_id = '${ORG}'`),
    )
    .toBe('season');

  const wording = page.getByTestId('screen-wording');
  await wording.locator('#builtin-screen-select').selectOption('season');
  await wording.locator('#builtin-screen-language').selectOption('ar');
  await expect(wording.locator('#builtin-screen-title')).toHaveAttribute('dir', 'rtl');
  await wording.locator('#builtin-screen-title').fill(ARABIC_TITLE);
  await wording.locator('#builtin-screen-help').fill(ARABIC_HELP);
  const preview = wording.getByTestId('builtin-screen-preview');
  await expect(preview).toHaveAttribute('dir', 'rtl');
  await expect(preview.getByTestId('preview-title')).toHaveText(ARABIC_TITLE);
  await expect(preview.getByTestId('preview-help')).toHaveText(ARABIC_HELP);
  // The button has no Arabic wording of its own: the app's text shows.
  await expect(preview.getByTestId('preview-continue')).toHaveText(onboardingAr.continueAction!);
  await wording.getByTestId('builtin-screen-save').click();
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
