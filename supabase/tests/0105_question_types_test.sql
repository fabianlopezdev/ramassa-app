-- Builder question types match every field kind the app uses (RAPP-610).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. The Fitxa saves a field of every type with its settings, refuses
--      settings that do not fit the type, a file or a consent she signs
--      (RAPP-671) on the entity form, and a list of choices that is too short. The type still
--      never changes; the settings travel in the catalog.
--   2. The database checks each answer by the type's rules, the same rules as
--      the shared Zod schema (`tests/custom-answer-parity.test.ts`).
--   3. A file is hers alone: its key must be in her own private folder. Staff
--      never write a file or a signed consent for a real woman; the scenario
--      tool does for a test player. A Sensitive answer is stored encrypted. A
--      signed consent gets the day she signed from the server, and a tick
--      given before the consent asked for a signature stays.
--   4. A private file is read by her and by staff who may read the answer's
--      level; nobody else.
--   5. Exports read every type in words.
--
-- Seed: admin ...001 (settings.organization), staff ...002 (participants.*),
-- the design account ...097, real players ...011 and ...012, the test player
-- ...096 (invited), organization ...000.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(57);

create temp table q (label text primary key, id uuid) on commit drop;
grant all on q to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

insert into q select 'screen', public.save_intake_screen(null, '{"ca": "Més dades"}'::jsonb, null, 'logistics');

-- A field of the Support section, placed where it is asked: 'onboarding' on
-- the screen above, 'entity_form' on the referral form.
create or replace function pg_temp.field(
  p_type text, p_label jsonb, p_privacy text, p_surfaces text[], p_options jsonb, p_settings jsonb)
returns uuid language plpgsql as $$
declare
  saved uuid := public.save_profile_field(
    null, (select id from public.profile_sections
            where org_id = '5eed0000-0000-4000-8000-000000000000' and key = 'support'),
    p_type, p_label, null, p_privacy, false, p_options, p_settings);
  surface text;
begin
  foreach surface in array p_surfaces loop
    perform public.place_field(saved, surface,
      case when surface = 'onboarding' then (select id::text from q where label = 'screen') end);
  end loop;
  return saved;
end $$;

-- 1. Building ------------------------------------------------------------------------------------------

insert into q select 'number', pg_temp.field('number', '{"ca": "Quants fills?"}'::jsonb, 'normal',
  array['onboarding'], '[]'::jsonb, '{"integer": true, "min": 0, "max": 15}'::jsonb);
insert into q select 'date', pg_temp.field('date', '{"ca": "Data d''arribada"}'::jsonb, 'personal',
  array['onboarding'], '[]'::jsonb, '{"min_age": 16}'::jsonb);
insert into q select 'yes_no', pg_temp.field('yes_no', '{"ca": "Tens bicicleta?"}'::jsonb, 'normal',
  array['onboarding'], '[]'::jsonb, '{}'::jsonb);
insert into q select 'phone', pg_temp.field('phone', '{"ca": "Telèfon d''un familiar"}'::jsonb, 'personal',
  array['onboarding'], '[]'::jsonb, '{}'::jsonb);
insert into q select 'email', pg_temp.field('email', '{"ca": "Correu de l''escola"}'::jsonb, 'personal',
  array['onboarding', 'entity_form'], '[]'::jsonb, '{}'::jsonb);
insert into q select 'search', pg_temp.field('search_choice', '{"ca": "Barri"}'::jsonb, 'normal',
  array['onboarding'], '[{"label": {"ca": "Gràcia"}}, {"label": {"ca": "Sants"}}, {"label": {"ca": "Horta"}}]'::jsonb,
  '{}'::jsonb);
insert into q select 'list', pg_temp.field('item_list', '{"ca": "Idiomes que parles"}'::jsonb, 'normal',
  array['onboarding'], '[]'::jsonb, '{"max_items": 3}'::jsonb);
insert into q select 'consent', pg_temp.field('consent', '{"ca": "Transport"}'::jsonb, 'normal',
  array['onboarding'], '[]'::jsonb, '{"text": {"ca": "Accepto que m''acompanyin amb cotxe", "ar": "أوافق"}}'::jsonb);
insert into q select 'file', pg_temp.field('file_upload', '{"ca": "Informe mèdic"}'::jsonb, 'sensitive',
  array['onboarding'], '[]'::jsonb, '{"accept": "document"}'::jsonb);
insert into q select 'signature', pg_temp.field('consent', '{"ca": "Signatura"}'::jsonb, 'personal',
  array['onboarding'], '[]'::jsonb, '{"text": {"ca": "Accepto i signo"}, "requires_signature": true}'::jsonb);

