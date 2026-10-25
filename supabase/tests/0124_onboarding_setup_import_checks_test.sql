-- The setup import checks what the editors check, counts what it creates and
-- says clearly why it refuses a file (RAPP-621, pending fixes 31 to 33).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. The flow order in a file passes the same checks as
--      `save_intake_flow_order`: no step twice, no summary, terms or
--      authorization step, no archived staff screen, no unknown step.
--   2. The preview, the import report and the audit row count the legal
--      versions the import creates (at most one draft of each), and the
--      warning still says how many published versions stay behind.
--   3. A refused file reads clearly: a database constraint is named as the
--      part of the file it concerns, `schema_version` as a string is refused
--      as "must be the number 1", and a file with no setup in it is refused,
--      so an empty export cannot be imported again and again.
--
-- Seed: admin ...001 of organization ...000 (3 staff screens, a published
-- authorization version 1, the bundled app terms version 1).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(23);

create temp table run (label text primary key, doc jsonb) on commit drop;
grant all on run to authenticated;

-- The file with its first Ramassà field's type broken.
create function pg_temp.bad_type(p_doc jsonb) returns jsonb language sql as $$
  select jsonb_set(p_doc,
           array['fields', (select (f.ordinality - 1)::text
                              from jsonb_array_elements(p_doc -> 'fields') with ordinality as f(field, ordinality)
                             where f.field ->> 'kind' = 'custom' order by f.ordinality limit 1),
                 'question_type'],
           '"not_a_type"');
$$;
grant execute on function pg_temp.bad_type(jsonb) to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into run (label, doc) values ('base', public.export_onboarding_setup('abc1234'));
reset role;
-- The first staff screen of the file, for the checks.
insert into run (label, doc)
select 'screen', jsonb_build_object('id', doc -> 'screens' -> 0 ->> 'id') from run where label = 'base';

-- A fresh organization with its admin.
insert into public.organizations (id, name, slug)
values ('5eed0000-0000-4000-8000-0000000006c0', 'Producció de prova 2', 'prova-621-b');
insert into auth.users (id, email) values ('5eed0000-0000-4000-8000-0000000006c1', 'admin-621-b@example.test');
insert into public.profiles (id, org_id, role, first_name, last_name)
values ('5eed0000-0000-4000-8000-0000000006c1', '5eed0000-0000-4000-8000-0000000006c0', 'admin', 'Admin', 'Nova')
on conflict (id) do update set org_id = excluded.org_id, role = excluded.role;
insert into public.team_member_permissions (org_id, profile_id, permission_code)
values ('5eed0000-0000-4000-8000-0000000006c0', '5eed0000-0000-4000-8000-0000000006c1', 'settings.organization')
on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-0000000006c1", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

-- 1. The flow order ------------------------------------------------------------------------------------

select ok(
  (select not (p ->> 'can_import')::boolean
          and p ->> 'problem' = 'ONBOARDING_SETUP/MALFORMED: the flow order names a step twice'
     from public.preview_onboarding_setup_import(
       jsonb_set((select doc from run where label = 'base'), '{flow_order}', '["identity", "background", "identity"]')) p),
  'a flow order with a step twice is refused by the preview'
);
select throws_ok(
  $$ select public.import_onboarding_setup(
       jsonb_set((select doc from run where label = 'base'), '{flow_order}', '["identity", "background", "identity"]')) $$,
  '22023', 'ONBOARDING_SETUP/MALFORMED: the flow order names a step twice',
  'and by the import'
);
select ok(
  (select p ->> 'problem' = 'ONBOARDING_SETUP/MALFORMED: the flow order names an archived screen'
     from public.preview_onboarding_setup_import(
       jsonb_set(jsonb_set((select doc from run where label = 'base'), '{screens,0,is_archived}', 'true'),
                 '{flow_order}',
                 jsonb_build_array('identity', 'custom:' || (select doc ->> 'id' from run where label = 'screen')))) p),
  'a flow order with an archived staff screen is refused'
);
select ok(
  (select p ->> 'problem' = 'ONBOARDING_SETUP/MALFORMED: the summary, the terms and the authorization always end the onboarding'
     from public.preview_onboarding_setup_import(
       jsonb_set((select doc from run where label = 'base'), '{flow_order}', '["identity", "summary"]')) p),
  'a flow order with an end step is refused'
);
select ok(
  (select p ->> 'problem' = 'ONBOARDING_SETUP/MALFORMED: the flow order names a step that is not in the file'
     from public.preview_onboarding_setup_import(
       jsonb_set((select doc from run where label = 'base'), '{flow_order}', '["identity", "not-a-screen"]')) p),
  'and one with an unknown step'
);
select ok(
  (select (p ->> 'can_import')::boolean
     from public.preview_onboarding_setup_import(
       jsonb_set((select doc from run where label = 'base'), '{flow_order}',
                 jsonb_build_array('identity', 'custom:' || (select doc ->> 'id' from run where label = 'screen'),
                                   'background'))) p),
  'a flow order that save_intake_flow_order accepts is accepted'
);

