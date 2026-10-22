-- Test players stay out of every real report, export and audience (RAPP-619).
-- Run with: bunx supabase test db
--
-- What these assertions defend: a test player who has joined and has data in
-- every place a real player does (attendance, a season signature, a survey
-- answer, feedback, a material handover, an entity referral, a staff
-- question answer, a push device) changes no number staff or an entity read,
-- appears in no export and receives no targeted notification:
--   impact report, attendance statistics, season registration, the four data
--   exports, survey results and their export, the notification audience and
--   the targeted send, stock levels, the participant filter options, feedback
--   counts, and the three entity tracking views.
--
-- Seed: admin ...001, entity contact ...004 (entity ...8030-...001), the design
-- account ...097, the test player ...096 (invited), survey ...8040-...001.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(24);

create temp table before_values (label text primary key, value jsonb) on commit drop;
grant all on before_values to authenticated;

-- What staff and the entity read before the test player has any data. --------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into before_values values
  ('impact', public.get_impact_report(current_date - 400, current_date + 400) -> 'summary'),
  ('attendance_periods', (select coalesce(jsonb_agg(to_jsonb(s) order by s.period_start), '[]'::jsonb)
                            from public.attendance_period_stats s)),
  ('attendance_categories', (select coalesce(jsonb_agg(to_jsonb(s) order by s.category_id), '[]'::jsonb)
                               from public.attendance_category_stats s)),
  ('season', (select to_jsonb(count(*)) from public.season_registration_status())),
  ('surveys', (select coalesce(jsonb_agg(jsonb_build_array(s.id, s.response_count, s.completed_count) order by s.id), '[]'::jsonb)
                 from public.list_surveys() s)),
  ('stock', (select coalesce(jsonb_agg(to_jsonb(s) order by s.item_key, s.size), '[]'::jsonb)
               from public.stock_levels() s)),
  ('feedback', (select coalesce(jsonb_agg(to_jsonb(f) order by f.month, f.type), '[]'::jsonb)
                  from public.feedback_monthly_counts() f));

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into before_values values
  ('entity_summary', (select to_jsonb(s) from public.get_entity_impact_summary() s)),
  ('entity_trend', (select coalesce(jsonb_agg(to_jsonb(t) order by t.month_start), '[]'::jsonb)
                      from public.list_entity_participation_trend() t));

-- The test player joins and gets data everywhere a real player has some. ------------------------------

reset role;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
update public.profiles
   set role = 'player', terms_accepted_at = now(), is_active = true,
       nationality = 'Islàndia', reference_entity = 'Entitat de prova 619',
       date_of_birth = '1990-01-01', push_notifications_enabled = true
 where id = '5eed0000-0000-4000-8000-000000000096';
insert into public.push_tokens (user_id, token, platform, device_id)
values ('5eed0000-0000-4000-8000-000000000096', 'tok-test-player-619', 'android', 'dev-test-player-619');
insert into public.attendance (org_id, occurrence_id, player_id, status, marked_by)
select org_id, occurrence_id, '5eed0000-0000-4000-8000-000000000096', 'present', marked_by
  from public.attendance limit 1;
insert into public.authorization_signatures (
  org_id, profile_id, season_id, method, language, paper_signed_on, recorded_by)
values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-000000000096',
        '5eed0000-0000-4000-8040-000000000001', 'paper', 'ca', current_date,
        '5eed0000-0000-4000-8000-000000000001');
insert into public.survey_responses (org_id, survey_id, player_id, answers_encrypted, status, completed_at)
values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8040-000000000001',
        '5eed0000-0000-4000-8000-000000000096', public.encrypt_field('{}'), 'completed', now());
insert into public.feedback_submissions (org_id, author_id, type, content_encrypted)
values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-000000000096',
        'activity_proposal', public.encrypt_field('Proposta de prova'));
insert into public.stock_movements (org_id, item_type_id, size, quantity, kind, participant_id, recorded_by)
select org_id, item_type_id, size, -1, 'handover', '5eed0000-0000-4000-8000-000000000096', recorded_by
  from public.stock_movements where kind = 'handover' limit 1;
insert into public.entity_referrals (
  org_id, entity_user_id, collaborating_entity_id, referred_first_name, referred_last_name,
  documentation_status, status, referred_profile_id, assigned_staff_id)
values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-000000000004',
        '5eed0000-0000-4000-8030-000000000001', 'Joana', 'Prova', 'complete', 'active',
        '5eed0000-0000-4000-8000-000000000096', '5eed0000-0000-4000-8000-000000000002');
insert into public.custom_answers (profile_id, question_id, org_id, value, source)
values ('5eed0000-0000-4000-8000-000000000096', '5eed0000-0000-4000-8045-000000000001',
        '5eed0000-0000-4000-8000-000000000000', '"yes"', 'player');

-- Staff read the same numbers. -------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select is(
  public.get_impact_report(current_date - 400, current_date + 400) -> 'summary',
  (select value from before_values where label = 'impact'),
  'the impact report counts no test player: participants, attendance, new players'
);
select is(
  (select coalesce(jsonb_agg(to_jsonb(s) order by s.period_start), '[]'::jsonb) from public.attendance_period_stats s),
  (select value from before_values where label = 'attendance_periods'),
  'the attendance statistics count no test player'
);
select is(
  (select coalesce(jsonb_agg(to_jsonb(s) order by s.category_id), '[]'::jsonb) from public.attendance_category_stats s),
  (select value from before_values where label = 'attendance_categories'),
  'the attendance statistics per category count no test player'
);
select is(
  (select to_jsonb(count(*)) from public.season_registration_status()),
  (select value from before_values where label = 'season'),
  'season registration lists no test player'
);

