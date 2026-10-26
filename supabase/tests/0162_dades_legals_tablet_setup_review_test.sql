-- Dades legals: the walk-in tablet, the setup file and the review ask Onboarding consents (RAPP-699).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. The tablet: a walk-in's ticks of the live Onboarding consents wait with
--      her signing, in her language, and become her consent events on
--      confirm (tablet, Onboarding, the coach present). An older tablet sends
--      none and is accepted; a missing required tick is refused.
--   2. The setup file carries the consents and their Onboarding placements;
--      a fresh organization gets them by key, and an older file still imports.
--   3. The review: a tick equal to her current state records nothing, a
--      changed one records a new decision.
--
-- Seed: staff ...002 (consents.collect, participants.invite), admin ...001,
-- player ...012, version ...8041...001.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(16);

select vault.create_secret('test-encryption-key', 'app_encryption_key', 'pgTAP test key')
where not exists (select 1 from vault.secrets where name = 'app_encryption_key');

create temp table run (label text primary key, id uuid, doc jsonb);
grant all on run to authenticated;
insert into run (label, id) values ('walk_in', '0b5e0000-0000-4000-8000-000000000699');

-- A team consent asked on the logistics screen, required.
insert into public.consents (id, org_id, key, name, body)
values ('69900000-0000-4000-8000-000000000011', '5eed0000-0000-4000-8000-000000000000', 'transport',
        '{"ca": "Transport"}', '{"ca": "Accepto el transport.", "ar": "أوافق على النقل."}');
insert into public.consent_placements (org_id, consent_id, surface, screen_key, sort_order, required)
values ('5eed0000-0000-4000-8000-000000000000', '69900000-0000-4000-8000-000000000011', 'onboarding',
        'logistics', 5, true);

create function pg_temp.payload() returns jsonb language sql as $$
  select jsonb_build_object(
    'consents', jsonb_build_object('participation', true, 'data_processing', true,
                                   'code_of_conduct', true, 'health_data', true, 'image_rights', true),
    'health_info', 'No', 'signature', '[[[10,20],[30,40]]]'::jsonb, 'language', 'ar', 'device', 'iPad');
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1. The tablet ----------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.submit_walk_in_signing(gen_random_uuid(), 'Rim', 'Haddad',
       '5eed0000-0000-4000-8041-000000000001', pg_temp.payload(), now(), '{}', '{"transport": false}') $$,
  '23514', 'every required consent must be given', 'a required Onboarding consent must be ticked'
);
select lives_ok(
  $$ select public.submit_walk_in_signing(gen_random_uuid(), 'Iryna', 'Melnyk',
       '5eed0000-0000-4000-8041-000000000001', pg_temp.payload(), now(), '{}') $$,
  'an older tablet sends no consent ticks and is accepted'
);
select lives_ok(
  $$ select public.submit_walk_in_signing((select id from run where label = 'walk_in'), 'Rim', 'Haddad',
       '5eed0000-0000-4000-8041-000000000001', pg_temp.payload(), now() - interval '1 hour', '{}',
       '{"transport": true}') $$,
  'a walk-in ticks the Onboarding consents after the authorization'
);
reset role;
select results_eq(
  $$ select consent_key, granted, wording, language, recorded_by::text from public.walk_in_consents
      where walk_in_id = '0b5e0000-0000-4000-8000-000000000699' $$,
  $$ values ('transport', true, 'أوافق على النقل.', 'ar', '5eed0000-0000-4000-8000-000000000002') $$,
  'they wait with her signing, in her language, with the coach present'
);

set local role authenticated;
insert into run (label, id)
select 'rim', public.confirm_walk_in((select id from run where label = 'walk_in'), 'rim.699@example.test');
reset role;
select results_eq(
  $$ select consent_key, granted, method, form, screen_key, wording, recorded_by::text,
            decided_at < now() - interval '50 minutes'
       from public.consent_events
      where profile_id = (select id from run where label = 'rim') and form = 'onboarding' $$,
  $$ values ('transport', true, 'staff_device', 'onboarding', 'logistics', 'أوافق على النقل.',
             '5eed0000-0000-4000-8000-000000000002', true) $$,
  'on confirm they become her consent events: tablet, Onboarding, the coach present, the time she ticked'
);
select is(
  (select count(*)::integer from public.walk_in_consents where walk_in_id = '0b5e0000-0000-4000-8000-000000000699'),
  0, 'nothing waits once she is confirmed'
);
select is(
  (select disposition from public.personal_data_disposition() where table_name = 'walk_in_consents'),
  'retain_limited', 'the registry lists the waiting ticks'
);

