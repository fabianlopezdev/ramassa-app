-- An activity's sign-up asks questions on the form engine (RAPP-941).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. The activity editor opens an activity's sign-up form, making it once:
--      a form of kind `signup`, filled in by the player, never published, one
--      live form per activity. It needs the form builder's permission and the
--      activity's: the design role alone and an activity editor alone are
--      refused.
--   2. Installed phone builds read `intake_catalog()` as before: neither the
--      form nor its questions reach it, for the team, the design role or a
--      player. The dashboard reads it, with its activity's title.
--   3. The design role builds it: screens, and questions of the form's own. It
--      asks no other field; no screen hides; it is never published.
--   4. Her phone reads the form, and `sign_up_for_event` signs her up with her
--      answers kept encrypted with the sign-up. A required question, a question
--      the form does not ask and an answer that does not fit are refused; the
--      sign-up mode, the places and the activity she may read are enforced as
--      for her own write. A staff member cannot sign up through it.
--   5. An installed build still signs up and cancels by writing the row, on an
--      activity whose form has a required question, and the count follows.
--   6. Signing up again after cancelling replaces the earlier answers; an
--      installed build's sign-up again starts without them.
--   7. Her answers are read under the rule that reads the sign-up: the team who
--      reads sign-ups reads them, she reads her own, the design role reads none.
--   8. Archiving the form, or deleting the activity, leaves the activity asking
--      nothing; answers given before stay readable with the question as she read it.
--
-- The test builds its own organization: an admin ...001, a player ...002, a
-- second player ...003, a designer ...004 who holds onboarding.design only, an
-- activity editor ...005 who holds events.edit only and a coach ...006 who
-- holds attendance.mark only, and a third player ...007.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(59);

insert into public.organizations (id, name, slug)
values ('94100000-0000-4000-8000-000000000000', 'Proves 941', 'proves-941');
insert into auth.users (id, email) values
  ('94100000-0000-4000-8000-000000000001', 'admin-941@example.test'),
  ('94100000-0000-4000-8000-000000000002', 'player-941@example.test'),
  ('94100000-0000-4000-8000-000000000003', 'player2-941@example.test'),
  ('94100000-0000-4000-8000-000000000004', 'designer-941@example.test'),
  ('94100000-0000-4000-8000-000000000005', 'events-941@example.test'),
  ('94100000-0000-4000-8000-000000000006', 'coach-941@example.test'),
  ('94100000-0000-4000-8000-000000000007', 'player3-941@example.test');
insert into public.profiles (id, org_id, role, first_name, last_name, terms_accepted_at)
values
  ('94100000-0000-4000-8000-000000000001', '94100000-0000-4000-8000-000000000000', 'admin', 'Admin', 'Prova', now()),
  ('94100000-0000-4000-8000-000000000002', '94100000-0000-4000-8000-000000000000', 'player', 'Jugadora', 'Prova', now()),
  ('94100000-0000-4000-8000-000000000003', '94100000-0000-4000-8000-000000000000', 'player', 'Altra', 'Prova', now()),
  ('94100000-0000-4000-8000-000000000004', '94100000-0000-4000-8000-000000000000', 'staff', 'Dissenyadora', 'Prova', now()),
  ('94100000-0000-4000-8000-000000000005', '94100000-0000-4000-8000-000000000000', 'staff', 'Activitats', 'Prova', now()),
  ('94100000-0000-4000-8000-000000000006', '94100000-0000-4000-8000-000000000000', 'staff', 'Entrenadora', 'Prova', now()),
  ('94100000-0000-4000-8000-000000000007', '94100000-0000-4000-8000-000000000000', 'player', 'Tercera', 'Prova', now())
on conflict (id) do update set org_id = excluded.org_id, role = excluded.role;
delete from public.team_member_permissions
 where profile_id in ('94100000-0000-4000-8000-000000000004', '94100000-0000-4000-8000-000000000005',
                      '94100000-0000-4000-8000-000000000006');
insert into public.team_member_permissions (org_id, profile_id, permission_code) values
  ('94100000-0000-4000-8000-000000000000', '94100000-0000-4000-8000-000000000004', 'onboarding.design'),
  ('94100000-0000-4000-8000-000000000000', '94100000-0000-4000-8000-000000000005', 'events.edit'),
  ('94100000-0000-4000-8000-000000000000', '94100000-0000-4000-8000-000000000006', 'attendance.mark');

