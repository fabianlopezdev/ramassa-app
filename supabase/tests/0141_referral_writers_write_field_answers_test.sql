-- The entity referral form and invitations save answers by field (RAPP-661).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. The form (`create_entity_referral`) takes her names and answers by
--      field: every answer encrypted on the referral, her phone and the app's
--      answers no longer in `referred_phone` or the answer object, which keeps
--      her season count only. Column keys, a staff caller, her names as
--      answers and a value for a field off the form are refused.
--   2. The rules come from the placements and fields: a required placement, a
--      condition that does not hold, the document rule.
--   3. The invitation adopts the entity's answers on the fields the team left
--      empty, named after the entity's contact, and her season count; the
--      referral keeps no copy.
--   4. The seed's pending referral has its answers by field, and they reach
--      her profile.
--   5. The old payload key map and the blob reader are gone (RAPP-666); the
--      helpers stay private.
--
-- Seed: organization ...000, admin ...001, staff ...002, entity contact ...004
-- (Creu Roja Osona), pending referral ...8010-...001.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(22);

create temp table run (label text primary key, id uuid) on commit drop;
grant all on run to authenticated;

create function pg_temp.field(p_key text) returns uuid language sql security definer as $$
  select id from public.profile_fields where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = p_key;
$$;
create function pg_temp.option(p_key text, p_option text) returns text language sql security definer as $$
  select o.id::text from public.custom_question_options o
   where o.question_id = pg_temp.field(p_key) and o.key = p_option;
$$;
create function pg_temp.referral_answer(p_referral uuid, p_field uuid) returns jsonb language sql security definer as $$
  select private.referral_answer(p_referral, p_field);
$$;
create function pg_temp.answer(p_profile uuid, p_field uuid) returns jsonb language sql security definer as $$
  select private.field_answer_now(p_profile, f) from public.profile_fields f where f.id = p_field;
$$;
create function pg_temp.source(p_profile uuid, p_field uuid) returns text language sql security definer as $$
  select a.source || '/' || coalesce(a.answered_by::text, '-') from public.custom_answers a
   where a.profile_id = p_profile and a.question_id = p_field;
$$;
-- A referral payload with these answers.
create function pg_temp.referral(p_answers jsonb, p_extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('first_name', 'Hiba', 'last_name', 'Prova', 'documentationStatus', 'missing',
                            'consentConfirmed', true, 'answers', p_answers) || p_extra;
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1. The form ------------------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';

select throws_ok(
  $$select public.create_entity_referral('{"firstName": "Hiba", "lastName": "Prova", "documentationStatus": "missing", "consentConfirmed": true, "nationality": "Marroc"}')$$,
  '23514', 'invalid entity referral payload', 'the old payload keys are refused');
select throws_ok(
  format('select public.create_entity_referral(%L)', pg_temp.referral(
    jsonb_build_object(pg_temp.field('first_name'), 'Hiba'))),
  '42501', 'not a question of the referral form', 'her names are the referral''s own, never answers');
select throws_ok(
  format('select public.create_entity_referral(%L)', pg_temp.referral(
    jsonb_build_object(pg_temp.field('clothing_size'), pg_temp.option('clothing_size', 'M')))),
  '42501', 'not a question of the referral form', 'a value for a field off the form is refused');
select throws_ok(
  format('select public.create_entity_referral(%L)', pg_temp.referral(
    jsonb_build_object(pg_temp.field('document_type'), pg_temp.option('document_type', 'nie')))),
  '23514', 'a document needs its number', 'a document type needs its number');

insert into run select 'referral', public.create_entity_referral(pg_temp.referral(
  jsonb_build_object(
    pg_temp.field('phone'), '+34600006671',
    pg_temp.field('document_type'), pg_temp.option('document_type', 'nie'),
    pg_temp.field('document_number'), 'X1234567L',
    pg_temp.field('city'), 'Vic',
    pg_temp.field('nationality'), 'Marroc',
    -- Nothing given for a field off the form: nothing to do.
    pg_temp.field('clothing_size'), null),
  '{"seasonNumber": 3, "email": "hiba@example.test"}'));
reset role;

select is(
  (select count(*)::integer from public.referral_custom_answers where referral_id = (select id from run where label = 'referral')),
  5, 'every answer is saved on the referral, by field');
select is(pg_temp.referral_answer((select id from run where label = 'referral'), pg_temp.field('document_type')),
          to_jsonb(pg_temp.option('document_type', 'nie')), 'a choice by its option');
select is(
  (select referred_phone is null and (public.decrypt_field(intake_answers))::jsonb = '{"season_number": 3}'::jsonb
     from public.entity_referrals where id = (select id from run where label = 'referral')),
  true, 'her phone is an answer, and the answer object keeps her season count only');

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  format('select public.create_entity_referral(%L)', pg_temp.referral('{}')),
  '42501', null, 'only an entity contact sends a referral');

