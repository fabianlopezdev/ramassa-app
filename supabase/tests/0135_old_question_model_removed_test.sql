-- The old question model is gone (RAPP-656).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. The compatibility view, the old writers, their private workers and the
--      two old columns no longer exist.
--   2. Archiving a Ramassà screen removes the placements on it, the
--      conditional field first; the fields stay live with their answers, and
--      the archive is audited with them.
--   3. A version 1 setup file imports as fields and placements: a holder's
--      question lands on its app screen, a Ramassà screen id is remapped, a
--      condition is kept, an archived screen's question keeps no onboarding
--      placement, a holder step leaves the flow, and the organization's
--      built-in placements stay as they were.
--   4. A version 2 file with holder screens and screens' questions imports
--      without making a holder a screen.
--   5. The export is version 3, with nothing of the old shape.
--   6. The custom answers export names the Fitxa section of each answer.
--   7. A referral that leaves out a Ramassà field required on the entity form
--      is refused, now that the answers always come in the same call.
--   8. Only designers archive a screen; anon has no right to.
--   9. `private.write_custom_answer` takes a field row and still encrypts a
--      Sensible answer; a built-in field is refused there.
--
-- Seed: admin ...001, entity contact ...004, player ...011 of organization
-- ...000; Ramassà fields ...8045-000000000001 (Normal, onboarding and entity
-- form) and ...8045-000000000003 (Sensible, onboarding and season).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(45);

create temp table run (label text primary key, id uuid, doc jsonb) on commit drop;
grant all on run to authenticated;

-- 1. What is gone ------------------------------------------------------------------------------------------

select hasnt_view('public', 'custom_questions', 'the compatibility view is gone');
select hasnt_function('public', 'save_custom_question', 'the old question writer is gone');
select hasnt_function('public', 'archive_custom_question', 'and its archive');
select hasnt_function('public', 'reorder_custom_questions', 'and its reorder');
select hasnt_function('public', 'save_custom_question_required', 'and its required switch');
select hasnt_function('public', 'ensure_builtin_screen_holder', 'holders are no longer made');
select hasnt_function('public', 'save_referral_custom_answers', 'the second referral call is gone');
select hasnt_function('private', 'apply_legacy_question_shape', 'the old shape writer is gone');
select hasnt_function('private', 'check_legacy_placements', 'and its placements check');
select hasnt_function('private', 'legacy_question_section', 'and its section rule');
select hasnt_function('private', 'write_custom_questions_view', 'and the view trigger');
select hasnt_column('public', 'intake_screens', 'builtin_screen', 'a screen holds no app screen any more');
select hasnt_column('public', 'profile_fields', 'legacy_screen_id', 'a field keeps no old screen');

-- 2. Archiving a screen ----------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into run (label, id)
values ('screen', public.save_intake_screen(null, '{"ca": "Transport de prova"}'::jsonb, null, 'logistics'));
insert into run (label, id)
select 'gate', public.save_profile_field(
  null, (select id from public.profile_sections
          where org_id = '5eed0000-0000-4000-8000-000000000000' and key = 'support'),
  'single_choice', '{"ca": "Tens cotxe?"}'::jsonb, null, 'normal', false,
  '[{"label": {"ca": "Sí"}}, {"label": {"ca": "No"}}]'::jsonb);
insert into run (label, id)
select 'detail', public.save_profile_field(
  null, (select id from public.profile_sections
          where org_id = '5eed0000-0000-4000-8000-000000000000' and key = 'support'),
  'short_text', '{"ca": "Quin cotxe?"}'::jsonb, null, 'normal');
select public.place_field((select id from run where label = 'gate'), 'onboarding', (select id::text from run where label = 'screen'));
select public.place_field((select id from run where label = 'detail'), 'onboarding', (select id::text from run where label = 'screen'));
reset role;
update public.profile_fields
   set show_when_field_id = (select id from run where label = 'gate'),
       show_when_option_id = (select id from public.custom_question_options
                               where question_id = (select id from run where label = 'gate') order by sort_order limit 1)
 where id = (select id from run where label = 'detail');
insert into public.custom_answers (profile_id, question_id, season_key, org_id, value, source)
values ('5eed0000-0000-4000-8000-000000000011', (select id from run where label = 'gate'),
        '00000000-0000-0000-0000-000000000000', '5eed0000-0000-4000-8000-000000000000',
        to_jsonb((select id::text from public.custom_question_options
                   where question_id = (select id from run where label = 'gate') order by sort_order limit 1)),
        'player');