insert into public.event_categories (id, org_id, name, icon, color)
values ('94100000-0000-4000-8001-000000000001', '94100000-0000-4000-8000-000000000000',
        '{"ca": "Sortides", "es": "Salidas", "en": "Trips", "fr": "Sorties", "ar": "رحلات", "fa": "سفرها"}',
        'footprints', 'green');
-- A trip she confirms (two places), an activity open to interest, one with no
-- sign-up, and a draft.
insert into public.events (id, org_id, category_id, title, location, starts_at, max_participants,
                           signup_mode, status, published_at)
values
  ('94100000-0000-4000-8002-000000000001', '94100000-0000-4000-8000-000000000000',
   '94100000-0000-4000-8001-000000000001', '{"ca": "Sortida a la platja"}', 'Barceloneta',
   now() + interval '10 days', 2, 'confirm', 'draft', null),
  ('94100000-0000-4000-8002-000000000002', '94100000-0000-4000-8000-000000000000',
   '94100000-0000-4000-8001-000000000001', '{"ca": "Torneig"}', 'Camp', now() + interval '12 days',
   null, 'interest', 'draft', null),
  ('94100000-0000-4000-8002-000000000003', '94100000-0000-4000-8000-000000000000',
   '94100000-0000-4000-8001-000000000001', '{"ca": "Xerrada"}', 'Local', now() + interval '14 days',
   null, 'none', 'draft', null),
  ('94100000-0000-4000-8002-000000000004', '94100000-0000-4000-8000-000000000000',
   '94100000-0000-4000-8001-000000000001', '{"ca": "Esborrany"}', 'Local', now() + interval '16 days',
   null, 'confirm', 'draft', null);
-- Published as a team member publishes them: with every language of the title.
update public.events
   set title = title || '{"es": "x", "en": "x", "fr": "x", "ar": "x", "fa": "x"}', status = 'published',
       published_at = now() - interval '1 hour'
 where id in ('94100000-0000-4000-8002-000000000001', '94100000-0000-4000-8002-000000000002',
              '94100000-0000-4000-8002-000000000003');

create temporary table ids (key text primary key, id uuid) on commit drop;
grant all on ids to authenticated;

create function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', 4102444800)))::text, true);
end;
$$;
create function pg_temp.catalog(p_user uuid, p_with_surveys boolean) returns jsonb language plpgsql as $$
declare
  result jsonb;
begin
  perform pg_temp.as_user(p_user);
  set local role authenticated;
  result := case when p_with_surveys then public.intake_catalog_with_surveys() else public.intake_catalog() end;
  reset role;
  return result;
end;
$$;
-- The catalog with the referral form's items in one order: that list is
-- aggregated in no set order (RAPP-938), so two reads may list it differently.
create function pg_temp.installed_catalog(p_user uuid) returns jsonb language sql as $$
  select c || case when c -> 'entity_form' is null or jsonb_typeof(c -> 'entity_form') <> 'object' then '{}'::jsonb
                   else jsonb_build_object('entity_form', (c -> 'entity_form') || jsonb_build_object('items',
                          coalesce((select jsonb_agg(i order by i ->> 'id')
                                      from jsonb_array_elements(c -> 'entity_form' -> 'items') i), '[]'::jsonb))) end
    from (select pg_temp.catalog(p_user, false) as c) x;
$$;
create function pg_temp.answers_of(p_user uuid, p_event uuid) returns setof jsonb language plpgsql as $$
begin
  perform pg_temp.as_user(p_user);
  set local role authenticated;
  return query select jsonb_build_object('player', a.player_id, 'state', a.state, 'answers', a.answers)
                 from public.event_signup_answers(p_event) a;
  reset role;
end;
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- A question of the Fitxa, which a sign-up form never asks.
set local role authenticated;
select pg_temp.as_user('94100000-0000-4000-8000-000000000001');
insert into ids select 'regular', public.save_profile_field(
  null, (select s.id from public.profile_sections s
          where s.org_id = '94100000-0000-4000-8000-000000000000' order by s.sort_order limit 1),
  'short_text', '{"ca": "Una pregunta de la fitxa"}', null, 'normal', false, '[]', '{}');
reset role;

-- What installed builds read before any sign-up form exists.
create temporary table before_catalogs on commit drop as
select who, pg_temp.installed_catalog(id) as catalog from (values
  ('admin', '94100000-0000-4000-8000-000000000001'::uuid),
  ('player', '94100000-0000-4000-8000-000000000002'::uuid),
  ('designer', '94100000-0000-4000-8000-000000000004'::uuid)) v(who, id);