-- 2. The counts -----------------------------------------------------------------------------------------

-- The file has the bundled terms, three published authorization versions
-- (two older copies added) and an app terms draft.
reset role;
update run set doc = jsonb_set(
    jsonb_set(doc, '{authorization,published}',
              (doc -> 'authorization' -> 'published')
              || jsonb_build_array(
                   (doc -> 'authorization' -> 'published' -> 0) || '{"version_number": 2}'::jsonb,
                   (doc -> 'authorization' -> 'published' -> 0) || '{"version_number": 3}'::jsonb)),
    '{app_terms,draft}',
    jsonb_build_object('content', jsonb_set(doc -> 'app_terms' -> 'published' -> 0 -> 'content',
                                            '{body}', '{"ca": "Termes nous."}')))
 where label = 'base';
set local role authenticated;
select is(
  (select p -> 'counts' from public.preview_onboarding_setup_import((select doc from run where label = 'base')) p)
    -> 'authorization_versions',
  '1'::jsonb,
  'the preview counts the one authorization draft the import creates'
);
select is(
  (select p -> 'counts' from public.preview_onboarding_setup_import((select doc from run where label = 'base')) p)
    -> 'app_terms_versions',
  '1'::jsonb,
  'and the one terms draft'
);
select ok(
  (select p -> 'warnings' @> '[{"code": "authorization_history", "count": 2}]'
     from public.preview_onboarding_setup_import((select doc from run where label = 'base')) p),
  'the warning still says two published versions stay behind'
);
select is(
  (select p -> 'counts' -> 'app_terms_versions'
     from public.preview_onboarding_setup_import(
       jsonb_set((select doc from run where label = 'base'), '{app_terms,draft}', 'null')) p),
  '0'::jsonb,
  'the bundled terms alone count as nothing imported'
);
insert into run (label, doc) values ('report', public.import_onboarding_setup((select doc from run where label = 'base')));
select ok(
  (select (doc -> 'counts' ->> 'app_terms_versions')::integer = 1
          and (doc -> 'counts' ->> 'authorization_versions')::integer = 1
     from run where label = 'report'),
  'the import report counts one draft of each'
);
reset role;
select is(
  (select count(*)::integer from public.authorization_versions where org_id = '5eed0000-0000-4000-8000-0000000006c0')
  + (select count(*)::integer from public.app_terms_versions
      where org_id = '5eed0000-0000-4000-8000-0000000006c0' and published_at is null),
  2,
  'which is what it created'
);
select ok(
  (select (changes -> 'counts' ->> 'authorization_versions')::integer = 1
          and (changes -> 'counts' ->> 'app_terms_versions')::integer = 1
     from public.audit_log
    where action = 'onboarding.import' and org_id = '5eed0000-0000-4000-8000-0000000006c0'),
  'and the audit row says the same'
);

-- Empty the organization again for the refusals.
delete from public.intake_screens where org_id = '5eed0000-0000-4000-8000-0000000006c0';
delete from public.profile_fields where org_id = '5eed0000-0000-4000-8000-0000000006c0' and kind = 'custom';
-- The app questions' wording and required flags live on their placements (RAPP-666).
update public.field_placements p
   set label_override = null, help_override = null
  from public.profile_fields f
 where f.id = p.field_id and f.org_id = '5eed0000-0000-4000-8000-0000000006c0' and f.kind = 'builtin';
