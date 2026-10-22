/**
 * Moving the onboarding setup (RAPP-621), end to end in real browsers, the
 * way Fabián does it at launch: an admin of the seeded organization (staging)
 * downloads the setup from the onboarding page; the admin of a brand-new
 * organization (production) chooses the file, reads the preview and imports
 * it, once; a second import is refused. Then a test player in each
 * organization, with the same answers filled, opens the player app on the
 * same screen at the same step.
 *
 * The new organization lives only for this spec: a second organization
 * changes who an uninvited woman joins, so the spec removes it at the end.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Browser } from '@playwright/test';
import { ONBOARDING_DESIGNER_EMAIL, TEST_PLAYER_EMAIL } from '@ramassa/shared/testing';
import { countInDatabase, queryDatabase, signIn, signInPlayer } from './session';

test.setTimeout(300_000);
test.use({ actionTimeout: 15_000 });

const SOURCE_ORG = '5eed0000-0000-4000-8000-000000000000';
const NEW_ORG = '5eed0000-0000-4000-8000-0000000006f0';
const NEW_ADMIN = '5eed0000-0000-4000-8000-0000000006f1';
const NEW_ADMIN_EMAIL = 'admin.produccio@example.test';
const NEW_PLAYER = '5eed0000-0000-4000-8000-0000000006f2';
const NEW_PLAYER_EMAIL = 'jugadora.produccio@example.test';
const SOURCE_ADMIN_EMAIL = 'laia.ferrer@example.test';
const SOURCE_ADMIN = '5eed0000-0000-4000-8000-000000000001';

let downloadedPath = '';

/** Runs SQL as a signed-in team member with her second factor, as the admin does. */
function asTeamMember(id: string, sql: string): string {
  const claims = JSON.stringify({ sub: id, role: 'authenticated', aal: 'aal2' });
  const output = queryDatabase(
    `begin; set local role authenticated; set local request.jwt.claims = '${claims}'; ${sql}; commit;`,
  );
  const lines = output.split('\n').filter((line) => !/^(BEGIN|SET|COMMIT|ROLLBACK)$/.test(line));
  return (lines.at(-1) ?? '').trim();
}

const FILL = `'{"kind": "answers", "fill": {
  "first_name": "Joana", "last_name": "Prova", "date_of_birth": "1995-05-15",
  "place_of_birth": "Marroc", "nationality": "Marroc", "preferred_language": "en",
  "reference_entity": "Entitat de prova", "has_dependents": false, "num_dependents": 0,
  "clothing_size": "M", "shoe_size": "38"}}'::jsonb`;

function createUser(id: string, email: string): string {
  return `
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000', '${id}', 'authenticated', 'authenticated', '${email}',
      extensions.crypt('ramassa-dev-password', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '');
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values ('${id}', '${id}', jsonb_build_object('sub', '${id}', 'email', '${email}', 'email_verified', true),
      'email', now(), now(), now());`;
}

test.afterAll(() => {
  // Audit rows are append-only (trigger off for the suite's own); the rest
  // goes by the organization's cascade, with its triggers on.
  queryDatabase(`
    begin;
    set local session_replication_role = replica;
    delete from public.audit_log where org_id = '${NEW_ORG}' or action = 'onboarding.export'
       or actor_id in ('${NEW_ADMIN}', '${NEW_PLAYER}');
    commit;
  `);
  queryDatabase(`
    begin;
    delete from public.invites where org_id = '${NEW_ORG}';
    delete from public.profiles where org_id = '${NEW_ORG}';
    delete from public.organizations where id = '${NEW_ORG}';
    delete from auth.users where id in ('${NEW_ADMIN}', '${NEW_PLAYER}');
    commit;
  `);
  // The seeded test player back to brand new.
  const her = `(select id from auth.users where email = '${TEST_PLAYER_EMAIL}')`;
  queryDatabase(`
    begin;
    delete from public.profile_answers where profile_id = ${her};
    update public.profiles set preferred_language = 'ca' where id = ${her};
    commit;
  `);
});

