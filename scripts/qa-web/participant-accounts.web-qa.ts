/**
 * Inviting a participant, driven the way a staff member drives it (RAPP-25,
 * RAPP-224, RAPP-227).
 *
 * THE ASSERTION THIS FILE EXISTS FOR: an invitation this screen recorded really
 * lets her in. Until RAPP-227 every other check was green while that was false:
 * the invite row was there, the panel looked right, and the woman typing her
 * email into the app was refused because no account existed. So the proof is
 * the product path end to end: staff invite a never-seen address in the admin,
 * she asks for her code in the player app, the code comes from the real inbox,
 * and the onboarding wizard opens.
 *
 * Every other expected value comes from psql (never from the app), and the specs
 * are RE-RUNNABLE: addresses carry a per-run suffix and counts are asserted as
 * relationships, not absolutes.
 */

import { expect, test, type Page } from '@playwright/test';
import {
  countInDatabase,
  ENTITY_EMAIL,
  PLAYER_ORIGIN,
  queryDatabase,
  queryDatabaseAsAddress,
  signIn,
  signInPlayer,
  STAFF_EMAIL,
} from './session';

const RUN_TAG = `qa${Date.now().toString(36)}`;
const PENDING_REFERRAL_ID = '5eed0000-0000-4000-8010-000000000001';

test.afterAll(() => {
  // One transaction. Invited addresses carry the run tag, so the accounts the
  // invitations created are found by address and nothing seeded is touched.
  queryDatabase(`
    begin;
    create temporary table qa_run_invites on commit drop as
      select id from public.invites where email like '%${RUN_TAG}%';
    create temporary table qa_run_accounts on commit drop as
      select id from auth.users where email like '%${RUN_TAG}%';

    delete from public.audit_log where target_id in (select id from qa_run_invites);
    delete from public.invites where id in (select id from qa_run_invites);
    update public.entity_referrals
       set referred_profile_id = null, assigned_staff_id = null, status = 'pending'
     where id = '${PENDING_REFERRAL_ID}'
       and referred_profile_id in (select id from qa_run_accounts);
    delete from public.profiles where id in (select id from qa_run_accounts);
    delete from auth.identities where user_id in (select id from qa_run_accounts);
    delete from auth.users where id in (select id from qa_run_accounts);
    commit;
  `);
});

async function invite(page: Page, email: string, entity?: string): Promise<void> {
  // Stays on the page when it is already open (a referral URL keeps its referral).
  if (!new URL(page.url()).pathname.endsWith('/participants/new')) {
    await page.goto('/participants/new');
  }
  await page.locator('#new-participant-email').fill(email);
  if (entity !== undefined) {
    await page.locator('#new-invite-entity').fill(entity);
  }
  await page
    .getByRole('button', { name: /crea la invitació|create the invitation|crea la invitación/i })
    .click();
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  expect(
    await page.evaluate(() => {
      const browser = globalThis as unknown as {
        document: { documentElement: { clientWidth: number; scrollWidth: number } };
      };
      return {
        viewport: browser.document.documentElement.clientWidth,
        content: browser.document.documentElement.scrollWidth,
      };
    }),
  ).toEqual({ viewport: 375, content: 375 });
}

const INVITED = /invitació creada|invitation created|invitación creada/i;