-- 2. Rules from the placements ------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok($$select public.place_field('5eed0000-0000-4000-8045-000000000005', 'entity_form')$$,
                'a conditional pair is placed on the form');
select lives_ok($$select public.place_field('5eed0000-0000-4000-8045-000000000003', 'entity_form', null, true)$$,
                'its details required there');
reset role;
update public.field_placements set required = true
 where field_id = pg_temp.field('date_of_birth') and surface = 'entity_form';

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  format('select public.create_entity_referral(%L)', pg_temp.referral('{}')),
  '23514', 'a required field of the referral form is missing', 'a required field left empty refuses the referral');
select lives_ok(
  format('select public.create_entity_referral(%L)', pg_temp.referral(jsonb_build_object(
    pg_temp.field('date_of_birth'), '1994-05-06',
    '5eed0000-0000-4000-8045-000000000005',
    (select o.id::text from public.custom_question_options o
      where o.question_id = '5eed0000-0000-4000-8045-000000000005'
        and o.id::text <> (select show_when_option_id::text from public.profile_fields
                            where id = '5eed0000-0000-4000-8045-000000000003')
      order by o.sort_order limit 1)))),
  'a required field whose condition does not hold asks nothing');
select throws_ok(
  format('select public.create_entity_referral(%L)', pg_temp.referral(jsonb_build_object(
    pg_temp.field('date_of_birth'), '1994-05-06',
    '5eed0000-0000-4000-8045-000000000005',
    (select show_when_option_id::text from public.profile_fields where id = '5eed0000-0000-4000-8045-000000000003')))),
  '23514', 'a required field of the referral form is missing', 'and asks once it holds');
reset role;

-- 3. The invitation adopts them -----------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into run select 'hiba', (select profile_id from public.create_participant_invite(jsonb_build_object(
  'email', 'hiba.rapp661@example.test', 'first_name', 'Hiba', 'last_name', 'Prova',
  'referral_id', (select id from run where label = 'referral'),
  'answers', jsonb_build_object(pg_temp.field('city'), 'Olot'))));
reset role;

select is(pg_temp.source((select id from run where label = 'hiba'), pg_temp.field('phone')),
          'entity/5eed0000-0000-4000-8000-000000000004', 'the entity''s answers land on her fields as the entity''s');
select is(pg_temp.answer((select id from run where label = 'hiba'), pg_temp.field('city')), '"Olot"'::jsonb,
          'what the team typed wins');
select is(
  (select value is null from public.custom_answers
    where profile_id = (select id from run where label = 'hiba') and question_id = pg_temp.field('document_number')),
  true, 'a Sensitive answer stays encrypted on her profile');
select is((select season_number::text || '/' || prior_seasons from public.profiles
            where id = (select id from run where label = 'hiba')), '3/2', 'her season count from the referral');
select is(
  (select count(*)::integer from public.referral_custom_answers where referral_id = (select id from run where label = 'referral')),
  0, 'the referral keeps no copy');

-- 4. The seed referral ---------------------------------------------------------------------------------------

select is(pg_temp.referral_answer('5eed0000-0000-4000-8010-000000000001', pg_temp.field('nationality')),
          '"Marroc"'::jsonb, 'a seed referral has its answers by field');
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into run select 'amina', (select profile_id from public.create_participant_invite(jsonb_build_object(
  'email', 'amina.rapp661@example.test', 'first_name', 'Amina', 'last_name', 'Prova',
  'referral_id', '5eed0000-0000-4000-8010-000000000001')));
reset role;
select is(pg_temp.answer((select id from run where label = 'amina'), pg_temp.field('specific_needs_details')),
          '"Prefereix entrenar a la tarda."'::jsonb, 'and they reach her profile');

-- 5. Gone and private ---------------------------------------------------------------------------------------

select hasnt_function('private', 'entity_form_payload_key', 'the old payload key map is gone');
select ok(not has_function_privilege('authenticated', 'private.check_entity_form_required(public.entity_referrals)', 'execute')
          and not has_function_privilege('authenticated', 'private.referral_answer(uuid, uuid)', 'execute')
          and to_regproc('private.referral_blob_answers') is null,
          'the helpers stay private, and the old blob reader is gone');

select * from finish();
rollback;
