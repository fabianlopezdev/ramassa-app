/**
 * Scenario switches on a test player (RAPP-619), driven the way the person
 * designing the onboarding drives them: the design role sets the seeded test
 * player's situation on her page, then the player app is opened as her, and it
 * shows the matching flow. A real player's page has no switches.
 *
 * The seeded test player starts invited, with nothing answered. The spec
 * leaves her reset; delete-and-recreate (RAPP-617) is in the design role spec.
 */

import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  ONBOARDING_DESIGNER_EMAIL,
  PARTICIPANT_FIXTURES,
  seedUserId,
  TEST_PLAYER_EMAIL,
} from '@ramassa/shared/testing';
import {
  countInDatabase,
  PLAYER_ORIGIN,
  queryDatabase,
  signIn,
  signInPlayer,
  STAFF_EMAIL,
} from './session';

test.setTimeout(240_000);

/**
 * Her id, read by address: the design role spec deletes the seeded test
 * player and creates her again (RAPP-617), so the seed id may be gone.
 */
const testPlayerId = () =>
  queryDatabase(`select id from auth.users where email = '${TEST_PLAYER_EMAIL}'`).trim();
const HER = `(select id from auth.users where email = '${TEST_PLAYER_EMAIL}')`;

test.afterAll(() => {
  // Back to the seed: invited, nothing answered, nothing signed, an open invitation.
  queryDatabase(`
    begin;
    delete from public.authorization_signatures where profile_id = ${HER};
    delete from public.terms_acceptances where profile_id = ${HER};
    delete from public.profile_answers where profile_id = ${HER};
    update public.profiles set role = 'invited', terms_accepted_at = null where id = ${HER};
    update public.invites set accepted_at = null, accepted_by = null, expires_at = now() + interval '30 days'
     where email = '${TEST_PLAYER_EMAIL}';
    commit;
  `);
});

async function openTestPlayer(page: Page): Promise<void> {
  await page.goto(`/participants/${testPlayerId()}`);
  await expect(page.getByTestId('test-player-scenario')).toBeVisible({ timeout: 20_000 });
}

/** Clicks a switch and waits for the page to show its new state. */
async function flip(page: Page, row: string, action: string, state: RegExp): Promise<void> {
  const section = page.getByTestId(row);
  await section.getByRole('button', { name: action }).click();
  await expect(section.getByTestId(`${row}-state`)).toHaveText(state, { timeout: 20_000 });
}

/** Opens the player app as her, in a fresh browser, the way a new app open starts. */
async function openAppAsHer(browser: Browser): Promise<Page> {
  const player = await (await browser.newContext({ locale: 'en-GB' })).newPage();
  await signInPlayer(player, TEST_PLAYER_EMAIL);
  return player;
}

test.describe.serial('scenario switches on a test player', () => {
  test('a returning player who has not signed this season gets re-registration', async ({
    page,
    browser,
  }) => {
    await signIn(page, ONBOARDING_DESIGNER_EMAIL);
    await openTestPlayer(page);
    const scenario = page.getByTestId('test-player-scenario');

    // She cannot join before her required answers are there.
    await scenario.getByRole('button', { name: 'Mark as accepted' }).click();
    await expect(scenario.getByRole('alert')).toContainText('Fill her required answers first');

    await scenario.getByRole('button', { name: 'Fill all' }).click();
    await expect(scenario.getByTestId('test-scenario-answer-shoe_size')).toHaveAttribute(
      'data-answered',
      'true',
      { timeout: 20_000 },
    );
    // Recorded as staff answers, so her wizard treats them as answered.
    expect(
      countInDatabase(
        `select count(*) from public.profile_answers where profile_id = ${HER} and source <> 'staff'`,
      ),
    ).toBe(0);

    await flip(page, 'test-scenario-terms', 'Mark as accepted', /^Accepted/);
    await flip(page, 'test-scenario-returning', 'Make her returning', /^Returning/);
    await expect(page.getByTestId('test-scenario-season-state')).toHaveText(/^Not signed/);
    expect(
      countInDatabase(
        `select count(*) from public.authorization_signatures where profile_id = ${HER} and not is_test_fixture`,
      ),
    ).toBe(0);

    const player = await openAppAsHer(browser);
    // The authorization gate, opening on "Is this still correct?" (RAPP-306).
    await expect(player.getByTestId('reregistration-review')).toBeVisible({ timeout: 60_000 });
    expect(new URL(player.url()).pathname).toBe('/authorization');
    await player.context().close();
  });

  test('signed this season: the app opens on her home', async ({ page, browser }) => {
    await signIn(page, ONBOARDING_DESIGNER_EMAIL);
    await openTestPlayer(page);
    await flip(page, 'test-scenario-season', 'Mark as signed', /^Signed/);

    const player = await openAppAsHer(browser);
    await expect(player.getByTestId('home-open-feedback')).toBeVisible({ timeout: 60_000 });
    expect(new URL(player.url()).pathname).not.toBe('/authorization');
    await player.context().close();
  });

  test('reset: the app opens the onboarding on the first question nobody answered', async ({
    page,
    browser,
  }) => {
    await signIn(page, ONBOARDING_DESIGNER_EMAIL);
    await openTestPlayer(page);
    await page
      .getByTestId('test-player-scenario')
      .getByRole('button', { name: 'Reset to brand-new player' })
      .click();
    await expect(page.getByTestId('test-scenario-terms-state')).toHaveText(/^Not accepted/, {
      timeout: 20_000,
    });
    await expect(page.getByTestId('test-scenario-returning-state')).toHaveText(/^New/);
    expect(queryDatabase(`select role from public.profiles where id = ${HER}`)).toBe('invited');

    const player = await openAppAsHer(browser);
    // A brand-new invited woman: staff gave her name, so the wizard opens on
    // the next question, as for any new invitation (RAPP-300).
    await expect(player.getByTestId('onboarding-day')).toBeVisible({ timeout: 60_000 });
    await expect(player.getByTestId('onboarding-first-name')).toHaveCount(0);
    await expect(player).toHaveURL(/\/onboarding\/background/);

    // Her wizard draft now remembers the background step. Staff fill her
    // background in; the next open drops the older draft and skips the step.
    await openTestPlayer(page);
    await page
      .getByTestId('test-player-scenario')
      .getByRole('button', { name: 'Fill all' })
      .click();
    await expect(page.getByTestId('test-scenario-answer-shoe_size')).toHaveAttribute(
      'data-answered',
      'true',
      { timeout: 20_000 },
    );
    await player.goto(PLAYER_ORIGIN);
    await expect(player).toHaveURL(/\/onboarding\//, { timeout: 60_000 });
    await expect(player).not.toHaveURL(/\/onboarding\/background/, { timeout: 30_000 });
    await expect(player.getByTestId('onboarding-day')).toHaveCount(0);
    await player.context().close();
  });

  test('a real player has no switches, for staff either', async ({ page }) => {
    await signIn(page, STAFF_EMAIL);
    await page.goto(`/participants/${seedUserId(PARTICIPANT_FIXTURES[0]!.ordinal)}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('test-player-scenario')).toHaveCount(0);
    // Staff see them on the test player.
    await openTestPlayer(page);
  });
});