set local role authenticated;
select lives_ok(
  $$ select public.archive_intake_screen((select id from run where label = 'screen')) $$,
  'a screen with a conditional field on it is archived'
);
reset role;
select is(
  (select count(*)::integer from public.field_placements
    where surface = 'onboarding' and screen_key = (select id::text from run where label = 'screen')),
  0,
  'no placement stays on the archived screen'
);
select is(
  (select count(*)::integer from public.profile_fields
    where id in (select id from run where label in ('gate', 'detail')) and not is_archived),
  2,
  'both fields stay live on the Fitxa'
);
select is(
  (select count(*)::integer from public.custom_answers
    where profile_id = '5eed0000-0000-4000-8000-000000000011' and question_id = (select id from run where label = 'gate')),
  1,
  'with the answers already given'
);
select is(
  (select jsonb_array_length(changes -> 'fields') from public.audit_log
    where action = 'intake.screen_archive' and target_id = (select id from run where label = 'screen')),
  2,
  'the archive is audited with the fields it took off the screen'
);

-- 8. Who archives -------------------------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.archive_intake_screen(uuid)', 'execute'),
  'anon has no right to archive a screen'
);
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  $$ select public.archive_intake_screen('5eed0000-0000-4000-8044-000000000001') $$,
  '42501', null::text,
  'a player cannot archive a screen'
);

-- 5 and 6. The exports ---------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into run (label, doc) values ('base', public.export_onboarding_setup(null));
select ok(
  (select (doc ->> 'schema_version')::integer = 3
          and not exists (select 1 from jsonb_array_elements(doc -> 'screens') s
                           where s ? 'questions' or s ? 'builtin_screen')
          and not exists (select 1 from jsonb_array_elements(doc -> 'fields') f where f ? 'legacy_screen_id')
     from run where label = 'base'),
  'the export is version 3, with nothing of the old shape'
);
insert into run (label, doc) values ('answers', public.create_data_export('custom_answers', 'default', 'csv'));
select ok(
  (select doc -> 'columns' ? 'section' and not (doc -> 'columns' ? 'screen') from run where label = 'answers'),
  'the custom answers export has a section column'
);
select ok(
  (select jsonb_array_length(doc -> 'rows') > 0
          and not exists (select 1 from jsonb_array_elements(doc -> 'rows') r where r ->> 'section' is null)
     from run where label = 'answers'),
  'and every answer names its section'
);
select ok(
  (select bool_and(r ->> 'section' = 'Suport')
     from run, jsonb_array_elements(run.doc -> 'rows') r
    where run.label = 'answers' and r ->> 'question' = 'Vens amb transport públic?'),
  'in the team''s words'
);
reset role;

-- 3. A version 1 file ------------------------------------------------------------------------------------------

insert into public.organizations (id, name, slug)
values ('5eed0000-0000-4000-8000-0000000007d0', 'Organització de la versió 1', 'prova-656-v1'),
       ('5eed0000-0000-4000-8000-0000000007e0', 'Organització de la versió 2', 'prova-656-v2');
insert into auth.users (id, email) values
  ('5eed0000-0000-4000-8000-0000000007d1', 'admin-656-v1@example.test'),
  ('5eed0000-0000-4000-8000-0000000007e1', 'admin-656-v2@example.test');
insert into public.profiles (id, org_id, role, first_name, last_name)
values ('5eed0000-0000-4000-8000-0000000007d1', '5eed0000-0000-4000-8000-0000000007d0', 'admin', 'Admin', 'U'),
       ('5eed0000-0000-4000-8000-0000000007e1', '5eed0000-0000-4000-8000-0000000007e0', 'admin', 'Admin', 'Dos')
on conflict (id) do update set org_id = excluded.org_id, role = excluded.role;
insert into public.team_member_permissions (org_id, profile_id, permission_code)
values ('5eed0000-0000-4000-8000-0000000007d0', '5eed0000-0000-4000-8000-0000000007d1', 'settings.organization'),
       ('5eed0000-0000-4000-8000-0000000007e0', '5eed0000-0000-4000-8000-0000000007e1', 'settings.organization')
on conflict do nothing;

insert into run (label, doc)
select 'builtin before', jsonb_agg(jsonb_build_object('key', f.system_key, 'surface', p.surface,
                                                       'screen', p.screen_key, 'required', p.required)
                                    order by f.system_key, p.surface)
  from public.field_placements p join public.profile_fields f on f.id = p.field_id
 where p.org_id = '5eed0000-0000-4000-8000-0000000007d0' and f.kind = 'builtin';