create temp table exports (dataset text, scope text, rows jsonb) on commit drop;
reset role;
grant all on exports to authenticated;
set local role authenticated;
insert into exports
select dataset, scope, public.create_data_export(dataset, scope, 'csv', null, null,
         case when scope = 'full' then 'Comprovació de proves' end, scope = 'full') -> 'rows'
  from (values ('participants', 'default'), ('participants', 'full'),
               ('custom_answers', 'default'), ('attendance', 'default')) d(dataset, scope);
select is(
  (select count(*)::integer from exports e, jsonb_array_elements(e.rows) r
    where e.dataset = 'participants' and e.scope = 'default'
      and r ->> 'id' = '5eed0000-0000-4000-8000-000000000096'),
  0, 'the participants export has no test player'
);
select is(
  (select count(*)::integer from exports e, jsonb_array_elements(e.rows) r
    where e.dataset = 'participants' and e.scope = 'full'
      and r ->> 'id' = '5eed0000-0000-4000-8000-000000000096'),
  0, 'the full participants export has no test player'
);
select is(
  (select count(*)::integer from exports e, jsonb_array_elements(e.rows) r
    where e.dataset = 'custom_answers' and r ->> 'participant_id' = '5eed0000-0000-4000-8000-000000000096'),
  0, 'the staff-question answers export has no test player'
);
select is(
  (select count(*)::integer from exports e, jsonb_array_elements(e.rows) r
    where e.dataset = 'attendance' and r ->> 'player_id' = '5eed0000-0000-4000-8000-000000000096'),
  0, 'the attendance export has no test player'
);
select ok(
  (select jsonb_array_length(rows) > 0 from exports where dataset = 'participants' and scope = 'default'),
  'the participants export still holds the real players'
);

select is(
  (select count(*)::integer from public.list_survey_responses('5eed0000-0000-4000-8040-000000000001')
    where player_id = '5eed0000-0000-4000-8000-000000000096'),
  0, 'survey results hold no test player''s answers'
);
select is(
  (select coalesce(jsonb_agg(jsonb_build_array(s.id, s.response_count, s.completed_count) order by s.id), '[]'::jsonb)
     from public.list_surveys() s),
  (select value from before_values where label = 'surveys'),
  'survey response counts count no test player'
);
select is(
  (select count(*)::integer from jsonb_array_elements(
     public.create_survey_export('5eed0000-0000-4000-8040-000000000001') -> 'rows') r
    where r ->> 'player_id' = '5eed0000-0000-4000-8000-000000000096'),
  0, 'the survey export has no test player'
);

select is(
  (select count(*)::integer from public.preview_notification_audience('all')
    where participant_id = '5eed0000-0000-4000-8000-000000000096'),
  0, 'the notification audience "everyone" has no test player'
);
select is(
  (select count(*)::integer from public.preview_notification_audience('entity', '{"entity_name": "Entitat de prova 619"}')),
  0, 'nor does an entity audience she would match'
);
reset role;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated"}';
select is(
  private.matches_notification_audience('5eed0000-0000-4000-8000-000000000096', 'all'),
  false,
  'a targeted send does not reach a test player'
);
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select is(
  (select coalesce(jsonb_agg(to_jsonb(s) order by s.item_key, s.size), '[]'::jsonb) from public.stock_levels() s),
  (select value from before_values where label = 'stock'),
  'a handover to a test player changes no stock level'
);
select is(
  (select 'Entitat de prova 619' = any (entities) or 'Islàndia' = any (nationalities)
     from public.participant_filter_options()),
  false,
  'the participant filters offer no test player''s values'
);
select is(
  (select coalesce(jsonb_agg(to_jsonb(f) order by f.month, f.type), '[]'::jsonb) from public.feedback_monthly_counts() f),
  (select value from before_values where label = 'feedback'),
  'feedback counts count no test player'
);

-- The entity reads the same numbers. ---------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select to_jsonb(s) from public.get_entity_impact_summary() s),
  (select value from before_values where label = 'entity_summary'),
  'the entity''s summary counts no test player'
);
select is(
  (select coalesce(jsonb_agg(to_jsonb(t) order by t.month_start), '[]'::jsonb) from public.list_entity_participation_trend() t),
  (select value from before_values where label = 'entity_trend'),
  'the entity''s participation trend counts no test player'
);
select is(
  (select count(*)::integer from public.list_entity_referral_tracking()
    where referred_profile_id = '5eed0000-0000-4000-8000-000000000096'),
  0,
  'the entity''s tracking list has no test player'
);

-- A real player still counts: the filter is the test flag, nothing else. --------------------------------

reset role;
update public.profiles set is_test_account = false where id = '5eed0000-0000-4000-8000-000000000096';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select isnt(
  (select coalesce(jsonb_agg(to_jsonb(s) order by s.category_id), '[]'::jsonb) from public.attendance_category_stats s),
  (select value from before_values where label = 'attendance_categories'),
  'the same woman, real, is in the attendance statistics'
);
select is(
  (select count(*)::integer from public.preview_notification_audience('all')
    where participant_id = '5eed0000-0000-4000-8000-000000000096'),
  1,
  'and in the notification audience'
);
select isnt(
  (select to_jsonb(count(*)) from public.season_registration_status()),
  (select value from before_values where label = 'season'),
  'and in season registration'
);

select * from finish();
rollback;
