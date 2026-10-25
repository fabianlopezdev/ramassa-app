-- Entity answers land on her Fitxa fields when staff invite her (RAPP-652).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. The entity form's limits: a built-in field the form cannot ask stays
--      off it, and her names never leave it and stay required.
--   2. A referral sends its field answers in the same call, and the database
--      refuses one that leaves out a required field, built-in or Ramassà.
--   3. The invitation's last step learns which fields the entity answered.
--   4. Creating her invitation writes every entity answer onto her profile
--      with source entity, a Sensible one encrypted, and the referral keeps
--      no copy; the adoption is audited by field id.
--   5. Her onboarding reads them as answered, so Auto skips them.
--   6. Privacy is unchanged: a Sensible entity answer needs
--      participants.view_sensitive.
--
-- Seed: admin ...001, staff ...002 and ...003, entity contact ...004 of
-- organization ...000; Ramassà fields ...8045-000000000004 (Personal, short
-- text, team only) and ...8045-000000000005 (Sensible, single choice).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(16);

create temp table run (label text primary key, id uuid) on commit drop;
grant all on run to authenticated;

insert into run values
  ('option', (select id from public.custom_question_options
               where question_id = '5eed0000-0000-4000-8045-000000000005' order by sort_order limit 1)),
  ('clothing', (select id from public.profile_fields
                 where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = 'clothing_size')),
  ('first_name_placement', (select p.id from public.field_placements p
                              join public.profile_fields f on f.id = p.field_id
                             where f.org_id = '5eed0000-0000-4000-8000-000000000000'
                               and f.system_key = 'first_name' and p.surface = 'entity_form')),
  ('last_name_placement', (select p.id from public.field_placements p
                             join public.profile_fields f on f.id = p.field_id
                            where f.org_id = '5eed0000-0000-4000-8000-000000000000'
                              and f.system_key = 'last_name' and p.surface = 'entity_form')),
  ('nationality_placement', (select p.id from public.field_placements p
                               join public.profile_fields f on f.id = p.field_id
                              where f.org_id = '5eed0000-0000-4000-8000-000000000000'
                                and f.system_key = 'nationality' and p.surface = 'entity_form'));

-- 1. The form's limits ------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';

select throws_ok(
  $$ select public.place_field((select id from run where label = 'clothing'), 'entity_form') $$,
  '23514', 'the entity form does not ask this built-in field',
  'a built-in field the form cannot ask stays off the entity form'
);
select throws_ok(
  $$ select public.remove_placement((select id from run where label = 'first_name_placement')) $$,
  '23514', 'the entity form always asks her names',
  'her first name never leaves the entity form'
);
select public.save_placement((select id from run where label = 'last_name_placement'), false);
select is(
  (select required from public.field_placements where id = (select id from run where label = 'last_name_placement')),
  true,
  'and her last name stays required there'
);

-- The form asks the two Ramassà fields, the Personal one required.
select lives_ok(
  $$ select public.place_field('5eed0000-0000-4000-8045-000000000004', 'entity_form', null, true),
            public.place_field('5eed0000-0000-4000-8045-000000000005', 'entity_form') $$,
  'staff place a Personal and a Sensible field on the entity form'
);

-- 2. One call, required fields checked ------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';

select throws_ok(
  $$ select public.create_entity_referral(
       '{"firstName": "Qa", "lastName": "Entitat", "documentationStatus": "none",
         "consentConfirmed": true, "fields": {}}'::jsonb) $$,
  '23514', 'a required field of the referral form is missing',
  'a referral without a required Ramassà field is refused'
);

insert into run values ('referral', public.create_entity_referral(jsonb_build_object(
  'firstName', 'Qa', 'lastName', 'Entitat', 'email', 'qa.rapp652@example.test',
  'documentationStatus', 'none', 'consentConfirmed', true,
  'fields', jsonb_build_object(
    '5eed0000-0000-4000-8045-000000000004', 'Sants',
    '5eed0000-0000-4000-8045-000000000005', (select id from run where label = 'option')))));

