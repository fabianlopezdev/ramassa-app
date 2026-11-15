/**
 * Proves a draft's test acceptance or signature cannot land on the version
 * an admin is publishing at the same moment (RAPP-619, pending fix 29).
 *
 * The race: an admin's `publish_app_terms_draft()` (or
 * `publish_authorization_draft()`) locks the draft row and turns it into the
 * published version. A test player who accepts (or signs) that draft in the
 * same instant used to decide "this is a draft" from a snapshot taken before
 * the publish committed, so her acceptance committed on the now-published
 * version still marked as a draft test fixture. The fix locks the version row
 * `FOR SHARE` before deciding: that waits for the publish to commit and then
 * reads the published row, so she is recorded against the published version
 * as an ordinary acceptance, or refused.
 * https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS
 *
 * The check is deterministic, not a timing gamble. Two database sessions run
 * through `psql` in the local Supabase database container:
 *   1. session A (the admin) opens a transaction and publishes the draft,
 *      holding the row lock;
 *   2. session B (the test player) accepts or signs the draft and is seen,
 *      from a third connection, WAITING on a lock;
 *   3. session A commits; session B finishes;
 *   4. no published version carries a draft acceptance or signature.
 *
 * It commits rows: run it after `supabase db reset` and reset again after.
 *   source the stack's variables; bun run db:test:draft-publish-race
 */

import { qaBackend } from './qa-web/backend';

const { databaseContainer } = qaBackend(process.env);
const organizationId = '5eed0000-0000-4000-8000-000000000000';
const adminClaims = JSON.stringify({
  sub: '5eed0000-0000-4000-8000-000000000001',
  role: 'authenticated',
  aal: 'aal2',
  amr: [{ method: 'totp', timestamp: 4102444800 }],
});
const designerClaims = JSON.stringify({
  sub: '5eed0000-0000-4000-8000-000000000097',
  role: 'authenticated',
  aal: 'aal2',
  amr: [{ method: 'totp', timestamp: 4102444800 }],
});
const testPlayerId = '5eed0000-0000-4000-8000-000000000096';
const testPlayerClaims = JSON.stringify({ sub: testPlayerId, role: 'authenticated' });

function fail(message: string): never {
  console.error(`Draft publish race check failed: ${message}`);
  process.exit(1);
}

function psqlCommand(applicationName: string): string[] {
  return [
    'docker',
    'exec',
    '-i',
    '-e',
    `PGAPPNAME=${applicationName}`,
    databaseContainer,
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-X',
    '-q',
    '-A',
    '-t',
    '-v',
    'ON_ERROR_STOP=1',
  ];
}

