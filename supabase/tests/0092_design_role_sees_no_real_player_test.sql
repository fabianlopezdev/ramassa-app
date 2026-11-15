-- The design role sees test players only, nothing about a real player (RAPP-615).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Through the tables: for every table that holds player-authored or
--      player-related rows, the design account (...097, Onboarding design
--      preset) reads 0 rows of a real player. The seed has real-player rows
--      in each of them, so every assertion can fail.
--   2. Through the functions: every function the design account can call
--      returns 0 rows of a real player, or refuses.
--   3. A test player's session (the design role signs in as one on a phone)
--      sees no forum post, reply, photo or story of a real player.
--   4. Team members with the permissions still see the same rows as before.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(53);

-- Real players and the rows that point at them, computed before any role switch.
create temp table real_player as
  select id from public.profiles where role in ('player', 'invited') and not is_test_account;
grant select on real_player to authenticated;

-- Counts a function's rows, or 0 when the function refuses the caller.
create function pg_temp.rows_or_refused(p_query text)
returns integer
language plpgsql
as $$
declare
  counted integer;
begin
  -- The row is read as text so every column is computed, raises included.
  execute format('select count(*)::integer from (%s) as result where result::text is not null', p_query)
    into counted;
  return counted;
exception
  when insufficient_privilege or no_data_found then
    return 0;
  when raise_exception then
    -- A refusal raised as a plain exception names who may call.
    if sqlerrm ~ '(STAFF_ONLY|_REQUIRED|^PERMISSIONS/|require staff access)' then
      return 0;
    end if;
    raise;
end;
$$;

-- The seed really holds real-player rows in the community tables.
select ok((select count(*) from public.forum_posts where author_id in (select id from real_player)) > 0,
  'the seed has forum posts by real players');
select ok((select count(*) from public.media_items where uploaded_by in (select id from real_player)) > 0,
  'the seed has a photo by a real player');

-- 1. Tables ----------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select is((select count(*)::int from public.profiles where id in (select id from real_player)), 0, 'profiles: no real player');
select is((select count(*)::int from public.forum_posts where author_id in (select id from real_player)), 0, 'forum_posts: no real player''s post');
select is((select count(*)::int from public.forum_replies where author_id in (select id from real_player)), 0, 'forum_replies: no real player''s reply');
select is((select count(*)::int from public.forum_flags where flagger_id in (select id from real_player)), 0, 'forum_flags: no real player''s flag');
select is((select count(*)::int from public.media_items where uploaded_by in (select id from real_player)), 0, 'media_items: no real player''s photo');
select is((select count(*)::int from public.knowledge_articles where author_id in (select id from real_player)), 0, 'knowledge_articles: no real player''s story');
select is((select count(*)::int from public.conversations where user_id in (select id from real_player)), 0, 'conversations: none');
select is((select count(*)::int from public.messages where sender_id in (select id from real_player)), 0, 'messages: none');
select is((select count(*)::int from public.conversation_assignment_history where user_id in (select id from real_player)), 0, 'conversation history: none');
select is((select count(*)::int from public.event_signups where player_id in (select id from real_player)), 0, 'event_signups: none');
select is((select count(*)::int from public.attendance where player_id in (select id from real_player)), 0, 'attendance: none');
select is((select count(*)::int from public.feedback_submissions where author_id in (select id from real_player)), 0, 'feedback: none');
select is((select count(*)::int from public.mentoring_requests where player_id in (select id from real_player)), 0, 'mentoring: none');
select is((select count(*)::int from public.survey_responses where player_id in (select id from real_player)), 0, 'survey responses: none');
select is((select count(*)::int from public.service_interests where user_id in (select id from real_player)), 0, 'service interests: none');
select is((select count(*)::int from public.push_tokens where user_id in (select id from real_player)), 0, 'push tokens: none');
select is((select count(*)::int from public.equipment_deliveries where profile_id in (select id from real_player)), 0, 'material handovers: none');
select is((select count(*)::int from public.custom_notification_group_members where participant_id in (select id from real_player)), 0, 'notification groups: none');
select is((select count(*)::int from public.targeted_notification_sends), 0, 'notification sends: none');
select is((select count(*)::int from public.terms_acceptances where profile_id in (select id from real_player)), 0, 'terms acceptances: none');
select is((select count(*)::int from public.participant_notes where profile_id in (select id from real_player)), 0, 'participant notes: none');
select is((select count(*)::int from public.deletion_requests where profile_id in (select id from real_player)), 0, 'deletion requests: none');
select is((select count(*)::int from public.authorization_signatures where profile_id in (select id from real_player)), 0, 'authorization signatures: none');
select is((select count(*)::int from public.consent_events where profile_id in (select id from real_player)), 0, 'consent events: none');
select is((select count(*)::int from public.app_terms_signatures where profile_id in (select id from real_player)), 0, 'app terms signatures: none');
select is((select count(*)::int from public.custom_answers where profile_id in (select id from real_player)), 0, 'custom answers: none');
select is((select count(*)::int from public.custom_question_states where profile_id in (select id from real_player)), 0, 'question states: none');
select is((select count(*)::int from public.entity_referrals), 0, 'referrals: none');
select is((select count(*)::int from public.walk_in_signings), 0, 'walk-in signings: none');
select is((select count(*)::int from public.invites), 0, 'invitations: none');
select is((select count(*)::int from public.audit_log), 0, 'audit log: none');