select is((select count(*)::integer from q), 11, 'every new type is saved, with its settings');
select is(
  (select settings from public.profile_fields where id = (select id from q where label = 'number')),
  '{"integer": true, "min": 0, "max": 15}'::jsonb,
  'a number keeps its range and that it is whole'
);
select throws_ok(
  $$ select pg_temp.field('number', '{"ca": "X"}'::jsonb, 'normal', array['onboarding'], '[]'::jsonb,
       '{"integer": true, "min": 9, "max": 1}'::jsonb) $$,
  '23514', 'the settings do not fit the type',
  'a range upside down is refused'
);
select throws_ok(
  $$ select pg_temp.field('email', '{"ca": "X"}'::jsonb, 'normal', array['onboarding'], '[]'::jsonb,
       '{"max_items": 3}'::jsonb) $$,
  '23514', 'the settings do not fit the type',
  'settings of another type are refused'
);
select throws_ok(
  $$ select pg_temp.field('consent', '{"ca": "X"}'::jsonb, 'normal', array['onboarding'], '[]'::jsonb,
       '{"text": {"en": "I agree"}}'::jsonb) $$,
  '23514', 'the settings do not fit the type',
  'a consent needs its own text in Catalan'
);
select throws_ok(
  $$ select public.place_field((select id from q where label = 'signature'), 'entity_form') $$,
  '23514', 'a file or a signature is asked of her only',
  'a consent she signs cannot be asked on the entity form'
);
select throws_ok(
  $$ select public.save_profile_field((select id from q where label = 'email'), null, 'consent',
       '{"ca": "Correu de l''escola"}'::jsonb, null, 'personal', false, '[]'::jsonb,
       '{"text": {"ca": "Accepto"}, "requires_signature": true}'::jsonb) $$,
  '23514', 'a file or a signature is asked of her only',
  'a field on the entity form never becomes a consent she signs'
);
select throws_ok(
  $$ select pg_temp.field('search_choice', '{"ca": "X"}'::jsonb, 'normal', array['onboarding'],
       '[{"label": {"ca": "A"}}]'::jsonb, '{}'::jsonb) $$,
  '23514', 'a choice question needs at least two options',
  'a searchable list needs two options too'
);
select is(
  public.preview_field_change((select id from q where label = 'number'), 'date', 'normal') ->> 'type_to',
  'date',
  'a new type is previewed before it is saved (RAPP-665)'
);
select lives_ok(
  $$ select public.save_profile_field((select id from q where label = 'number'), null,
       'number', '{"ca": "Quants fills tens?"}'::jsonb, null, 'normal', false, '[]'::jsonb,
       '{"integer": true, "min": 0, "max": 12}'::jsonb) $$,
  'the settings may change'
);
select is(
  (select f -> 'settings'
     from jsonb_array_elements(public.intake_catalog() -> 'fields') f
    where f ->> 'id' = (select id::text from q where label = 'consent')),
  '{"text": {"ca": "Accepto que m''acompanyin amb cotxe", "ar": "أوافق"}}'::jsonb,
  'the catalog carries each field''s settings'
);
select ok(
  (select count(*) = 1 from public.audit_log
    where action = 'intake.field_save' and target_id = (select id from q where label = 'list')
      and changes -> 'settings' = '{"max_items": 3}'::jsonb),
  'the settings are in the audit log'
);
reset role;
select throws_ok(
  $$ insert into public.field_placements (org_id, field_id, surface, screen_key, sort_order, required)
     values ('5eed0000-0000-4000-8000-000000000000', (select id from q where label = 'number'),
             'entity_form', 'logistics', 0, false) $$,
  '23514', null::text,
  'the table itself names a screen only on her onboarding'
);
select throws_ok(
  $$ update public.profile_fields set settings = '{"accept": "video"}' where id = (select id from q where label = 'file') $$,
  '23514', null::text,
  'and keeps settings that fit the type'
);

-- 2. Her answers --------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';

create temp table attempts (label text, value jsonb, ok boolean) on commit drop;
grant all on attempts to authenticated;

-- One call per attempt; the outcome is recorded rather than thrown.
create or replace function pg_temp.try_answer(p_label text, p_value jsonb)
returns boolean language plpgsql as $$
begin
  perform public.save_my_custom_answers(jsonb_build_object((select id::text from q where label = p_label), p_value));
  return true;
exception when check_violation then
  return false;
end $$;

