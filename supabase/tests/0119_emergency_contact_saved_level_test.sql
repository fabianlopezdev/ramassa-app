-- The emergency contact keeps the privacy level it was saved under
-- (RAPP-614, pending fix 26).
-- Run with: bunx supabase test db
--
-- What these assertions defend: reading her emergency contact's name and
-- relation needs the STRICTER of the level in force when it was saved and the
-- current version's level. A later version that relaxes the level never opens
-- a contact collected as sensitive; a later version that tightens it closes
-- one collected as personal. Nobody sets the stored level by hand.
--
-- Seed: admin ...001, staff ...002 (here without participants.view_sensitive),
-- real players ...011 and ...012, version 1 with the contact `personal`.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(9);

create temp table run (label text primary key, content jsonb) on commit drop;
grant all on run to authenticated;
insert into run (label, content)
select 'sensitive', jsonb_set(content, '{questions,emergency_contact,privacy}', '"sensitive"')
  from public.authorization_versions where version_number = 1
   and org_id = '5eed0000-0000-4000-8000-000000000000';
insert into run (label, content)
select 'personal', content
  from public.authorization_versions where version_number = 1
   and org_id = '5eed0000-0000-4000-8000-000000000000';
delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000002' and permission_code = 'participants.view_sensitive';

-- Saved while the contact is personal.
update public.profiles set emergency_contact_name = 'Olena', emergency_contact_relation = 'Germana'
 where id = '5eed0000-0000-4000-8000-000000000011';
select is(
  (select emergency_contact_privacy from public.profiles where id = '5eed0000-0000-4000-8000-000000000011'),
  'personal',
  'a contact keeps the level in force when it was saved'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select emergency_contact_name from public.get_participant_profile('5eed0000-0000-4000-8000-000000000011')),
  'Olena',
  'staff with personal access read a personal contact'
);

-- A stricter version closes it.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok($$ select public.publish_authorization_version((select content from run where label = 'sensitive')) $$,
  'an admin makes the contact sensitive');
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select emergency_contact_name from public.get_participant_profile('5eed0000-0000-4000-8000-000000000011')),
  null,
  'the current stricter level closes a contact saved as personal'
);

-- Saved while sensitive, then the level is relaxed.
reset role;
update public.profiles set emergency_contact_name = 'Karim', emergency_contact_relation = 'Germà'
 where id = '5eed0000-0000-4000-8000-000000000012';
select is(
  (select emergency_contact_privacy from public.profiles where id = '5eed0000-0000-4000-8000-000000000012'),
  'sensitive',
  'a contact saved under the sensitive level keeps it'
);
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok($$ select public.publish_authorization_version((select content from run where label = 'personal')) $$,
  'an admin relaxes the contact to personal');
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select emergency_contact_name from public.get_participant_profile('5eed0000-0000-4000-8000-000000000012')),
  null,
  'a relaxed version never opens a contact saved as sensitive'
);
select is(
  (select emergency_contact_name from public.get_participant_profile('5eed0000-0000-4000-8000-000000000011')),
  'Olena',
  'while a contact saved as personal is readable again'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated"}';
select throws_ok(
  $$ update public.profiles set emergency_contact_privacy = 'personal' where id = '5eed0000-0000-4000-8000-000000000012' $$,
  '42501', null::text,
  'she cannot lower the stored level by hand'
);

select * from finish();
rollback;
