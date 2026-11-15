-- Health information and the emergency contact are fields (RAPP-698).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Every organization has the four fields, Sensible, team fields named by
--      a key, placed on the authorization's Health screen; staff place more
--      fields there with the field picker.
--   2. An older build's `health_info` and `emergency_contact` read as answers
--      to the four fields; an empty one is left out.
--   3. Signing writes her answers through the answer writer, encrypted, and
--      checks them: a required field of the Health screen, a value that fits,
--      and the health data consent for a health answer.
--   4. Who reads them: at the Sensible level, like every Sensible answer, and
--      her health only with the health permission too (0160); she reads her own.
--   5. Anonymizing her deletes them.
--
-- Seed: admin ...001, staff ...002 (participants.view_sensitive, rgpd.erase),
-- player ...011 (health "No" and Layla Al-Hassan as her contact), player
-- ...022 (has not signed version 1, which asks health required).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(20);

create temp table run (label text primary key, id uuid) on commit drop;
grant all on run to authenticated;
insert into run (label, id)
select key, (private.authorization_field('5eed0000-0000-4000-8000-000000000000', key)).id
  from unnest(private.authorization_field_keys()) key;

create function pg_temp.payload(p_answers jsonb, p_health_consent boolean default true) returns jsonb
language sql as $$
  select jsonb_build_object(
    'consents', jsonb_build_object('participation', true, 'data_processing', true,
                                   'code_of_conduct', true, 'health_data', p_health_consent),
    'answers', p_answers, 'unable_to_draw', true, 'language', 'ca', 'device', 'iPhone');
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1. The fields and the Health screen -----------------------------------------------------------------

select is(
  (select array_agg(f.system_key || ':' || f.kind || ':' || f.privacy || ':' || s.key order by f.system_key)
     from public.profile_fields f join public.profile_sections s on s.id = f.section_id
    where f.org_id = '5eed0000-0000-4000-8000-000000000000'
      and f.system_key = any (private.authorization_field_keys())),
  array['emergency_contact_name:custom:sensitive:contact', 'emergency_contact_phone:custom:sensitive:contact',
        'emergency_contact_relation:custom:sensitive:contact', 'health_info:custom:sensitive:health_needs'],
  'four Sensible team fields, the health one with health and needs, the contact with the contact'
);
select is(
  (select array_agg(f.system_key || ':' || pl.required order by pl.sort_order)
     from public.field_placements pl join public.profile_fields f on f.id = pl.field_id
    where pl.org_id = '5eed0000-0000-4000-8000-000000000000' and pl.surface = 'authorization'),
  array['health_info:true', 'emergency_contact_name:false', 'emergency_contact_relation:false',
        'emergency_contact_phone:false'],
  'the Health screen places them as version 1 asked them'
);

