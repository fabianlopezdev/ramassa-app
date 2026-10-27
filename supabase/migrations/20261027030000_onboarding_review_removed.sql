-- RAPP-705: Onboarding is only for players who open the app for the first
-- time. This removes the review of Onboarding screens saved as a Nova versió
-- (RAPP-697, `20261026200000_onboarding_review.sql`).
--
-- WHY
--
-- A player who already has the app never goes through Onboarding screens
-- again. Saving an Onboarding screen only changes what players who have not
-- signed up yet will see. To ask existing players something new, the team
-- creates a form. Correcció and Nova versió stay on the forms: the app terms,
-- the season authorization and the team's own forms.
--
-- WHAT THIS MIGRATION DOES
--
--   1. Drops `complete_onboarding_review`, `participant_onboarding_review_pending`,
--      `mark_onboarding_screen_changed` and `onboarding_finished_count` (the
--      count the Onboarding Desa dialog showed).
--   2. Keeps `my_onboarding_review()` as a stub that always returns an empty
--      list. App builds already in the field call it at start; an empty list
--      lets them into the app, so an old build never blocks a player.
--   3. Drops `private.onboarding_review_screens`, the trigger that stamped
--      `profiles.onboarding_current_at`, and that column.
--   4. Drops `public.onboarding_screen_versions` and its erasure entry.
--   5. `private.record_onboarding_consents` loses `p_only_changes`, which only
--      the review used.
--
-- ORDER: apply this migration after the app update without the review is
-- live. An older build that calls `complete_onboarding_review` cannot reach
-- it any more, because `my_onboarding_review` never sends her there.

-- 1. The review's writers and readers ---------------------------------------------------------------------

drop function if exists public.complete_onboarding_review(jsonb);
drop function if exists public.participant_onboarding_review_pending(uuid);
drop function if exists public.mark_onboarding_screen_changed(text);
drop function if exists public.onboarding_finished_count();

-- 2. The stub older builds still call --------------------------------------------------------------------

-- Kept for app builds released before RAPP-705: they ask for her screens to
-- review at start. Nothing is ever pending, so they open the app as usual.
create or replace function public.my_onboarding_review()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array[]::text[];
$$;
comment on function public.my_onboarding_review() is
  'Stub for app builds before RAPP-705: Onboarding is never reviewed again, so the list is always empty.';
revoke all on function public.my_onboarding_review() from public, anon;
grant execute on function public.my_onboarding_review() to authenticated;

-- 3. Her review stamp -------------------------------------------------------------------------------------

drop function if exists private.onboarding_review_screens(uuid);
drop trigger if exists profiles_onboarding_current_on_joining on public.profiles;
drop function if exists private.onboarding_current_on_joining();
alter table public.profiles drop column if exists onboarding_current_at;

-- 4. The screens saved as a Nova versió -------------------------------------------------------------------

drop table if exists public.onboarding_screen_versions;

