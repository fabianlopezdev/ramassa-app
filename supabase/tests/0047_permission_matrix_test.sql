-- Permission matrix: every team rule reads permissions (RAPP-230).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. No rule can still use the fixed roles: the old helpers are gone, and a
--      literal staff/admin role check survives only where it states who IS a
--      team member (never what a team member may do).
--   2. A new staff member (plain Staff preset) differs from today's staff only
--      as decided on 2026-10-10: no sensitive fields, no RGPD erasure, no audit
--      log, no internal documents, no entity invitations.
--   3. A person with one job sees that job and nothing else (Coach preset and
--      single-permission members).
--   4. The new separations hold: edit versus publish, service review,
--      organization versus branding settings, permanent deletion, exports.

begin;
select plan(33);

-- Her answers travel by field (RAPP-661). Helpers: the app's keys of a payload
-- keyed by their fields (a choice by its option), a field's id, and her stored
-- answer to an app field (decrypted).
create function pg_temp.answers(p jsonb) returns jsonb language sql security definer as $$
  select coalesce(jsonb_object_agg(f.id::text, private.app_answer_value(f, e.value)), '{}'::jsonb)
    from jsonb_each(p) e
    join public.profile_fields f on f.org_id = '5eed0000-0000-4000-8000-000000000000' and f.system_key = e.key;
$$;
create function pg_temp.field(p_key text) returns text language sql security definer as $$
  select id::text from public.profile_fields
   where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = p_key;
$$;
create function pg_temp.stored(p_profile uuid, p_key text) returns jsonb language sql security definer as $$
  select private.system_field_answer(p_profile, p_key);
$$;
-- Her answer to an app field in a reader's `answers` (RAPP-662): a choice by its
-- option's key, anything else as text.
create function pg_temp.column_of(p_answers jsonb, p_key text) returns text language sql security definer as $$
  select coalesce(
    (select o.key from public.custom_question_options o
      where o.question_id = f.id and o.id::text = p_answers ->> f.id::text),
    p_answers ->> f.id::text)
    from public.profile_fields f
   where f.org_id = '5eed0000-0000-4000-8000-000000000000' and f.system_key = p_key;
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1. Structure -------------------------------------------------------------------------------

select hasnt_function('public', 'is_staff_or_admin', array[]::text[], 'the staff-or-admin helper is gone');
select hasnt_function('public', 'is_admin', array[]::text[], 'the admin helper is gone');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosrc ~ '(is_staff_or_admin|is_admin)\('),
  0, 'no function body calls the old helpers'
);
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prosrc ~ 'role in \(''staff'', ''admin''\)'
      and p.proname not in (
        -- Who is a team member: the permission helpers and the team list itself.
        'has_permission', 'my_permissions', 'is_team_member', 'profile_has_permission',
        'assert_team_manage_remains', 'set_team_member_permissions', 'sync_role_permissions',
        'list_staff_members', 'remove_staff_member', 'set_staff_member_role',
        -- Which manager may sign the target out depends on what kind of person she is.
        'sign_out_everywhere',
        -- A message counts as sent by the team when its sender is a team member.
        'enqueue_message_push',
        -- Material is lent to team members only (RAPP-252).
        'checkout_recipients', 'record_staff_checkout',
        -- Only a team account is marked as a test account; a player is a test
        -- player from her creation or never (RAPP-615).
        'set_team_member_test_account',
        -- Players see the first name and photo of team members only (RAPP-639).
        'get_staff_cards', 'can_read_profile_photo_object',
        -- The bell rings for team members only (RAPP-640).
        'staff_notification_recipients'
      )),
  '{}'::text[], 'a literal staff/admin role check remains only where it defines team membership'
);

-- Fixtures: three new team members in the seed organization. Inserting a staff
-- profile gives the plain Staff preset (RAPP-229 trigger); the matrix rows
-- below then replace it where a test needs one job only.
insert into auth.users (id, email) values
  ('47000000-0000-4000-8000-000000000001', 'new.staff@rapp230.test'),
  ('47000000-0000-4000-8000-000000000002', 'coach@rapp230.test'),
  ('47000000-0000-4000-8000-000000000003', 'single@rapp230.test');
insert into public.profiles (id, org_id, role, first_name, last_name) values
  ('47000000-0000-4000-8000-000000000001', '5eed0000-0000-4000-8000-000000000000', 'staff', 'New', 'Staff'),
  ('47000000-0000-4000-8000-000000000002', '5eed0000-0000-4000-8000-000000000000', 'staff', 'Field', 'Coach'),
  ('47000000-0000-4000-8000-000000000003', '5eed0000-0000-4000-8000-000000000000', 'staff', 'One', 'Job');

delete from public.team_member_permissions where profile_id = '47000000-0000-4000-8000-000000000002';
insert into public.team_member_permissions (org_id, profile_id, permission_code)
select '5eed0000-0000-4000-8000-000000000000', '47000000-0000-4000-8000-000000000002', permission_code
from public.permission_preset_defaults where builtin_key = 'coach';

create temporary table matrix_member (code text);
grant select on matrix_member to authenticated;

create or replace function pg_temp.give_only(p_profile uuid, p_codes text[])
returns void language sql as $$
  delete from public.team_member_permissions where profile_id = p_profile;
  insert into public.team_member_permissions (org_id, profile_id, permission_code)
  select '5eed0000-0000-4000-8000-000000000000', p_profile, unnest(p_codes);
$$;