select is(pg_temp.try_answer('number', '3'), true, 'a whole number in range');
select is(pg_temp.try_answer('number', '2.5'), false, 'a decimal where whole is asked is refused');
select is(pg_temp.try_answer('number', '13'), false, 'above the maximum is refused');
select is(pg_temp.try_answer('number', '"3"'), false, 'a number as text is refused');
select is(pg_temp.try_answer('date', to_jsonb(to_char(current_date - interval '20 years', 'YYYY-MM-DD'))), true, 'a date old enough');
select is(pg_temp.try_answer('date', to_jsonb(to_char(current_date - interval '10 years', 'YYYY-MM-DD'))), false, 'too young is refused');
select is(pg_temp.try_answer('date', '"2001-02-30"'), false, 'an impossible date is refused');
select is(pg_temp.try_answer('yes_no', '"maybe"'), false, 'yes or no only');
select is(pg_temp.try_answer('phone', '"+34600111222"'), true, 'an international phone');
select is(pg_temp.try_answer('phone', '"600111222"'), false, 'a phone without its country is refused');
select is(pg_temp.try_answer('email', '"ana@example.org"'), true, 'an email');
select is(pg_temp.try_answer('email', '"ana@example"'), false, 'an email without a domain is refused');
select is(pg_temp.try_answer('search',
  to_jsonb((select o.id::text from public.custom_question_options o where o.question_id = (select id from q where label = 'search') order by sort_order limit 1))),
  true, 'one of the listed choices');
select is(pg_temp.try_answer('list', '["Català", "Àrab"]'), true, 'a list of items');
select is(pg_temp.try_answer('list', '["A", "B", "C", "D"]'), false, 'more items than allowed is refused');
select is(pg_temp.try_answer('list', '["A", "A"]'), false, 'a repeated item is refused');
select is(pg_temp.try_answer('consent', 'true'), true, 'a ticked consent');
select is(pg_temp.try_answer('consent', 'false'), true, 'unticking clears it');
select is(
  (select count(*)::integer from public.custom_answers
    where profile_id = '5eed0000-0000-4000-8000-000000000011' and question_id = (select id from q where label = 'consent')),
  0,
  'so no consent is kept'
);
select is(pg_temp.try_answer('signature', '{"accepted": true, "signature": [[[100, 200], [300, 400]]]}'),
  true, 'a consent ticked and signed');
select is(pg_temp.try_answer('signature', '{"accepted": true, "signature": [[[100, 2000]]]}'),
  false, 'a signature off the pad is refused');
select is(pg_temp.try_answer('signature', 'true'), false, 'a tick without the signature is refused');
select is(
  (select value ->> 'signed_on' from public.custom_answers
    where profile_id = '5eed0000-0000-4000-8000-000000000011' and question_id = (select id from q where label = 'signature')),
  to_char((now() at time zone 'Europe/Madrid')::date, 'YYYY-MM-DD'),
  'the server stamps the day she signed'
);
-- A consent that starts asking for a signature keeps the tick she gave before.
select is(pg_temp.try_answer('consent', 'true'), true, 'she ticks the consent again');
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.save_profile_field((select id from q where label = 'consent'), null, 'consent',
       '{"ca": "Transport"}'::jsonb, null, 'normal', false, '[]'::jsonb,
       '{"text": {"ca": "Accepto que m''acompanyin amb cotxe"}, "requires_signature": true}'::jsonb) $$,
  'the consent starts asking for her signature'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(pg_temp.try_answer('consent', 'true'), true, 'her tick from before the switch stays as it was');

-- 3. Files are hers ---------------------------------------------------------------------------------------

select is(pg_temp.try_answer('file', '{"key": "5eed0000-0000-4000-8000-000000000000/intake-answers/5eed0000-0000-4000-8000-000000000011/2026/10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf", "name": "informe.pdf", "content_type": "application/pdf", "size": 2048}'),
  true, 'a file in her own folder');
select is(pg_temp.try_answer('file', '{"key": "5eed0000-0000-4000-8000-000000000000/intake-answers/5eed0000-0000-4000-8000-000000000012/2026/10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf", "name": "informe.pdf", "content_type": "application/pdf", "size": 2048}'),
  false, 'a file in another woman''s folder is refused');
reset role;
select ok(
  (select value is null and value_encrypted is not null from public.custom_answers
    where profile_id = '5eed0000-0000-4000-8000-000000000011' and question_id = (select id from q where label = 'file')),
  'a Sensitive file answer is stored encrypted'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.set_participant_custom_answers('5eed0000-0000-4000-8000-000000000012',
       jsonb_build_object((select id::text from q where label = 'signature'),
         '{"accepted": true, "signature": [[[1, 2]]]}'::jsonb)) $$,
  '42501', 'a file or a signature is hers to give',
  'staff never sign for a real woman'
);