-- A file of the old shape: a Ramassà screen with four questions (a required
-- gate, a conditional detail, an entity-only one, one asked every season), a
-- holder of the sizes screen, and an archived screen.
insert into run (label, doc)
select 'v1', (doc - 'sections' - 'fields' - 'placements') || jsonb_build_object(
  'schema_version', 1,
  'flow_order', jsonb_build_array('identity', 'custom:5eed0000-0000-4000-8135-000000000001',
                                  'custom:5eed0000-0000-4000-8135-000000000002'),
  'screens', jsonb_build_array(
    jsonb_build_object(
      'id', '5eed0000-0000-4000-8135-000000000001', 'title', '{"ca": "Pantalla antiga"}'::jsonb, 'intro', null,
      'after_screen', 'logistics', 'sort_order', 0, 'home_after_screen', 'logistics', 'home_sort_order', 0,
      'is_archived', false, 'builtin_screen', null,
      'questions', jsonb_build_array(
        jsonb_build_object('id', '5eed0000-0000-4000-8135-000000000011', 'question_type', 'single_choice',
          'label', '{"ca": "V1 porta"}'::jsonb, 'help', null, 'privacy', 'normal',
          'placements', '["wizard"]'::jsonb, 'settings', '{}'::jsonb, 'is_required', true, 'sort_order', 0,
          'is_archived', false, 'show_when_question_id', null, 'show_when_option_id', null,
          'options', jsonb_build_array(
            jsonb_build_object('id', '5eed0000-0000-4000-8135-000000000021', 'label', '{"ca": "Sí"}'::jsonb,
                               'sort_order', 0, 'is_archived', false),
            jsonb_build_object('id', '5eed0000-0000-4000-8135-000000000022', 'label', '{"ca": "No"}'::jsonb,
                               'sort_order', 1, 'is_archived', false))),
        jsonb_build_object('id', '5eed0000-0000-4000-8135-000000000012', 'question_type', 'short_text',
          'label', '{"ca": "V1 detall"}'::jsonb, 'help', null, 'privacy', 'normal',
          'placements', '["wizard"]'::jsonb, 'settings', '{}'::jsonb, 'is_required', false, 'sort_order', 1,
          'is_archived', false, 'show_when_question_id', '5eed0000-0000-4000-8135-000000000011',
          'show_when_option_id', '5eed0000-0000-4000-8135-000000000021', 'options', '[]'::jsonb),
        jsonb_build_object('id', '5eed0000-0000-4000-8135-000000000013', 'question_type', 'short_text',
          'label', '{"ca": "V1 entitat"}'::jsonb, 'help', null, 'privacy', 'personal',
          'placements', '["entity_form"]'::jsonb, 'settings', '{}'::jsonb, 'is_required', false, 'sort_order', 2,
          'is_archived', false, 'show_when_question_id', null, 'show_when_option_id', null, 'options', '[]'::jsonb),
        jsonb_build_object('id', '5eed0000-0000-4000-8135-000000000014', 'question_type', 'long_text',
          'label', '{"ca": "V1 temporada"}'::jsonb, 'help', null, 'privacy', 'sensitive',
          'placements', '["wizard", "season"]'::jsonb, 'settings', '{}'::jsonb, 'is_required', true, 'sort_order', 3,
          'is_archived', false, 'show_when_question_id', null, 'show_when_option_id', null, 'options', '[]'::jsonb))),
    jsonb_build_object(
      'id', '5eed0000-0000-4000-8135-000000000002', 'title', '{"ca": "Talles"}'::jsonb, 'intro', null,
      'after_screen', 'logistics', 'sort_order', 1, 'home_after_screen', 'logistics', 'home_sort_order', 1,
      'is_archived', false, 'builtin_screen', 'equipment',
      'questions', jsonb_build_array(
        jsonb_build_object('id', '5eed0000-0000-4000-8135-000000000015', 'question_type', 'short_text',
          'label', '{"ca": "V1 a les talles"}'::jsonb, 'help', null, 'privacy', 'normal',
          'placements', '["wizard"]'::jsonb, 'settings', '{}'::jsonb, 'is_required', false, 'sort_order', 0,
          'is_archived', false, 'show_when_question_id', null, 'show_when_option_id', null, 'options', '[]'::jsonb))),
    jsonb_build_object(
      'id', '5eed0000-0000-4000-8135-000000000003', 'title', '{"ca": "Pantalla arxivada"}'::jsonb, 'intro', null,
      'after_screen', 'identity', 'sort_order', 0, 'home_after_screen', 'identity', 'home_sort_order', 0,
      'is_archived', true, 'builtin_screen', null,
      'questions', jsonb_build_array(
        jsonb_build_object('id', '5eed0000-0000-4000-8135-000000000016', 'question_type', 'short_text',
          'label', '{"ca": "V1 arxivada"}'::jsonb, 'help', null, 'privacy', 'normal',
          'placements', '["wizard"]'::jsonb, 'settings', '{}'::jsonb, 'is_required', false, 'sort_order', 0,
          'is_archived', false, 'show_when_question_id', null, 'show_when_option_id', null,
          'options', '[]'::jsonb)))))
  from run where label = 'base';