-- 2. A new staff member: the plain Staff preset ------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "47000000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select ok((select count(*) from public.attendance) > 0, 'new staff read attendance');
select ok((select count(*) from public.feedback_submissions) > 0, 'and private feedback');
select is((select count(*)::int from public.deletion_requests), 0, 'but no deletion requests');
select is((select count(*)::int from public.audit_log), 0, 'no audit log');
select is((select count(*)::int from public.internal_documents), 0, 'no internal documents');
select is((select count(*)::int from public.entity_invitations), 0, 'no entity invitations');
select is(
  (select first_name is not null and pg_temp.column_of(answers, 'date_of_birth') is not null and pg_temp.column_of(answers, 'phone') is null and pg_temp.column_of(answers, 'document_number') is null
     from public.get_participant_profile('5eed0000-0000-4000-8000-000000000026')),
  true, 'a participant profile shows her Personal fields and hides the Sensitive ones'
);
select throws_ok(
  $$ select public.anonymize_participant('5eed0000-0000-4000-8000-000000000026') $$,
  '42501', null::text, 'new staff cannot erase a participant'
);

-- Today's staff keep both (the adjustment).
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select pg_temp.column_of(answers, 'phone') is not null from public.get_participant_profile('5eed0000-0000-4000-8000-000000000026')),
  true, 'today''s staff still see the sensitive fields'
);
select ok((select count(*) from public.deletion_requests) >= 0 and (select public.has_permission('rgpd.erase')),
  'and keep RGPD erasure');
select throws_ok(
  $$ select public.delete_participant_permanently('5eed0000-0000-4000-8000-000000000026') $$,
  '42501', null::text, 'but permanent deletion also needs team.manage'
);

-- 3. One job only ---------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "47000000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select ok((select count(*) from public.attendance) > 0, 'a coach reads attendance');
select ok((select count(*) from public.event_signups) > 0, 'and event sign-ups');
select is((select count(*)::int from public.feedback_submissions), 0, 'but no private feedback');
select is((select count(*)::int from public.mentoring_requests), 0, 'no mentoring requests');
select is((select count(*)::int from public.notification_templates), 0, 'no notification templates');
select is(
  (select first_name is not null and pg_temp.column_of(answers, 'date_of_birth') is null and pg_temp.column_of(answers, 'phone') is null
     from public.get_participant_profile('5eed0000-0000-4000-8000-000000000026')),
  true, 'a coach sees a participant''s Basic fields only'
);
select throws_ok(
  $$ select public.get_impact_report(null, null, null, null) $$,
  '42501', null::text, 'and cannot open the impact report'
);

reset role;
select pg_temp.give_only('47000000-0000-4000-8000-000000000003', array['feedback.view']);
set local role authenticated;
set local request.jwt.claims = '{"sub": "47000000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select ok((select count(*) from public.feedback_submissions) > 0, 'feedback.view alone opens feedback');
select is((select count(*)::int from public.attendance), 0, 'and nothing else, not even attendance');

-- 4. Separations -------------------------------------------------------------------------------------

reset role;
select pg_temp.give_only('47000000-0000-4000-8000-000000000003', array['announcements.edit']);
set local role authenticated;
set local request.jwt.claims = '{"sub": "47000000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ update public.announcements set title = title where id = '5eed0000-0000-4000-8001-000000000001' $$,
  'announcements.edit edits a draft'
);
select throws_ok(
  $$ update public.announcements set status = 'published', published_at = now()
     where id = '5eed0000-0000-4000-8001-000000000001' $$,
  '42501', null::text, 'but publishing needs announcements.publish'
);

reset role;
select pg_temp.give_only('47000000-0000-4000-8000-000000000003', array['services.edit']);
set local role authenticated;
set local request.jwt.claims = '{"sub": "47000000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ update public.services set status = 'approved' where id = '5eed0000-0000-4000-800a-000000000001' $$,
  '42501', null::text, 'approving an entity''s service needs services.review'
);

reset role;
select pg_temp.give_only('47000000-0000-4000-8000-000000000003', array['settings.branding']);
set local role authenticated;
set local request.jwt.claims = '{"sub": "47000000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.update_organization_settings(
       'AE Ramassà', 'laia.ferrer@example.test', '+34600000000', null, '#005F92', '#FFD166',
       array['ca', 'es', 'en', 'ar', 'fa'], 'ca') $$,
  'settings.branding changes the colours'
);
select throws_ok(
  $$ select public.update_organization_settings(
       'Renamed', 'laia.ferrer@example.test', '+34600000000', null, '#005F92', '#FFD166',
       array['ca', 'es', 'en', 'ar', 'fa'], 'ca') $$,
  '42501', null::text, 'but not the organization name'
);

reset role;
select pg_temp.give_only('47000000-0000-4000-8000-000000000003', array['export.attendance']);
set local role authenticated;
set local request.jwt.claims = '{"sub": "47000000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.create_data_export('attendance', 'default', 'csv') $$,
  'export.attendance exports attendance'
);
select throws_ok(
  $$ select public.create_data_export('participants', 'default', 'csv') $$,
  '42501', null::text, 'and not the participant list'
);

reset role;
select pg_temp.give_only('47000000-0000-4000-8000-000000000003', array['participants.view', 'participants.view_personal']);
set local role authenticated;
set local request.jwt.claims = '{"sub": "47000000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.update_participant_profile('5eed0000-0000-4000-8000-000000000026',
       jsonb_build_object('answers', pg_temp.answers(jsonb_build_object(
          'city', 'Manlleu', 'phone', '', 'address', '', 'postal_code', '', 'document_number', '')))) $$,
  'an editor without sensitive access saves the Personal fields'
);
reset role;
select is(
  pg_temp.stored('5eed0000-0000-4000-8000-000000000026', 'phone') is not null
    and pg_temp.stored('5eed0000-0000-4000-8000-000000000026', 'city') = '"Manlleu"'::jsonb,
  true, 'and the phone she could not see is kept, not wiped'
);

select * from finish();
rollback;
