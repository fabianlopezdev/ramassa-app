-- A write never relaxes her emergency contact's saved privacy level, and staff
-- who cannot read the contact cannot write it (RAPP-614, pending fix 27).
-- Run with: bunx supabase test db
--
-- What these assertions defend: the level stored with the contact is the
-- STRICTER of the stored one and the current version's level on every
-- update; only clearing the contact clears it. Before this, any write to
-- the name or relation re-stamped the contact from the current level, so a
-- staff member without participants.view_sensitive could relax a sensitive
-- contact with one direct UPDATE and then read it. Staff who cannot read the
-- contact now cannot write it either. She still edits her own.
--
-- Seed: admin ...001 (participants.view_sensitive), staff ...002 (here
-- without participants.view_sensitive), real player ...012,
-- authorization version 1 with the contact `personal`.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);

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

-- Her contact is saved under a sensitive version, then the level is relaxed.
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok($$ select public.publish_authorization_version((select content from run where label = 'sensitive')) $$,
  'an admin makes the contact sensitive');
reset role;
update public.profiles set emergency_contact_name = 'Karim', emergency_contact_relation = 'Germà'
 where id = '5eed0000-0000-4000-8000-000000000012';
set local role authenticated;
select lives_ok($$ select public.publish_authorization_version((select content from run where label = 'personal')) $$,
  'an admin relaxes the contact to personal');

-- Staff without the sensitive permission cannot write a contact they cannot read.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ update public.profiles set emergency_contact_relation = 'x' where id = '5eed0000-0000-4000-8000-000000000012' $$,
  '42501', null::text,
  'staff without view_sensitive cannot rewrite a contact saved as sensitive'
);
select throws_ok(
  $$ update public.profiles set emergency_contact_name = null, emergency_contact_relation = null
      where id = '5eed0000-0000-4000-8000-000000000012' $$,
  '42501', null::text,
  'nor clear it'
);
select is(
  (select emergency_contact_name from public.get_participant_profile('5eed0000-0000-4000-8000-000000000012')),
  null,
  'so the contact stays closed to them'
);

-- Her own edit keeps the stricter level.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated"}';
select lives_ok(
  $$ update public.profiles set emergency_contact_relation = 'Cosí' where id = '5eed0000-0000-4000-8000-000000000012' $$,
  'she edits her own contact'
);
reset role;
select is(
  (select emergency_contact_privacy from public.profiles where id = '5eed0000-0000-4000-8000-000000000012'),
  'sensitive',
  'and it keeps the sensitive level it was saved under'
);

-- Staff who may read it may write it, and the level still never drops.
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ update public.profiles set emergency_contact_name = 'Karim B.' where id = '5eed0000-0000-4000-8000-000000000012' $$,
  'an admin with view_sensitive corrects it'
);
reset role;
select is(
  (select emergency_contact_privacy from public.profiles where id = '5eed0000-0000-4000-8000-000000000012'),
  'sensitive',
  'still sensitive after her correction'
);

-- Clearing the contact clears the level; a new one takes the current level.
update public.profiles
   set emergency_contact_name = null, emergency_contact_relation = null, emergency_contact_phone = null
 where id = '5eed0000-0000-4000-8000-000000000012';
select is(
  (select emergency_contact_privacy from public.profiles where id = '5eed0000-0000-4000-8000-000000000012'),
  null,
  'a cleared contact has no level'
);
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ update public.profiles set emergency_contact_name = 'Nadia', emergency_contact_relation = 'Amiga'
      where id = '5eed0000-0000-4000-8000-000000000012' $$,
  'staff with personal access write a new contact under the personal level'
);
reset role;
select is(
  (select emergency_contact_privacy from public.profiles where id = '5eed0000-0000-4000-8000-000000000012'),
  'personal',
  'and it is saved as personal'
);

select * from finish();
rollback;