insert into public.organizations (id, name, slug)
values ('5eed0000-0000-4000-8000-0000000698f0', 'Organització nova', 'nova-698');
select is(
  (select count(*)::integer from public.field_placements
    where org_id = '5eed0000-0000-4000-8000-0000000698f0' and surface = 'authorization'),
  4, 'a new organization gets them on its Health screen'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into run (label, id)
select 'allergies', public.save_profile_field(
  null, (select id from public.profile_sections
          where org_id = '5eed0000-0000-4000-8000-000000000000' and key = 'health_needs'),
  'short_text', '{"ca": "Al·lèrgies"}'::jsonb, null, 'sensitive', false);
select lives_ok(
  $$ select public.place_field((select id from run where label = 'allergies'), 'authorization', null, true) $$,
  'staff place a field of their own on the Health screen, required'
);
select throws_ok(
  $$ select public.place_field((select id from run where label = 'allergies'), 'authorization', 'health') $$,
  null::text, null::text, 'the Health screen is the authorization''s one screen: it names none'
);

-- 2. An older build's payload --------------------------------------------------------------------------------

reset role;
select is(
  private.signing_answers('5eed0000-0000-4000-8000-000000000000', jsonb_build_object(
    'health_info', ' Asma ', 'emergency_contact', jsonb_build_object('name', U&'\200E', 'phone', '+34600222333'))),
  jsonb_build_object((select id::text from run where label = 'health_info'), 'Asma',
                     (select id::text from run where label = 'emergency_contact_phone'), '+34600222333'),
  'an older build''s health and contact are answers; a blank name is left out'
);
select is(
  private.signing_answers('5eed0000-0000-4000-8000-000000000000', jsonb_build_object(
    'health_info', 'Asma',
    'answers', jsonb_build_object((select id::text from run where label = 'health_info'), 'No'))),
  jsonb_build_object((select id::text from run where label = 'health_info'), 'No'),
  'an answer sent by field wins over the old key'
);

-- 3. Signing writes and checks her answers ----------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000022", "role": "authenticated", "aal": "aal1"}';
insert into run (label, id) select 'version', version_id from public.my_authorization_status();
select throws_ok(
  format($$ select public.sign_authorization((select id from run where label = 'version'),
              pg_temp.payload(jsonb_build_object(%L, 'Pòlens')) ) $$,
         (select id::text from run where label = 'allergies')),
  '23502', null::text, 'the required health answer is missing'
);
reset role;
select throws_ok(
  format($$ select private.check_signing_answers('5eed0000-0000-4000-8000-000000000000',
              '5eed0000-0000-4000-8000-000000000022',
              jsonb_set((select content from public.authorization_versions
                          where id = '5eed0000-0000-4000-8041-000000000001'),
                        '{consents,health_data,required}', 'false'),
              pg_temp.payload(jsonb_build_object(%L, 'Asma', %L, 'Pòlens'), false)) $$,
         (select id::text from run where label = 'health_info'),
         (select id::text from run where label = 'allergies')),
  '23514', 'the medical answer needs the health data consent', 'a health answer needs its consent'
);
set local role authenticated;
select throws_ok(
  format($$ select public.sign_authorization((select id from run where label = 'version'),
              pg_temp.payload(jsonb_build_object(%L, 'Asma', %L, 'Pòlens', %L, 'no és un telèfon'))) $$,
         (select id::text from run where label = 'health_info'),
         (select id::text from run where label = 'allergies'),
         (select id::text from run where label = 'emergency_contact_phone')),
  '23514', 'the answer does not fit the question', 'a phone that is not one is refused'
);
select throws_ok(
  format($$ select public.sign_authorization((select id from run where label = 'version'),
              pg_temp.payload(jsonb_build_object(%L, 'Asma', %L, 'Pòlens', %L, 'x'))) $$,
         (select id::text from run where label = 'health_info'),
         (select id::text from run where label = 'allergies'),
         '5eed0000-0000-4000-8045-000000000003'),
  '23514', 'not a question of the authorization', 'a field the Health screen does not ask is refused'
);
select lives_ok(
  format($$ select public.sign_authorization((select id from run where label = 'version'),
              pg_temp.payload(jsonb_build_object(%L, 'Asma', %L, 'Pòlens', %L, 'Olena', %L, '+34600222333'))) $$,
         (select id::text from run where label = 'health_info'),
         (select id::text from run where label = 'allergies'),
         (select id::text from run where label = 'emergency_contact_name'),
         (select id::text from run where label = 'emergency_contact_phone')),
  'she signs with her answers'
);
reset role;
select is(
  (select array_agg(f.system_key || ':' || public.decrypt_field(a.value_encrypted) || ':' || a.source
                    order by f.system_key)
     from public.custom_answers a join public.profile_fields f on f.id = a.question_id
    where a.profile_id = '5eed0000-0000-4000-8000-000000000022' and a.value is null
      and f.system_key = any (private.authorization_field_keys())),
  array['emergency_contact_name:"Olena":player', 'emergency_contact_phone:"+34600222333":player',
        'health_info:"Asma":player'],
  'her answers are stored encrypted, as hers'
);

-- A walk-in's answers are checked when she signs on the tablet.
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  format($$ select public.submit_walk_in_signing(gen_random_uuid(), 'Rim', 'Haddad',
              (select id from run where label = 'version'),
              pg_temp.payload(jsonb_build_object(%L, 'Pòlens')), now()) $$,
         (select id::text from run where label = 'allergies')),
  '23502', null::text, 'a walk-in with no health answer is refused'
);

-- 4. Who reads them -------------------------------------------------------------------------------------------

select is(
  (select coalesce(answers ->> (select id::text from run where label = 'health_info'), 'hidden') || '|'
          || (answers ->> (select id::text from run where label = 'emergency_contact_phone'))
     from public.get_participant_profile('5eed0000-0000-4000-8000-000000000011')),
  'hidden|+34600000099',
  'staff with participants.view_sensitive read her contact; her health needs the health permission'
);
reset role;
delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000002' and permission_code = 'participants.view_sensitive';
set local role authenticated;
select is(
  (select coalesce(answers ->> (select id::text from run where label = 'health_info'), 'hidden') || '|'
          || coalesce(answers ->> (select id::text from run where label = 'emergency_contact_phone'), 'hidden')
     from public.get_participant_profile('5eed0000-0000-4000-8000-000000000011')),
  'hidden|hidden', 'without it they are hidden'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(
  (select answers ->> (select id::text from run where label = 'emergency_contact_name') from public.get_own_profile()),
  'Layla Al-Hassan', 'she reads her own'
);
select ok(
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'profiles'
                 and column_name in ('health_info', 'emergency_contact_name', 'emergency_contact_relation',
                                     'emergency_contact_phone', 'emergency_contact_privacy')),
  'the old profile columns are gone'
);

-- 5. Anonymizing deletes them ---------------------------------------------------------------------------------

reset role;
insert into public.team_member_permissions (org_id, profile_id, permission_code)
values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-000000000002',
        'participants.view_sensitive')
on conflict do nothing;
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok($$ select public.anonymize_participant('5eed0000-0000-4000-8000-000000000011') $$,
  'staff anonymize her');
reset role;
select is(
  (select count(*)::integer from public.custom_answers a
    where a.profile_id = '5eed0000-0000-4000-8000-000000000011'
      and a.question_id in (select id from run where label = any (private.authorization_field_keys()))),
  0, 'her health and her emergency contact are deleted with her answers'
);

select * from finish();
rollback;