reset role;
select is(
  (select count(*)::integer from public.referral_custom_answers
    where referral_id = (select id from run where label = 'referral')),
  2,
  'the field answers are saved with the referral, in one call'
);

-- A built-in field made required on the form is checked too, with or without `fields`.
update public.field_placements set required = true
 where id = (select id from run where label = 'nationality_placement');
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.create_entity_referral(
       '{"firstName": "Qa", "lastName": "Sense", "documentationStatus": "none", "consentConfirmed": true}'::jsonb) $$,
  '23514', 'a required field of the referral form is missing',
  'a referral without a required built-in field is refused'
);
reset role;
update public.field_placements set required = false
 where id = (select id from run where label = 'nationality_placement');

-- 3. The invitation's last step ------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select ok(
  array['5eed0000-0000-4000-8045-000000000004', '5eed0000-0000-4000-8045-000000000005']
    <@ (select array_agg(key) from public.referral_answer_keys((select id from run where label = 'referral')) key),
  'the invitation learns which fields the entity answered'
);

-- 4. Her invitation makes them hers ------------------------------------------------------------------------

insert into run values ('player', (select profile_id from public.create_participant_invite(jsonb_build_object(
  'email', 'qa.rapp652@example.test', 'first_name', 'Qa', 'last_name', 'Entitat',
  'referral_id', (select id from run where label = 'referral')))));

reset role;
select is(
  (select string_agg(question_id::text || '/' || source, ',' order by question_id)
     from public.custom_answers where profile_id = (select id from run where label = 'player')),
  '5eed0000-0000-4000-8045-000000000004/entity,5eed0000-0000-4000-8045-000000000005/entity',
  'both entity answers are hers from the invitation on, with source entity'
);
select ok(
  (select value is null and value_encrypted is not null from public.custom_answers
    where profile_id = (select id from run where label = 'player')
      and question_id = '5eed0000-0000-4000-8045-000000000005'),
  'the Sensible answer is stored encrypted'
);
select ok(
  (select value = '"Sants"'::jsonb from public.custom_answers
    where profile_id = (select id from run where label = 'player')
      and question_id = '5eed0000-0000-4000-8045-000000000004'),
  'the Personal answer is stored as the entity gave it'
);
select is(
  (select count(*)::integer from public.referral_custom_answers
    where referral_id = (select id from run where label = 'referral')),
  0,
  'the referral keeps no copy'
);
select is(
  (select changes -> 'fields' from public.audit_log
    where action = 'intake.entity_answers_adopted' and target_id = (select id from run where label = 'referral')),
  '["5eed0000-0000-4000-8045-000000000004", "5eed0000-0000-4000-8045-000000000005"]'::jsonb,
  'the adoption is audited by field id, never by answer'
);

-- 5. Her onboarding reads them as answered ------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', (select id from run where label = 'player'), 'role', 'authenticated')::text, true);
select is(
  (select count(*)::integer from public.my_custom_answers()
    where question_id in ('5eed0000-0000-4000-8045-000000000004', '5eed0000-0000-4000-8045-000000000005')),
  2,
  'her onboarding reads both as answered, so Auto skips them'
);

-- 6. Privacy ---------------------------------------------------------------------------------------------------

reset role;
delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000003'
   and permission_code = 'participants.view_sensitive';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2"}';
select is(
  (select array_agg(question_id::text)
     from public.participant_custom_answers((select id from run where label = 'player'))),
  array['5eed0000-0000-4000-8045-000000000004'],
  'without participants.view_sensitive, the Sensible entity answer is not read'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2"}';
select is(
  (select source from public.participant_custom_answers((select id from run where label = 'player'))
    where question_id = '5eed0000-0000-4000-8045-000000000005'),
  'entity',
  'with it, the Sensible answer is read with the entity as its source'
);

select * from finish();
rollback;
