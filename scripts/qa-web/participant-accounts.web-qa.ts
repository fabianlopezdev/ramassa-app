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
import { choose, expectAsking, questionRow } from './invite-review';
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
    delete from public.audit_log where target_id in (select id from qa_run_accounts);
    delete from public.invites where id in (select id from qa_run_invites);
    update public.entity_referrals
       set referred_profile_id = null, assigned_staff_id = null, status = 'pending'
     where id = '${PENDING_REFERRAL_ID}'
       and referred_profile_id in (select id from qa_run_accounts);
    -- Accepting it moved the seeded answers to her profile (RAPP-303): put them back.
    update public.entity_referrals
       set referred_phone = public.encrypt_field('+34930005401'),
           referred_email = public.encrypt_field('amina.referral@example.test'),
           intake_answers = public.encrypt_field(jsonb_build_object(
             'date_of_birth', '1996-02-20', 'nationality', 'Marroc', 'document_type', 'none',
             'city', 'Vic', 'applicant_status', 'migrant',
             'supporting_entities', jsonb_build_array('Càritas Vic'),
             'reference_contact_name', 'Sílvia Bosch', 'season_number', 2,
             'childcare_need', 'yes', 'specific_needs', 'Prefereix entrenar a la tarda.')::text)
     where id = '${PENDING_REFERRAL_ID}' and intake_answers is null;
    delete from public.profiles where id in (select id from qa_run_accounts);
    delete from auth.identities where user_id in (select id from qa_run_accounts);
    delete from auth.users where id in (select id from qa_run_accounts);
    commit;
  `);
});

/** Her details, then the step that shows what she will be asked (RAPP-618). */
async function fillDetails(
  page: Page,
  email: string,
  entity?: string,
  options: { readonly expectReview?: boolean } = {},
): Promise<void> {
  // Stays on the page when it is already open (a referral URL keeps its referral).
  if (!new URL(page.url()).pathname.endsWith('/participants/new')) {
    await page.goto('/participants/new');
  }
  // Her name creates her profile with the invitation (RAPP-300). A referral
  // already fills it, so only an empty field is typed into.
  const firstName = page.locator('#new-participant-first-name');
  if ((await firstName.inputValue()) === '') await firstName.fill('Qa');
  const lastName = page.locator('#new-participant-last-name');
  if ((await lastName.inputValue()) === '') await lastName.fill(`Invite ${RUN_TAG}`);
  await page.locator('#new-participant-email').fill(email);
  if (entity !== undefined) {
    await page.locator('#new-invite-entity').fill(entity);
  }
  await page
    .getByRole('button', {
      name: /què se li preguntarà|what she will be asked|qué se le preguntará/i,
    })
    .click();
  if (options.expectReview === false) return;
  await expect(page.getByTestId('invite-questions-review')).toBeVisible({ timeout: 15_000 });
}

async function createInvitation(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /crea la invitació|create the invitation|crea la invitación/i })
    .click();
}

async function invite(page: Page, email: string, entity?: string): Promise<void> {
  await fillDetails(page, email, entity);
  await createInvitation(page);
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

    // Her profile exists from the invitation, as invited and without consent (RAPP-300).
    expect(
      queryDatabase(
        `select p.role || ':' || (p.terms_accepted_at is null)::text from public.profiles p join auth.users u on u.id = p.id where u.email = '${email}'`,
      ),
    ).toBe('invited:true');

    const player = await (await browser.newContext({ locale: 'en-GB' })).newPage();
    await signInPlayer(player, email);
    // Staff gave her name, so the wizard skips the name screen and opens on the
    // background questions (RAPP-300).
    await expect(player.getByTestId('onboarding-day')).toBeVisible({ timeout: 30_000 });
    await expect(player.getByTestId('onboarding-first-name')).toHaveCount(0);
    expect(new URL(player.url()).origin).toBe(PLAYER_ORIGIN);
  });

  test('staff open her new record and complete it in parts before she joins', async ({ page }) => {
    const email = `complete.${RUN_TAG}@example.test`;
    await invite(page, email);
    await expect(page.getByRole('heading', { name: INVITED })).toBeVisible({ timeout: 15_000 });

    await page
      .getByRole('link', {
        name: /completa les seves dades|complete her details|completa sus datos/i,
      })
      .click();
    await expect(
      page.getByText(/encara no ha entrat|not joined yet|aún no ha entrado/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Her page on the Fitxa layout (RAPP-653): nothing anybody answered shows
    // a value (no "M", no "no dependants"), and a field is edited on its row.
    const notFilled = /sense omplir|not filled in|sin rellenar/i;
    await expect(page.getByTestId('fitxa-field-clothing_size-value')).toHaveText(notFilled);
    await expect(page.getByTestId('fitxa-field-dependents-value')).toHaveText(notFilled);

    await page.getByTestId('fitxa-field-clothing_size-edit').click();
    const editor = page.getByTestId('fitxa-field-clothing_size-editor');
    await expect(editor.locator('select')).toHaveValue('');
    await editor.locator('select').selectOption({ label: 'L' });
    await editor.getByRole('button', { name: /^(desa|save|guardar)$/i }).click();
    await expect(page.getByTestId('fitxa-field-clothing_size-value')).toHaveText('L');

    // Only the field she changed became a staff answer; the names came with the invitation.
    await expect
      .poll(
        () =>
          queryDatabase(
            `select string_agg(a.question || ':' || a.source, ',' order by a.question) from public.profile_answers a join auth.users u on u.id = a.profile_id where u.email = '${email}'`,
          ),
        { timeout: 15_000 },
      )
      .toBe('clothing_size:staff,first_name:staff,last_name:staff');
  });

  /**
   * Staff choose what her registration asks (RAPP-301), and her wizard follows.
   * "She reviews everything" makes it ask her names although staff gave them,
   * so her wizard opens on the name screen. Don't ask is not offered on a
   * required question nobody answered.
   */
  test('staff choose what her registration asks, and her wizard follows', async ({
    page,
    browser,
  }) => {
    const email = `review.${RUN_TAG}@example.test`;
    await invite(page, email);
    await expect(page.getByRole('heading', { name: INVITED })).toBeVisible({ timeout: 15_000 });
    await page
      .getByRole('link', {
        name: /completa les seves dades|complete her details|completa sus datos/i,
      })
      .click();

    // The choice sits on each field's row of her page (RAPP-653) and saves at once.
    const choices = page.getByTestId('participant-choices');
    await expect(choices).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('fitxa-field-shoe_size-choice').click();
    await expect(page.getByTestId('fitxa-field-shoe_size-choice-skip')).toHaveAttribute(
      'data-disabled',
      '',
    );
    await page.keyboard.press('Escape');

    await choices
      .getByRole('button', { name: /que ho revisi tot|reviews everything|que lo revise todo/i })
      .click();
    await expect(page.getByTestId('fitxa-field-phone-choice')).toHaveAttribute(
      'data-state-choice',
      'ask',
      { timeout: 15_000 },
    );
    await page.getByTestId('fitxa-field-phone-choice').click();
    await page.getByTestId('fitxa-field-phone-choice-skip').click();
    await expect(page.getByTestId('fitxa-field-phone-choice')).toHaveAttribute(
      'data-state-choice',
      'skip',
      { timeout: 15_000 },
    );

    await expect
      .poll(
        () =>
          queryDatabase(
            `select count(*) filter (where s.state = 'ask') || ':' || count(*) filter (where s.state = 'skip')
               from public.intake_question_states s join auth.users u on u.id = s.profile_id
              where u.email = '${email}'`,
          ),
        { timeout: 15_000 },
      )
      // Every wizard question is Ask but the phone, which is Skip. Read from the
      // database, so a new wizard question does not break this check. The
      // language is in the database list but on no wizard screen (it is chosen
      // before the wizard), so the staff choices never include it.
      .toBe(
        `${Number(queryDatabase("select cardinality(array_remove(private.wizard_intake_questions(), 'preferred_language'))")) - 1}:1`,
      );

    const player = await (await browser.newContext({ locale: 'en-GB' })).newPage();
    await signInPlayer(player, email);
    // Ask: the names staff gave are asked again, filled in for her to confirm.
    await expect(player.getByTestId('onboarding-first-name')).toBeVisible({ timeout: 30_000 });
  });

  /**
   * The last step of creating her (RAPP-618): what she will be asked, from
   * what staff entered. The choices are saved with the invitation, and her
   * wizard follows them.
   */
  test('staff confirm what she will be asked before the invitation exists', async ({
    page,
    browser,
  }) => {
    const email = `confirm.${RUN_TAG}@example.test`;
    await fillDetails(page, email, 'Creu Roja');
    const review = page.getByTestId('invite-questions-review');
    // Nothing exists yet: the step only shows the plan.
    expect(countInDatabase(`select count(*) from auth.users where email = '${email}'`)).toBe(0);
    // Staff gave her name and entity: Auto skips them. Nobody answered the rest.
    await expect(review).toBeVisible();
    await expectAsking(page, 'first_name', 'not-asked');
    await expectAsking(page, 'reference_entity', 'not-asked');
    await expectAsking(page, 'date_of_birth', 'asked');
    // Don't ask is not offered on a required question nobody answered.
    await expect(
      (await questionRow(page, 'shoe_size')).getByTestId('invite-question-shoe_size-skip'),
    ).toBeDisabled();

    await choose(page, 'first_name', 'ask');
    await choose(page, 'phone', 'skip');
    await choose(page, 'reference_entity', 'skip');
    await expectAsking(page, 'first_name', 'asked');
    // Her name screen shows both names, as on her phone (RAPP-618).
    await expectAsking(page, 'last_name', 'asked');
    // Her contact shows only once she has an entity.
    await expectAsking(page, 'reference_contact_name', 'when-it-applies');
    await expectAsking(page, 'phone', 'not-asked');
    await page.keyboard.press('Escape');

    // Back to her details keeps what staff typed.
    await page
      .getByRole('button', {
        name: /torna a les seves dades|back to her details|volver a sus datos/i,
      })
      .click();
    await expect(page.locator('#new-participant-email')).toHaveValue(email);
    await page
      .getByRole('button', {
        name: /què se li preguntarà|what she will be asked|qué se le preguntará/i,
      })
      .click();
    await choose(page, 'first_name', 'ask');
    await choose(page, 'phone', 'skip');
    await page.keyboard.press('Escape');
    await createInvitation(page);
    await expect(page.getByRole('heading', { name: INVITED })).toBeVisible({ timeout: 15_000 });

    expect(
      queryDatabase(
        `select string_agg(s.question || ':' || s.state, ',' order by s.question)
           from public.intake_question_states s join auth.users u on u.id = s.profile_id
          where u.email = '${email}'`,
      ),
    ).toBe('first_name:ask,phone:skip');
    // Audited like a change on her page (RAPP-301).
    expect(
      countInDatabase(
        `select count(*) from public.audit_log a join auth.users u on u.id = a.target_id
          where u.email = '${email}' and a.action = 'profile.intake_questions_update'`,
      ),
    ).toBe(1);

    // Her wizard opens on the name screen, because staff chose Ask.
    const player = await (await browser.newContext({ locale: 'en-GB' })).newPage();
    await signInPlayer(player, email);
    await expect(player.getByTestId('onboarding-first-name')).toBeVisible({ timeout: 30_000 });
  });

  test("from a referral, the step counts the entity's answers", async ({ page }) => {
    await page.goto(`/participants/new?referral=${PENDING_REFERRAL_ID}`);
    await expect(page.getByTestId('referral-prefill')).toBeVisible({ timeout: 15_000 });
    await fillDetails(page, `referred.preview.${RUN_TAG}@example.test`);
    await expect(page.getByTestId('invite-questions-review')).toBeVisible();
    // The entity gave her date of birth, her phone and her applicant status:
    // she is not asked them again. Nobody gave her address.
    for (const question of ['date_of_birth', 'phone', 'applicant_status']) {
      await expectAsking(page, question, 'not-asked');
    }
    await expectAsking(page, 'address', 'asked');
    // Nothing is created until staff confirm.
    expect(
      countInDatabase(
        `select count(*) from auth.users where email = 'referred.preview.${RUN_TAG}@example.test'`,
      ),
    ).toBe(0);
  });

  test('an invitation opened from a referral carries it, and says so', async ({ page }) => {
    await page.goto(`/participants/new?referral=${PENDING_REFERRAL_ID}`);
    await expect(page.getByTestId('referral-prefill')).toBeVisible({ timeout: 15_000 });
    // What the entity answered is shown before staff invite her (RAPP-303).
    await expect(page.getByTestId('referral-answers')).toBeVisible();

    const email = `referred.${RUN_TAG}@example.test`;
    await invite(page, email);
    await expect(page.getByRole('heading', { name: INVITED })).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/derivació de l'entitat|entity's referral|derivación de la entidad/i),
    ).toBeVisible();
    expect(queryDatabase(`select referral_id from public.invites where email = '${email}'`)).toBe(
      PENDING_REFERRAL_ID,
    );

    // Her record holds the entity's answers, recorded as the entity's, and the
    // referral keeps no copy of them (RAPP-303).
    expect(
      queryDatabase(
        `select p.childcare_need || '|' || p.season_number || '|' || p.city || '|'
                || public.decrypt_field(p.applicant_status)
           from public.profiles p join auth.users u on u.id = p.id where u.email = '${email}'`,
      ),
    ).toBe('yes|2|Vic|migrant');
    expect(
      queryDatabase(
        `select a.source from public.profile_answers a join auth.users u on u.id = a.profile_id
          where u.email = '${email}' and a.question = 'season_number'`,
      ),
    ).toBe('entity');
    expect(
      queryDatabase(
        `select (intake_answers is null)::text from public.entity_referrals where id = '${PENDING_REFERRAL_ID}'`,
      ),
    ).toBe('true');
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

    // The address is checked on her details, before the questions step.
    await fillDetails(page, 'not-an-address', undefined, { expectReview: false });

    await expect(page.getByText(/vàlida|valid|válida/i).first()).toBeVisible();
    await expect(page.getByTestId('invite-questions-review')).toHaveCount(0);
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