test.describe('inviting a participant', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, STAFF_EMAIL);
    await page.goto('/participants/new');
  });

  test('an invited address that never existed signs in with her code and reaches the wizard', async ({
    page,
    browser,
  }) => {
    const email = `new.player.${RUN_TAG}@example.test`;
    expect(countInDatabase(`select count(*) from auth.users where email = '${email}'`)).toBe(0);

    await invite(page, email);
    await expect(page.getByRole('heading', { name: INVITED })).toBeVisible({ timeout: 15_000 });
    expect(countInDatabase(`select count(*) from auth.users where email = '${email}'`)).toBe(1);

    const player = await (await browser.newContext({ locale: 'en-GB' })).newPage();
    await signInPlayer(player, email);
    await expect(player.getByTestId('onboarding-first-name')).toBeVisible({ timeout: 30_000 });
    expect(new URL(player.url()).origin).toBe(PLAYER_ORIGIN);
  });

  test('an invitation opened from a referral carries it, and says so', async ({ page }) => {
    await page.goto(`/participants/new?referral=${PENDING_REFERRAL_ID}`);
    await expect(page.getByTestId('referral-prefill')).toBeVisible({ timeout: 15_000 });

    const email = `referred.${RUN_TAG}@example.test`;
    await invite(page, email);
    await expect(page.getByRole('heading', { name: INVITED })).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/derivació de l'entitat|entity's referral|derivación de la entidad/i),
    ).toBeVisible();
    expect(queryDatabase(`select referral_id from public.invites where email = '${email}'`)).toBe(
      PENDING_REFERRAL_ID,
    );
  });

  test('an address that already has an account is refused with words', async ({ page }) => {
    const before = countInDatabase('select count(*) from public.invites');
    await invite(page, 'rosa.mamani@example.test');
    await expect(
      page.getByText(/ja té un compte|already has an account|ya tiene una cuenta/i),
    ).toBeVisible({ timeout: 15_000 });
    expect(countInDatabase('select count(*) from public.invites')).toBe(before);
  });

  test('the invitation form and its result work at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await expectNoHorizontalScroll(page);
    await invite(page, `mobile.${RUN_TAG}@example.test`);
    await expect(page.getByRole('heading', { name: INVITED })).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalScroll(page);
  });

  test('an address typed with capitals is stored the way login will look it up', async ({
    page,
  }) => {
    const typed = `  Fatou.Ndiaye+${RUN_TAG}@Example.COM `;
    const normalized = typed.trim().toLowerCase();

    await invite(page, typed, 'CEAR Catalunya');

    await expect
      .poll(
        () =>
          queryDatabase(
            `select coalesce(reference_entity, '-') from public.invites where email = '${normalized}'`,
          ),
        { timeout: 15_000 },
      )
      .toBe('CEAR Catalunya');
    // And exactly one row: the address is the key the wizard looks itself up by.
    expect(
      countInDatabase(`select count(*) from public.invites where email = '${normalized}'`),
    ).toBe(1);
  });

  test('a new invitation appears in the invitations list, signed and pending', async ({ page }) => {
    const email = `pending.${RUN_TAG}@example.com`;
    await invite(page, email);

    await page.goto('/participants/invites');
    const row = page.locator('tr', { hasText: email });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.getByText(/Marta Puig/)).toBeVisible();
    // The STATUS cell, not "anything in the row saying pending": the address
    // itself contains that word, and matching it would pass with no status
    // column at all.
    await expect(row.locator('td').last()).toHaveText(/pendent|pending|pendiente/i);
  });

  test('a malformed address is refused with words, and no invite is recorded', async ({ page }) => {
    const before = countInDatabase(`select count(*) from public.invites`);

    await invite(page, 'not-an-address');

    await expect(page.getByText(/vàlida|valid|válida/i).first()).toBeVisible();
    expect(countInDatabase(`select count(*) from public.invites`)).toBe(before);
  });

  /**
   * The wizard's own lookup, asserted where it is decided: `my_pending_invite`
   * keys on the JWT's address, so the invite reaches the woman who signs in
   * and nobody else. Checked through the database as the invited identity
   * rather than through the phone app, which this suite cannot drive.
   */
  test('a pending invite is visible to the invited address and to no other', async ({ page }) => {
    const email = `prefill.${RUN_TAG}@example.com`;
    await invite(page, email, 'Creu Roja Osona');
    await expect
      .poll(() => countInDatabase(`select count(*) from public.invites where email = '${email}'`), {
        timeout: 15_000,
      })
      .toBe(1);

    // As the invited address, exactly as GoTrue would present it.
    expect(
      queryDatabaseAsAddress(
        email,
        `select coalesce(reference_entity, '-') from public.my_pending_invite();`,
      ),
    ).toBe('Creu Roja Osona');

    // And as anybody else: no row at all. Without this half the spec would
    // pass against a lookup that hands the same invite to everyone.
    expect(
      queryDatabaseAsAddress(
        `someone.else.${RUN_TAG}@example.com`,
        `select coalesce(reference_entity, '-') from public.my_pending_invite();`,
      ),
    ).toBe('');
  });
});

/**
 * The role boundary in the PRODUCT, not only in the policies. An entity
 * contact handed this URL must not reach the screen, and must not be able to
 * invite anybody.
 */
test('an entity contact cannot reach the invitation screen', async ({ page }) => {
  const usersBefore = countInDatabase('select count(*) from auth.users');
  const invitesBefore = countInDatabase('select count(*) from public.invites');

  await signIn(page, ENTITY_EMAIL);
  await page.goto('/participants/new');

  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 10_000 })
    .not.toContain('/participants/new');
  await expect(page.locator('#new-participant-email')).toHaveCount(0);

  await page.goto('/participants/invites');
  await expect(page.getByRole('table')).toHaveCount(0);

  expect(countInDatabase('select count(*) from auth.users')).toBe(usersBefore);
  expect(countInDatabase('select count(*) from public.invites')).toBe(invitesBefore);
});