-- 4. Who reads her file -------------------------------------------------------------------------------------

select is(
  public.can_read_custom_answer_object('5eed0000-0000-4000-8000-000000000000/intake-answers/5eed0000-0000-4000-8000-000000000011/2026/10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf'),
  true,
  'staff who may read Sensitive answers open her file'
);
select is(
  public.can_read_custom_answer_object('5eed0000-0000-4000-8000-000000000000/intake-answers/5eed0000-0000-4000-8000-000000000011/2026/10/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.pdf'),
  false,
  'a key no answer names opens nothing'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  public.can_read_custom_answer_object('5eed0000-0000-4000-8000-000000000000/intake-answers/5eed0000-0000-4000-8000-000000000011/2026/10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf'),
  false,
  'the design role never opens a real woman''s file'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated"}';
select is(
  public.can_read_custom_answer_object('5eed0000-0000-4000-8000-000000000000/intake-answers/5eed0000-0000-4000-8000-000000000011/2026/10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf'),
  false,
  'another player never opens it'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(
  public.can_read_custom_answer_object('5eed0000-0000-4000-8000-000000000000/intake-answers/5eed0000-0000-4000-8000-000000000011/2026/10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf'),
  true,
  'she opens her own'
);

-- The scenario tool answers every type for a test player, files and signed consents included.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096', jsonb_build_object(
       -- The staff fields' switch folded into answers (RAPP-661).
       'kind', 'answers',
       'fill', jsonb_build_object('answers', jsonb_build_object(
         (select id::text from q where label = 'signature'),
           '{"accepted": true, "signature": [[[100, 500], [300, 400]]]}'::jsonb,
         (select id::text from q where label = 'file'), '{"key": "5eed0000-0000-4000-8000-000000000000/intake-answers/5eed0000-0000-4000-8000-000000000096/2026/01/00000000000000000000000000000000.pdf", "name": "prova.pdf", "content_type": "application/pdf", "size": 1024}'::jsonb,
         (select id::text from q where label = 'number'), '2'::jsonb)))) $$,
  'the scenario tool fills a test player''s file, signature and number'
);
select is(
  (select jsonb_array_length(public.test_player_scenario('5eed0000-0000-4000-8000-000000000096') -> 'custom_answered')),
  3,
  'and her page lists them as answered'
);
select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096', jsonb_build_object(
       'kind', 'answers', 'clear', jsonb_build_array((select id::text from q where label = 'number')))) $$,
  'and clears one'
);
select throws_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096', jsonb_build_object(
       'kind', 'answers', 'fill', jsonb_build_object('answers', jsonb_build_object((select id::text from q where label = 'number'), '99'::jsonb)))) $$,
  '23514', 'the answer does not fit the question',
  'a sample that does not fit is refused like any answer'
);
select throws_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000011', jsonb_build_object(
       'kind', 'answers', 'clear', '[]'::jsonb)) $$,
  '42501', 'scenario switches are for test players only',
  'never on a real woman'
);

-- 5. Exports read every type in words ------------------------------------------------------------------------

reset role;
select is(
  private.custom_answer_text((select f from public.profile_fields f where id = (select id from q where label = 'date')), '"2001-02-28"'),
  '28/02/2001', 'a date as day/month/year');
select is(
  private.custom_answer_text((select f from public.profile_fields f where id = (select id from q where label = 'list')), '["Català", "Àrab"]'),
  'Català; Àrab', 'a list joined');
select is(
  private.custom_answer_text((select f from public.profile_fields f where id = (select id from q where label = 'consent')), 'true')
  || ' / ' || private.custom_answer_text((select f from public.profile_fields f where id = (select id from q where label = 'yes_no')), '"no"')
  || ' / ' || private.custom_answer_text((select f from public.profile_fields f where id = (select id from q where label = 'signature')),
       '{"accepted": true, "signature": [[[1, 2]]], "signed_on": "2026-10-26"}')
  || ' / ' || private.custom_answer_text((select f from public.profile_fields f where id = (select id from q where label = 'file')),
       '{"key": "k", "name": "informe.pdf", "content_type": "application/pdf", "size": 1}'),
  'Sí / No / Acceptada, signada el 26/10/2026 / Fitxer: informe.pdf',
  'a consent, a yes/no, a signed consent and a file in words, never their data'
);

select * from finish();
rollback;
