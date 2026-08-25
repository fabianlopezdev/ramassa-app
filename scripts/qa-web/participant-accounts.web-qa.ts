/**
 * Creating a participant's access, inviting her, and resetting her password,
 * driven the way a staff member drives it (RAPP-25).
 *
 * THE ASSERTION THIS FILE EXISTS FOR is the last one: a credential this screen
 * printed is typed into a real login form and really signs in. Everything else
 * about the feature can look right while that is false — the row is in
 * `auth.users`, the panel shows a plausible address and password, pgTAP is
 * green because it verifies the hash the way GoTrue verifies it — and the only
 * person who finds out is a woman standing at the door with a slip of paper.
 * So the credential is never read from the database or from a fixture: it is
 * read off the screen that promised it, and then used.
 *
 * Every other expected value comes from psql (never from the app, which is
 * confidently wrong exactly when it matters), and the specs are RE-RUNNABLE:
 * names carry a per-run suffix and counts are asserted as relationships, not
 * absolutes, so a second run against an already-changed database still means
 * something.
 */

import { expect, test, type Page } from '@playwright/test';
import {
  countInDatabase,
  ENTITY_EMAIL,
  queryDatabase,
  queryDatabaseAsAddress,
  signIn,
  signOut,
  STAFF_EMAIL,
} from './session';

/**
 * A suffix unique to this run, so the specs can be run repeatedly against the
 * same database and still assert "the row I just made", not "a row like it".
 * Date-based rather than random: a failure's leftovers are identifiable.
 */
const RUN_TAG = `qa${Date.now().toString(36)}`;

/**
 * This run's accounts and invitations, removed when the file is done.
 *
 * Not tidiness: account creation is RATE-LIMITED to 20 an hour per staff
 * member, counted off the audit trail, so a suite that mints half a dozen
 * accounts per run and leaves them behind turns green into red on the fourth
 * run of the day — and it fails looking exactly like a broken screen. The
 * limit itself is asserted where it is decided, in pgTAP; here it is a hazard
 * to stay clear of.
 *
 * Matched on this run's tag alone, so a parallel run's rows and every seeded
 * participant are untouched.
 */
test.afterAll(() => {
  // One transaction, ids captured BEFORE anything is deleted. Deleting the
  // auth rows by "whatever has no profile left" would be a far wider blast
  // radius than this suite has any business having, and one of the seeded
  // participants is admin-created too, so the domain is not a filter either.
  queryDatabase(`
    begin;
    create temporary table qa_run_profiles on commit drop as
      select id from public.profiles where last_name like '%${RUN_TAG}';
    create temporary table qa_run_invites on commit drop as
      select id from public.invites where email like '%${RUN_TAG}%';

    delete from public.audit_log
     where target_id in (select id from qa_run_profiles)
        or target_id in (select id from qa_run_invites);
    delete from public.invites where id in (select id from qa_run_invites);
    delete from public.profiles where id in (select id from qa_run_profiles);
    delete from auth.identities where user_id in (select id from qa_run_profiles);
    delete from auth.users where id in (select id from qa_run_profiles);
    commit;
  `);
});

interface ShownCredential {
  readonly accessCode: string;
  readonly internalEmail: string;
}

function internalEmailForShownCode(accessCode: string): string {
  return `${accessCode.split('-')[0]}@ramassa.invalid`;
}

/** The access code read off the screen that promised it. */
async function createAccountThroughTheProduct(
  page: Page,
  names: { readonly firstName: string; readonly lastName: string; readonly entity?: string },
): Promise<ShownCredential> {
  await page.goto('/participants/new');
  await page
    .getByRole('button', { name: /no, (no té correu|she has no email|no tiene correo)/i })
    .click();

  await page.locator('#new-participant-first-name').fill(names.firstName);
  await page.locator('#new-participant-last-name').fill(names.lastName);
  if (names.entity !== undefined) {
    await page.locator('#new-participant-entity').fill(names.entity);
  }
  await page
    .getByRole('button', { name: /crea el compte|create the account|crea la cuenta/i })
    .click();

  // Located by the panel's own heading rather than by the domain it shows: a
  // helper that waits for "@ramassa.invalid" makes EVERY spec downstream of it
  // fail with "no credentials panel" the day the domain regresses, hiding
  // which promise actually broke.
  const panel = page
    .locator('section')
    .filter({
      has: page.getByRole('heading', { name: /compte creat|account created|cuenta creada/i }),
    })
    .last();
  await expect(panel).toBeVisible({ timeout: 15_000 });
  const accessCode = panel.getByTestId('one-time-access-code');
  await expect(accessCode).toBeVisible();
  await expect(panel).not.toContainText('@ramassa.invalid');
  const shownCode = (await accessCode.innerText()).trim();
  return {
    accessCode: shownCode,
    internalEmail: internalEmailForShownCode(shownCode),
  };
}