-- 1. The activity editor opens the form ----------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('94100000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select public.open_event_signup_form('94100000-0000-4000-8002-000000000001') $$,
  '42501', 'an activity''s questions need events.edit or events.publish',
  'the design role alone cannot tie a form to an activity');
select pg_temp.as_user('94100000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select public.open_event_signup_form('94100000-0000-4000-8002-000000000001') $$,
  '42501', 'the question builder needs settings.organization or onboarding.design',
  'an activity editor alone cannot build a form');
select pg_temp.as_user('94100000-0000-4000-8000-000000000001');
insert into ids values ('form', public.open_event_signup_form('94100000-0000-4000-8002-000000000001'));
select is(public.open_event_signup_form('94100000-0000-4000-8002-000000000001'),
          (select id from ids where key = 'form'), 'opening it again opens the same form');
insert into ids values ('interest_form', public.open_event_signup_form('94100000-0000-4000-8002-000000000002'));
reset role;

select results_eq(
  $$ select kind, event_id, filled_by, mandatory, audience, published_at is null, is_archived
       from public.custom_forms where id = (select id from ids where key = 'form') $$,
  $$ values ('signup', '94100000-0000-4000-8002-000000000001'::uuid, 'player', 'optional', 'all', true, false) $$,
  'a sign-up form: tied to its activity, filled in by her, optional, never published');
select throws_ok(
  $$ insert into public.custom_forms (org_id, name, filled_by, kind, event_id)
     values ('94100000-0000-4000-8000-000000000000', '{"ca": "Una altra"}', 'player', 'signup',
             '94100000-0000-4000-8002-000000000001') $$,
  '23505', null, 'an activity has one live sign-up form');
select throws_ok(
  $$ insert into public.custom_forms (org_id, name, filled_by, kind)
     values ('94100000-0000-4000-8000-000000000000', '{"ca": "Sense activitat"}', 'player', 'signup') $$,
  '23514', 'a sign-up form belongs to an activity', 'a sign-up form always starts with an activity');
select throws_ok(
  format($$ update public.custom_forms set kind = 'other', event_id = null where id = %L $$,
         (select id from ids where key = 'form')),
  '23514', 'a sign-up form stays a sign-up form', 'a sign-up form stays one');
select throws_ok(
  format($$ update public.custom_forms set event_id = '94100000-0000-4000-8002-000000000002' where id = %L $$,
         (select id from ids where key = 'form')),
  '23514', 'a sign-up form stays with its activity', 'and stays with its activity');

-- 3. The design role builds it --------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('94100000-0000-4000-8000-000000000004');
insert into ids select 'screen', public.save_custom_form_screen(
  null, (select id from ids where key = 'form'), '{"ca": "Transport"}', null, null);
insert into ids select 'bus', public.save_survey_question(
  null, (select id from ids where key = 'screen'), 'single_choice', '{"ca": "Necessites seient al bus?"}', null,
  true, '[{"label": {"ca": "Sí"}}, {"label": {"ca": "No"}}]', '{}');
insert into ids select 'allergies', public.save_survey_question(
  null, (select id from ids where key = 'screen'), 'short_text', '{"ca": "Tens alguna al·lèrgia?"}', null,
  false, '[]', '{}');
insert into ids select 'interest_screen', public.save_custom_form_screen(
  null, (select id from ids where key = 'interest_form'), '{"ca": "Samarreta"}', null, null);
insert into ids select 'size', public.save_survey_question(
  null, (select id from ids where key = 'interest_screen'), 'short_text', '{"ca": "Quina talla fas?"}', null,
  false, '[]', '{}');
reset role;
insert into ids select 'yes', o.id from public.custom_question_options o
 where o.question_id = (select id from ids where key = 'bus') and o.sort_order = 0;
insert into ids select 'no', o.id from public.custom_question_options o
 where o.question_id = (select id from ids where key = 'bus') and o.sort_order = 1;

select results_eq(
  $$ select kind, survey_form_id, section_id is null from public.profile_fields
      where id = (select id from ids where key = 'bus') $$,
  $$ values ('survey', (select id from ids where key = 'form'), true) $$,
  'a question of the sign-up form is its own, in no section');
select results_eq(
  $$ select screen_key, required from public.field_placements where field_id = (select id from ids where key = 'bus') $$,
  $$ values ((select id::text from ids where key = 'screen'), true) $$,
  'the question goes on the screen staff picked, required as saved');

