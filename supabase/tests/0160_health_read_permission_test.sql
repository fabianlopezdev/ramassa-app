-- Her health answer needs the health permission (RAPP-698).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. The health field carries participants.view_health as its read
--      permission, and only that permission is allowed there.
--   2. Staff with participants.view_sensitive but not view_health do not read
--      it, on her page or in her answers; the emergency contact they do.
--      Staff with view_health read it.
--   3. A privacy change keeps the rule, and its preview counts only people
--      who hold the health permission.
--   4. Writing is not affected: staff who could write it still can.
--
-- Seed: admin ...001 (every participants permission), staff ...002
-- (view_sensitive, no view_health), player ...011 (health "No", Layla
-- Al-Hassan as her contact).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(11);

create temp table run (label text primary key, id uuid) on commit drop;
grant all on run to authenticated;
insert into run (label, id)
select key, (private.authorization_field('5eed0000-0000-4000-8000-000000000000', key)).id
  from unnest(array['health_info', 'emergency_contact_name']) key;

-- 1. The field's read permission -----------------------------------------------------------------------------

select is(
  (select read_permission from public.profile_fields where id = (select id from run where label = 'health_info')),
  'participants.view_health', 'the health field needs the health permission'
);
select throws_ok(
  $$ update public.profile_fields set read_permission = 'participants.view'
      where id = (select id from run where label = 'emergency_contact_name') $$,
  '23514', null::text, 'no other permission is allowed there'
);

-- 2. Who reads it ---------------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select coalesce(answers ->> (select id::text from run where label = 'health_info'), 'hidden') || '|'
          || (answers ->> (select id::text from run where label = 'emergency_contact_name'))
     from public.get_participant_profile('5eed0000-0000-4000-8000-000000000011')),
  'hidden|Layla Al-Hassan', 'staff with sensitive access but not health read her contact, never her health'
);
select ok(
  not exists (select 1 from public.participant_custom_answers('5eed0000-0000-4000-8000-000000000011')
               where question_id = (select id from run where label = 'health_info')),
  'nor in her answers'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select answers ->> (select id::text from run where label = 'health_info')
     from public.get_participant_profile('5eed0000-0000-4000-8000-000000000011')),
  'No', 'staff with the health permission read it'
);
select ok(
  exists (select 1 from public.participant_custom_answers('5eed0000-0000-4000-8000-000000000011')
           where question_id = (select id from run where label = 'health_info')),
  'in her answers too'
);

-- 3. A privacy change keeps the rule -----------------------------------------------------------------------

select is(
  (select (p ->> 'read_permission') || '|' || (p ->> 'readers_gaining')
     from public.preview_field_change((select id from run where label = 'health_info'), 'long_text', 'personal') p),
  'participants.view_health|0',
  'the preview names the health permission: nobody without it would start reading'
);
select lives_ok(
  $$ select public.save_profile_field((select id from run where label = 'health_info'), null, 'long_text',
       (select label from public.profile_fields where id = (select id from run where label = 'health_info')),
       null, 'personal', false, '[]'::jsonb, '{}'::jsonb) $$,
  'an admin makes the health field Personal'
);
reset role;
select is(
  (select privacy || '|' || read_permission from public.profile_fields
    where id = (select id from run where label = 'health_info')),
  'personal|participants.view_health', 'its read permission stays'
);
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select coalesce(answers ->> (select id::text from run where label = 'health_info'), 'hidden')
     from public.get_participant_profile('5eed0000-0000-4000-8000-000000000011')),
  'hidden', 'staff without the health permission still do not read it'
);

-- 4. Writing is not affected ------------------------------------------------------------------------------------

select lives_ok(
  format($$ select public.set_participant_custom_answers('5eed0000-0000-4000-8000-000000000011',
              jsonb_build_object(%L, 'Asma')) $$, (select id::text from run where label = 'health_info')),
  'staff who could write her health still can'
);

select * from finish();
rollback;