-- 3. The review -------------------------------------------------------------------------------------------

select lives_ok(
  $$ select private.record_onboarding_consents(
       (select id from run where label = 'rim'), '{"transport": true}', 'ar', array['logistics'], true) $$,
  'she reviews the screen and leaves the tick as it was'
);
select is(
  (select count(*)::integer from public.consent_events
    where profile_id = (select id from run where label = 'rim') and consent_key = 'transport'),
  1, 'an unchanged tick records nothing'
);
update public.consent_placements set required = false
 where consent_id = '69900000-0000-4000-8000-000000000011';
select private.record_onboarding_consents(
  (select id from run where label = 'rim'), '{"transport": false}', 'ar', array['logistics'], true);
select is(
  (select granted::text || '|' || method from public.consent_events
    where profile_id = (select id from run where label = 'rim') and consent_key = 'transport'
    order by decided_at desc, id desc limit 1),
  'false|app', 'a changed tick records a new decision'
);

-- 2. The setup file ---------------------------------------------------------------------------------------

update public.consents set body = '{"ca": "Text del butlletí de prova."}'
 where org_id = '5eed0000-0000-4000-8000-000000000000' and key = 'newsletter';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into run (label, doc) values ('first', public.export_onboarding_setup(null));
reset role;
select ok(
  (select doc -> 'consents' @> '[{"key": "transport"}, {"key": "newsletter", "system_key": "newsletter"}]'
          and doc -> 'consent_placements' @> '[{"consent_key": "transport", "screen_key": "logistics"}]'
     from run where label = 'first'),
  'the export carries the consents and where Onboarding asks them'
);

insert into public.organizations (id, name, slug)
values ('69900000-0000-4000-8000-0000000006a0', 'Nova 699', 'nova-699');
insert into auth.users (id, email) values ('69900000-0000-4000-8000-0000000006a1', 'admin-699@example.test');
insert into public.profiles (id, org_id, role, first_name, last_name)
values ('69900000-0000-4000-8000-0000000006a1', '69900000-0000-4000-8000-0000000006a0', 'admin', 'Admin', 'Nou')
on conflict (id) do update set org_id = excluded.org_id, role = excluded.role;
insert into public.team_member_permissions (org_id, profile_id, permission_code)
values ('69900000-0000-4000-8000-0000000006a0', '69900000-0000-4000-8000-0000000006a1', 'settings.organization')
on conflict do nothing;
set local role authenticated;
set local request.jwt.claims = '{"sub": "69900000-0000-4000-8000-0000000006a1", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.import_onboarding_setup((select doc from run where label = 'first')) $$,
  'a fresh organization imports it'
);
reset role;
select is(
  (select body ->> 'ca' from public.consents
    where org_id = '69900000-0000-4000-8000-0000000006a0' and key = 'newsletter'),
  'Text del butlletí de prova.', 'a system consent takes the file''s wording by key'
);
select is(
  (select c.key || '|' || p.screen_key || '|' || p.required from public.consent_placements p
     join public.consents c on c.id = p.consent_id
    where p.org_id = '69900000-0000-4000-8000-0000000006a0' and p.surface = 'onboarding' and c.key = 'transport'),
  'transport|logistics|false', 'a staff consent is made by key and placed where the file asks it'
);

-- An older file without them still imports.
delete from public.consent_placements where org_id = '69900000-0000-4000-8000-0000000006a0';
delete from public.consents where org_id = '69900000-0000-4000-8000-0000000006a0' and system_key is null;
delete from public.intake_screens where org_id = '69900000-0000-4000-8000-0000000006a0';
select lives_ok(
  $$ select private.check_onboarding_setup_document(
       (select doc - 'consents' - 'consent_placements' from run where label = 'first')) $$,
  'an older file without consents is still a valid file'
);
select throws_ok(
  $$ select private.check_onboarding_setup_document(
       jsonb_set((select doc from run where label = 'first'), '{consents}', '[{"key": "Bad Key"}]')) $$,
  '22023', null::text, 'a damaged consent is refused'
);

select * from finish();
rollback;