set local role authenticated;
select pg_temp.as_user('94100000-0000-4000-8000-000000000001');
select throws_ok(
  format($$ select public.place_field(%L, 'custom_form', %L, false) $$,
         (select id from ids where key = 'regular'), (select id from ids where key = 'screen')),
  '23514', 'the sign-up form asks its own questions only',
  'a field of the Fitxa is never asked on a sign-up form');
select throws_ok(
  format($$ select public.set_screen_hidden(%L, true) $$, (select id from ids where key = 'interest_screen')),
  '23514', 'a screen of the sign-up form always shows', 'a screen of a sign-up form never hides');
select throws_ok(
  format($$ select public.publish_custom_form(%L, false, null) $$, (select id from ids where key = 'form')),
  '23514', 'the sign-up form has no versions and asks nobody', 'a sign-up form is never published');
reset role;

-- 2. Installed builds read the catalog as before; the dashboard reads the form -------------------------------

select is(pg_temp.installed_catalog('94100000-0000-4000-8000-000000000001'),
          (select catalog from before_catalogs where who = 'admin'),
          'the team''s intake_catalog() is what it was before the sign-up forms');
select is(pg_temp.installed_catalog('94100000-0000-4000-8000-000000000002'),
          (select catalog from before_catalogs where who = 'player'),
          'a player''s intake_catalog() is what it was before the sign-up forms');
select is(pg_temp.installed_catalog('94100000-0000-4000-8000-000000000004'),
          (select catalog from before_catalogs where who = 'designer'),
          'the design role''s intake_catalog() is what it was before the sign-up forms');
select is(
  (select count(*)::integer from jsonb_array_elements(
     pg_temp.catalog('94100000-0000-4000-8000-000000000001', false) -> 'fields') f
    where f ->> 'id' in (select id::text from ids where key in ('bus', 'allergies', 'size'))),
  0, 'its questions never reach intake_catalog()');
select results_eq(
  $$ select f ->> 'kind', f -> 'event_title' ->> 'ca', jsonb_array_length(f -> 'screens')
       from jsonb_array_elements(pg_temp.catalog('94100000-0000-4000-8000-000000000004', true) -> 'custom_forms') f
      where f ->> 'id' = (select id::text from ids where key = 'form') $$,
  $$ values ('signup', 'Sortida a la platja', 1) $$,
  'the dashboard lists it with its activity''s title and its screens');
select is(
  (select count(*)::integer from jsonb_array_elements(
     pg_temp.catalog('94100000-0000-4000-8000-000000000004', true) -> 'custom_forms') f
    where f ? 'event_title' and f ->> 'kind' <> 'signup'),
  0, 'no other form gets the activity''s title');

-- 4. Her phone signs her up with answers -------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('94100000-0000-4000-8000-000000000002');
select results_eq(
  $$ select (f ->> 'form_id')::uuid, jsonb_array_length(f -> 'content' -> 'placements')
       from (select public.event_signup_form('94100000-0000-4000-8002-000000000001') f) x $$,
  $$ values ((select id from ids where key = 'form'), 2) $$,
  'her phone reads the activity''s form with its questions');
select is(public.event_signup_form('94100000-0000-4000-8002-000000000003'), null::jsonb,
          'an activity with no form asks nothing');
select throws_ok(
  $$ select public.event_signup_form('94100000-0000-4000-8002-000000000004') $$,
  'P0002', 'EVENTS/NOT_FOUND', 'a draft activity is not hers to read');
select throws_ok(
  $$ select public.sign_up_for_event('94100000-0000-4000-8002-000000000001', '{}') $$,
  '23514', 'a required question has no answer', 'a required question needs an answer');
select throws_ok(
  format($$ select public.sign_up_for_event('94100000-0000-4000-8002-000000000001', %L) $$,
         jsonb_build_object((select id from ids where key = 'bus'), (select id from ids where key = 'yes'),
                            (select id from ids where key = 'size'), 'M')),
  '22023', 'an answer to a question the sign-up form does not ask',
  'an answer to another activity''s question is refused');
select throws_ok(
  format($$ select public.sign_up_for_event('94100000-0000-4000-8002-000000000001', %L) $$,
         jsonb_build_object((select id from ids where key = 'bus'), gen_random_uuid())),
  '23514', 'an answer does not fit its question', 'an answer that does not fit is refused');
select is(
  (select count(*)::integer from public.event_signups where event_id = '94100000-0000-4000-8002-000000000001'),
  0, 'a refused sign-up leaves no row');
