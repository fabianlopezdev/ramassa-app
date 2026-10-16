-- The preview player account (RAPP-370, ADR-027).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Only a team member with a verified second factor starts a preview:
--      nobody signed out, no player, no entity contact, no team member without
--      her second factor.
--   2. Each organization has one preview account, with no personal data. Each
--      start gives it a new password, kept only as a hash, and is audited.
--   3. The preview reads what a player reads, and stays out of the team's
--      participant list.
--   4. Every request of the preview account is read-only, so it writes
--      nothing, even where row security would let a player write. A real
--      player's requests are not affected.
--   (Signing in with the password on a separate session is checked end to end
--   by `bun run db:test:player-preview`.)

begin;
select plan(21);

select set_config('test.audits_before', (
  select count(*)::text from public.audit_log where action = 'player_preview.start'
), true);

-- 1. Who may start a preview.
-- Asked of the privilege: calling a function anon may not run, in a raw SQL
-- session, crashes the local server (PostgREST refuses such a call before it
-- reaches the database, with 401).
select ok(
  not has_function_privilege('anon', 'public.start_player_preview()', 'execute'),
  'nobody signed out starts a preview'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select throws_ok(
  $$ select public.start_player_preview() $$,
  '42501', null::text, 'a player cannot start a preview'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.start_player_preview() $$,
  '42501', null::text, 'an entity contact cannot start a preview'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  $$ select public.start_player_preview() $$,
  '42501', null::text, 'a team member without her second factor cannot start a preview'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select set_config('test.first_start', (select public.start_player_preview())::text, true);
select is(
  current_setting('test.first_start')::jsonb ->> 'email',
  'preview+5eed0000-0000-4000-8000-000000000000@preview.ramassa.invalid',
  'a verified team member gets the address of her organization''s preview account'
);
select set_config('test.second_start', (select public.start_player_preview())::text, true);

-- 2. One account per organization, with no personal data, audited.
reset role;
select set_config('test.preview_id', (
  select id::text from public.profiles
  where org_id = '5eed0000-0000-4000-8000-000000000000' and role = 'preview'
), true);
select is(
  (select count(*)::int from public.profiles
    where org_id = '5eed0000-0000-4000-8000-000000000000' and role = 'preview'),
  1, 'a second start reuses the one preview account'
);
select ok(
  (select phone is null and address is null and date_of_birth is null and document_number is null
          and nationality is null and document_type = 'none' and terms_accepted_at is not null
     from public.profiles where id = current_setting('test.preview_id')::uuid),
  'the preview account holds no personal data and needs no onboarding'
);
select ok(
  (select encrypted_password = extensions.crypt(
            current_setting('test.second_start')::jsonb ->> 'password', encrypted_password)
     from auth.users where id = current_setting('test.preview_id')::uuid),
  'with a password stored only as its hash'
);
select ok(
  (select encrypted_password <> extensions.crypt(
            current_setting('test.first_start')::jsonb ->> 'password', encrypted_password)
     from auth.users where id = current_setting('test.preview_id')::uuid),
  'and each start replaces it, so an earlier password opens nothing'
);
select is(
  (select count(*)::int from public.audit_log where action = 'player_preview.start')
    - current_setting('test.audits_before')::int,
  2, 'every start is audited'
);
select throws_ok(
  $$ update public.profiles set role = 'preview' where id = '5eed0000-0000-4000-8000-000000000011' $$,
  '23505', null::text, 'an organization cannot have a second preview account'
);
select throws_ok(
  $$ update public.profiles set role = 'ghost' where id = '5eed0000-0000-4000-8000-000000000011' $$,
  '23514', null::text, 'a profile cannot carry an unknown role'
);

-- 3. What it reads: what a player reads.
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select set_config('test.player_reads', (
  select concat_ws('|',
    (select count(*) from public.announcements),
    (select count(*) from public.events),
    (select count(*) from public.knowledge_articles),
    (select count(*) from public.services))
), true);

select set_config('request.jwt.claims', json_build_object(
  'sub', current_setting('test.preview_id'), 'role', 'authenticated')::text, true);
select is((select public.current_app_role()), 'player', 'the database treats the preview as a player');
select is(
  (select count(*)::text from public.announcements),
  split_part(current_setting('test.player_reads'), '|', 1),
  'it reads the announcements a player reads'
);
select is(
  (select count(*)::text from public.events),
  split_part(current_setting('test.player_reads'), '|', 2),
  'the events'
);
select is(
  (select count(*)::text from public.knowledge_articles),
  split_part(current_setting('test.player_reads'), '|', 3),
  'the knowledge articles'
);
select is(
  (select count(*)::text from public.services),
  split_part(current_setting('test.player_reads'), '|', 4),
  'and the services'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select ok(
  not exists (
    select 1 from public.list_participants(p_page_size => 100)
    where id = current_setting('test.preview_id')::uuid
  ),
  'the preview account is not in the team''s participant list'
);

-- 4. Read-only. Last, because the preview's request makes this transaction read-only.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select private.player_preview_pre_request();
select is(current_setting('transaction_read_only'), 'off', 'a real player''s request stays writable');

select set_config('request.jwt.claims', json_build_object(
  'sub', current_setting('test.preview_id'), 'role', 'authenticated')::text, true);
select private.player_preview_pre_request();
select is(current_setting('transaction_read_only'), 'on', 'a request of the preview account is read-only');
select throws_ok(
  format(
    'insert into public.service_interests (service_id, org_id, user_id) select id, org_id, %L from public.services limit 1',
    current_setting('test.preview_id')
  ),
  '25006', null::text, 'so a write that row security allows a player is refused'
);

select * from finish();
rollback;
