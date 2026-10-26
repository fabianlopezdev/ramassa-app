/**
 * Test players see the drafts (RAPP-619, pending fix 23), in real browsers:
 * the design role writes a terms draft and an authorization draft without
 * publishing anything; her page and the editor say only test players see
 * them; the test player's app shows both drafts and records her acceptance on
 * the draft as a test fixture; a real player sees the published texts only.
 */
import { expect, test, type Browser } from '@playwright/test';
import { ONBOARDING_DESIGNER_EMAIL, TEST_PLAYER_EMAIL } from '@ramassa/shared/testing';
import { countInDatabase, queryDatabase, signIn, signInPlayer } from './session';

test.setTimeout(300_000);
test.use({ actionTimeout: 15_000 });

const RUN_TAG = Date.now().toString(36);
const ORG = '5eed0000-0000-4000-8000-000000000000';
const DESIGNER = '5eed0000-0000-4000-8000-000000000097';
const DRAFT_BODY = `Termes en esborrany ${RUN_TAG}.`;
const SECOND_BODY = `Segon esborrany ${RUN_TAG}.`;
const DRAFT_TITLE = `Autoritzacio en esborrany ${RUN_TAG}`;
const HER = `(select id from auth.users where email = '${TEST_PLAYER_EMAIL}')`;

function asDesigner(sql: string): void {
  const claims = JSON.stringify({ sub: DESIGNER, role: 'authenticated', aal: 'aal2' });
  queryDatabase(
    `begin; set local role authenticated; set local request.jwt.claims = '${claims}'; ${sql}; commit;`,
  );
}

test.afterAll(() => {
  queryDatabase(`
    begin;
    delete from public.authorization_signatures where profile_id = ${HER};
    delete from public.terms_acceptances where profile_id = ${HER};
    -- Her answers by field (ADR-031): the seed gives her none.
    delete from public.custom_answers where profile_id = ${HER};
    update public.profiles set role = 'invited', terms_accepted_at = null where id = ${HER};
    update public.invites set accepted_at = null, accepted_by = null, expires_at = now() + interval '30 days'
     where email = '${TEST_PLAYER_EMAIL}';
    delete from public.app_terms_versions where org_id = '${ORG}' and published_at is null;
    delete from public.authorization_signatures where version_id in
      (select id from public.authorization_versions where org_id = '${ORG}' and published_at is null);
    delete from public.authorization_versions where org_id = '${ORG}' and published_at is null;
    commit;
  `);
});

async function openAppAsHer(browser: Browser) {
  const player = await (await browser.newContext({ locale: 'en-GB' })).newPage();
  await signInPlayer(player, TEST_PLAYER_EMAIL);
  return player;
}

test.describe.serial('test players see the drafts', () => {
  test('the design role writes drafts; the editor and her page say only test players see them', async ({
    page,
  }) => {
    await signIn(page, ONBOARDING_DESIGNER_EMAIL);
    // The legal texts have their own page, Textos legals (RAPP-694).
    await page.goto('/legal?tab=terms');
    const editor = page.getByTestId('app-terms-editor');
    await expect(editor).toBeVisible({ timeout: 30_000 });
    await editor.locator('#app-terms-body').fill(DRAFT_BODY);
    await editor.getByTestId('app-terms-save').click();
    await expect(editor.getByTestId('app-terms-draft-note')).toBeVisible({ timeout: 20_000 });
    asDesigner(
      `select public.save_authorization_draft(jsonb_set(
         (select content from public.authorization_versions where org_id = '${ORG}' and version_number = 1),
         '{title}', '{"ca": "${DRAFT_TITLE}", "en": "${DRAFT_TITLE}"}'::jsonb))`,
    );

    await page.goto(
      `/participants/${queryDatabase(`select id from auth.users where email = '${TEST_PLAYER_EMAIL}'`)}`,
    );
    const scenario = page.getByTestId('test-player-scenario');
    await expect(scenario).toBeVisible({ timeout: 20_000 });
    await expect(scenario.getByTestId('test-scenario-draft-terms')).toBeVisible();
    await expect(scenario.getByTestId('test-scenario-draft-authorization')).toBeVisible();
    await scenario.getByRole('button', { name: 'Fill all' }).click();
    await expect(scenario.getByTestId('test-scenario-answer-shoe_size')).toHaveAttribute(
      'data-answered',
      'true',
      { timeout: 20_000 },
    );
    await scenario
      .getByTestId('test-scenario-terms')
      .getByRole('button', { name: 'Mark as accepted' })
      .click();
    await expect(scenario.getByTestId('test-scenario-terms-state')).toHaveText(/^Accepted/, {
      timeout: 20_000,
    });
    expect(
      countInDatabase(
        `select count(*) from public.terms_acceptances t join public.app_terms_versions v on v.id = t.version_id
          where t.profile_id = ${HER} and v.published_at is null and t.is_test_fixture`,
      ),
    ).toBe(1);
  });

  test('her app asks for the draft authorization, then the next terms draft on its own', async ({
    browser,
  }) => {
    const player = await openAppAsHer(browser);
    await expect(player).toHaveURL(/\/authorization/, { timeout: 60_000 });
    await expect(player.getByText(DRAFT_TITLE).first()).toBeVisible({ timeout: 60_000 });
    await player.context().close();

    // A new terms draft: her acceptance of the old one goes with it.
    asDesigner(`select public.discard_app_terms_draft()`);
    asDesigner(
      `select public.save_app_terms_draft(jsonb_set(
         (select content from public.app_terms_versions where org_id = '${ORG}' and version_number = 1),
         '{body}', '{"ca": "${SECOND_BODY}", "en": "${SECOND_BODY}"}'::jsonb))`,
    );
    const again = await openAppAsHer(browser);
    await expect(again).toHaveURL(/\/terms-update/, { timeout: 60_000 });
    await expect(again.getByText(SECOND_BODY)).toBeVisible({ timeout: 60_000 });
    await again.getByTestId('terms-update-acceptance').click();
    await again.getByTestId('terms-update-cannot-draw').click();
    await again.getByRole('button', { name: 'Sign and continue', exact: true }).click();
    await expect(again).not.toHaveURL(/\/terms-update$/, { timeout: 30_000 });
    expect(
      queryDatabase(
        `select t.terms_version || ':' || t.is_test_fixture from public.terms_acceptances t
           join public.app_terms_versions v on v.id = t.version_id
          where t.profile_id = ${HER} and v.published_at is null`,
      ),
    ).toBe('draft:true');
    await again.context().close();
  });

  test('a real player never sees the drafts', async ({ browser }) => {
    const player = await (await browser.newContext({ locale: 'en-GB' })).newPage();
    await signInPlayer(player, 'maria.rojas@example.test');
    await expect(player).not.toHaveURL(/\/email-login$/, { timeout: 60_000 });
    await player.waitForTimeout(3_000);
    await expect(player).not.toHaveURL(/\/terms-update$/);
    await expect(player.getByText(SECOND_BODY)).toHaveCount(0);
    await expect(player.getByText(DRAFT_TITLE)).toHaveCount(0);
    await player.context().close();
  });
});