-- The fields of the version 1 organization, by their Catalan name.
create function pg_temp.v1_field(p_name text) returns uuid language sql as $$
  select id from public.profile_fields
   where org_id = '5eed0000-0000-4000-8000-0000000007d0' and label ->> 'ca' = p_name;
$$;
create function pg_temp.v1_surfaces(p_name text) returns text language sql as $$
  select string_agg(p.surface || coalesce(':' || p.screen_key, '') || case when p.required then '!' else '' end,
                    ',' order by p.surface)
    from public.field_placements p where p.field_id = pg_temp.v1_field(p_name);
$$;
grant execute on function pg_temp.v1_field(text) to authenticated;
grant execute on function pg_temp.v1_surfaces(text) to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-0000000007d1", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select ok(
  (select (p ->> 'can_import')::boolean and p ->> 'problem' is null
          and (p -> 'counts' ->> 'questions')::integer = 6 and (p -> 'counts' ->> 'screens')::integer = 2
     from public.preview_onboarding_setup_import((select doc from run where label = 'v1')) p),
  'the preview of a version 1 file counts six questions and two screens, the holder none'
);
select lives_ok(
  $$ select public.import_onboarding_setup((select doc from run where label = 'v1')) $$,
  'a version 1 file imports'
);
reset role;
insert into run (label, id)
select 'v1 screen', id from public.intake_screens
 where org_id = '5eed0000-0000-4000-8000-0000000007d0' and title ->> 'ca' = 'Pantalla antiga';
select is(
  (select array_agg(title ->> 'ca' order by title ->> 'ca') from public.intake_screens
    where org_id = '5eed0000-0000-4000-8000-0000000007d0'),
  array['Pantalla antiga', 'Pantalla arxivada'],
  'its Ramassà screens arrive and its holder does not'
);
select is(
  pg_temp.v1_surfaces('V1 porta'),
  'onboarding:' || (select id::text from run where label = 'v1 screen') || '!',
  'a question on a Ramassà screen is placed on the new screen, required as it was'
);
select ok(
  (select f.show_when_field_id = pg_temp.v1_field('V1 porta')
          and f.show_when_option_id = (select o.id from public.custom_question_options o
                                        where o.question_id = pg_temp.v1_field('V1 porta')
                                          and o.label ->> 'ca' = 'Sí')
     from public.profile_fields f where f.id = pg_temp.v1_field('V1 detall')),
  'its condition points at the new field and option'
);
select is(pg_temp.v1_surfaces('V1 entitat'), 'entity_form', 'an entity-only question is on the entity form only');
select is(
  pg_temp.v1_surfaces('V1 temporada'),
  'onboarding:' || (select id::text from run where label = 'v1 screen') || '!,season!',
  'a question asked every season is on her onboarding and the season form'
);
select is(pg_temp.v1_surfaces('V1 a les talles'), 'onboarding:equipment', 'a holder''s question lands on its app screen');
select is(pg_temp.v1_surfaces('V1 arxivada'), null::text, 'an archived screen''s question keeps no onboarding placement');
select is(
  (select array_agg(s.key order by f.label ->> 'ca')
     from public.profile_fields f join public.profile_sections s on s.id = f.section_id
    where f.org_id = '5eed0000-0000-4000-8000-0000000007d0' and f.label ->> 'ca' in ('V1 a les talles', 'V1 porta')),
  array['sizes', 'support'],
  'a holder''s question goes to its app screen''s section, the others to Support'
);
select is(
  (select step_order from public.intake_flow_orders where org_id = '5eed0000-0000-4000-8000-0000000007d0'),
  array['identity', 'custom:' || (select id::text from run where label = 'v1 screen')],
  'the flow names the new screen and leaves the holder out'
);
select is(
  (select jsonb_agg(jsonb_build_object('key', f.system_key, 'surface', p.surface,
                                       'screen', p.screen_key, 'required', p.required)
                    order by f.system_key, p.surface)
     from public.field_placements p join public.profile_fields f on f.id = p.field_id
    where p.org_id = '5eed0000-0000-4000-8000-0000000007d0' and f.kind = 'builtin'),
  (select doc from run where label = 'builtin before'),
  'the organization''s built-in placements stay as they were'
);