select lives_ok(
  format($$ select public.sign_up_for_event('94100000-0000-4000-8002-000000000001', %L) $$,
         jsonb_build_object((select id from ids where key = 'bus'), (select id from ids where key = 'yes'),
                            (select id from ids where key = 'allergies'), 'Fruits secs')),
  'she signs up with her answers');
select throws_ok(
  $$ select public.sign_up_for_event('94100000-0000-4000-8002-000000000003', '{}') $$,
  'P0001', 'EVENTS/SIGNUP_CLOSED', 'an activity with no sign-up refuses her, as her own write is refused');
select throws_ok(
  $$ select public.sign_up_for_event('94100000-0000-4000-8002-000000000004', '{}') $$,
  '42501', 'EVENTS/NOT_FOUND', 'a draft activity refuses her, as her own write is refused');
select lives_ok(
  $$ select public.sign_up_for_event('94100000-0000-4000-8002-000000000002', '{}') $$,
  'an activity open to interest takes her with no answers when none is required');
reset role;

select results_eq(
  $$ select state, answers_encrypted is not null from public.event_signups
      where event_id = '94100000-0000-4000-8002-000000000001'
        and player_id = '94100000-0000-4000-8000-000000000002' $$,
  $$ values ('confirmed', true) $$,
  'the sign-up is confirmed, as the activity asks, with her answers encrypted');
select is(
  (select state from public.event_signups where event_id = '94100000-0000-4000-8002-000000000002'
      and player_id = '94100000-0000-4000-8000-000000000002'),
  'interested', 'an activity open to interest records her interest');
select is(
  (select count(*)::integer from public.event_signups
    where event_id = '94100000-0000-4000-8002-000000000002' and answers_encrypted is not null),
  0, 'a sign-up with no answers keeps none');
select is((select active_signup_count from public.events where id = '94100000-0000-4000-8002-000000000001'),
          1, 'her sign-up takes one place');
select is(
  (select count(*)::integer from public.custom_answers
    where profile_id = '94100000-0000-4000-8000-000000000002'
      and question_id in (select id from ids where key in ('bus', 'allergies'))),
  0, 'her answers never go to her record');

set local role authenticated;
select pg_temp.as_user('94100000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.sign_up_for_event('94100000-0000-4000-8002-000000000001', '{}') $$,
  '42501', 'EVENTS/NOT_FOUND', 'a staff member cannot sign up through it');
reset role;

-- 5. An installed build still signs up by writing the row -------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('94100000-0000-4000-8000-000000000003');
select lives_ok(
  $$ insert into public.event_signups (event_id, player_id, state)
     values ('94100000-0000-4000-8002-000000000001', '94100000-0000-4000-8000-000000000003', 'confirmed')
     on conflict (event_id, player_id) do update set state = excluded.state $$,
  'an installed build signs up without answers, though a question is required');
select pg_temp.as_user('94100000-0000-4000-8000-000000000007');
select throws_ok(
  $$ select public.sign_up_for_event('94100000-0000-4000-8002-000000000001',
       jsonb_build_object((select id from ids where key = 'bus'), (select id from ids where key = 'no'))) $$,
  'P0001', 'EVENTS/CAPACITY_FULL', 'no place is left for a third: the places hold as before');
reset role;
select is((select active_signup_count from public.events where id = '94100000-0000-4000-8002-000000000001'),
          2, 'both sign-ups count, one place each');

-- 6. Signing up again ---------------------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('94100000-0000-4000-8000-000000000003');
select lives_ok(
  $$ update public.event_signups set state = 'cancelled'
      where event_id = '94100000-0000-4000-8002-000000000001'
        and player_id = '94100000-0000-4000-8000-000000000003' $$,
  'an installed build cancels as before');
select lives_ok(
  format($$ select public.sign_up_for_event('94100000-0000-4000-8002-000000000001', %L) $$,
         jsonb_build_object((select id from ids where key = 'bus'), (select id from ids where key = 'no'))),
  'she signs up again with her answers');
select pg_temp.as_user('94100000-0000-4000-8000-000000000002');
select lives_ok(
  $$ update public.event_signups set state = 'cancelled'
      where event_id = '94100000-0000-4000-8002-000000000001'
        and player_id = '94100000-0000-4000-8000-000000000002' $$,
  'the first player cancels');
reset role;
select is((select active_signup_count from public.events where id = '94100000-0000-4000-8002-000000000001'),
          1, 'cancelling frees her place');
select isnt((select answers_encrypted from public.event_signups
              where event_id = '94100000-0000-4000-8002-000000000001'
                and player_id = '94100000-0000-4000-8000-000000000002'),
            null, 'a cancelled sign-up keeps her answers until she signs up again');
