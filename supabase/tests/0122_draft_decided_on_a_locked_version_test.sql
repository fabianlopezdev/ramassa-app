-- A draft acceptance or signature is decided on a locked version row
-- (RAPP-619, pending fix 29).
-- Run with: bunx supabase test db
--
-- The race itself needs two sessions and is proved by
-- `bun run db:test:draft-publish-race` (scripts/verify-draft-publish-race.ts):
-- a test player's acceptance or signature made while an admin publishes the
-- draft waits for the publish and lands on the published version as an
-- ordinary one. What a single session can defend is here:
--   1. An acceptance that names the draft is refused once that row is
--      published, so the late half of the race never records "draft" on a
--      published version.
--   2. A test player's acceptance of a published version is ordinary.
--   3. Every path that decides "is it a draft" locks the row FOR SHARE first,
--      so a later redefinition cannot drop the lock unnoticed.
--
-- Seed: test player ...096 (invited), app terms version 1.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(7);

create temp table run (label text primary key, id uuid) on commit drop;
insert into run (label, id)
select 'terms-v1', id from public.app_terms_versions
 where org_id = '5eed0000-0000-4000-8000-000000000000' and version_number = 1;

select throws_ok(
  $$ insert into public.terms_acceptances (profile_id, terms_version, locale_shown, version_id)
     values ('5eed0000-0000-4000-8000-000000000096', 'draft', 'ca', (select id from run where label = 'terms-v1')) $$,
  '23514', 'the draft terms she was shown were published or discarded',
  'an acceptance of the draft is refused once that version is published'
);
select throws_ok(
  $$ insert into public.terms_acceptances (profile_id, terms_version, locale_shown)
     values ('5eed0000-0000-4000-8000-000000000096', 'draft', 'ca') $$,
  '23514', 'the draft terms she was shown were published or discarded',
  'and the wizard''s acceptance of a draft that is gone'
);
select lives_ok(
  $$ insert into public.terms_acceptances (profile_id, terms_version, locale_shown, version_id)
     values ('5eed0000-0000-4000-8000-000000000096', '1', 'ca', (select id from run where label = 'terms-v1')) $$,
  'a test player accepts a published version'
);
select is(
  (select count(*)::integer from public.terms_acceptances
    where profile_id = '5eed0000-0000-4000-8000-000000000096'
      and version_id = (select id from run where label = 'terms-v1')
      and terms_version = '1' and not is_test_fixture),
  1,
  'as an ordinary acceptance'
);

select ok(
  pg_get_functiondef('private.terms_acceptance_version()'::regprocedure) ~* 'for share',
  'the acceptance trigger locks the version before deciding'
);
select ok(
  pg_get_functiondef('public.accept_current_app_terms(uuid, text, jsonb)'::regprocedure) ~* 'for share'
  and pg_get_functiondef('public.sign_authorization(uuid, jsonb)'::regprocedure) ~* 'for share',
  'accepting the terms and signing the authorization lock it first'
);
select ok(
  pg_get_functiondef('private.record_signature(uuid, uuid, uuid, jsonb, text, uuid, timestamptz)'::regprocedure)
    ~* 'from public\.authorization_versions where id = p_version_id for share',
  'every signing path decides on the locked authorization version'
);

select * from finish();
rollback;