/**
 * Signs in with an arbitrary credential and reports whether it was accepted.
 *
 * The sign-out first is not tidiness: `/login` on an authenticated session
 * redirects to that role's landing, so without it the form would never appear
 * and the spec would fail for a reason that has nothing to do with the
 * credential under test.
 */
async function passwordSignInSucceeds(
  page: Page,
  email: string,
  password: string,
): Promise<boolean> {
  await signOut(page);
  await page.goto('/login');
  const usePassword = page.getByRole('button', { name: /contrasenya|password/i }).first();
  await expect(async () => {
    await usePassword.click();
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();

  // A player has no admin surface, so a SUCCESSFUL sign-in lands on the
  // terminal "no access here" state (AUTH-3) rather than on a dashboard. That
  // is the tell that distinguishes it from a REFUSED one, which stays on the
  // form with the neutral AUTH-6 recovery message. Both are real outcomes of
  // this form, which is what makes the assertion able to fail either way.
  const authenticated = page.getByRole('button', {
    name: /tanca la sessió|sign out|log out|cerrar sesión/i,
  });
  const refused = page.getByRole('alert').filter({ hasText: 'AUTH-6' });
  await expect(authenticated.or(refused).first()).toBeVisible({ timeout: 20_000 });
  return (await authenticated.count()) > 0;
}

function profileIdByEmail(email: string): string {
  return queryDatabase(`select id from auth.users where email = '${email}'`);
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

async function requestsAfterResultSettles(page: Page): Promise<readonly string[]> {
  const requests: string[] = [];
  const collect = (request: { url(): string }) => requests.push(request.url());
  page.on('request', collect);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const browser = globalThis as unknown as {
          requestAnimationFrame: (callback: () => void) => number;
        };
        browser.requestAnimationFrame(() => browser.requestAnimationFrame(() => resolve()));
      }),
  );
  page.off('request', collect);
  return requests;
}