-- 4. A version 2 file -------------------------------------------------------------------------------------------

-- The export of RAPP-649: the layout, plus screens with their questions, a
-- holder screen and the fields' old screen.
insert into run (label, doc)
select 'v2', jsonb_set(
    doc || jsonb_build_object(
      'schema_version', 2,
      'screens', (select jsonb_agg(s || '{"builtin_screen": null, "questions": []}'::jsonb)
                    from jsonb_array_elements(doc -> 'screens') s)
                 || jsonb_build_array(jsonb_build_object(
                      'id', '5eed0000-0000-4000-8135-000000000004', 'title', '{"ca": "Talles"}'::jsonb,
                      'intro', null, 'after_screen', 'logistics', 'sort_order', 9,
                      'home_after_screen', 'logistics', 'home_sort_order', 9, 'is_archived', false,
                      'builtin_screen', 'equipment', 'questions', '[]'::jsonb))),
    '{fields,0,legacy_screen_id}', '"5eed0000-0000-4000-8135-000000000004"')
  from run where label = 'base';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-0000000007e1", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select ok(
  (select (p ->> 'can_import')::boolean
          and (p -> 'counts' ->> 'screens')::integer = jsonb_array_length((select doc -> 'screens' from run where label = 'base'))
     from public.preview_onboarding_setup_import((select doc from run where label = 'v2')) p),
  'the preview of a version 2 file counts no holder as a screen'
);
select lives_ok(
  $$ select public.import_onboarding_setup((select doc from run where label = 'v2')) $$,
  'a version 2 file imports'
);
reset role;
select is(
  (select count(*)::integer from public.intake_screens where org_id = '5eed0000-0000-4000-8000-0000000007e0'),
  jsonb_array_length((select doc -> 'screens' from run where label = 'base')),
  'its holder screen is not made a screen'
);
select is(
  (select count(*)::integer from public.profile_fields
    where org_id = '5eed0000-0000-4000-8000-0000000007e0' and kind = 'custom'),
  (select count(*)::integer from jsonb_array_elements((select doc -> 'fields' from run where label = 'base')) f
    where f ->> 'kind' = 'custom'),
  'every field arrives'
);

-- 7. The referral form asks Ramassà's fields in the one call -----------------------------------------------------

update public.field_placements set required = true
 where field_id = '5eed0000-0000-4000-8045-000000000001' and surface = 'entity_form';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.create_entity_referral(
       '{"firstName": "Qa", "lastName": "Sense camps", "documentationStatus": "none",
         "consentConfirmed": true}'::jsonb) $$,
  '23514', 'a required field of the referral form is missing',
  'a referral without its required Ramassà field is refused, even with no fields at all'
);
select lives_ok(
  $$ select public.create_entity_referral(
       '{"firstName": "Qa", "lastName": "Amb camps", "documentationStatus": "none",
         "consentConfirmed": true, "fields": {"5eed0000-0000-4000-8045-000000000001": "yes"}}'::jsonb) $$,
  'with it, the referral is sent'
);
reset role;

-- 9. The answer writer takes a field --------------------------------------------------------------------------------

select lives_ok(
  $$ select private.write_custom_answer('5eed0000-0000-4000-8000-000000000011',
       (select f from public.profile_fields f where f.id = '5eed0000-0000-4000-8045-000000000003'),
       '"Una resposta sensible de prova"'::jsonb, 'staff', '5eed0000-0000-4000-8000-000000000001') $$,
  'a Sensible field''s answer is written from its field row'
);
select ok(
  (select value is null and public.decrypt_field(value_encrypted) = '"Una resposta sensible de prova"'
     from public.custom_answers
    where profile_id = '5eed0000-0000-4000-8000-000000000011'
      and question_id = '5eed0000-0000-4000-8045-000000000003'
      and season_id = private.current_season_id('5eed0000-0000-4000-8000-000000000000')),
  'stored encrypted, for the current season'
);
select throws_ok(
  $$ select private.write_custom_answer('5eed0000-0000-4000-8000-000000000011',
       (select f from public.profile_fields f
         where f.org_id = '5eed0000-0000-4000-8000-000000000000' and f.system_key = 'first_name'),
       '"Anna"'::jsonb, 'staff') $$,
  '23514', 'her names stay on her account',
  'her names are never written as an answer (RAPP-660: every other app field is)'
);

select * from finish();
rollback;
