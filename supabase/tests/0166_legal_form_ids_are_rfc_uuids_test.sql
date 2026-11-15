-- The ids the two legal forms build for their parts are RFC 4122 uuids (RAPP-773).
-- Run with: bunx supabase test db
--
-- The Control Center and the app read a form's screens with a strict uuid
-- reader, which refuses an id without the version and variant bits and so
-- left the whole form out. Every id the converters build carries them.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(3);

select is(
  private.stable_uuid('same text'), private.stable_uuid('same text'),
  'one source text gives one id'
);
select ok(
  private.stable_uuid('any text')::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
  'with version 5 and the RFC variant'
);
select is(
  (select count(*)::integer
     from public.custom_form_screens s
     join public.custom_forms f on f.id = s.form_id
    where f.system_key is not null
      and s.id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  0,
  'every screen of the legal forms has an RFC uuid'
);

select * from finish();
rollback;