set local role authenticated;
select pg_temp.as_user('94100000-0000-4000-8000-000000000002');
select lives_ok(
  $$ update public.event_signups set state = 'confirmed'
      where event_id = '94100000-0000-4000-8002-000000000001'
        and player_id = '94100000-0000-4000-8000-000000000002' $$,
  'an installed build signs her up again');
reset role;
select is((select answers_encrypted from public.event_signups
            where event_id = '94100000-0000-4000-8002-000000000001'
              and player_id = '94100000-0000-4000-8000-000000000002'),
          null, 'signing up again starts without the earlier answers');
set local role authenticated;
select pg_temp.as_user('94100000-0000-4000-8000-000000000002');
select lives_ok(
  format($$ select public.sign_up_for_event('94100000-0000-4000-8002-000000000001', %L) $$,
         jsonb_build_object((select id from ids where key = 'bus'), (select id from ids where key = 'no'),
                            (select id from ids where key = 'allergies'), 'Cap')),
  'already signed up, she answers again');
reset role;
select is((select active_signup_count from public.events where id = '94100000-0000-4000-8002-000000000001'),
          2, 'answering again takes no second place');

-- 7. Who reads her answers ---------------------------------------------------------------------------------------

select results_eq(
  $$ select a ->> 'player', a ->> 'state', a -> 'answers' -> 0 -> 'question' -> 'label' ->> 'ca',
            a -> 'answers' -> 1 ->> 'value'
       from pg_temp.answers_of('94100000-0000-4000-8000-000000000001', '94100000-0000-4000-8002-000000000001') a
      where a ->> 'player' = '94100000-0000-4000-8000-000000000002' $$,
  $$ values ('94100000-0000-4000-8000-000000000002', 'confirmed', 'Necessites seient al bus?', 'Cap') $$,
  'the team reads her answers, each under its question as she read it; the new answers replaced the old');
select is((select count(*)::integer
             from pg_temp.answers_of('94100000-0000-4000-8000-000000000006', '94100000-0000-4000-8002-000000000001')),
          2, 'a coach, who reads the sign-ups, reads both');
select is((select count(*)::integer
             from pg_temp.answers_of('94100000-0000-4000-8000-000000000005', '94100000-0000-4000-8002-000000000001')),
          2, 'an activity editor reads both');
select is((select count(*)::integer
             from pg_temp.answers_of('94100000-0000-4000-8000-000000000004', '94100000-0000-4000-8002-000000000001')),
          0, 'the design role, who builds the form, reads no sign-up and no answer');
select results_eq(
  $$ select a ->> 'player', jsonb_array_length(a -> 'answers')
       from pg_temp.answers_of('94100000-0000-4000-8000-000000000003', '94100000-0000-4000-8002-000000000001') a $$,
  $$ values ('94100000-0000-4000-8000-000000000003', 1) $$,
  'a player reads her own sign-up and answers only');

-- 8. Archiving the form, deleting the activity ------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('94100000-0000-4000-8000-000000000004');
select lives_ok(format($$ select public.archive_custom_form(%L, true) $$, (select id from ids where key = 'form')),
                'the design role archives the form');
select pg_temp.as_user('94100000-0000-4000-8000-000000000003');
select is(public.event_signup_form('94100000-0000-4000-8002-000000000001'), null::jsonb,
          'the activity then asks nothing');
select lives_ok(
  $$ update public.event_signups set state = 'cancelled'
      where event_id = '94100000-0000-4000-8002-000000000001'
        and player_id = '94100000-0000-4000-8000-000000000003' $$,
  'she cancels');
select lives_ok($$ select public.sign_up_for_event('94100000-0000-4000-8002-000000000001', '{}') $$,
                'and signs up again with no answers, the required question gone with the form');
reset role;
select is((select jsonb_array_length(a -> 'answers')
             from pg_temp.answers_of('94100000-0000-4000-8000-000000000001', '94100000-0000-4000-8002-000000000001') a
            where a ->> 'player' = '94100000-0000-4000-8000-000000000002'),
          2, 'answers given before stay readable with the question as she read it');

delete from public.events where id = '94100000-0000-4000-8002-000000000002';
select results_eq(
  $$ select is_archived, event_id is null from public.custom_forms where id = (select id from ids where key = 'interest_form') $$,
  $$ values (true, true) $$,
  'deleting an activity archives its sign-up form');

select * from finish();
rollback;