test.describe.serial('moving the onboarding setup', () => {
  test('an admin downloads the setup: one versioned file, no person in it', async ({ page }) => {
    await signIn(page, SOURCE_ADMIN_EMAIL);
    await page.goto('/onboarding');
    const transfer = page.getByTestId('setup-transfer');
    await expect(transfer).toBeVisible({ timeout: 30_000 });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      transfer.getByTestId('setup-download').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^ramassa-onboarding-setup-\d{4}-\d{2}-\d{2}\.json$/,
    );
    downloadedPath = test.info().outputPath('setup.json');
    await download.saveAs(downloadedPath);
    const text = readFileSync(downloadedPath, 'utf8');
    const document = JSON.parse(text) as { schema_version: number; screens: unknown[] };
    expect(document.schema_version).toBe(1);
    expect(document.screens.length).toBe(
      countInDatabase(`select count(*) from public.intake_screens where org_id = '${SOURCE_ORG}'`),
    );
    // No address and no profile id of anyone on the stack.
    const people = queryDatabase(
      `select string_agg(lower(u.email) || ' ' || u.id::text, ' ') from auth.users u`,
    ).split(' ');
    expect(people.filter((value) => value !== '' && text.toLowerCase().includes(value))).toEqual(
      [],
    );
    expect(
      countInDatabase(
        `select count(*) from public.audit_log where action = 'onboarding.export' and actor_id = '${SOURCE_ADMIN}'`,
      ),
    ).toBeGreaterThan(0);
  });

  test('the design role downloads but cannot import', async ({ page }) => {
    await signIn(page, ONBOARDING_DESIGNER_EMAIL);
    await page.goto('/onboarding');
    await expect(page.getByTestId('setup-download')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('setup-import-file')).toHaveCount(0);
  });

  test('the admin of a new organization previews the file and imports it once', async ({
    page,
  }) => {
    queryDatabase(`
      begin;
      insert into public.organizations (id, name, slug) values ('${NEW_ORG}', 'Producció de prova', 'produccio-621');
      ${createUser(NEW_ADMIN, NEW_ADMIN_EMAIL)}
      insert into public.profiles (id, org_id, role, first_name, last_name, preferred_language)
      values ('${NEW_ADMIN}', '${NEW_ORG}', 'admin', 'Admin', 'Producció', 'en');
      insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
      values (gen_random_uuid(), '${NEW_ADMIN}', 'Ramassà (seed)', 'totp', 'verified', 'JBSWY3DPEHPK3PXP', now(), now());
      commit;
    `);
    await signIn(page, NEW_ADMIN_EMAIL);
    await page.goto('/onboarding');
    const transfer = page.getByTestId('setup-transfer');
    await expect(transfer).toBeVisible({ timeout: 30_000 });

    // A file of another version is named before anything is sent.
    const other = test.info().outputPath('other.json');
    const text = readFileSync(downloadedPath, 'utf8');
    writeFileSync(other, text.replace('"schema_version": 1', '"schema_version": 2'));
    await transfer.getByTestId('setup-import-file').setInputFiles(other);
    await expect(transfer.getByTestId('setup-import-refused')).toContainText('version 2');

    await transfer.getByTestId('setup-import-file').setInputFiles(downloadedPath);
    const preview = transfer.getByTestId('setup-import-preview');
    await expect(preview).toBeVisible({ timeout: 30_000 });
    const questions = countInDatabase(
      `select count(*) from public.custom_questions where org_id = '${SOURCE_ORG}'`,
    );
    await expect(preview.getByTestId('setup-count-questions')).toContainText(String(questions));
    await expect(preview.getByTestId('setup-warnings')).toContainText('drafts');
    // The preview created nothing.
    expect(
      countInDatabase(`select count(*) from public.intake_screens where org_id = '${NEW_ORG}'`),
    ).toBe(0);

    await preview.getByTestId('setup-import-confirm').click();
    await expect(preview.getByRole('alert').last()).toContainText('only once');
    await preview.getByTestId('setup-import-confirm').click();
    const report = transfer.getByTestId('setup-import-report');
    await expect(report).toBeVisible({ timeout: 30_000 });
    await expect(report.getByTestId('setup-must-publish')).toBeVisible();

    expect(
      countInDatabase(`select count(*) from public.custom_questions where org_id = '${NEW_ORG}'`),
    ).toBe(questions);
    expect(
      countInDatabase(
        `select count(*) from public.authorization_versions where org_id = '${NEW_ORG}' and published_at is not null`,
      ),
    ).toBe(0);
    expect(
      queryDatabase(
        `select changes -> 'counts' ->> 'questions' from public.audit_log where action = 'onboarding.import' and org_id = '${NEW_ORG}'`,
      ),
    ).toBe(String(questions));

    // Once: the same file again is refused, and the preview says why.
    await transfer.getByTestId('setup-import-file').setInputFiles(downloadedPath);
    await expect(transfer.getByTestId('setup-import-blockers')).toBeVisible({ timeout: 30_000 });
    await expect(transfer.getByTestId('setup-import-confirm')).toHaveCount(0);
  });

  test('a new test player in each organization opens the app on the same screen', async ({
    browser,
  }) => {
    queryDatabase(`
      begin;
      ${createUser(NEW_PLAYER, NEW_PLAYER_EMAIL)}
      insert into public.profiles (id, org_id, role, first_name, last_name, preferred_language, is_test_account)
      values ('${NEW_PLAYER}', '${NEW_ORG}', 'invited', 'Joana', 'Prova', 'en', true);
      insert into public.invites (org_id, email, invited_by, expires_at)
      values ('${NEW_ORG}', '${NEW_PLAYER_EMAIL}', '${NEW_ADMIN}', now() + interval '30 days');
      commit;
    `);
    const sourcePlayer = queryDatabase(
      `select id from auth.users where email = '${TEST_PLAYER_EMAIL}'`,
    ).trim();
    asTeamMember(
      SOURCE_ADMIN,
      `select public.set_test_player_scenario('${sourcePlayer}', ${FILL})`,
    );
    asTeamMember(NEW_ADMIN, `select public.set_test_player_scenario('${NEW_PLAYER}', ${FILL})`);

    async function firstScreen(email: string) {
      const player = await openApp(browser, email);
      await expect(player).toHaveURL(/\/onboarding\//, { timeout: 60_000 });
      const step = player.getByText(/^Step \d+ of \d+$/).first();
      await expect(step).toBeVisible({ timeout: 60_000 });
      const seen = {
        step: (await step.innerText()).trim(),
        title: (await player.getByRole('heading').first().innerText()).trim(),
        kind: new URL(player.url()).pathname.replace(/[0-9a-f-]{36}/, ':id'),
      };
      await player.context().close();
      return seen;
    }

    const staging = await firstScreen(TEST_PLAYER_EMAIL);
    const production = await firstScreen(NEW_PLAYER_EMAIL);
    expect(production).toEqual(staging);
  });
});

async function openApp(browser: Browser, email: string) {
  const player = await (await browser.newContext({ locale: 'en-GB' })).newPage();
  await signInPlayer(player, email);
  return player;
}