-- 2. Functions -------------------------------------------------------------------------------------

select is(
  (select count(*)::int from public.list_participants() where id in (select id from real_player)),
  0, 'list_participants: no real player'
);
select is(pg_temp.rows_or_refused($$ select * from public.get_participant_profile('5eed0000-0000-4000-8000-000000000011') $$),
  0, 'get_participant_profile: refused for a real player');
select is(pg_temp.rows_or_refused($$ select * from public.participant_activity('5eed0000-0000-4000-8000-000000000011') $$),
  0, 'participant_activity: nothing of a real player');
select is(pg_temp.rows_or_refused($$ select * from public.participant_custom_answers('5eed0000-0000-4000-8000-000000000011') $$),
  0, 'participant_custom_answers: refused for a real player');
select is(pg_temp.rows_or_refused($$ select * from public.participant_season_answers('5eed0000-0000-4000-8000-000000000011') $$),
  0, 'participant_season_answers: refused');
select is(pg_temp.rows_or_refused($$ select * from public.participant_material('5eed0000-0000-4000-8000-000000000011') $$),
  0, 'participant_material: refused');
select is(pg_temp.rows_or_refused($$ select * from public.list_staff_conversations(false, false, null, null) $$),
  0, 'list_staff_conversations: refused');
select is(pg_temp.rows_or_refused($$ select * from public.list_staff_feedback_submissions(null, null) $$),
  0, 'list_staff_feedback_submissions: refused');
select is(pg_temp.rows_or_refused($$ select * from public.list_staff_mentoring_requests() $$),
  0, 'list_staff_mentoring_requests: refused');
select is(pg_temp.rows_or_refused($$ select * from public.list_survey_responses('5eed0000-0000-4000-8040-000000000001') $$),
  0, 'list_survey_responses: refused');
select is(pg_temp.rows_or_refused($$ select * from public.list_staff_referrals() $$),
  0, 'list_staff_referrals: nothing');
select is(pg_temp.rows_or_refused($$ select * from public.list_forum_moderation_queue() $$),
  0, 'list_forum_moderation_queue: nothing');
select is(pg_temp.rows_or_refused($$ select public.get_impact_report(current_date - 90, current_date, null, null) $$),
  0, 'get_impact_report: refused');
select is(
  public.can_read_media_object('5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000011/2026/08/11111111111111111111111111111111.jpg'),
  false, 'can_read_media_object: a real player''s photo file is refused'
);
select throws_ok(
  $$ select public.start_player_preview() $$,
  '42501', null, 'start_player_preview: the design role cannot open a player session over real players'' content'
);

-- 3. A test player's own session ---------------------------------------------------------------------

reset role;
update public.profiles set role = 'player', terms_accepted_at = now()
 where id = '5eed0000-0000-4000-8000-000000000096';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000096", "role": "authenticated", "aal": "aal1"}';
select is((select count(*)::int from public.forum_posts where author_id in (select id from real_player)), 0,
  'a test player reads no real player''s forum post');
select is((select count(*)::int from public.media_items where uploaded_by in (select id from real_player)), 0,
  'a test player sees no real player''s photo');
select is((select count(*)::int from public.knowledge_articles where author_id in (select id from real_player)), 0,
  'a test player reads no real player''s story');

-- 4. Real team members and real players are unchanged ----------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated", "aal": "aal1"}';
select ok((select count(*) from public.forum_posts where author_id = '5eed0000-0000-4000-8000-000000000011') > 0,
  'a real player still reads another player''s forum post');
select ok((select count(*) from public.media_items where uploaded_by = '5eed0000-0000-4000-8000-000000000011') > 0,
  'a real player still sees a community photo');

select * from finish();
rollback;