-- The body of `20261027010000_custom_forms_audience_repeat_drafts.sql`,
-- without `onboarding_screen_versions`.
CREATE OR REPLACE FUNCTION public.personal_data_disposition()
 RETURNS TABLE(table_name text, participant_column text, disposition text, reason text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select * from (values
    ('app_terms_signatures', 'profile_id', 'purge', 'The app terms signature and photo/video choice.'),
    ('profiles', 'id', 'purge', 'The participant profile and its encrypted fields.'),
    ('participant_notes', 'profile_id', 'purge', 'Staff prose about the participant.'),
    ('push_tokens', 'user_id', 'purge', 'Registered participant devices.'),
    ('push_deliveries', 'recipient_id', 'purge', 'Per-device notification delivery history.'),
    ('custom_notification_group_members', 'participant_id', 'purge', 'Curated notification membership.'),
    ('terms_acceptances', 'profile_id', 'purge', 'Participant consent records.'),
    ('deletion_requests', 'profile_id', 'purge', 'Participant erasure requests.'),
    ('invites', 'accepted_by', 'purge', 'The invitation that admitted the participant.'),
    ('entity_invitations', 'profile_id', 'purge', 'The invitation that admitted an entity collaborator.'),
    ('equipment_deliveries', 'profile_id', 'purge', 'Participant equipment history.'),
    ('event_signups', 'player_id', 'purge', 'Participant event activity.'),
    ('attendance', 'player_id', 'purge', 'Participant attendance history.'),
    ('service_interests', 'user_id', 'purge', 'Participant service interests.'),
    ('conversations', 'user_id', 'purge', 'Participant direct correspondence.'),
    ('messages', 'sender_id', 'purge', 'Participant-authored messages.'),
    ('conversation_read_states', 'user_id', 'purge', 'Participant message read history.'),
    ('conversation_assignment_history', 'user_id', 'purge', 'Participant conversation handling history.'),
    ('forum_posts', 'author_id', 'purge', 'Participant-authored forum posts.'),
    ('forum_replies', 'author_id', 'purge', 'Participant-authored forum replies.'),
    ('forum_flags', 'flagger_id', 'purge', 'Participant safety reports and optional comments.'),
    ('media_items', 'uploaded_by', 'purge', 'Participant gallery media and its consent record.'),
    ('entity_referrals', 'referred_profile_id', 'purge', 'Referral intake cascades with the linked participant.'),
    ('referral_updates', 'author_id', 'purge', 'Referral updates authored by the participant.'),
    ('mentoring_requests', 'player_id', 'purge', 'Private support requests belonging to the player.'),
    ('mentoring_notification_events', 'recipient_id', 'purge', 'Technical mentoring schedule notifications.'),
    ('feedback_submissions', 'author_id', 'purge', 'Encrypted feedback and its private attachment key.'),
    ('survey_responses', 'player_id', 'purge', 'Attributed encrypted survey responses.'),
    ('audit_log', 'actor_id', 'purge', 'Rows where the participant acted.'),
    ('audit_log', 'target_id', 'retain', 'Opaque lawful-access and erasure record.'),
    ('entity_referrals', null, 'retain_limited', 'Unlinked referral intake is purged after 24 months.'),
    ('entity_invitations', null, 'retain_limited', 'Expired entity invitations are purged after 24 months.'),
    ('notification_templates', null, 'not_personal', 'Organization-owned notification copy.'),
    ('custom_notification_groups', null, 'not_personal', 'Organization-owned audience definitions.'),
    ('targeted_notification_sends', null, 'not_personal', 'Aggregate organization send history.'),
    ('surveys', null, 'not_personal', 'Organization-owned survey definitions.'),
    ('survey_questions', null, 'not_personal', 'Organization-owned survey questions.'),
    ('staff_invitations', null, 'not_personal', 'Organization staff access administration history.'),
    ('internal_documents', null, 'not_personal', 'Organization-owned private operational documents.'),
    ('announcements', null, 'not_personal', 'Organization-owned operational content.'),
    ('event_categories', null, 'not_personal', 'Organization-owned event vocabulary.'),
    ('events', null, 'not_personal', 'Organization-owned schedules.'),
    ('event_occurrences', null, 'not_personal', 'Materialized organization schedules.'),
    ('knowledge_categories', null, 'not_personal', 'Organization-owned knowledge vocabulary.'),
    ('knowledge_articles', 'author_id', 'purge', 'Participant-authored knowledge stories.'),
    ('push_publications', 'recipient_id', 'purge', 'Recipient-specific push publications.'),
    ('service_categories', null, 'not_personal', 'Organization-owned service vocabulary.'),
    ('services', null, 'not_personal', 'Organization-owned directory content.'),
    ('service_images', null, 'not_personal', 'Organization-owned service media.'),
    ('service_submission_comments', null, 'not_personal', 'Organization review correspondence.'),
    ('service_submission_notifications', null, 'not_personal', 'Organization staff queue.'),
    ('forum_categories', null, 'not_personal', 'Organization-owned forum vocabulary.'),
    ('collaborating_entities', null, 'not_personal', 'A tenant-owned partner organization.'),
    ('organizations', null, 'not_personal', 'A tenant, not a person.'),
    ('municipality_catalog', null, 'not_personal', 'Official geography with no participant data.'),
    ('permissions', null, 'not_personal', 'The product permission catalog.'),
    ('permission_preset_defaults', null, 'not_personal', 'Product default permissions of the built-in presets.'),
    ('permission_presets', null, 'not_personal', 'Organization-owned access presets.'),
    ('permission_preset_permissions', null, 'not_personal', 'Organization-owned access presets.'),
    ('team_member_access', null, 'not_personal', 'Team access administration; players never hold permissions.'),
    ('team_member_permissions', null, 'not_personal', 'Team access administration; players never hold permissions.'),
    ('equipment_item_types', null, 'not_personal', 'The organization''s material catalog.'),
    ('stock_movements', 'participant_id', 'purge', 'Stock movements keep their quantity so stock stays right; her link is cleared by ON DELETE SET NULL.'),
    ('stock_alerts', null, 'not_personal', 'Stock that went below zero, for the team to count.'),
    ('equipment_arrivals', null, 'not_personal', 'Goods received: source, problems and cost. No participant data.'),
    ('equipment_arrival_photos', null, 'not_personal', 'Photos of goods received and their receipts.'),
    ('stock_counts', null, 'not_personal', 'Stock counts: what was expected and what was on the shelf.'),
    ('staff_checkouts', null, 'not_personal', 'Material lent to a staff member for a trip or an event.'),
    ('photo_handoffs', null, 'not_personal', 'A staff member''s request to take a document photo with the phone.'),
    ('seasons', null, 'not_personal', 'The organization''s seasons.'),
    ('authorization_versions', null, 'not_personal', 'The organization''s published authorization texts.'),
    ('app_terms_versions', null, 'not_personal', 'The organization''s app terms texts, draft and published.'),
    ('authorization_signatures', 'profile_id', 'purge', 'Her signed or paper authorizations, with her drawn signature.'),
    ('consent_events', 'profile_id', 'purge', 'Each consent she gave or withdrew, with the text she was shown. Anonymizing keeps them as proof without her name and clears a staff reason; deleting her account deletes them.'),
    ('consents', null, 'not_personal', 'The consents of the organization, defined once (Dades legals).'),
    ('consent_placements', null, 'not_personal', 'Where each consent is asked.'),
    ('walk_in_signings', null, 'retain_limited', 'A walk-in''s tablet signing until staff confirm it; purged after 60 days.'),
    ('intake_screens', null, 'not_personal', 'Registration screens staff built.'),
    ('profile_sections', null, 'not_personal', 'Sections of the player profile layout.'),
    ('profile_fields', null, 'not_personal', 'The pieces of information the profile holds, and who created each.'),
    ('field_placements', null, 'not_personal', 'Where each piece of information is asked.'),
    ('form_blocks', null, 'not_personal', 'The signature blocks of the forms and the text each asks to accept.'),
    ('form_signatures', 'profile_id', 'purge', 'Her signatures of the form blocks, and the entity''s for her on a referral, with the strokes.'),
    ('walk_in_consents', null, 'retain_limited', 'A walk-in''s ticks of the Onboarding consents on the tablet until staff confirm her; moved to her consent history then, or purged with the walk-in.'),
    ('walk_in_form_signatures', null, 'retain_limited', 'A walk-in''s signatures of the Onboarding blocks until staff confirm her; moved to her profile then, or purged with the walk-in.'),
    ('custom_question_options', null, 'not_personal', 'Options of those questions.'),
    ('intake_builtin_screens', null, 'not_personal', 'Staff wording of the built-in onboarding screens and which are hidden.'),
    ('intake_flow_orders', null, 'not_personal', 'The order of the onboarding screens staff arranged.'),
    ('intake_state_presets', null, 'not_personal', 'Organization presets for which questions are asked.'),
    ('custom_answers', 'profile_id', 'purge', 'Every answer of her record, the app''s fields and the team''s. Anonymizing deletes them all and keeps only her birth year.'),
    ('referral_custom_answers', null, 'retain_limited', 'Extra answers sent with a referral; moved to her profile when she is invited, or purged with the referral.'),
    ('custom_question_states', 'profile_id', 'purge', 'Which fields staff chose to ask or not ask her, the app''s and the team''s.'),
    ('participant_search_documents', 'profile_id', 'purge', 'Her names and her Normal and Personal text answers, indexed for the participants search.'),
    ('staff_notifications', null, 'not_personal', 'The team''s bell: one row per team member; names render live from the source row and params hold no personal value.'),
    ('custom_forms', null, 'not_personal', 'Forms the team created: their names and choices.'),
    ('custom_form_screens', null, 'not_personal', 'The screens of the forms the team created.'),
    ('custom_form_responses', 'profile_id', 'purge', 'Each time she was asked a form, and when and by whom it was answered.'),
    ('custom_form_recipients', 'profile_id', 'purge', 'The forms the team picked her for.'),
    ('custom_form_versions', null, 'not_personal', 'The forms the team created as each was published.'),
    ('custom_form_reminders', null, 'not_personal', 'When the team was reminded to renew a repeating form.')
  ) as disposition(table_name, participant_column, disposition, reason);
$function$;


-- 5. Her Onboarding consents, without the review's option ---------------------------------------------------

drop function private.record_onboarding_consents(uuid, jsonb, text, text[], boolean);
create function private.record_onboarding_consents(
  p_profile_id uuid, p_consents jsonb, p_language text, p_screens text[] default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  her public.profiles;
  shown record;
begin
  select * into her from public.profiles where id = p_profile_id;
  for shown in
    select * from private.onboarding_consents_shown(
      her.org_id, p_consents, coalesce(nullif(p_language, ''), her.preferred_language), p_screens)
  loop
    insert into public.consent_events
      (org_id, profile_id, consent_id, consent_key, granted, method, language, wording, required,
       form, screen_key)
    values (her.org_id, her.id, shown.consent_id, shown.consent_key, shown.granted, 'app',
            shown.language, shown.wording, shown.required, 'onboarding', shown.screen_key);
    perform private.apply_consent_effects(her.id, shown.consent_key, shown.granted, her.id);
  end loop;
end;
$$;
revoke all on function private.record_onboarding_consents(uuid, jsonb, text, text[]) from public, anon, authenticated;