test.describe('creating an account for a participant with no email', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, STAFF_EMAIL);
  });

  /**
   * THE ACCEPTANCE CRITERION. The password is read off the panel and typed
   * into the real login form, because "the account was created" and "she can
   * get in" are different claims and only the second one matters to her.
   *
   * The wrong-password half is not padding: without it the spec would pass
   * against a login form that accepted anything.
   */
  test('a credential this screen printed really signs in, and a wrong one does not', async ({
    page,
  }) => {
    const credentials = await createAccountThroughTheProduct(page, {
      firstName: 'Amina',
      lastName: `Signin ${RUN_TAG}`,
    });

    expect(
      await passwordSignInSucceeds(page, credentials.internalEmail, credentials.accessCode),
    ).toBe(true);

    // The same address with a password that was never issued must be refused,
    // or the assertion above proves nothing about the password at all.
    expect(await passwordSignInSucceeds(page, credentials.internalEmail, 'wrong-wrong-wrong')).toBe(
      false,
    );
  });

  /**
   * The generated address is UNROUTABLE, and that is a safety property rather
   * than a naming convention: a real domain could one day deliver a
   * participant's recovery mail to whoever holds that mailbox.
   */
  test('the generated address is unroutable, and staff never typed a domain', async ({ page }) => {
    const credentials = await createAccountThroughTheProduct(page, {
      firstName: 'Núria',
      lastName: `Domini ${RUN_TAG}`,
    });

    expect(credentials.internalEmail).toMatch(
      /^[abcdefghjkmnpqrstuvwxyz23456789]{4}@ramassa\.invalid$/,
    );
    // Per the DATABASE, not per the panel: the identity GoTrue will resolve
    // carries the same unroutable address.
    expect(
      queryDatabase(`select email from auth.users where email = '${credentials.internalEmail}'`),
    ).toBe(credentials.internalEmail);
    expect(
      countInDatabase(`select count(*) from auth.users where email like '%@ramassa.app'`),
    ).toBe(0);
  });

  /**
   * RGPD: staff create the ACCOUNT, she gives the CONSENT. A profile that
   * arrived with the terms already accepted would be consent given on someone
   * else's behalf, which is exactly what the regulation forbids.
   */
  test('the new profile is admin-created, carries her entity, and accepts nothing for her', async ({
    page,
  }) => {
    const credentials = await createAccountThroughTheProduct(page, {
      firstName: 'Fatou',
      lastName: `Consent ${RUN_TAG}`,
      entity: 'Creu Roja Osona',
    });
    const profileId = profileIdByEmail(credentials.internalEmail);
    expect(profileId).not.toBe('');

    const row = queryDatabase(
      `select auth_method || '|' || coalesce(reference_entity, '-') || '|' ||
              coalesce(terms_accepted_at::text, 'null') || '|' || role
         from public.profiles where id = '${profileId}'`,
    );
    expect(row).toBe('admin_created|Creu Roja Osona|null|player');

    // Audited under its own action, naming the staff member who did it.
    const actor = queryDatabase(
      `select u.email from public.audit_log a join auth.users u on u.id = a.actor_id
        where a.action = 'account.create' and a.target_id = '${profileId}'`,
    );
    expect(actor).toBe(STAFF_EMAIL);
  });

  /**
   * The audit trail records WHICH account was minted, and never the password.
   * A credential in the log would outlive the one-time panel and undo the
   * whole point of showing it once.
   */
  test('no audit row anywhere carries the password that was shown', async ({ page }) => {
    const credentials = await createAccountThroughTheProduct(page, {
      firstName: 'Sara',
      lastName: `Audit ${RUN_TAG}`,
    });

    expect(
      countInDatabase(
        `select count(*) from public.audit_log
          where changes::text like '%${credentials.accessCode}%'`,
      ),
    ).toBe(0);
  });

  /**
   * A name in a script that folds to nothing must still produce a usable
   * address. This is the case an ASCII-only generator gets wrong by returning
   * an empty local part, and the account it creates is one nobody can log in
   * to.
   */
  test('a name written in Arabic still yields a usable address', async ({ page }) => {
    const credentials = await createAccountThroughTheProduct(page, {
      firstName: 'مريم',
      lastName: `Arabic ${RUN_TAG}`,
    });

    expect(credentials.internalEmail).toMatch(
      /^[abcdefghjkmnpqrstuvwxyz23456789]{4}@ramassa\.invalid$/,
    );
    expect(
      await passwordSignInSucceeds(page, credentials.internalEmail, credentials.accessCode),
    ).toBe(true);
  });

  /** Pressing the button with an empty form has to SAY something. */
  test('a nameless account is refused with words, and nothing is created', async ({ page }) => {
    const before = countInDatabase(`select count(*) from public.profiles`);

    await page.goto('/participants/new');
    await page
      .getByRole('button', { name: /no, (no té correu|she has no email|no tiene correo)/i })
      .click();
    await page
      .getByRole('button', { name: /crea el compte|create the account|crea la cuenta/i })
      .click();

    await expect(
      page.getByText(/falta aquesta dada|this is missing|falta este dato/i).first(),
    ).toBeVisible();
    expect(countInDatabase(`select count(*) from public.profiles`)).toBe(before);
  });

  /**
   * Shown once means GONE on reload. If the panel survived a refresh it would
   * be reading the credential back from somewhere, and "stored nowhere" would
   * be a lie the screen tells in bold red text.
   */
  test('the credentials do not survive a reload', async ({ page }) => {
    const credentials = await createAccountThroughTheProduct(page, {
      firstName: 'Zahra',
      lastName: `Once ${RUN_TAG}`,
    });

    await page.reload();

    // WAITED FOR FIRST, and this is the whole assertion. `toHaveCount(0)`
    // succeeds the instant it is true, which on a page that has not rendered
    // yet is immediately: without something proving the screen is actually
    // back, this spec passes against an implementation that cheerfully
    // restores the password from storage. Asserting the fork is on screen is
    // what makes the two absences below mean "not shown" rather than "not
    // painted yet".
    await expect(
      page.getByRole('button', { name: /no, (no té correu|she has no email|no tiene correo)/i }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText(credentials.accessCode)).toHaveCount(0);
    await expect(page.getByText(credentials.internalEmail)).toHaveCount(0);
  });
});

test.describe('inviting a participant who has an email', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, STAFF_EMAIL);
  });

  async function invite(page: Page, email: string, entity?: string): Promise<void> {
    await page.goto('/participants/new');
    await page
      .getByRole('button', { name: /sí, té correu|she has email|sí, tiene correo/i })
      .click();
    await page.locator('#new-participant-email').fill(email);
    if (entity !== undefined) {
      await page.locator('#new-invite-entity').fill(entity);
    }
    await page
      .getByRole('button', { name: /crea la invitació|create the invitation|crea la invitación/i })
      .click();
  }

  /**
   * The address is stored NORMALIZED, which is what lets the invite find the
   * identity that eventually signs in. Typed here the way a person types one
   * in a hurry: capitals and a trailing space.
   */
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