/** One statement batch in its own session; returns what it printed. */
function sql(text: string): string {
  const result = Bun.spawnSync(psqlCommand('race-observer'), { stdin: Buffer.from(text) });
  if (result.exitCode !== 0) fail(`setup SQL failed: ${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

const quote = (value: string): string => `'${value.replaceAll("'", "''")}'`;

async function waitUntil(description: string, query: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (sql(query) === 't') return;
    await Bun.sleep(100);
  }
  fail(`timed out waiting until ${description}`);
}

interface RaceOutcome {
  readonly signerError: string | null;
}

/** Publishes in session A while session B acts on the same draft. */
async function race(name: string, publish: string, act: string): Promise<RaceOutcome> {
  const publisherName = `race-publisher-${name}`;
  const signerName = `race-signer-${name}`;
  const publisher = Bun.spawn(psqlCommand(publisherName), {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  publisher.stdin.write(
    `begin;\nset local role authenticated;\n` +
      `select set_config('request.jwt.claims', ${quote(adminClaims)}, true);\n${publish};\n`,
  );
  await publisher.stdin.flush();
  await waitUntil(
    `${name}: the admin's publish holds its transaction open`,
    `select exists (select 1 from pg_stat_activity
                     where application_name = ${quote(publisherName)} and state = 'idle in transaction');`,
  );

  const signer = Bun.spawn(psqlCommand(signerName), {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  signer.stdin.write(
    `set role authenticated;\n` +
      `select set_config('request.jwt.claims', ${quote(testPlayerClaims)}, false);\n${act};\n`,
  );
  await signer.stdin.flush();
  signer.stdin.end();
  await waitUntil(
    `${name}: the test player's session waits on the publish's lock`,
    `select exists (select 1 from pg_stat_activity
                     where application_name = ${quote(signerName)} and wait_event_type = 'Lock');`,
  );

  publisher.stdin.write('commit;\n');
  await publisher.stdin.flush();
  publisher.stdin.end();
  if ((await publisher.exited) !== 0) {
    fail(`${name}: the publish failed: ${await new Response(publisher.stderr).text()}`);
  }
  const signerExit = await signer.exited;
  const signerError = signerExit === 0 ? null : (await new Response(signer.stderr).text()).trim();
  return { signerError };
}

// Setup: the test player has joined on the published terms; a terms draft
// and an authorization draft exist.
sql(`
begin;
set local role authenticated;
select set_config('request.jwt.claims', ${quote(designerClaims)}, true);
select public.discard_app_terms_draft();
select public.discard_authorization_draft();
-- Her answers travel by field (RAPP-661): each app key becomes its field's
-- answer, a choice its option with that key.
select public.set_test_player_scenario(${quote(testPlayerId)}, jsonb_build_object(
  'kind', 'answers',
  'fill', jsonb_build_object(
    'first_name', 'Joana', 'last_name', 'Prova', 'preferred_language', 'ca',
    'answers', (
      select jsonb_object_agg(f.id::text, coalesce(
               (select to_jsonb(o.id::text) from public.custom_question_options o
                 where o.question_id = f.id and o.key = v.value #>> '{}'),
               v.value))
        from jsonb_each('{
          "date_of_birth": "1995-05-15", "place_of_birth": "Marroc", "nationality": "Marroc",
          "reference_entity": "Entitat de prova", "has_dependents": "no",
          "clothing_size": "M", "shoe_size": "38"}'::jsonb) v
        join public.profile_fields f on f.system_key = v.key and f.org_id = ${quote(organizationId)}))));
select public.set_test_player_scenario(${quote(testPlayerId)}, '{"kind": "terms", "accepted": true}'::jsonb);
reset role;
create temp table published_terms on commit drop as
  select content from public.app_terms_versions
   where org_id = ${quote(organizationId)} and published_at is not null
   order by version_number desc limit 1;
create temp table published_authorization on commit drop as
  select content from public.authorization_versions
   where org_id = ${quote(organizationId)} and published_at is not null
     and season_id = private.current_season_id(${quote(organizationId)})
   order by version_number desc limit 1;
grant select on published_terms, published_authorization to authenticated;
set local role authenticated;
select public.save_app_terms_draft(jsonb_set((select content from published_terms),
  '{body}', '{"ca": "Esborrany per a la prova de concurrència."}'::jsonb));
select public.save_authorization_draft(jsonb_set((select content from published_authorization),
  '{title}', '{"ca": "Autorització en esborrany per a la prova de concurrència"}'::jsonb));
commit;
`);

const [termsDraftId, authorizationDraftId, signingPayload] = sql(`
select (select id from public.app_terms_versions
         where org_id = ${quote(organizationId)} and published_at is null);
select (select id from public.authorization_versions
         where org_id = ${quote(organizationId)} and published_at is null);
select jsonb_build_object(
  'consents', (select jsonb_object_agg(c.consent_key, c.required)
                 from private.authorization_consents(v.content) c),
  'health_info', 'No',
  'emergency_contact', jsonb_build_object('name', 'Olena', 'phone', '+34600222333'),
  'unable_to_draw', true, 'language', 'ca')
  from public.authorization_versions v
 where v.org_id = ${quote(organizationId)} and v.published_at is null;
`).split('\n');
if (!termsDraftId || !authorizationDraftId || !signingPayload) fail('the drafts were not created');

// 1. The app terms.
const terms = await race(
  'terms',
  'select public.publish_app_terms_draft()',
  `select public.accept_current_app_terms(${quote(termsDraftId)}::uuid, 'ca',
     '{"terms_accepted": true, "media_consent": false, "unable_to_draw": true}'::jsonb)`,
);
const termsLeft = sql(`
select count(*) from public.terms_acceptances t
  join public.app_terms_versions v on v.id = t.version_id
 where v.id = ${quote(termsDraftId)} and (t.is_test_fixture or t.terms_version = 'draft');`);
if (termsLeft !== '0') {
  fail(`the published terms carry ${termsLeft} draft test acceptance(s) from the race`);
}
console.log(
  `Terms: the publish committed first; her acceptance ${
    terms.signerError === null
      ? 'was recorded against the published version, as an ordinary acceptance'
      : `was refused (${terms.signerError})`
  }.`,
);

// 2. The authorization.
const authorization = await race(
  'authorization',
  'select public.publish_authorization_draft()',
  `select public.sign_authorization(${quote(authorizationDraftId)}::uuid, ${quote(signingPayload)}::jsonb)`,
);
const signaturesLeft = sql(`
select count(*) from public.authorization_signatures s
 where s.version_id = ${quote(authorizationDraftId)} and s.is_test_fixture;`);
if (signaturesLeft !== '0') {
  fail(
    `the published authorization carries ${signaturesLeft} draft test signature(s) from the race`,
  );
}
console.log(
  `Authorization: the publish committed first; her signature ${
    authorization.signerError === null
      ? 'was recorded against the published version, as an ordinary signature'
      : `was refused (${authorization.signerError})`
  }.`,
);
console.log('Draft publish race check passed. Reset the database: this check commits rows.');

export {};