select private.set_app_question_required('5eed0000-0000-4000-8000-0000000006c0', q.question,
         q.question = any (private.default_required_intake_questions()))
  from unnest(private.wizard_intake_questions()) q(question)
 where not (q.question = any (private.locked_required_intake_questions()));
delete from public.intake_builtin_screens where org_id = '5eed0000-0000-4000-8000-0000000006c0';
delete from public.intake_flow_orders where org_id = '5eed0000-0000-4000-8000-0000000006c0';
delete from public.intake_state_presets where org_id = '5eed0000-0000-4000-8000-0000000006c0';
update public.organizations set document_step_explanation = null where id = '5eed0000-0000-4000-8000-0000000006c0';
delete from public.app_terms_versions where org_id = '5eed0000-0000-4000-8000-0000000006c0' and published_at is null;
delete from public.authorization_versions where org_id = '5eed0000-0000-4000-8000-0000000006c0';
delete from public.seasons where org_id = '5eed0000-0000-4000-8000-0000000006c0';
set local role authenticated;

-- 3. Clear refusals --------------------------------------------------------------------------------------

select ok(
  (select p ->> 'problem' = 'ONBOARDING_SETUP/REFUSED_VALUE: a question in the file has a value this app does not accept. Download the file again from an app at the same version.'
     from public.preview_onboarding_setup_import(
       pg_temp.bad_type((select doc from run where label = 'base'))) p),
  'a constraint the file breaks is named as the part of the file it concerns'
);
select ok(
  (select p ->> 'problem' not like '%profile_fields%' and p ->> 'problem' not like '%constraint%'
     from public.preview_onboarding_setup_import(
       pg_temp.bad_type((select doc from run where label = 'base'))) p),
  'with no table or constraint name in it'
);
select throws_ok(
  $$ select public.import_onboarding_setup(
       pg_temp.bad_type((select doc from run where label = 'base'))) $$,
  '22023', 'ONBOARDING_SETUP/REFUSED_VALUE: a question in the file has a value this app does not accept. Download the file again from an app at the same version.',
  'the import says the same'
);
select ok(
  (select p ->> 'problem' = 'ONBOARDING_SETUP/MALFORMED: a value in the file has the wrong form (a date, a number or an id). Download the file again from an app at the same version.'
     from public.preview_onboarding_setup_import(
       jsonb_set((select doc from run where label = 'base'), '{seasons,0,starts_on}', '"not a date"')) p),
  'a value of the wrong form reads as such'
);
select throws_ok(
  $$ select public.preview_onboarding_setup_import(
       jsonb_set((select doc from run where label = 'base'), '{schema_version}', '"1"')) $$,
  '22023', 'ONBOARDING_SETUP/MALFORMED: schema_version must be the number 1, 2 or 3',
  'schema_version as a string is refused as not the number 1'
);
select throws_ok(
  $$ select public.import_onboarding_setup((select doc from run where label = 'base') - 'schema_version') $$,
  '22023', 'ONBOARDING_SETUP/MALFORMED: schema_version must be the number 1, 2 or 3',
  'and so is a file without it'
);

-- The empty organization's own export holds nothing to import.
insert into run (label, doc) values ('empty', public.export_onboarding_setup(null));
select ok(
  (select not (p ->> 'can_import')::boolean
          and p ->> 'problem' = 'ONBOARDING_SETUP/EMPTY: the file holds no onboarding setup to import'
     from public.preview_onboarding_setup_import((select doc from run where label = 'empty')) p),
  'a file with no setup is refused by the preview'
);
select throws_ok(
  $$ select public.import_onboarding_setup((select doc from run where label = 'empty')) $$,
  '22023', 'ONBOARDING_SETUP/EMPTY: the file holds no onboarding setup to import',
  'and by the import'
);
select throws_ok(
  $$ select public.import_onboarding_setup((select doc from run where label = 'empty')) $$,
  '22023', 'ONBOARDING_SETUP/EMPTY: the file holds no onboarding setup to import',
  'every time, so it is never imported again and again'
);
reset role;
select is(
  (select count(*)::integer from public.audit_log
    where action = 'onboarding.import' and org_id = '5eed0000-0000-4000-8000-0000000006c0'),
  1,
  'no empty import is recorded'
);

select * from finish();
rollback;