test.describe('resetting the access code of an admin-created account', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, STAFF_EMAIL);
  });

  /**
   * The reset is only worth anything if the NEW password works and the OLD one
   * stops. Both halves are asserted through the login form, for the reason the
   * creation spec gives.
   */
  test('the new access code signs in and the old one no longer does', async ({ page }) => {
    const original = await createAccountThroughTheProduct(page, {
      firstName: 'Blanca',
      lastName: `Reset ${RUN_TAG}`,
    });
    const profileId = profileIdByEmail(original.internalEmail);

    await page.goto(`/participants/${profileId}`);
    await page
      .getByRole('button', { name: /codi d'accés nou|new access code|código de acceso nuevo/i })
      .click();
    await page
      .getByRole('button', {
        name: /sí, crea un codi nou|yes, create a new code|sí, crea un código nuevo/i,
      })
      .click();

    const panel = page
      .locator('section', { hasText: /codi d'accés nou|new access code|código de acceso nuevo/i })
      .last();
    await expect(panel.locator('code')).toBeVisible({ timeout: 15_000 });
    const replacement = (await panel.locator('code').innerText()).trim();
    expect(replacement).not.toBe(original.accessCode);

    expect(await passwordSignInSucceeds(page, original.internalEmail, replacement)).toBe(true);
    expect(await passwordSignInSucceeds(page, original.internalEmail, original.accessCode)).toBe(
      false,
    );
  });

  /**
   * A magic-link account has no password, so the control must not be there at
   * all. Offering it would be a button whose only outcome is a refusal.
   */
  test('a magic-link account is offered no password reset', async ({ page }) => {
    const magicLinkParticipant = queryDatabase(
      `select id from public.profiles
        where role = 'player' and auth_method = 'magic_link' order by last_name limit 1`,
    );
    expect(magicLinkParticipant).not.toBe('');

    await page.goto(`/participants/${magicLinkParticipant}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: /codi d'accés nou|new access code|código de acceso nuevo/i,
      }),
    ).toHaveCount(0);
  });

  test('the creation form and both one-time code screens work at 375px without refetching', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/participants/new');
    await page
      .getByRole('button', { name: /no, (no té correu|she has no email|no tiene correo)/i })
      .click();
    await expectNoHorizontalScroll(page);

    await page.locator('#new-participant-first-name').fill('Mobile');
    await page.locator('#new-participant-last-name').fill(`Pitch ${RUN_TAG}`);
    await page
      .getByRole('button', { name: /crea el compte|create the account|crea la cuenta/i })
      .click();

    const createdCode = page.getByTestId('one-time-access-code');
    await expect(createdCode).toBeVisible({ timeout: 15_000 });
    await expect(createdCode).toHaveCSS('white-space', 'nowrap');
    expect(
      Number.parseFloat(
        await createdCode.evaluate((element) => {
          const browser = globalThis as unknown as {
            getComputedStyle: (node: unknown) => { fontSize: string };
          };
          return browser.getComputedStyle(element).fontSize;
        }),
      ),
    ).toBeGreaterThanOrEqual(20);
    await expectNoHorizontalScroll(page);
    expect(await requestsAfterResultSettles(page)).toEqual([]);

    const accessCode = (await createdCode.innerText()).trim();
    const internalEmail = internalEmailForShownCode(accessCode);
    const profileId = profileIdByEmail(internalEmail);
    await page.goto(`/participants/${profileId}`);
    await page
      .getByRole('button', { name: /codi d'accés nou|new access code|código de acceso nuevo/i })
      .click();
    await page
      .getByRole('button', {
        name: /sí, crea un codi nou|yes, create a new code|sí, crea un código nuevo/i,
      })
      .click();

    const resetCode = page.getByTestId('one-time-access-code');
    await expect(resetCode).toBeVisible({ timeout: 15_000 });
    await expect(resetCode).toHaveCSS('white-space', 'nowrap');
    await expectNoHorizontalScroll(page);
    expect(await requestsAfterResultSettles(page)).toEqual([]);
  });
});

/**
 * The role boundary in the PRODUCT, not only in the policies. An entity
 * contact handed this URL must not reach the screen, and must not be able to
 * mint an account for anybody.
 */
test('an entity contact cannot reach the account-creation screen', async ({ page }) => {
  const profilesBefore = countInDatabase('select count(*) from public.profiles');
  const invitesBefore = countInDatabase('select count(*) from public.invites');

  await signIn(page, ENTITY_EMAIL);
  await page.goto('/participants/new');

  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 10_000 })
    .not.toContain('/participants/new');
  await expect(
    page.getByRole('button', { name: /no, (no té correu|she has no email|no tiene correo)/i }),
  ).toHaveCount(0);

  await page.goto('/participants/invites');
  await expect(page.getByRole('table')).toHaveCount(0);

  expect(countInDatabase('select count(*) from public.profiles')).toBe(profilesBefore);
  expect(countInDatabase('select count(*) from public.invites')).toBe(invitesBefore);
});
