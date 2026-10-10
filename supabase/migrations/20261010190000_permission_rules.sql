-- Every team access rule reads permissions (RAPP-230, part of RAPP-211).
--
-- WHY
--
-- RAPP-229 added the permission catalog, presets and toggles without changing
-- anybody's access. This migration moves every row policy and function that
-- checked the fixed roles (`is_staff_or_admin()`, `is_admin()` and literal
-- `role in ('staff', 'admin')` recipient checks) to the permission that names
-- its job, then drops the two old helpers so nothing can keep using them.
--
-- WHO KEEPS WHAT
--
-- A rule that staff could pass now asks for a permission in the Staff preset,
-- and a rule only admins could pass asks for one outside it. Staff hold the
-- Staff preset and admins hold all 42, so their access stays the same, with
-- these exceptions decided by Fabián on 2026-10-10 (RAPP-230):
--   - the 4 encrypted fields (participants.view_sensitive) and RGPD erasure
--     (rgpd.erase): today's staff keep them as an adjustment ("Staff,
--     adjusted"); a new staff member gets the plain Staff preset without them;
--   - internal documents (settings.documents), the audit log (audit.view) and
--     partner entity invitations (entities.manage) follow the web admin, which
--     only ever showed them to admins;
--   - permanent deletion of a participant, and the direct profile delete, need
--     rgpd.erase AND team.manage, so the staff adjustment does not grant it.
--
-- WHAT IS NEW, NOT ONLY MOVED
--
--   - Edit and publish are separate for announcements, events, knowledge and
--     services: publishing, scheduling or unpublishing needs the "publish"
--     permission, and approving or rejecting an entity's service needs
--     services.review.
--   - get_participant_profile returns Personal fields only with
--     participants.view_personal and decrypts the Sensitive ones only with
--     participants.view_sensitive. update_participant_profile keeps the stored
--     Sensitive values for a caller without that permission.
--   - Organization settings: name, contacts and languages need
--     settings.organization; logo and colours need settings.branding.
--   - Alerts and assignments go to people with the permission for the job
--     (forum flags: forum.moderate; referral updates: referrals.manage;
--     conversations: messages.inbox; mentoring: mentoring.manage).
--
-- The policy and function bodies below were generated from the live
-- definitions, so the only differences from the previous migrations are the
-- checks themselves. Row filters on `profiles` columns (Basic versus Personal
-- fields read directly from the table) are RAPP-240.

-- Helpers -------------------------------------------------------------------------------

-- An active team member holding at least one permission. For organization
-- reference data every job needs (category lists, partner entity names,
-- participants' names), where no single permission names the job.
create or replace function public.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_member_permissions as grant_row
    join public.profiles as profile on profile.id = grant_row.profile_id
    where grant_row.profile_id = (select auth.uid())
      and grant_row.org_id = profile.org_id
      and profile.is_active
      and profile.role in ('staff', 'admin')
  );
$$;

revoke all on function public.is_team_member() from public, anon;
grant execute on function public.is_team_member() to authenticated;

-- Whether SOMEONE ELSE holds a permission: the recipient of an alert or the
-- person a conversation or mentoring request is assigned to.
create or replace function private.profile_has_permission(p_profile_id uuid, p_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_member_permissions as grant_row
    join public.profiles as profile on profile.id = grant_row.profile_id
    where grant_row.profile_id = p_profile_id
      and grant_row.permission_code = p_code
      and grant_row.org_id = profile.org_id
      and profile.is_active
      and profile.role in ('staff', 'admin')
  );
$$;

revoke all on function private.profile_has_permission(uuid, text) from public, anon, authenticated;

-- Today's staff keep the sensitive fields and RGPD erasure (decision above).
-- Their preset stays Staff, so the Team screen shows them as "Staff, adjusted".
insert into public.team_member_permissions (org_id, profile_id, permission_code)
select profile.org_id, profile.id, code
from public.profiles as profile
cross join unnest(array['participants.view_sensitive', 'rgpd.erase']) as code
where profile.role = 'staff'
on conflict do nothing;

-- Publishing needs the "publish" permission ----------------------------------------------

-- Publishing, scheduling and unpublishing content: a change to the status, the
-- published flag, or the publish and expiry times. Applies to team members
-- writing directly; SECURITY DEFINER functions run as their owner and check
-- their own permission.
create or replace function private.guard_content_publish()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  publish_code text := tg_argv[0];
  new_row jsonb := to_jsonb(new);
  old_row jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  touches_publication boolean;
begin
  if current_user not in ('authenticated', 'anon') or not (select public.is_team_member()) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    touches_publication := new_row ->> 'status' = 'published'
      or (new_row ->> 'is_published')::boolean is true;
  else
    touches_publication := new_row -> 'status' is distinct from old_row -> 'status'
      or new_row -> 'is_published' is distinct from old_row -> 'is_published'
      or new_row -> 'published_at' is distinct from old_row -> 'published_at'
      or new_row -> 'expires_at' is distinct from old_row -> 'expires_at';
  end if;

  if touches_publication and not (select public.has_permission(publish_code)) then
    raise insufficient_privilege using message = 'publishing needs ' || publish_code;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_content_publish() from public, anon, authenticated;

create trigger announcements_guard_publish
  before insert or update on public.announcements
  for each row execute function private.guard_content_publish('announcements.publish');

create trigger events_guard_publish
  before insert or update on public.events
  for each row execute function private.guard_content_publish('events.publish');

create trigger knowledge_articles_guard_publish
  before insert or update on public.knowledge_articles
  for each row execute function private.guard_content_publish('knowledge.publish');

-- Row policies (generated) ------------------------------------------------------------------

alter policy announcements_delete_org_staff on public.announcements
  using ((( SELECT public.has_permission('announcements.publish'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id))));

alter policy announcements_insert_org_staff on public.announcements
  with check (((( SELECT public.has_permission('announcements.edit'::text) AS has_permission) OR ( SELECT public.has_permission('announcements.publish'::text) AS has_permission)) AND (org_id = ( SELECT current_org_id() AS current_org_id)) AND (created_by = ( SELECT auth.uid() AS uid))));

alter policy announcements_select_org_staff_or_visible_player on public.announcements
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ((( SELECT public.has_permission('announcements.edit'::text) AS has_permission) OR ( SELECT public.has_permission('announcements.publish'::text) AS has_permission)) OR ((( SELECT current_app_role() AS current_app_role) = 'player'::text) AND is_content_visible(status, published_at, expires_at)))));

alter policy announcements_update_org_staff on public.announcements
  using (((( SELECT public.has_permission('announcements.edit'::text) AS has_permission) OR ( SELECT public.has_permission('announcements.publish'::text) AS has_permission)) AND (org_id = ( SELECT current_org_id() AS current_org_id))))
  with check (((( SELECT public.has_permission('announcements.edit'::text) AS has_permission) OR ( SELECT public.has_permission('announcements.publish'::text) AS has_permission)) AND (org_id = ( SELECT current_org_id() AS current_org_id))));

alter policy attendance_insert_org_staff on public.attendance
  with check ((( SELECT public.has_permission('attendance.mark'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id)) AND (marked_by = ( SELECT auth.uid() AS uid))));

alter policy attendance_select_self_staff_or_referring_entity on public.attendance
  using (((player_id = ( SELECT auth.uid() AS uid)) OR ((org_id = ( SELECT current_org_id() AS current_org_id)) AND ((( SELECT public.has_permission('attendance.mark'::text) AS has_permission) OR ( SELECT public.has_permission('attendance.reports'::text) AS has_permission) OR ( SELECT public.has_permission('participants.view'::text) AS has_permission)) OR (EXISTS ( SELECT 1
   FROM entity_referrals referral
  WHERE ((referral.org_id = attendance.org_id) AND (referral.referred_profile_id = attendance.player_id) AND (referral.collaborating_entity_id = ( SELECT current_collaborating_entity_id() AS current_collaborating_entity_id)))))))));

alter policy attendance_update_org_staff on public.attendance
  using ((( SELECT public.has_permission('attendance.mark'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id))))
  with check ((( SELECT public.has_permission('attendance.mark'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id))));

alter policy audit_log_select_org_staff on public.audit_log
  using ((( SELECT public.has_permission('audit.view'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id))));

alter policy collaborating_entities_select_own_or_staff on public.collaborating_entities
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ((id = ( SELECT current_collaborating_entity_id() AS current_collaborating_entity_id)) OR ( SELECT public.is_team_member() AS is_team_member))));

alter policy conversation_assignment_history_select_staff on public.conversation_assignment_history
  using ((( SELECT public.has_permission('messages.inbox'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id))));

alter policy conversations_select_participant_or_staff on public.conversations
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.has_permission('messages.inbox'::text) AS has_permission))));

alter policy custom_notification_group_members_select_staff on public.custom_notification_group_members
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ( SELECT public.has_permission('notifications.send'::text) AS has_permission)));

alter policy custom_notification_groups_select_staff on public.custom_notification_groups
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ( SELECT public.has_permission('notifications.send'::text) AS has_permission)));

alter policy deletion_requests_select_self_or_org_staff on public.deletion_requests
  using (((profile_id = ( SELECT auth.uid() AS uid)) OR (( SELECT public.has_permission('rgpd.erase'::text) AS has_permission) AND (EXISTS ( SELECT 1
   FROM profiles subject
  WHERE ((subject.id = deletion_requests.profile_id) AND (subject.org_id = ( SELECT current_org_id() AS current_org_id))))))));

alter policy entity_invitations_select_org_staff on public.entity_invitations
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ( SELECT public.has_permission('entities.manage'::text) AS has_permission)));

alter policy entity_referrals_select_own_entity_or_staff on public.entity_referrals
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ((collaborating_entity_id = ( SELECT current_collaborating_entity_id() AS current_collaborating_entity_id)) OR ( SELECT public.has_permission('referrals.manage'::text) AS has_permission))));

alter policy equipment_deliveries_insert_org_staff on public.equipment_deliveries
  with check ((( SELECT public.has_permission('equipment.handover'::text) AS has_permission) AND (delivered_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM profiles subject
  WHERE ((subject.id = equipment_deliveries.profile_id) AND (subject.org_id = ( SELECT current_org_id() AS current_org_id)))))));

alter policy equipment_deliveries_select_org_staff on public.equipment_deliveries
  using (((( SELECT public.has_permission('equipment.handover'::text) AS has_permission) OR ( SELECT public.has_permission('participants.view'::text) AS has_permission)) AND (EXISTS ( SELECT 1
   FROM profiles subject
  WHERE ((subject.id = equipment_deliveries.profile_id) AND (subject.org_id = ( SELECT current_org_id() AS current_org_id)))))));

alter policy event_categories_delete_org_staff on public.event_categories
  using ((( SELECT public.has_permission('events.edit'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id))));

alter policy event_categories_insert_org_staff on public.event_categories
  with check ((( SELECT public.has_permission('events.edit'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id))));

alter policy event_categories_select_org_staff_or_player on public.event_categories
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND (( SELECT public.is_team_member() AS is_team_member) OR (( SELECT current_app_role() AS current_app_role) = 'player'::text))));

alter policy event_categories_update_org_staff on public.event_categories
  using ((( SELECT public.has_permission('events.edit'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id))))
  with check ((( SELECT public.has_permission('events.edit'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id))));

alter policy event_occurrences_select_org_staff_visible_or_attended_player on public.event_occurrences
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ((( SELECT public.has_permission('events.edit'::text) AS has_permission) OR ( SELECT public.has_permission('events.publish'::text) AS has_permission) OR ( SELECT public.has_permission('attendance.mark'::text) AS has_permission) OR ( SELECT public.has_permission('attendance.reports'::text) AS has_permission)) OR ((( SELECT current_app_role() AS current_app_role) = 'player'::text) AND ((EXISTS ( SELECT 1
   FROM events
  WHERE ((events.id = event_occurrences.event_id) AND (events.org_id = event_occurrences.org_id) AND is_content_visible(events.status, events.published_at, events.expires_at)))) OR (EXISTS ( SELECT 1
   FROM attendance
  WHERE ((attendance.occurrence_id = event_occurrences.id) AND (attendance.player_id = ( SELECT auth.uid() AS uid))))))))));

alter policy event_signups_select_org_staff_or_self on public.event_signups
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ((( SELECT public.has_permission('events.edit'::text) AS has_permission) OR ( SELECT public.has_permission('events.publish'::text) AS has_permission) OR ( SELECT public.has_permission('attendance.mark'::text) AS has_permission) OR ( SELECT public.has_permission('attendance.reports'::text) AS has_permission) OR ( SELECT public.has_permission('participants.view'::text) AS has_permission)) OR ((( SELECT current_app_role() AS current_app_role) = 'player'::text) AND (player_id = ( SELECT auth.uid() AS uid))))));

alter policy events_delete_org_staff on public.events
  using ((( SELECT public.has_permission('events.publish'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id))));

alter policy events_insert_org_staff on public.events
  with check (((( SELECT public.has_permission('events.edit'::text) AS has_permission) OR ( SELECT public.has_permission('events.publish'::text) AS has_permission)) AND (org_id = ( SELECT current_org_id() AS current_org_id)) AND (created_by = ( SELECT auth.uid() AS uid))));

alter policy events_select_org_staff_player_or_entity on public.events
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ((( SELECT public.has_permission('events.edit'::text) AS has_permission) OR ( SELECT public.has_permission('events.publish'::text) AS has_permission) OR ( SELECT public.has_permission('attendance.mark'::text) AS has_permission) OR ( SELECT public.has_permission('attendance.reports'::text) AS has_permission)) OR ((( SELECT current_app_role() AS current_app_role) = 'player'::text) AND (is_content_visible(status, published_at, expires_at) OR ( SELECT has_own_attendance_for_event(events.id) AS has_own_attendance_for_event))) OR ((( SELECT current_app_role() AS current_app_role) = 'entity'::text) AND (( SELECT current_collaborating_entity_id() AS current_collaborating_entity_id) IS NOT NULL) AND is_content_visible(status, published_at, expires_at) AND (starts_at >= now())))));

alter policy events_update_org_staff on public.events
  using (((( SELECT public.has_permission('events.edit'::text) AS has_permission) OR ( SELECT public.has_permission('events.publish'::text) AS has_permission)) AND (org_id = ( SELECT current_org_id() AS current_org_id))))
  with check (((( SELECT public.has_permission('events.edit'::text) AS has_permission) OR ( SELECT public.has_permission('events.publish'::text) AS has_permission)) AND (org_id = ( SELECT current_org_id() AS current_org_id))));

alter policy feedback_submissions_select_owner_or_staff on public.feedback_submissions
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ((author_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.has_permission('feedback.view'::text) AS has_permission))));

alter policy forum_categories_delete_staff on public.forum_categories
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ( SELECT public.has_permission('forum.moderate'::text) AS has_permission)));

alter policy forum_categories_insert_staff on public.forum_categories
  with check (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ( SELECT public.has_permission('forum.moderate'::text) AS has_permission)));

alter policy forum_categories_update_staff on public.forum_categories
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ( SELECT public.has_permission('forum.moderate'::text) AS has_permission)))
  with check (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ( SELECT public.has_permission('forum.moderate'::text) AS has_permission)));

alter policy forum_flags_select_own_or_staff on public.forum_flags
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ((flagger_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.has_permission('forum.moderate'::text) AS has_permission))));

alter policy forum_flags_update_staff on public.forum_flags
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ( SELECT public.has_permission('forum.moderate'::text) AS has_permission)))
  with check (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ( SELECT public.has_permission('forum.moderate'::text) AS has_permission)));

alter policy forum_posts_delete_staff on public.forum_posts
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ( SELECT public.has_permission('forum.moderate'::text) AS has_permission)));

alter policy forum_posts_insert_player_or_staff on public.forum_posts
  with check (((org_id = ( SELECT current_org_id() AS current_org_id)) AND (author_id = ( SELECT auth.uid() AS uid)) AND (visibility = 'visible'::text) AND (NOT is_pinned) AND (flag_count = 0) AND (reply_count = 0) AND (( SELECT public.has_permission('forum.moderate'::text) AS has_permission) OR ((( SELECT current_app_role() AS current_app_role) = 'player'::text) AND (EXISTS ( SELECT 1
   FROM profiles actor
  WHERE ((actor.id = ( SELECT auth.uid() AS uid)) AND (actor.org_id = forum_posts.org_id) AND actor.is_active AND (NOT actor.is_forum_banned))))))));

alter policy forum_posts_select_org_member on public.forum_posts
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ((visibility = ANY (ARRAY['visible'::text, 'deleted'::text])) OR ( SELECT public.has_permission('forum.moderate'::text) AS has_permission))));

alter policy forum_posts_update_author_or_staff on public.forum_posts
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ((author_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.has_permission('forum.moderate'::text) AS has_permission))))
  with check (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ((author_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.has_permission('forum.moderate'::text) AS has_permission))));

alter policy forum_replies_delete_staff on public.forum_replies
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ( SELECT public.has_permission('forum.moderate'::text) AS has_permission)));

alter policy forum_replies_insert_player_or_staff on public.forum_replies
  with check (((org_id = ( SELECT current_org_id() AS current_org_id)) AND (author_id = ( SELECT auth.uid() AS uid)) AND (visibility = 'visible'::text) AND (flag_count = 0) AND (EXISTS ( SELECT 1
   FROM forum_posts post
  WHERE ((post.org_id = forum_replies.org_id) AND (post.id = forum_replies.post_id) AND (post.visibility = 'visible'::text)))) AND (( SELECT public.has_permission('forum.moderate'::text) AS has_permission) OR ((( SELECT current_app_role() AS current_app_role) = 'player'::text) AND (EXISTS ( SELECT 1
   FROM profiles actor
  WHERE ((actor.id = ( SELECT auth.uid() AS uid)) AND (actor.org_id = forum_replies.org_id) AND actor.is_active AND (NOT actor.is_forum_banned))))))));

alter policy forum_replies_select_org_member on public.forum_replies
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND (( SELECT public.has_permission('forum.moderate'::text) AS has_permission) OR ((visibility = ANY (ARRAY['visible'::text, 'deleted'::text])) AND (EXISTS ( SELECT 1
   FROM forum_posts post
  WHERE ((post.org_id = forum_replies.org_id) AND (post.id = forum_replies.post_id) AND (post.visibility = ANY (ARRAY['visible'::text, 'deleted'::text])))))))));

alter policy forum_replies_update_staff on public.forum_replies
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ( SELECT public.has_permission('forum.moderate'::text) AS has_permission)))
  with check (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ( SELECT public.has_permission('forum.moderate'::text) AS has_permission)));

alter policy internal_documents_select_org_staff on public.internal_documents
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ( SELECT public.has_permission('settings.documents'::text) AS has_permission)));

alter policy invites_select_org_staff on public.invites
  using ((( SELECT public.has_permission('participants.invite'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id))));

alter policy knowledge_articles_delete_org_staff on public.knowledge_articles
  using ((( SELECT public.has_permission('knowledge.publish'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id))));

alter policy knowledge_articles_insert_org_staff_or_own_story on public.knowledge_articles
  with check (((org_id = ( SELECT current_org_id() AS current_org_id)) AND (created_by = ( SELECT auth.uid() AS uid)) AND ((( SELECT public.has_permission('knowledge.edit'::text) AS has_permission) OR ( SELECT public.has_permission('knowledge.publish'::text) AS has_permission)) OR ((( SELECT current_app_role() AS current_app_role) = 'player'::text) AND (content_type = 'participant_story'::text) AND (author_id = ( SELECT auth.uid() AS uid)) AND (story_status = 'submitted'::text) AND (NOT is_published) AND (published_at IS NULL) AND (expires_at IS NULL) AND (reviewer_note IS NULL) AND (submission_language = ANY (ARRAY['ca'::text, 'es'::text, 'en'::text, 'ar'::text, 'fa'::text])) AND (title ? submission_language) AND (body ? submission_language) AND (publication_consent = true) AND (publication_consent_at IS NOT NULL) AND (publication_consent_version = 'story-publication-v1'::text) AND is_story_image_urls_valid(story_image_urls, org_id, author_id)))));

alter policy knowledge_articles_select_org_staff_visible_or_own_story on public.knowledge_articles
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ((( SELECT public.has_permission('knowledge.edit'::text) AS has_permission) OR ( SELECT public.has_permission('knowledge.publish'::text) AS has_permission)) OR ((( SELECT current_app_role() AS current_app_role) = 'player'::text) AND ((is_published AND (published_at <= now()) AND ((expires_at IS NULL) OR (expires_at > now()))) OR ((content_type = 'participant_story'::text) AND (author_id = ( SELECT auth.uid() AS uid))))))));

alter policy knowledge_articles_update_org_staff on public.knowledge_articles
  using (((( SELECT public.has_permission('knowledge.edit'::text) AS has_permission) OR ( SELECT public.has_permission('knowledge.publish'::text) AS has_permission)) AND (org_id = ( SELECT current_org_id() AS current_org_id))))
  with check (((( SELECT public.has_permission('knowledge.edit'::text) AS has_permission) OR ( SELECT public.has_permission('knowledge.publish'::text) AS has_permission)) AND (org_id = ( SELECT current_org_id() AS current_org_id))));

alter policy knowledge_categories_delete_org_staff on public.knowledge_categories
  using ((( SELECT public.has_permission('knowledge.edit'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id))));

alter policy knowledge_categories_insert_org_staff on public.knowledge_categories
  with check ((( SELECT public.has_permission('knowledge.edit'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id))));

alter policy knowledge_categories_select_org_staff_or_player on public.knowledge_categories
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND (( SELECT public.is_team_member() AS is_team_member) OR (( SELECT current_app_role() AS current_app_role) = 'player'::text))));

alter policy knowledge_categories_update_org_staff on public.knowledge_categories
  using ((( SELECT public.has_permission('knowledge.edit'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id))))
  with check ((( SELECT public.has_permission('knowledge.edit'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id))));

alter policy media_items_select_tenant_privacy on public.media_items
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ((( SELECT public.has_permission('gallery.moderate'::text) AS has_permission) OR ( SELECT public.has_permission('forum.moderate'::text) AS has_permission) OR ( SELECT public.has_permission('knowledge.edit'::text) AS has_permission) OR ( SELECT public.has_permission('knowledge.publish'::text) AS has_permission)) OR ((moderation_state = 'visible'::text) AND ((uploaded_by = ( SELECT auth.uid() AS uid)) OR (privacy_level = 'community'::text))))));

alter policy media_items_update_staff_moderation on public.media_items
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND (( SELECT public.has_permission('gallery.moderate'::text) AS has_permission) OR ( SELECT public.has_permission('forum.moderate'::text) AS has_permission))))
  with check (((org_id = ( SELECT current_org_id() AS current_org_id)) AND (( SELECT public.has_permission('gallery.moderate'::text) AS has_permission) OR ( SELECT public.has_permission('forum.moderate'::text) AS has_permission))));

alter policy mentoring_requests_select_owner_or_staff on public.mentoring_requests
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ((player_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.has_permission('mentoring.manage'::text) AS has_permission))));

alter policy messages_insert_participant_or_staff on public.messages
  with check (((sender_id = ( SELECT auth.uid() AS uid)) AND (org_id = ( SELECT current_org_id() AS current_org_id)) AND (EXISTS ( SELECT 1
   FROM conversations conversation
  WHERE ((conversation.id = messages.conversation_id) AND (conversation.org_id = messages.org_id) AND ((conversation.user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.has_permission('messages.inbox'::text) AS has_permission)))))));

alter policy messages_select_participant_or_staff on public.messages
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND (EXISTS ( SELECT 1
   FROM conversations conversation
  WHERE ((conversation.id = messages.conversation_id) AND (conversation.org_id = messages.org_id) AND ((conversation.user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.has_permission('messages.inbox'::text) AS has_permission)))))));

alter policy notification_templates_select_staff on public.notification_templates
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ( SELECT public.has_permission('notifications.send'::text) AS has_permission)));

alter policy organizations_update_admin on public.organizations
  using (((id = ( SELECT current_org_id() AS current_org_id)) AND (( SELECT public.has_permission('settings.organization'::text) AS has_permission) OR ( SELECT public.has_permission('settings.branding'::text) AS has_permission))))
  with check (((id = ( SELECT current_org_id() AS current_org_id)) AND (( SELECT public.has_permission('settings.organization'::text) AS has_permission) OR ( SELECT public.has_permission('settings.branding'::text) AS has_permission))));

alter policy participant_notes_insert_org_staff on public.participant_notes
  with check ((( SELECT public.has_permission('participants.notes'::text) AS has_permission) AND (author_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM profiles subject
  WHERE ((subject.id = participant_notes.profile_id) AND (subject.org_id = ( SELECT current_org_id() AS current_org_id)))))));

alter policy participant_notes_select_org_staff on public.participant_notes
  using ((( SELECT public.has_permission('participants.notes'::text) AS has_permission) AND (EXISTS ( SELECT 1
   FROM profiles subject
  WHERE ((subject.id = participant_notes.profile_id) AND (subject.org_id = ( SELECT current_org_id() AS current_org_id)))))));

alter policy profiles_delete_org_staff on public.profiles
  using (((( SELECT public.has_permission('rgpd.erase'::text) AS has_permission) AND ( SELECT public.has_permission('team.manage'::text) AS has_permission)) AND (org_id = ( SELECT current_org_id() AS current_org_id))));

alter policy profiles_insert_org_staff on public.profiles
  with check ((( SELECT public.has_permission('participants.invite'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id))));

alter policy profiles_select_self_or_org_staff on public.profiles
  using (((id = ( SELECT auth.uid() AS uid)) OR (( SELECT public.is_team_member() AS is_team_member) AND (org_id = ( SELECT current_org_id() AS current_org_id)))));

alter policy profiles_update_org_staff on public.profiles
  using ((( SELECT public.has_permission('participants.view_personal'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id))))
  with check ((( SELECT public.has_permission('participants.view_personal'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id))));

alter policy push_tokens_select_self_or_org_staff on public.push_tokens
  using (((user_id = ( SELECT auth.uid() AS uid)) OR (( SELECT public.has_permission('notifications.send'::text) AS has_permission) AND ( SELECT user_is_in_current_org(push_tokens.user_id) AS user_is_in_current_org))));

alter policy referral_updates_select_own_entity_or_staff on public.referral_updates
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND (( SELECT public.has_permission('referrals.manage'::text) AS has_permission) OR (EXISTS ( SELECT 1
   FROM entity_referrals referral
  WHERE ((referral.org_id = referral_updates.org_id) AND (referral.id = referral_updates.referral_id) AND (referral.collaborating_entity_id = ( SELECT current_collaborating_entity_id() AS current_collaborating_entity_id))))))));

alter policy service_categories_delete_org_staff on public.service_categories
  using ((( SELECT public.has_permission('services.edit'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id))));

alter policy service_categories_insert_org_staff on public.service_categories
  with check ((( SELECT public.has_permission('services.edit'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id))));

alter policy service_categories_update_org_staff on public.service_categories
  using ((( SELECT public.has_permission('services.edit'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id))))
  with check ((( SELECT public.has_permission('services.edit'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id))));

alter policy service_images_delete_staff_or_own_entity_service on public.service_images
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND (EXISTS ( SELECT 1
   FROM services service
  WHERE ((service.org_id = service_images.org_id) AND (service.id = service_images.service_id) AND ((( SELECT public.has_permission('services.edit'::text) AS has_permission) OR ( SELECT public.has_permission('services.review'::text) AS has_permission)) OR (service.submitted_by = ( SELECT auth.uid() AS uid))))))));

alter policy service_images_insert_staff_or_own_entity_service on public.service_images
  with check (((org_id = ( SELECT current_org_id() AS current_org_id)) AND (EXISTS ( SELECT 1
   FROM services service
  WHERE ((service.org_id = service_images.org_id) AND (service.id = service_images.service_id) AND ((( SELECT public.has_permission('services.edit'::text) AS has_permission) OR ( SELECT public.has_permission('services.review'::text) AS has_permission)) OR (service.submitted_by = ( SELECT auth.uid() AS uid))))))));

alter policy service_images_update_staff_or_own_entity_service on public.service_images
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND (EXISTS ( SELECT 1
   FROM services service
  WHERE ((service.org_id = service_images.org_id) AND (service.id = service_images.service_id) AND ((( SELECT public.has_permission('services.edit'::text) AS has_permission) OR ( SELECT public.has_permission('services.review'::text) AS has_permission)) OR (service.submitted_by = ( SELECT auth.uid() AS uid))))))))
  with check (((org_id = ( SELECT current_org_id() AS current_org_id)) AND (EXISTS ( SELECT 1
   FROM services service
  WHERE ((service.org_id = service_images.org_id) AND (service.id = service_images.service_id) AND ((( SELECT public.has_permission('services.edit'::text) AS has_permission) OR ( SELECT public.has_permission('services.review'::text) AS has_permission)) OR (service.submitted_by = ( SELECT auth.uid() AS uid))))))));

alter policy service_interests_select_self_or_staff on public.service_interests
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ((( SELECT public.has_permission('services.edit'::text) AS has_permission) OR ( SELECT public.has_permission('services.publish'::text) AS has_permission) OR ( SELECT public.has_permission('notifications.send'::text) AS has_permission) OR ( SELECT public.has_permission('participants.view'::text) AS has_permission)) OR (user_id = ( SELECT auth.uid() AS uid)))));

alter policy service_submission_comments_insert_thread on public.service_submission_comments
  with check (((org_id = ( SELECT current_org_id() AS current_org_id)) AND (author_id = ( SELECT auth.uid() AS uid)) AND (author_role = ( SELECT current_app_role() AS current_app_role)) AND (EXISTS ( SELECT 1
   FROM services service
  WHERE ((service.org_id = service_submission_comments.org_id) AND (service.id = service_submission_comments.service_id) AND ((( SELECT public.has_permission('services.review'::text) AS has_permission) AND (service_submission_comments.author_role = ANY (ARRAY['staff'::text, 'admin'::text]))) OR ((( SELECT current_app_role() AS current_app_role) = 'entity'::text) AND (service_submission_comments.author_role = 'entity'::text) AND (NOT service_submission_comments.is_internal) AND (service.submitted_by = ( SELECT auth.uid() AS uid)))))))));

alter policy service_submission_comments_select_thread on public.service_submission_comments
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND (( SELECT public.has_permission('services.review'::text) AS has_permission) OR ((( SELECT current_app_role() AS current_app_role) = 'entity'::text) AND (NOT is_internal) AND (EXISTS ( SELECT 1
   FROM services service
  WHERE ((service.org_id = service_submission_comments.org_id) AND (service.id = service_submission_comments.service_id) AND (service.submitted_by = ( SELECT auth.uid() AS uid)))))))));

alter policy service_submission_notifications_insert_staff_decision on public.service_submission_notifications
  with check ((( SELECT public.has_permission('services.review'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id)) AND (kind = ANY (ARRAY['approved'::text, 'rejected'::text])) AND (created_by = ( SELECT auth.uid() AS uid)) AND (recipient_id IS NOT NULL)));

alter policy service_submission_notifications_select_staff on public.service_submission_notifications
  using ((( SELECT public.has_permission('services.review'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id))));

alter policy service_submission_notifications_update_staff on public.service_submission_notifications
  using ((( SELECT public.has_permission('services.review'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id))))
  with check ((( SELECT public.has_permission('services.review'::text) AS has_permission) AND (org_id = ( SELECT current_org_id() AS current_org_id)) AND (read_by = ( SELECT auth.uid() AS uid))));

alter policy services_delete_staff_or_own_editable_entity_submission on public.services
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND (( SELECT public.has_permission('services.publish'::text) AS has_permission) OR ((( SELECT current_app_role() AS current_app_role) = 'entity'::text) AND (submitted_by = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['draft'::text, 'rejected'::text]))))));

alter policy services_insert_staff_or_entity on public.services
  with check (((org_id = ( SELECT current_org_id() AS current_org_id)) AND (created_by = ( SELECT auth.uid() AS uid)) AND ((( SELECT public.has_permission('services.edit'::text) AS has_permission) OR ( SELECT public.has_permission('services.publish'::text) AS has_permission)) OR ((( SELECT current_app_role() AS current_app_role) = 'entity'::text) AND (submitted_by = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['draft'::text, 'pending'::text]))))));

alter policy services_select_role_matrix on public.services
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ((( SELECT public.has_permission('services.edit'::text) AS has_permission) OR ( SELECT public.has_permission('services.publish'::text) AS has_permission) OR ( SELECT public.has_permission('services.review'::text) AS has_permission)) OR is_content_visible(status, published_at, expires_at) OR ((( SELECT current_app_role() AS current_app_role) = 'entity'::text) AND (submitted_by = ( SELECT auth.uid() AS uid))))));

alter policy services_update_staff_or_own_entity_submission on public.services
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ((( SELECT public.has_permission('services.edit'::text) AS has_permission) OR ( SELECT public.has_permission('services.publish'::text) AS has_permission) OR ( SELECT public.has_permission('services.review'::text) AS has_permission)) OR ((( SELECT current_app_role() AS current_app_role) = 'entity'::text) AND (submitted_by = ( SELECT auth.uid() AS uid))))))
  with check (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ((( SELECT public.has_permission('services.edit'::text) AS has_permission) OR ( SELECT public.has_permission('services.publish'::text) AS has_permission) OR ( SELECT public.has_permission('services.review'::text) AS has_permission)) OR ((( SELECT current_app_role() AS current_app_role) = 'entity'::text) AND (submitted_by = ( SELECT auth.uid() AS uid))))));

alter policy staff_invitations_select_org_admin on public.staff_invitations
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ( SELECT public.has_permission('team.manage'::text) AS has_permission)));

alter policy survey_questions_select_staff on public.survey_questions
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND (( SELECT public.has_permission('surveys.manage'::text) AS has_permission) OR ( SELECT public.has_permission('surveys.results'::text) AS has_permission))));

alter policy survey_responses_select_owner_or_staff on public.survey_responses
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ((player_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.has_permission('surveys.results'::text) AS has_permission))));

alter policy surveys_select_staff on public.surveys
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND (( SELECT public.has_permission('surveys.manage'::text) AS has_permission) OR ( SELECT public.has_permission('surveys.results'::text) AS has_permission))));

alter policy targeted_notification_sends_select_staff on public.targeted_notification_sends
  using (((org_id = ( SELECT current_org_id() AS current_org_id)) AND ( SELECT public.has_permission('notifications.send'::text) AS has_permission)));

alter policy terms_acceptances_select_self_or_org_staff on public.terms_acceptances
  using (((profile_id = ( SELECT auth.uid() AS uid)) OR (( SELECT public.has_permission('participants.view'::text) AS has_permission) AND (EXISTS ( SELECT 1
   FROM profiles subject
  WHERE ((subject.id = terms_acceptances.profile_id) AND (subject.org_id = ( SELECT current_org_id() AS current_org_id))))))));

-- Functions (generated) ------------------------------------------------------------------------

create or replace function private.apply_forum_flag()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  publication_id uuid;
begin
  if new.target_type = 'post' then
    update public.forum_posts
    set flag_count = flag_count + 1,
      visibility = case when visibility = 'visible' and flag_count + 1 >= 3
        then 'hidden_pending_review' else visibility end
    where org_id = new.org_id and id = new.post_id;
  elsif new.target_type = 'reply' then
    update public.forum_replies
    set flag_count = flag_count + 1,
      visibility = case when visibility = 'visible' and flag_count + 1 >= 3
        then 'hidden_pending_review' else visibility end
    where org_id = new.org_id and id = new.reply_id;
  else
    update public.media_items
    set flag_count = flag_count + 1,
      moderation_state = case when moderation_state = 'visible' and flag_count + 1 >= 3
        then 'hidden_pending_review' else moderation_state end
    where org_id = new.org_id and id = new.media_id;
  end if;

  insert into public.push_publications (org_id, content_type, content_id, scheduled_for, state)
  values (new.org_id, 'forum_flag', new.id, new.created_at, 'processing')
  on conflict (content_type, content_id) do nothing
  returning id into publication_id;

  if publication_id is not null then
    insert into public.push_deliveries (
      org_id, publication_id, push_token_id, recipient_id, language, next_attempt_at
    )
    select new.org_id, publication_id, push_token.id, profile.id,
      case when profile.preferred_language in ('ca', 'es', 'en', 'ar', 'fa')
        then profile.preferred_language else 'ca' end,
      new.created_at
    from public.profiles as profile
    join public.push_tokens as push_token on push_token.user_id = profile.id
    where profile.org_id = new.org_id
      and (select private.profile_has_permission(profile.id, 'forum.moderate'))
      and profile.is_active
      and profile.push_notifications_enabled
    on conflict on constraint push_deliveries_publication_token_unique do nothing;
    perform private.invoke_push_dispatch('forum_flag');
  end if;
  return new;
end;
$$;

create or replace function private.create_targeted_notification_send(p_template_id uuid, p_title jsonb, p_body jsonb, p_audience_kind text, p_audience_config jsonb, p_expected_recipient_count integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  recipient_ids uuid[];
  actual_recipient_count integer;
  actual_device_count integer;
  send_id uuid;
  publication_id uuid;
begin
  if not (select public.has_permission('notifications.send')) then
    raise exception 'NOTIFICATIONS/STAFF_ONLY' using errcode = '42501';
  end if;
  if not private.valid_notification_copy(p_title, 120)
    or not private.valid_notification_copy(p_body, 1000)
    or p_expected_recipient_count < 1
  then
    raise exception 'NOTIFICATIONS/INVALID_SEND' using errcode = '23514';
  end if;
  if p_template_id is not null and not exists (
    select 1 from public.notification_templates
    where id = p_template_id and org_id = actor_org
  ) then
    raise exception 'NOTIFICATIONS/TEMPLATE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select
    coalesce(array_agg(audience.participant_id), '{}'::uuid[]),
    count(*)::integer,
    coalesce(sum(audience.device_count), 0)::integer
  into recipient_ids, actual_recipient_count, actual_device_count
  from public.preview_notification_audience(p_audience_kind, coalesce(p_audience_config, '{}'::jsonb)) audience;

  if actual_recipient_count <> p_expected_recipient_count then
    raise exception 'NOTIFICATIONS/AUDIENCE_CHANGED' using errcode = 'P0001';
  end if;

  insert into public.targeted_notification_sends (
    org_id, template_id, title, body, audience_kind, audience_config,
    recipient_count, sent_by
  ) values (
    actor_org, p_template_id, p_title, p_body, p_audience_kind,
    coalesce(p_audience_config, '{}'::jsonb), actual_recipient_count, actor
  ) returning id into send_id;

  insert into public.push_publications (
    org_id, content_type, content_id, scheduled_for, recipient_count
  ) values (
    actor_org, 'targeted_notification', send_id, now(), actual_device_count
  ) returning id into publication_id;

  insert into public.push_deliveries (
    org_id, publication_id, push_token_id, recipient_id, language, next_attempt_at
  )
  select
    actor_org,
    publication_id,
    push_token.id,
    profile.id,
    case when profile.preferred_language in ('ca', 'es', 'en', 'ar', 'fa')
      then profile.preferred_language else 'ca' end,
    now()
  from public.profiles as profile
  join public.push_tokens as push_token on push_token.user_id = profile.id
  where profile.org_id = actor_org
    and profile.id = any(recipient_ids)
    and profile.role = 'player'
    and profile.is_active
    and profile.push_notifications_enabled;

  insert into public.audit_log (
    org_id, actor_id, action, target_type, target_id, changes
  ) values (
    actor_org,
    actor,
    'targeted_notification_sent',
    'targeted_notification_send',
    send_id,
    jsonb_build_object(
      'audience_kind', p_audience_kind,
      'recipient_count', actual_recipient_count,
      'template_id', p_template_id
    )
  );

  perform private.invoke_push_dispatch('targeted');
  return send_id;
end;
$$;

create or replace function private.delete_custom_notification_group(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
begin
  if not (select public.has_permission('notifications.send')) then
    raise exception 'NOTIFICATIONS/STAFF_ONLY' using errcode = '42501';
  end if;
  delete from public.custom_notification_groups
  where id = p_id and org_id = (select public.current_org_id());
end;
$$;

create or replace function private.delete_notification_template(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
begin
  if not (select public.has_permission('notifications.send')) then
    raise exception 'NOTIFICATIONS/STAFF_ONLY' using errcode = '42501';
  end if;
  delete from public.notification_templates
  where id = p_id and org_id = (select public.current_org_id());
end;
$$;

create or replace function private.enforce_service_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
declare
  actor_role text := public.current_app_role();
  actor_id uuid := auth.uid();
  transition_allowed boolean;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    transition_allowed := case old.status
      when 'draft' then new.status in ('pending', 'published')
      when 'pending' then new.status in ('approved', 'rejected')
      when 'approved' then new.status in ('published', 'rejected')
      when 'rejected' then new.status in ('draft', 'pending')
      when 'published' then new.status = 'draft'
      else false
    end;
    if not transition_allowed then
      raise check_violation using message = 'invalid service status transition';
    end if;
  end if;

  -- Team members: publishing or unpublishing needs services.publish, and
  -- approving or rejecting an entity submission needs services.review (RAPP-230).
  if (select public.is_team_member()) then
    if (tg_op = 'INSERT' and new.status = 'published')
      or (tg_op = 'UPDATE' and new.status is distinct from old.status
        and 'published' in (new.status, old.status))
    then
      if not (select public.has_permission('services.publish')) then
        raise insufficient_privilege using message = 'publishing a service needs services.publish';
      end if;
    end if;
    if tg_op = 'UPDATE' and new.status is distinct from old.status
      and old.status = 'pending' and new.status in ('approved', 'rejected')
      and not (select public.has_permission('services.review'))
    then
      raise insufficient_privilege using message = 'reviewing a submission needs services.review';
    end if;
  end if;
  if actor_role = 'entity' then
    if tg_op = 'INSERT' then
      if new.created_by is distinct from actor_id
        or new.submitted_by is distinct from actor_id
        or new.status not in ('draft', 'pending') then
        raise insufficient_privilege using message =
          'entities may create only their own draft or pending submissions';
      end if;
    else
      if old.submitted_by is distinct from actor_id
        or new.submitted_by is distinct from old.submitted_by
        or new.created_by is distinct from old.created_by
        or (
          new.status = old.status
          and old.status not in ('draft', 'rejected', 'published')
        )
        or (
          new.status is distinct from old.status
          and not (
            (old.status = 'draft' and new.status = 'pending')
            or (old.status = 'rejected' and new.status in ('draft', 'pending'))
          )
        ) then
        raise insufficient_privilege using message =
          'entities cannot review, approve, or publish submissions';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.enqueue_referral_update_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  recipient uuid;
  publication uuid;
begin
  select referral.assigned_staff_id into recipient
  from public.entity_referrals as referral
  where referral.org_id = new.org_id and referral.id = new.referral_id;

  if recipient is null or recipient = new.author_id then
    return new;
  end if;

  insert into public.push_publications (
    org_id, content_type, content_id, recipient_id, scheduled_for, state
  ) values (
    new.org_id, 'referral_update', new.id, recipient, new.created_at, 'processing'
  )
  on conflict (content_type, content_id) do nothing
  returning id into publication;

  if publication is not null then
    insert into public.push_deliveries (
      org_id, publication_id, push_token_id, recipient_id, language, next_attempt_at
    )
    select
      new.org_id,
      publication,
      push_token.id,
      profile.id,
      case when profile.preferred_language in ('ca', 'es', 'en', 'ar', 'fa')
        then profile.preferred_language else 'ca' end,
      new.created_at
    from public.profiles as profile
    join public.push_tokens as push_token on push_token.user_id = profile.id
    where profile.org_id = new.org_id
      and profile.id = recipient
      and (select private.profile_has_permission(profile.id, 'referrals.manage'))
      and profile.is_active
      and profile.push_notifications_enabled
    on conflict on constraint push_deliveries_publication_token_unique do nothing;

    perform private.invoke_push_dispatch('referral_update');
  end if;

  return new;
end;
$$;

create or replace function private.get_or_create_staff_conversation(p_participant_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor_org uuid := (select public.current_org_id());
  result uuid;
begin
  if not (select public.has_permission('messages.inbox'))
    or not exists (
      select 1 from public.profiles
      where id = p_participant_id and org_id = actor_org and role = 'player'
    )
  then
    raise exception 'forum author contact denied' using errcode = 'insufficient_privilege';
  end if;

  insert into public.conversations (org_id, user_id)
  values (actor_org, p_participant_id)
  on conflict (org_id, user_id) do update set org_id = excluded.org_id
  returning id into result;
  return result;
end;
$$;

create or replace function private.guard_forum_post_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
begin
  if pg_trigger_depth() > 1
    or (select auth.uid()) is null
    or (select public.has_permission('forum.moderate'))
  then
    return new;
  end if;

  if old.author_id <> (select auth.uid())
    or new.org_id is distinct from old.org_id
    or new.category_id is distinct from old.category_id
    or new.author_id is distinct from old.author_id
    or new.author_first_name is distinct from old.author_first_name
    or new.is_pinned is distinct from old.is_pinned
    or new.flag_count is distinct from old.flag_count
    or new.reply_count is distinct from old.reply_count
    or new.created_at is distinct from old.created_at
    or old.visibility <> 'visible'
    or new.visibility not in ('visible', 'deleted')
    or (new.visibility = 'visible' and new.image_url is distinct from old.image_url)
    or (new.visibility = 'deleted' and (new.content is not null or new.image_url is not null))
  then
    raise exception 'forum post ownership or protected columns rejected'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create or replace function private.list_notification_send_history()
 RETURNS TABLE(id uuid, template_id uuid, audience_kind text, audience_config jsonb, recipient_count integer, device_count integer, sent_count integer, delivered_count integer, failed_count integer, state text, sent_by uuid, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
begin
  if not (select public.has_permission('notifications.send')) then
    raise exception 'NOTIFICATIONS/STAFF_ONLY' using errcode = '42501';
  end if;
  return query
  select
    send.id,
    send.template_id,
    send.audience_kind,
    send.audience_config,
    send.recipient_count,
    publication.recipient_count,
    publication.sent_count,
    publication.delivered_count,
    publication.failed_count,
    publication.state,
    send.sent_by,
    send.created_at
  from public.targeted_notification_sends as send
  join public.push_publications as publication
    on publication.org_id = send.org_id
   and publication.content_type = 'targeted_notification'
   and publication.content_id = send.id
  where send.org_id = (select public.current_org_id())
  order by send.created_at desc, send.id;
end;
$$;

create or replace function private.mark_conversation_read(p_conversation_id uuid, p_message_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  target_created_at timestamptz;
  current_created_at timestamptz;
  current_message_id uuid;
begin
  if not exists (
    select 1
    from public.conversations as conversation
    where conversation.id = p_conversation_id
      and conversation.org_id = actor_org
      and (
        conversation.user_id = actor
        or (select public.has_permission('messages.inbox'))
      )
  ) then
    raise exception 'conversation read access denied' using errcode = 'insufficient_privilege';
  end if;

  select message.created_at into target_created_at
  from public.messages as message
  where message.id = p_message_id
    and message.conversation_id = p_conversation_id
    and message.org_id = actor_org;

  if target_created_at is null then
    raise exception 'message read access denied' using errcode = 'insufficient_privilege';
  end if;

  select message.created_at, state.last_read_message_id
  into current_created_at, current_message_id
  from public.conversation_read_states as state
  left join public.messages as message on message.id = state.last_read_message_id
  where state.conversation_id = p_conversation_id and state.user_id = actor;

  if current_created_at is null
    or (target_created_at, p_message_id) >= (current_created_at, current_message_id) then
    insert into public.conversation_read_states (
      org_id, conversation_id, user_id, last_read_message_id, read_at
    ) values (
      actor_org, p_conversation_id, actor, p_message_id, now()
    )
    on conflict (conversation_id, user_id) do update
    set last_read_message_id = excluded.last_read_message_id,
        read_at = excluded.read_at;
  end if;
end;
$$;

create or replace function private.prepare_attendance_mark()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor_id uuid := (select auth.uid());
  actor_org_id uuid;
  occurrence_org_id uuid;
  participant_org_id uuid;
  participant_role text;
begin
  if not (select public.has_permission('attendance.mark')) then
    raise exception 'ATTENDANCE/STAFF_ONLY'
      using errcode = 'insufficient_privilege';
  end if;

  actor_org_id := (select public.current_org_id());

  select event_occurrences.org_id
  into occurrence_org_id
  from public.event_occurrences
  where event_occurrences.id = new.occurrence_id;

  select profiles.org_id, profiles.role
  into participant_org_id, participant_role
  from public.profiles
  where profiles.id = new.player_id;

  if occurrence_org_id is null or participant_org_id is null then
    raise exception 'ATTENDANCE/RELATED_ROW_NOT_FOUND'
      using errcode = 'foreign_key_violation';
  end if;

  if occurrence_org_id <> actor_org_id or participant_org_id <> actor_org_id then
    raise exception 'ATTENDANCE/WRONG_ORGANIZATION'
      using errcode = 'insufficient_privilege';
  end if;

  if participant_role <> 'player' then
    raise exception 'ATTENDANCE/PARTICIPANT_REQUIRED'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and (
    new.org_id <> old.org_id
    or new.occurrence_id <> old.occurrence_id
    or new.player_id <> old.player_id
  ) then
    raise exception 'ATTENDANCE/IDENTITY_IMMUTABLE'
      using errcode = 'insufficient_privilege';
  end if;

  -- An offline retry can arrive after another device has already written a
  -- later tap. Returning OLD makes that retry succeed idempotently while
  -- preserving the authoritative status and marker together.
  if tg_op = 'UPDATE' and new.marked_at <= old.marked_at then
    return old;
  end if;

  new.org_id := actor_org_id;
  new.marked_by := actor_id;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.record_conversation_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
begin
  if new.assigned_staff_id is not distinct from old.assigned_staff_id then
    return new;
  end if;

  if actor is null or not exists (
    select 1
    from public.profiles as profile
    where profile.id = actor
      and profile.org_id = new.org_id
      and (select private.profile_has_permission(profile.id, 'messages.inbox'))
  ) then
    raise exception 'only staff may change a conversation assignment'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.conversation_assignment_history (
    org_id,
    conversation_id,
    user_id,
    changed_by,
    previous_staff_id,
    assigned_staff_id
  ) values (
    new.org_id,
    new.id,
    new.user_id,
    actor,
    old.assigned_staff_id,
    new.assigned_staff_id
  );
  return new;
end;
$$;

create or replace function private.save_custom_notification_group(p_id uuid, p_name text, p_participant_ids uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  saved_id uuid;
  normalized_ids uuid[] := array(
    select distinct participant_id from unnest(coalesce(p_participant_ids, '{}'::uuid[])) participant_id
  );
begin
  if not (select public.has_permission('notifications.send')) then
    raise exception 'NOTIFICATIONS/STAFF_ONLY' using errcode = '42501';
  end if;
  if length(btrim(p_name)) not between 1 and 80 then
    raise exception 'NOTIFICATIONS/INVALID_GROUP' using errcode = '23514';
  end if;
  if (select count(*) from public.profiles
      where org_id = actor_org and id = any(normalized_ids) and role = 'player')
     <> cardinality(normalized_ids)
  then
    raise exception 'NOTIFICATIONS/INVALID_GROUP_MEMBERS' using errcode = '23514';
  end if;

  if p_id is null then
    insert into public.custom_notification_groups (org_id, name, created_by)
    values (actor_org, btrim(p_name), actor)
    returning id into saved_id;
  else
    update public.custom_notification_groups
    set name = btrim(p_name)
    where id = p_id and org_id = actor_org
    returning id into saved_id;
    if saved_id is null then
      raise exception 'NOTIFICATIONS/GROUP_NOT_FOUND' using errcode = 'P0002';
    end if;
    delete from public.custom_notification_group_members
    where org_id = actor_org and group_id = saved_id;
  end if;

  insert into public.custom_notification_group_members (org_id, group_id, participant_id)
  select actor_org, saved_id, participant_id from unnest(normalized_ids) participant_id;
  return saved_id;
end;
$$;

create or replace function private.save_notification_template(p_id uuid, p_name text, p_category text, p_title jsonb, p_body jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  saved_id uuid;
begin
  if not (select public.has_permission('notifications.send')) then
    raise exception 'NOTIFICATIONS/STAFF_ONLY' using errcode = '42501';
  end if;
  if length(btrim(p_name)) not between 1 and 80
    or p_category not in ('transactional', 'engagement', 'marketing')
    or not private.valid_notification_copy(p_title, 120)
    or not private.valid_notification_copy(p_body, 1000)
  then
    raise exception 'NOTIFICATIONS/INVALID_TEMPLATE' using errcode = '23514';
  end if;

  if p_id is null then
    insert into public.notification_templates (org_id, name, category, title, body, created_by)
    values (actor_org, btrim(p_name), p_category, p_title, p_body, actor)
    returning id into saved_id;
  else
    update public.notification_templates
    set name = btrim(p_name), category = p_category, title = p_title, body = p_body
    where id = p_id and org_id = actor_org
    returning id into saved_id;
    if saved_id is null then
      raise exception 'NOTIFICATIONS/TEMPLATE_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;
  return saved_id;
end;
$$;

create or replace function private.set_conversation_assignment(p_conversation_id uuid, p_staff_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  current_staff uuid;
begin
  if actor is null or not (select public.has_permission('messages.inbox')) then
    raise exception 'only staff may change a conversation assignment'
      using errcode = 'insufficient_privilege';
  end if;

  select conversation.assigned_staff_id
  into current_staff
  from public.conversations as conversation
  where conversation.id = p_conversation_id
    and conversation.org_id = actor_org;

  if not found then
    raise exception 'conversation assignment access denied'
      using errcode = 'insufficient_privilege';
  end if;

  if p_staff_id is not null and not exists (
    select 1
    from public.profiles as profile
    where profile.id = p_staff_id
      and profile.org_id = actor_org
      and (select private.profile_has_permission(profile.id, 'messages.inbox'))
  ) then
    raise exception 'assigned owner must be staff in this organization'
      using errcode = 'insufficient_privilege';
  end if;

  if current_staff is not distinct from p_staff_id then
    return;
  end if;

  update public.conversations
  set assigned_staff_id = p_staff_id
  where id = p_conversation_id and org_id = actor_org;
end;
$$;

create or replace function public.add_referral_update(p_referral_id uuid, p_update_type text, p_content text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid;
  actor_org uuid;
  actor_role text;
  actor_entity uuid;
  clean_content text := nullif(btrim(p_content), '');
  result uuid;
begin
  select
    assert_referral_actor.actor_id,
    assert_referral_actor.actor_org_id,
    assert_referral_actor.actor_role
  into actor, actor_org, actor_role
  from private.assert_referral_actor();
  actor_entity := public.current_collaborating_entity_id();

  if p_update_type not in (
    'housing', 'documentation', 'education', 'employment', 'health', 'other'
  )
    or clean_content is null
    or length(clean_content) > 4000
  then
    raise check_violation using message = 'invalid referral update';
  end if;

  if not exists (
    select 1
    from public.entity_referrals as referral
    where referral.id = p_referral_id
      and referral.org_id = actor_org
      and referral.referred_profile_id is not null
      and (
        (select public.has_permission('referrals.manage'))
        or referral.collaborating_entity_id = actor_entity
      )
  ) then
    raise exception 'referral update is outside the caller boundary'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.referral_updates (
    org_id, referral_id, author_id, update_type, content
  ) values (
    actor_org, p_referral_id, actor, p_update_type, public.encrypt_field(clean_content)
  )
  returning id into result;

  return result;
end;
$$;

create or replace function public.anonymize_participant(participant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid;
  subject_role text;
  subject_anonymized_at timestamptz;
begin
  -- SECURITY DEFINER means RLS is not doing this check, so it is the first
  -- statement in the body and pgTAP asserts it from three roles.
  if not (select public.has_permission('rgpd.erase')) then
    raise exception 'anonymizing a participant is a staff action'
      using errcode = 'insufficient_privilege';
  end if;

  actor_org := (select public.current_org_id());

  -- The tenant scope RLS would normally provide. Without it, SECURITY DEFINER
  -- would let a staff member of one organization anonymize another's roster.
  select p.role, p.anonymized_at into subject_role, subject_anonymized_at
  from public.profiles p
  where p.id = participant_id and p.org_id = actor_org;

  if subject_role is null then
    raise exception 'ANONYMIZE_NO_SUBJECT: no such participant in this organization'
      using errcode = 'raise_exception';
  end if;

  -- Anonymizing a colleague would strip the name off an account that still signs
  -- in and still acts, which is a different and much worse thing than what this
  -- function is for.
  if subject_role <> 'player' then
    raise exception 'ANONYMIZE_NOT_A_PARTICIPANT: only a participant record can be anonymized'
      using errcode = 'raise_exception';
  end if;

  -- Already done. Silently re-running would rewrite `anonymized_at` and lose the
  -- date the person actually left the record.
  if subject_anonymized_at is not null then
    raise exception 'ANONYMIZE_ALREADY_DONE: this record was already anonymized'
      using errcode = 'raise_exception';
  end if;

  update public.profiles set
    -- Emptied rather than filled with a placeholder word: the screens read
    -- `anonymized_at` and show a translated label, so no invented name has to
    -- exist in five languages or leak out of a CSV export as though it were one.
    first_name = '',
    last_name = '',
    place_of_birth = null,
    reference_contact_name = null,
    avatar_url = null,
    document_type = null,
    document_number = null,
    phone = null,
    address = null,
    postal_code = null,
    date_of_birth = case
      when date_of_birth is null then null
      else make_date(extract(year from date_of_birth)::int, 1, 1)
    end,
    media_consent_at = null,
    is_active = false,
    anonymized_at = now(),
    updated_at = now()
  where id = participant_id;

  -- Prose about her life, which no column-level anonymization can reach. Deleted
  -- through this function and only through this function: the table has no
  -- DELETE policy precisely so that no staff member can quietly revise the
  -- record, and the right to erasure is a different thing from revising it.
  delete from public.participant_notes where profile_id = participant_id;

  -- A retained device token would keep a channel open to a real phone belonging
  -- to a person this row no longer claims to know.
  delete from public.push_tokens where user_id = participant_id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org,
    actor,
    'profile.anonymize',
    'profile',
    participant_id,
    -- WHICH fields were cleared, never what was in them (ADR-021). The audit row
    -- must not become the last surviving copy of the data it describes.
    jsonb_build_object('fields_cleared', true, 'notes_deleted', true)
  );
end;
$$;

create or replace function public.can_read_feedback_object(p_object_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
  select exists (
    select 1
    from public.feedback_submissions as submission
    where submission.image_url = p_object_key
      and submission.org_id = (select public.current_org_id())
      and (submission.author_id = (select auth.uid()) or (select public.has_permission('feedback.view')))
  );
$$;

create or replace function public.can_read_internal_document_object(p_object_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $$
  select (select public.has_permission('settings.documents')) and exists (
    select 1
    from public.internal_documents
    where object_key = p_object_key
      and org_id = (select public.current_org_id())
  );
$$;

create or replace function public.can_read_media_object(p_object_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
  with matching as (
    select item.*
    from public.media_items item
    where item.file_url = p_object_key or item.thumbnail_url = p_object_key
  ), authorized as (
    select item.id
    from matching item
    where item.org_id = (select public.current_org_id())
      and (
        (select (public.has_permission('gallery.moderate') or public.has_permission('forum.moderate') or public.has_permission('knowledge.edit') or public.has_permission('knowledge.publish')))
        or (
          item.moderation_state = 'visible'
          and (item.uploaded_by = (select auth.uid()) or item.privacy_level = 'community')
        )
      )
  )
  select exists (select 1 from matching)
    and not exists (
      select 1 from matching item
      where not exists (select 1 from authorized visible where visible.id = item.id)
    );
$$;

create or replace function public.complete_media_item_deletion(p_media_item_id uuid, p_file_object_key text, p_thumbnail_object_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
begin
  delete from public.media_items as item
  where item.id = p_media_item_id
    and item.org_id = (select public.current_org_id())
    and (item.uploaded_by = (select auth.uid()) or (select (public.has_permission('gallery.moderate') or public.has_permission('forum.moderate'))))
    and item.file_url = p_file_object_key
    and item.thumbnail_url is not distinct from p_thumbnail_object_key;
  if not found then
    raise exception 'media deletion denied or object keys differ'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function public.complete_mentoring_request(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor_org uuid := public.current_org_id();
begin
  if actor_org is null or not public.has_permission('mentoring.manage') then
    raise exception 'only staff may complete mentoring'
      using errcode = 'insufficient_privilege';
  end if;

  update public.mentoring_requests
  set status = 'completed', completed_at = now()
  where org_id = actor_org
    and id = p_request_id
    and status = 'scheduled';

  if not found then
    raise check_violation using message = 'only a scheduled mentoring request can be completed';
  end if;
end;
$$;

create or replace function public.count_services_incompatible_with_category_schema(p_category_id uuid, p_metadata_schema jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $$
declare
  incompatible_count bigint;
begin
  if not public.has_permission('services.edit') then
    raise insufficient_privilege using message =
      'only staff may inspect service category migrations';
  end if;
  if not public.is_service_metadata_schema_valid(p_metadata_schema) then
    raise check_violation using message = 'invalid service metadata schema';
  end if;

  select count(*)
  into incompatible_count
  from public.services as service
  where service.org_id = public.current_org_id()
    and service.category_id = p_category_id
    and not public.is_service_metadata_valid(service.metadata, p_metadata_schema);

  return incompatible_count;
end;
$$;

create or replace function public.create_collaborating_entity(p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  clean_name text := nullif(btrim(p_name), '');
  result uuid;
begin
  if not (select public.has_permission('entities.manage')) then
    raise exception 'only admins may create collaborating entities'
      using errcode = 'insufficient_privilege';
  end if;
  if clean_name is null or length(clean_name) > 200 then
    raise check_violation using message = 'invalid collaborating entity name';
  end if;

  perform public.assert_within_hourly_limit('entity.create', 30);

  insert into public.collaborating_entities (org_id, name, created_by)
  values (actor_org, clean_name, actor)
  returning id into result;

  insert into public.audit_log (
    org_id, actor_id, action, target_type, target_id, changes
  ) values (
    actor_org,
    actor,
    'entity.create',
    'collaborating_entity',
    result,
    jsonb_build_object('name', clean_name)
  );

  return result;
end;
$$;

create or replace function public.create_data_export(p_dataset text, p_scope text, p_format text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_reason text DEFAULT NULL::text, p_confirmed boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  export_id uuid := gen_random_uuid();
  export_columns jsonb;
  export_rows jsonb;
  start_instant timestamptz;
  end_instant timestamptz;
begin
  if actor is null or actor_org is null or not (
    case p_dataset
      when 'participants' then case
        when p_scope = 'full' then (select public.has_permission('export.participants_sensitive'))
          and (select public.has_permission('participants.view_sensitive'))
        else (select public.has_permission('export.participants'))
      end
      when 'attendance' then (select public.has_permission('export.attendance'))
      when 'events' then (select public.has_permission('export.events'))
      -- An unknown dataset falls through to the validation below for anyone
      -- who may export something, so the error names the real problem.
      else (select public.has_permission('export.participants'))
        or (select public.has_permission('export.attendance'))
        or (select public.has_permission('export.events'))
    end
  ) then
    raise insufficient_privilege using message = 'data exports require admin access';
  end if;
  if p_dataset not in ('participants', 'attendance', 'events') then
    raise invalid_parameter_value using message = 'unsupported export dataset';
  end if;
  if p_scope not in ('default', 'full') then
    raise invalid_parameter_value using message = 'unsupported export scope';
  end if;
  if p_format not in ('csv', 'xlsx') then
    raise invalid_parameter_value using message = 'unsupported export format';
  end if;
  if p_start_date is not null and p_end_date is not null and p_start_date > p_end_date then
    raise invalid_datetime_format using message = 'invalid export period';
  end if;
  if p_scope = 'full' and not p_confirmed then
    raise invalid_parameter_value using message = 'full export requires explicit confirmation';
  end if;
  if p_scope = 'full' and length(btrim(coalesce(p_reason, ''))) < 10 then
    raise invalid_parameter_value using message = 'full export requires a reason of at least 10 characters';
  end if;
  if length(coalesce(p_reason, '')) > 500 then
    raise invalid_parameter_value using message = 'export reason is too long';
  end if;
  if (
    select count(*)
    from public.audit_log log
    where log.actor_id = actor
      and log.action like 'data_export.%'
      and log.created_at >= now() - interval '1 minute'
  ) >= 5 then
    raise sqlstate '42901' using message = 'export rate limit exceeded';
  end if;

  start_instant := case
    when p_start_date is null then null
    else p_start_date::timestamp at time zone 'Europe/Madrid'
  end;
  end_instant := case
    when p_end_date is null then null
    else (p_end_date + 1)::timestamp at time zone 'Europe/Madrid'
  end;

  if p_dataset = 'participants' and p_scope = 'default' then
    export_columns := '["id","first_name","last_name","date_of_birth","place_of_birth","nationality","preferred_language","city","reference_entity","reference_contact_name","has_dependents","num_dependents","clothing_size","shoe_size","is_active","created_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', profile.id,
      'first_name', profile.first_name,
      'last_name', profile.last_name,
      'date_of_birth', profile.date_of_birth,
      'place_of_birth', profile.place_of_birth,
      'nationality', profile.nationality,
      'preferred_language', profile.preferred_language,
      'city', profile.city,
      'reference_entity', profile.reference_entity,
      'reference_contact_name', profile.reference_contact_name,
      'has_dependents', profile.has_dependents,
      'num_dependents', profile.num_dependents,
      'clothing_size', profile.clothing_size,
      'shoe_size', profile.shoe_size,
      'is_active', profile.is_active,
      'created_at', profile.created_at
    ) order by profile.last_name, profile.first_name, profile.id), '[]'::jsonb)
    into export_rows
    from public.profiles profile
    where profile.org_id = actor_org
      and profile.role = 'player';
  elsif p_dataset = 'participants' then
    export_columns := '["id","first_name","last_name","date_of_birth","place_of_birth","nationality","preferred_language","document_type","document_number","phone","address","city","postal_code","reference_entity","reference_contact_name","has_dependents","num_dependents","clothing_size","shoe_size","is_active","created_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', profile.id,
      'first_name', profile.first_name,
      'last_name', profile.last_name,
      'date_of_birth', profile.date_of_birth,
      'place_of_birth', profile.place_of_birth,
      'nationality', profile.nationality,
      'preferred_language', profile.preferred_language,
      'document_type', profile.document_type,
      'document_number', public.decrypt_field(profile.document_number),
      'phone', public.decrypt_field(profile.phone),
      'address', public.decrypt_field(profile.address),
      'city', profile.city,
      'postal_code', public.decrypt_field(profile.postal_code),
      'reference_entity', profile.reference_entity,
      'reference_contact_name', profile.reference_contact_name,
      'has_dependents', profile.has_dependents,
      'num_dependents', profile.num_dependents,
      'clothing_size', profile.clothing_size,
      'shoe_size', profile.shoe_size,
      'is_active', profile.is_active,
      'created_at', profile.created_at
    ) order by profile.last_name, profile.first_name, profile.id), '[]'::jsonb)
    into export_rows
    from public.profiles profile
    where profile.org_id = actor_org
      and profile.role = 'player';
  elsif p_dataset = 'attendance' then
    export_columns := '["attendance_id","occurrence_id","event_id","category_id","player_id","first_name","last_name","status","marked_at","starts_at","ends_at","event_title_ca","event_title_es","event_title_en","event_title_ar","event_title_fa","event_location","category_name_ca","category_name_es","category_name_en","category_name_ar","category_name_fa"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'attendance_id', report.attendance_id,
      'occurrence_id', report.occurrence_id,
      'event_id', report.event_id,
      'category_id', report.category_id,
      'player_id', report.player_id,
      'first_name', report.first_name,
      'last_name', report.last_name,
      'status', report.status,
      'marked_at', report.marked_at,
      'starts_at', report.starts_at,
      'ends_at', report.ends_at,
      'event_title_ca', report.event_title ->> 'ca',
      'event_title_es', report.event_title ->> 'es',
      'event_title_en', report.event_title ->> 'en',
      'event_title_ar', report.event_title ->> 'ar',
      'event_title_fa', report.event_title ->> 'fa',
      'event_location', report.event_location,
      'category_name_ca', report.category_name ->> 'ca',
      'category_name_es', report.category_name ->> 'es',
      'category_name_en', report.category_name ->> 'en',
      'category_name_ar', report.category_name ->> 'ar',
      'category_name_fa', report.category_name ->> 'fa'
    ) order by report.starts_at, report.last_name, report.first_name, report.attendance_id), '[]'::jsonb)
    into export_rows
    from public.attendance_report_rows report
    where (start_instant is null or report.starts_at >= start_instant)
      and (end_instant is null or report.starts_at < end_instant);
  else
    export_columns := '["id","category_id","title_ca","title_es","title_en","title_ar","title_fa","location","starts_at","ends_at","time_zone","status","signup_mode","max_participants","created_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', event.id,
      'category_id', event.category_id,
      'title_ca', event.title ->> 'ca',
      'title_es', event.title ->> 'es',
      'title_en', event.title ->> 'en',
      'title_ar', event.title ->> 'ar',
      'title_fa', event.title ->> 'fa',
      'location', event.location,
      'starts_at', event.starts_at,
      'ends_at', event.ends_at,
      'time_zone', event.time_zone,
      'status', event.status,
      'signup_mode', event.signup_mode,
      'max_participants', event.max_participants,
      'created_at', event.created_at
    ) order by event.starts_at, event.id), '[]'::jsonb)
    into export_rows
    from public.events event
    where event.org_id = actor_org
      and (start_instant is null or event.starts_at >= start_instant)
      and (end_instant is null or event.starts_at < end_instant);
  end if;

  insert into public.audit_log (id, org_id, actor_id, action, target_type, target_id, changes)
  values (
    gen_random_uuid(), actor_org, actor, 'data_export.' || p_scope, 'data_export', export_id,
    jsonb_strip_nulls(jsonb_build_object(
      'dataset', p_dataset,
      'format', p_format,
      'scope', p_scope,
      'start_date', p_start_date,
      'end_date', p_end_date,
      'reason', case when p_scope = 'full' then btrim(p_reason) else null end,
      'row_count', jsonb_array_length(export_rows)
    ))
  );

  return jsonb_build_object(
    'version', 1,
    'export_id', export_id,
    'dataset', p_dataset,
    'scope', p_scope,
    'format', p_format,
    'generated_at', now(),
    'columns', export_columns,
    'rows', export_rows
  );
end;
$$;

create or replace function public.create_participant_invite(payload jsonb)
 RETURNS TABLE(invite_id uuid, email text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid;
  email_value text := lower(btrim(payload ->> 'email'));
  reference_entity_value text := nullif(btrim(payload ->> 'reference_entity'), '');
  referral_value uuid := nullif(btrim(payload ->> 'referral_id'), '')::uuid;
  account_id uuid;
  new_invite_id uuid;
  invite_expires_at timestamptz := now() + interval '30 days';
begin
  if not (select public.has_permission('participants.invite')) then
    raise exception 'inviting a participant is a staff action'
      using errcode = 'insufficient_privilege';
  end if;

  -- The same shape the CHECK constraint enforces, raised here as a clean error
  -- rather than as a constraint violation, because this one is shown to a staff
  -- member who mistyped an address.
  if email_value is null
    or length(email_value) > 254
    or email_value !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  then
    raise exception 'create_participant_invite requires a valid email address'
      using errcode = 'invalid_parameter_value';
  end if;

  perform public.assert_within_hourly_limit('invite.create', 30);

  actor_org := (select public.current_org_id());

  if referral_value is not null and not exists (
    select 1 from public.entity_referrals referral
    where referral.id = referral_value
      and referral.org_id = actor_org
      and referral.status = 'pending'
  ) then
    raise exception 'an invitation can only carry a pending referral of this organization'
      using errcode = 'invalid_parameter_value';
  end if;

  select account.id into account_id
  from auth.users account
  where lower(account.email) = email_value;

  if account_id is not null
    and exists (select 1 from public.profiles profile where profile.id = account_id)
  then
    raise exception 'this address already belongs to an account'
      using errcode = 'unique_violation';
  end if;

  -- Her account, so her first code request succeeds. Confirmed, because staff
  -- typed the address with her; empty, because the wizard writes her profile.
  if account_id is null then
    account_id := extensions.gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', account_id,
      'authenticated', 'authenticated', email_value, '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', '', '', ''
    );

    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      account_id::text,
      account_id,
      jsonb_build_object('sub', account_id::text, 'email', email_value, 'email_verified', true),
      'email', now(), now(), now()
    );
  end if;

  insert into public.invites (org_id, email, reference_entity, referral_id, invited_by, expires_at)
  values (actor_org, email_value, reference_entity_value, referral_value, actor, invite_expires_at)
  returning id into new_invite_id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org,
    actor,
    'invite.create',
    'invite',
    new_invite_id,
    -- The referring entity and the referral are programme data, not personal
    -- data, so they are recorded. The invited ADDRESS is not: the audit trail
    -- says who invited and when, and the invite row itself holds who was invited.
    jsonb_build_object('reference_entity', reference_entity_value, 'referral_id', referral_value)
  );

  return query select new_invite_id, email_value, invite_expires_at;
end;
$$;

create or replace function public.delete_forum_category(p_category_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
begin
  if not (select public.has_permission('forum.moderate')) then
    raise exception 'forum category action denied' using errcode = 'insufficient_privilege';
  end if;
  delete from public.forum_categories
  where id = p_category_id and org_id = (select public.current_org_id());
  if not found then
    raise exception 'forum category not found' using errcode = 'no_data_found';
  end if;
end;
$$;

create or replace function public.delete_participant_permanently(participant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid;
  subject_role text;
  subject_email text;
  entry record;
  remaining bigint;
  leftovers text[] := array[]::text[];
begin
  if not (select (public.has_permission('rgpd.erase') and public.has_permission('team.manage'))) then
    raise exception 'erasing a participant is an admin action'
      using errcode = 'insufficient_privilege';
  end if;

  actor_org := (select public.current_org_id());

  select p.role into subject_role
  from public.profiles p
  where p.id = participant_id and p.org_id = actor_org;

  if subject_role is null then
    raise exception 'DELETION_NO_SUBJECT: no such participant in this organization'
      using errcode = 'raise_exception';
  end if;

  if subject_role <> 'player' then
    raise exception 'DELETION_NOT_A_PARTICIPANT: only a participant record can be erased here'
      using errcode = 'raise_exception';
  end if;

  if participant_id = actor then
    raise exception 'DELETION_SELF: an admin cannot erase her own account through this path'
      using errcode = 'raise_exception';
  end if;

  if not exists (
    select 1 from public.audit_log
    where action = 'profile.media_purged'
      and target_id = participant_id
      and actor_id = actor
      and created_at > now() - interval '30 minutes'
  ) then
    raise exception 'DELETION_MEDIA_NOT_PURGED: her uploaded media must be removed before the record'
      using errcode = 'raise_exception';
  end if;

  select u.email into subject_email from auth.users u where u.id = participant_id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org,
    actor,
    'profile.delete',
    'profile',
    participant_id,
    jsonb_build_object('erased', true)
  );

  delete from public.invites
   where accepted_by = participant_id
      or (subject_email is not null and email = subject_email);

  delete from public.audit_log where actor_id = participant_id;

  delete from auth.users where id = participant_id;

  for entry in
    select d.table_name, d.participant_column
    from public.personal_data_disposition() d
    where d.disposition = 'purge'
  loop
    execute format(
      'select count(*) from public.%I where %I = $1',
      entry.table_name, entry.participant_column
    ) into remaining using participant_id;
    if remaining > 0 then
      leftovers := leftovers || format('%s.%s', entry.table_name, entry.participant_column);
    end if;
  end loop;

  if array_length(leftovers, 1) > 0 then
    raise exception 'DELETION_INCOMPLETE: rows survived in %', array_to_string(leftovers, ', ')
      using errcode = 'raise_exception';
  end if;
end;
$$;

create or replace function public.feedback_monthly_counts()
 RETURNS TABLE(month date, type text, count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
begin
  if not (public.has_permission('feedback.view') or public.has_permission('impact.view')) then
    raise exception 'only staff may view feedback counts' using errcode = 'insufficient_privilege';
  end if;
  return query
  select date_trunc('month', submission.created_at)::date, submission.type, count(*)
  from public.feedback_submissions as submission
  where submission.org_id = (select public.current_org_id())
  group by 1, submission.type
  order by 1 desc, submission.type;
end;
$$;

create or replace function public.get_audit_log_page(p_actor_id uuid DEFAULT NULL::uuid, p_action text DEFAULT NULL::text, p_target_type text DEFAULT NULL::text, p_target_id uuid DEFAULT NULL::uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_page_size integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $$
declare
  result jsonb;
begin
  if not (select public.has_permission('audit.view')) then
    raise insufficient_privilege using message = 'audit viewer requires admin access';
  end if;
  if p_page_size < 1 or p_page_size > 100 then
    raise invalid_parameter_value using message = 'audit page size must be between 1 and 100';
  end if;
  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    raise invalid_parameter_value using message = 'audit cursor is incomplete';
  end if;
  if p_start_date is not null and p_end_date is not null and p_start_date > p_end_date then
    raise invalid_datetime_format using message = 'invalid audit period';
  end if;

  with filtered as (
    select
      log.id,
      log.actor_id,
      trim(concat(actor.first_name, ' ', actor.last_name)) as actor_name,
      log.action,
      log.target_type,
      log.target_id,
      log.changes,
      log.created_at
    from public.audit_log log
    join public.profiles actor on actor.id = log.actor_id
    where log.org_id = (select public.current_org_id())
      and (p_actor_id is null or log.actor_id = p_actor_id)
      and (p_action is null or log.action = p_action)
      and (p_target_type is null or log.target_type = p_target_type)
      and (p_target_id is null or log.target_id = p_target_id)
      and (p_start_date is null or log.created_at >= p_start_date::timestamp at time zone 'Europe/Madrid')
      and (p_end_date is null or log.created_at < (p_end_date + 1)::timestamp at time zone 'Europe/Madrid')
      and (
        p_cursor_created_at is null
        or (log.created_at, log.id) < (p_cursor_created_at, p_cursor_id)
      )
    order by log.created_at desc, log.id desc
    limit p_page_size + 1
  ), page as (
    select * from filtered
    order by created_at desc, id desc
    limit p_page_size
  ), last_row as (
    select created_at, id from page order by created_at, id limit 1
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc, id desc) from page), '[]'::jsonb),
    'has_more', (select count(*) from filtered) > p_page_size,
    'next_cursor_created_at', (select created_at from last_row),
    'next_cursor_id', (select id from last_row)
  ) into result;

  return result;
end;
$$;

create or replace function public.get_impact_report(p_start_date date, p_end_date date, p_category_id uuid DEFAULT NULL::uuid, p_collaborating_entity_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $$
declare
  actor_org_id uuid := (select public.current_org_id());
  period_start_at timestamptz;
  period_end_at timestamptz;
  result jsonb;
begin
  if not (select public.has_permission('impact.view')) then
    raise exception 'impact reports require staff access'
      using errcode = 'insufficient_privilege';
  end if;

  if p_start_date is null
    or p_end_date is null
    or p_start_date > p_end_date
    or p_end_date - p_start_date > 3660
  then
    raise exception 'invalid impact report period'
      using errcode = 'invalid_datetime_format';
  end if;

  if p_category_id is not null and not exists (
    select 1
    from public.event_categories as category
    where category.org_id = actor_org_id
      and category.id = p_category_id
  ) then
    raise exception 'impact report category is outside the caller organization'
      using errcode = 'insufficient_privilege';
  end if;

  if p_collaborating_entity_id is not null and not exists (
    select 1
    from public.collaborating_entities as entity
    where entity.org_id = actor_org_id
      and entity.id = p_collaborating_entity_id
  ) then
    raise exception 'impact report entity is outside the caller organization'
      using errcode = 'insufficient_privilege';
  end if;

  period_start_at := p_start_date::timestamp at time zone 'Europe/Madrid';
  period_end_at := (p_end_date + 1)::timestamp at time zone 'Europe/Madrid';

  with
  category_options as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('id', category.id, 'name', category.name)
        order by category.sort_order, category.id
      ),
      '[]'::jsonb
    ) as value
    from public.event_categories as category
    where category.org_id = actor_org_id
  ),
  entity_options as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('id', entity.id, 'name', entity.name)
        order by entity.name, entity.id
      ),
      '[]'::jsonb
    ) as value
    from public.collaborating_entities as entity
    where entity.org_id = actor_org_id
      and entity.is_active
  ),
  linked_entities as (
    select
      referral.referred_profile_id as player_id,
      referral.collaborating_entity_id,
      entity.name as entity_name
    from public.entity_referrals as referral
    join public.collaborating_entities as entity
      on entity.org_id = referral.org_id
     and entity.id = referral.collaborating_entity_id
    where referral.org_id = actor_org_id
      and referral.referred_profile_id is not null
  ),
  attendance_period as (
    select
      attendance.id,
      attendance.player_id,
      attendance.status,
      occurrence.starts_at,
      event.category_id,
      category.name as category_name,
      category.color as category_color
    from public.attendance as attendance
    join public.event_occurrences as occurrence
      on occurrence.org_id = attendance.org_id
     and occurrence.id = attendance.occurrence_id
    join public.events as event
      on event.org_id = occurrence.org_id
     and event.id = occurrence.event_id
    join public.event_categories as category
      on category.org_id = event.org_id
     and category.id = event.category_id
    left join linked_entities as entity_link
      on entity_link.player_id = attendance.player_id
    where attendance.org_id = actor_org_id
      and occurrence.starts_at >= period_start_at
      and occurrence.starts_at < period_end_at
      and (p_category_id is null or event.category_id = p_category_id)
      and (
        p_collaborating_entity_id is null
        or entity_link.collaborating_entity_id = p_collaborating_entity_id
      )
  ),
  category_participants as (
    select distinct attendance.player_id
    from attendance_period as attendance
    union
    select distinct signup.player_id
    from public.event_signups as signup
    join public.events as event
      on event.org_id = signup.org_id
     and event.id = signup.event_id
    join public.event_occurrences as occurrence
      on occurrence.org_id = event.org_id
     and occurrence.event_id = event.id
    left join linked_entities as entity_link
      on entity_link.player_id = signup.player_id
    where signup.org_id = actor_org_id
      and signup.state in ('interested', 'confirmed')
      and occurrence.starts_at >= period_start_at
      and occurrence.starts_at < period_end_at
      and (p_category_id is null or event.category_id = p_category_id)
      and (
        p_collaborating_entity_id is null
        or entity_link.collaborating_entity_id = p_collaborating_entity_id
      )
  ),
  cohort as (
    select
      profile.id,
      profile.is_active,
      profile.created_at,
      profile.date_of_birth,
      coalesce(nullif(btrim(profile.nationality), ''), 'unknown') as nationality,
      entity_link.collaborating_entity_id,
      entity_link.entity_name
    from public.profiles as profile
    left join linked_entities as entity_link
      on entity_link.player_id = profile.id
    where profile.org_id = actor_org_id
      and profile.role = 'player'
      and profile.created_at < period_end_at
      and (
        p_collaborating_entity_id is null
        or entity_link.collaborating_entity_id = p_collaborating_entity_id
      )
      and (
        p_category_id is null
        or profile.id in (select participant.player_id from category_participants as participant)
      )
  ),
  privacy as (
    select count(*)::integer as participant_count
    from cohort
  ),
  attendance_scoped as (
    select attendance.*
    from attendance_period as attendance
    join cohort on cohort.id = attendance.player_id
  ),
  attendance_totals as (
    select
      count(*) filter (where status = 'present')::integer as present_count,
      count(*) filter (where status in ('present', 'absent'))::integer as eligible_count,
      count(*)::integer as marked_count,
      count(distinct player_id)::integer as participant_count
    from attendance_scoped
  ),
  summary as (
    select
      privacy.participant_count < 3 as suppressed,
      privacy.participant_count,
      count(*) filter (where cohort.is_active)::integer as active_participant_count,
      count(*) filter (
        where cohort.created_at >= period_start_at
          and cohort.created_at < period_end_at
      )::integer as new_participant_count,
      attendance_totals.present_count as attendance_present_count,
      attendance_totals.eligible_count as attendance_eligible_count,
      attendance_totals.marked_count as attendance_marked_count,
      attendance_totals.participant_count as participating_participant_count,
      coalesce(
        round(
          100.0 * attendance_totals.present_count
          / nullif(attendance_totals.eligible_count, 0),
          2
        ),
        0.00
      ) as attendance_rate
    from cohort
    cross join privacy
    cross join attendance_totals
    group by
      privacy.participant_count,
      attendance_totals.present_count,
      attendance_totals.eligible_count,
      attendance_totals.marked_count,
      attendance_totals.participant_count
  ),
  category_rows as (
    select
      attendance.category_id,
      attendance.category_name,
      attendance.category_color,
      count(distinct attendance.player_id)::integer as participant_count,
      count(*) filter (where attendance.status = 'present')::integer as present_count,
      count(*) filter (where attendance.status in ('present', 'absent'))::integer as eligible_count,
      count(*)::integer as marked_count
    from attendance_scoped as attendance
    group by attendance.category_id, attendance.category_name, attendance.category_color
  ),
  category_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'category_id', category.category_id,
          'category_name', category.category_name,
          'category_color', category.category_color,
          'participant_count', category.participant_count,
          'attendance_present_count', category.present_count,
          'attendance_eligible_count', category.eligible_count,
          'attendance_marked_count', category.marked_count,
          'attendance_rate', coalesce(
            round(100.0 * category.present_count / nullif(category.eligible_count, 0), 2),
            0.00
          )
        )
        order by category.category_id
      ),
      '[]'::jsonb
    ) as value
    from category_rows as category
  ),
  months as (
    select generate_series(
      date_trunc('month', p_start_date::timestamp),
      date_trunc('month', p_end_date::timestamp),
      interval '1 month'
    )::date as month_start
  ),
  trend_rows as (
    select
      months.month_start,
      count(distinct cohort.id) filter (
        where cohort.created_at >= months.month_start::timestamp at time zone 'Europe/Madrid'
          and cohort.created_at < (months.month_start + interval '1 month')::timestamp at time zone 'Europe/Madrid'
      )::integer as new_participant_count,
      count(distinct attendance.player_id)::integer as participating_participant_count,
      count(attendance.id) filter (where attendance.status = 'present')::integer as present_count,
      count(attendance.id) filter (where attendance.status in ('present', 'absent'))::integer as eligible_count,
      count(attendance.id)::integer as marked_count
    from months
    left join cohort on true
    left join attendance_scoped as attendance
      on attendance.player_id = cohort.id
     and attendance.starts_at >= months.month_start::timestamp at time zone 'Europe/Madrid'
     and attendance.starts_at < (months.month_start + interval '1 month')::timestamp at time zone 'Europe/Madrid'
    group by months.month_start
  ),
  trend_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'month_start', trend.month_start,
          'new_participant_count', trend.new_participant_count,
          'participating_participant_count', trend.participating_participant_count,
          'attendance_present_count', trend.present_count,
          'attendance_eligible_count', trend.eligible_count,
          'attendance_marked_count', trend.marked_count,
          'attendance_rate', coalesce(
            round(100.0 * trend.present_count / nullif(trend.eligible_count, 0), 2),
            0.00
          )
        )
        order by trend.month_start
      ),
      '[]'::jsonb
    ) as value
    from trend_rows as trend
  ),
  nationality_rows as (
    select cohort.nationality as label, count(*)::integer as participant_count
    from cohort
    group by cohort.nationality
  ),
  nationality_json as (
    select coalesce(
      jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'label', nationality.label,
            'suppressed', nationality.participant_count < 3,
            'count', case when nationality.participant_count >= 3 then nationality.participant_count end
          )
        )
        order by nationality.participant_count desc, nationality.label
      ),
      '[]'::jsonb
    ) as value
    from nationality_rows as nationality
  ),
  age_rows as (
    select
      case
        when cohort.date_of_birth is null then 'unknown'
        when extract(year from age(p_end_date, cohort.date_of_birth)) < 18 then 'under-18'
        when extract(year from age(p_end_date, cohort.date_of_birth)) between 18 and 24 then '18-24'
        when extract(year from age(p_end_date, cohort.date_of_birth)) between 25 and 34 then '25-34'
        when extract(year from age(p_end_date, cohort.date_of_birth)) between 35 and 44 then '35-44'
        when extract(year from age(p_end_date, cohort.date_of_birth)) between 45 and 54 then '45-54'
        else '55-plus'
      end as label,
      count(*)::integer as participant_count
    from cohort
    group by 1
  ),
  age_json as (
    select coalesce(
      jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'label', age_band.label,
            'suppressed', age_band.participant_count < 3,
            'count', case when age_band.participant_count >= 3 then age_band.participant_count end
          )
        )
        order by age_band.label
      ),
      '[]'::jsonb
    ) as value
    from age_rows as age_band
  ),
  entity_rows as (
    select
      cohort.collaborating_entity_id as entity_id,
      cohort.entity_name,
      count(distinct cohort.id)::integer as participant_count,
      count(attendance.id) filter (where attendance.status = 'present')::integer as present_count,
      count(attendance.id) filter (where attendance.status in ('present', 'absent'))::integer as eligible_count,
      count(attendance.id)::integer as marked_count
    from cohort
    left join attendance_scoped as attendance on attendance.player_id = cohort.id
    where cohort.collaborating_entity_id is not null
    group by cohort.collaborating_entity_id, cohort.entity_name
  ),
  entity_json as (
    select coalesce(
      jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'entity_id', entity.entity_id,
            'entity_name', entity.entity_name,
            'suppressed', entity.participant_count < 3,
            'participant_count', case when entity.participant_count >= 3 then entity.participant_count end,
            'attendance_present_count', case when entity.participant_count >= 3 then entity.present_count end,
            'attendance_eligible_count', case when entity.participant_count >= 3 then entity.eligible_count end,
            'attendance_marked_count', case when entity.participant_count >= 3 then entity.marked_count end,
            'attendance_rate', case when entity.participant_count >= 3 then coalesce(
              round(100.0 * entity.present_count / nullif(entity.eligible_count, 0), 2),
              0.00
            ) end
          )
        )
        order by entity.entity_name, entity.entity_id
      ),
      '[]'::jsonb
    ) as value
    from entity_rows as entity
  ),
  forum_totals as (
    select
      (select count(*)::integer
       from public.forum_posts as post
       join cohort on cohort.id = post.author_id
       where post.org_id = actor_org_id
         and post.created_at >= period_start_at
         and post.created_at < period_end_at) as post_count,
      (select count(*)::integer
       from public.forum_replies as reply
       join cohort on cohort.id = reply.author_id
       where reply.org_id = actor_org_id
         and reply.created_at >= period_start_at
         and reply.created_at < period_end_at) as reply_count,
      (select count(distinct activity.author_id)::integer
       from (
         select post.author_id
         from public.forum_posts as post
         join cohort on cohort.id = post.author_id
         where post.org_id = actor_org_id
           and post.created_at >= period_start_at
           and post.created_at < period_end_at
         union all
         select reply.author_id
         from public.forum_replies as reply
         join cohort on cohort.id = reply.author_id
         where reply.org_id = actor_org_id
           and reply.created_at >= period_start_at
           and reply.created_at < period_end_at
       ) as activity) as contributor_count
  ),
  referral_totals as (
    select
      count(*)::integer as referral_count,
      count(*) filter (
        where referral.referred_profile_id is not null
          and referral.status in ('active', 'inactive')
      )::integer as converted_count
    from public.entity_referrals as referral
    where referral.org_id = actor_org_id
      and referral.created_at >= period_start_at
      and referral.created_at < period_end_at
      and (
        p_collaborating_entity_id is null
        or referral.collaborating_entity_id = p_collaborating_entity_id
      )
      and (
        p_category_id is null
        or referral.referred_profile_id in (select cohort.id from cohort)
      )
  )
  select jsonb_build_object(
    'version', 1,
    'period', jsonb_build_object(
      'start_date', p_start_date,
      'end_date', p_end_date,
      'time_zone', 'Europe/Madrid'
    ),
    'filters', jsonb_strip_nulls(jsonb_build_object(
      'category_id', p_category_id,
      'collaborating_entity_id', p_collaborating_entity_id
    )),
    'available_filters', jsonb_build_object(
      'categories', category_options.value,
      'entities', entity_options.value
    ),
    'summary', case
      when summary.suppressed then jsonb_build_object('suppressed', true)
      else jsonb_build_object(
        'suppressed', false,
        'participant_count', summary.participant_count,
        'active_participant_count', summary.active_participant_count,
        'new_participant_count', summary.new_participant_count,
        'participating_participant_count', summary.participating_participant_count,
        'attendance_present_count', summary.attendance_present_count,
        'attendance_eligible_count', summary.attendance_eligible_count,
        'attendance_marked_count', summary.attendance_marked_count,
        'attendance_rate', summary.attendance_rate
      )
    end,
    'participant_trend', case when summary.suppressed then '[]'::jsonb else trend_json.value end,
    'categories', case when summary.suppressed then '[]'::jsonb else category_json.value end,
    'demographics', jsonb_build_object(
      'nationalities', nationality_json.value,
      'age_bands', age_json.value
    ),
    'entities', entity_json.value,
    'forum_activity', case
      when summary.suppressed then jsonb_build_object('suppressed', true)
      else jsonb_build_object(
        'suppressed', false,
        'post_count', forum_totals.post_count,
        'reply_count', forum_totals.reply_count,
        'contributor_count', forum_totals.contributor_count
      )
    end,
    'referrals', case
      when summary.suppressed then jsonb_build_object('suppressed', true)
      else jsonb_build_object(
        'suppressed', false,
        'referral_count', referral_totals.referral_count,
        'converted_count', referral_totals.converted_count,
        'conversion_rate', coalesce(
          round(100.0 * referral_totals.converted_count / nullif(referral_totals.referral_count, 0), 2),
          0.00
        )
      )
    end
  )
  into result
  from summary
  cross join category_options
  cross join entity_options
  cross join category_json
  cross join trend_json
  cross join nationality_json
  cross join age_json
  cross join entity_json
  cross join forum_totals
  cross join referral_totals;

  return result;
end;
$$;

create or replace function public.get_participant_profile(participant_id uuid)
 RETURNS TABLE(id uuid, first_name text, last_name text, date_of_birth date, place_of_birth text, nationality text, preferred_language text, document_type text, document_number text, phone text, address text, city text, postal_code text, reference_entity text, reference_contact_name text, has_dependents boolean, num_dependents integer, clothing_size text, shoe_size text, avatar_url text, media_consent boolean, terms_accepted_at timestamp with time zone, is_active boolean, is_forum_banned boolean, auth_method text, anonymized_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 SET search_path TO ''
AS $$
  with subject as (
    select p.*
    from public.profiles p
    where p.id = participant_id
      and (select public.has_permission('participants.view'))
  ),
  access_recorded as (
    insert into public.audit_log (org_id, actor_id, action, target_type, target_id)
    select
      (select public.current_org_id()),
      (select auth.uid()),
      case when (select public.has_permission('participants.view_sensitive')) then 'profile.view_sensitive' else 'profile.view' end,
      'profile',
      s.id
    from subject s
    returning 1
  )
  select
    s.id,
    s.first_name,
    s.last_name,
    case when (select public.has_permission('participants.view_personal')) then s.date_of_birth end,
    case when (select public.has_permission('participants.view_personal')) then s.place_of_birth end,
    case when (select public.has_permission('participants.view_personal')) then s.nationality end,
    s.preferred_language,
    case when (select public.has_permission('participants.view_personal')) then s.document_type end,
    case when (select public.has_permission('participants.view_sensitive')) then public.decrypt_field(s.document_number) end,
    case when (select public.has_permission('participants.view_sensitive')) then public.decrypt_field(s.phone) end,
    case when (select public.has_permission('participants.view_sensitive')) then public.decrypt_field(s.address) end,
    case when (select public.has_permission('participants.view_personal')) then s.city end,
    case when (select public.has_permission('participants.view_sensitive')) then public.decrypt_field(s.postal_code) end,
    s.reference_entity,
    case when (select public.has_permission('participants.view_personal')) then s.reference_contact_name end,
    case when (select public.has_permission('participants.view_personal')) then s.has_dependents end,
    case when (select public.has_permission('participants.view_personal')) then s.num_dependents end,
    s.clothing_size,
    s.shoe_size,
    s.avatar_url,
    s.media_consent_at is not null,
    s.terms_accepted_at,
    s.is_active,
    s.is_forum_banned,
    s.auth_method,
    s.anonymized_at,
    s.created_at,
    s.updated_at
  from subject s;
$$;

create or replace function public.get_service_review_queue(p_kind text, p_category_id uuid, p_query text, p_page integer)
 RETURNS TABLE(item_kind text, item_id uuid, service_id uuid, category_id uuid, title jsonb, provider_name text, contact_name text, status text, changed_at timestamp with time zone, previous_service jsonb, current_service jsonb, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $$
begin
  if not (select public.has_permission('services.review')) then
    raise insufficient_privilege using message =
      'only staff may read the service review queue';
  end if;
  if p_kind not in ('all', 'pending', 'published_edit') then
    raise check_violation using message = 'invalid service review queue kind';
  end if;
  if p_page is null or p_page < 1 or p_page > 10000 then
    raise check_violation using message = 'invalid service review queue page';
  end if;

  return query
  with candidates as (
    select
      'pending'::text as item_kind,
      service.id as item_id,
      service.id as service_id,
      service.category_id,
      service.title,
      service.provider_name,
      service.contact_name,
      service.status,
      service.updated_at as changed_at,
      null::jsonb as previous_service,
      null::jsonb as current_service,
      0 as sort_priority
    from public.services as service
    where p_kind in ('all', 'pending')
      and service.org_id = (select public.current_org_id())
      and service.status = 'pending'

    union all

    select
      'published_edit'::text as item_kind,
      notification.id as item_id,
      service.id as service_id,
      service.category_id,
      service.title,
      service.provider_name,
      service.contact_name,
      service.status,
      notification.created_at as changed_at,
      notification.previous_service,
      notification.current_service,
      1 as sort_priority
    from public.service_submission_notifications as notification
    join public.services as service
      on service.org_id = notification.org_id
     and service.id = notification.service_id
    where p_kind in ('all', 'published_edit')
      and notification.org_id = (select public.current_org_id())
      and notification.kind = 'published_edit'
      and notification.read_at is null
  ), filtered as (
    select candidate.*
    from candidates as candidate
    where (p_category_id is null or candidate.category_id = p_category_id)
      and (
        btrim(coalesce(p_query, '')) = ''
        or concat_ws(
          ' ',
          candidate.title->>'ca',
          candidate.title->>'es',
          candidate.title->>'en',
          candidate.title->>'ar',
          candidate.title->>'fa',
          candidate.provider_name,
          candidate.contact_name
        ) ilike '%' || btrim(p_query) || '%'
      )
  )
  select
    filtered.item_kind,
    filtered.item_id,
    filtered.service_id,
    filtered.category_id,
    filtered.title,
    filtered.provider_name,
    filtered.contact_name,
    filtered.status,
    filtered.changed_at,
    filtered.previous_service,
    filtered.current_service,
    count(*) over() as total_count
  from filtered
  order by filtered.sort_priority, filtered.changed_at, filtered.item_id
  limit 25
  offset (p_page - 1) * 25;
end;
$$;

create or replace function public.invite_entity_collaborator(p_collaborating_entity_id uuid, p_email text, p_first_name text, p_last_name text)
 RETURNS TABLE(invitation_id uuid, profile_id uuid, email text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  clean_email text := lower(btrim(p_email));
  clean_first_name text := nullif(btrim(p_first_name), '');
  clean_last_name text := nullif(btrim(p_last_name), '');
  entity_name text;
  new_profile_id uuid := extensions.gen_random_uuid();
  new_invitation_id uuid := extensions.gen_random_uuid();
  invitation_expires_at timestamptz := now() + interval '30 days';
begin
  if not (select public.has_permission('entities.manage')) then
    raise exception 'only admins may invite entity collaborators'
      using errcode = 'insufficient_privilege';
  end if;
  if clean_email is null
    or length(clean_email) > 254
    or clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or clean_first_name is null
    or length(clean_first_name) > 100
    or clean_last_name is null
    or length(clean_last_name) > 100
  then
    raise check_violation using message = 'invalid entity collaborator invitation';
  end if;

  select entity.name into entity_name
  from public.collaborating_entities as entity
  where entity.id = p_collaborating_entity_id
    and entity.org_id = actor_org
    and entity.is_active;

  if entity_name is null then
    raise no_data_found using message = 'active collaborating entity not found';
  end if;
  if exists (
    select 1
    from auth.users as account
    where lower(account.email) = clean_email
  ) then
    raise unique_violation using message = 'an auth identity already uses this email';
  end if;

  perform public.assert_within_hourly_limit('entity.collaborator_invite', 30);

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    new_profile_id,
    'authenticated',
    'authenticated',
    clean_email,
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now(), '', '', '', '', '', ''
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    new_profile_id::text,
    new_profile_id,
    jsonb_build_object(
      'sub', new_profile_id::text,
      'email', clean_email,
      'email_verified', true
    ),
    'email',
    now(), now(), now()
  );

  insert into public.profiles (
    id,
    org_id,
    role,
    first_name,
    last_name,
    reference_entity,
    collaborating_entity_id,
    auth_method,
    terms_accepted_at
  ) values (
    new_profile_id,
    actor_org,
    'entity',
    clean_first_name,
    clean_last_name,
    entity_name,
    p_collaborating_entity_id,
    'magic_link',
    now()
  );

  insert into public.entity_invitations (
    id,
    org_id,
    collaborating_entity_id,
    email,
    profile_id,
    invited_by,
    expires_at
  ) values (
    new_invitation_id,
    actor_org,
    p_collaborating_entity_id,
    clean_email,
    new_profile_id,
    actor,
    invitation_expires_at
  );

  insert into public.audit_log (
    org_id, actor_id, action, target_type, target_id, changes
  ) values (
    actor_org,
    actor,
    'entity.collaborator_invite',
    'profile',
    new_profile_id,
    jsonb_build_object('collaborating_entity_id', p_collaborating_entity_id)
  );

  return query
  select new_invitation_id, new_profile_id, clean_email, invitation_expires_at;
end;
$$;

create or replace function public.invite_staff_member(p_email text, p_first_name text, p_last_name text, p_role text)
 RETURNS TABLE(profile_id uuid, email text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  clean_email text := lower(btrim(p_email));
  clean_first_name text := nullif(btrim(p_first_name), '');
  clean_last_name text := nullif(btrim(p_last_name), '');
  new_profile_id uuid := extensions.gen_random_uuid();
  invitation_expires_at timestamptz := now() + interval '30 days';
  org_language text;
begin
  if not (select public.has_permission('team.manage')) then
    raise insufficient_privilege using message = 'only active admins may invite staff members';
  end if;
  if clean_email is null
    or length(clean_email) > 254
    or clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or clean_first_name is null
    or length(clean_first_name) > 100
    or clean_last_name is null
    or length(clean_last_name) > 100
    or p_role not in ('staff', 'admin')
  then
    raise check_violation using message = 'invalid staff invitation';
  end if;
  if exists (select 1 from auth.users as account where lower(account.email) = clean_email) then
    raise unique_violation using message = 'an auth identity already uses this email';
  end if;

  perform public.assert_within_hourly_limit('staff.invite', 30);
  select default_language into org_language from public.organizations where id = actor_org;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', new_profile_id,
    'authenticated', 'authenticated', clean_email, '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), '', '', '', '', '', ''
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    new_profile_id::text,
    new_profile_id,
    jsonb_build_object('sub', new_profile_id::text, 'email', clean_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  insert into public.profiles (
    id, org_id, role, first_name, last_name, preferred_language,
    document_type, auth_method, terms_accepted_at
  ) values (
    new_profile_id, actor_org, p_role, clean_first_name, clean_last_name,
    org_language, 'none', 'magic_link', now()
  );

  insert into public.staff_invitations (
    org_id, profile_id, email, role, invited_by, expires_at
  ) values (
    actor_org, new_profile_id, clean_email, p_role, actor, invitation_expires_at
  );

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org, actor, 'staff.invite', 'profile', new_profile_id,
    jsonb_build_object('role', p_role)
  );

  return query select new_profile_id, clean_email, invitation_expires_at;
end;
$$;

create or replace function public.list_collaborating_entities()
 RETURNS TABLE(id uuid, name text, is_active boolean, active_collaborator_count integer, referral_count integer, pending_invitation_count integer, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $$
  select
    entity.id,
    entity.name,
    entity.is_active,
    count(distinct profile.id) filter (where profile.is_active)::integer,
    count(distinct referral.id)::integer,
    count(distinct invitation.id)
      filter (where invitation.accepted_at is null and invitation.expires_at > now())::integer,
    entity.created_at,
    entity.updated_at
  from public.collaborating_entities as entity
  left join public.profiles as profile
    on profile.org_id = entity.org_id
   and profile.collaborating_entity_id = entity.id
  left join public.entity_referrals as referral
    on referral.org_id = entity.org_id
   and referral.collaborating_entity_id = entity.id
  left join public.entity_invitations as invitation
    on invitation.org_id = entity.org_id
   and invitation.collaborating_entity_id = entity.id
  where (select public.has_permission('entities.manage'))
  group by entity.id
  order by entity.name, entity.id;
$$;

create or replace function public.list_entity_collaborators(p_collaborating_entity_id uuid)
 RETURNS TABLE(profile_id uuid, first_name text, last_name text, email text, is_active boolean, invited_at timestamp with time zone, accepted_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
begin
  if not (select public.has_permission('entities.manage')) then
    raise exception 'only admins may list entity collaborators'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    profile.id,
    profile.first_name,
    profile.last_name,
    account.email::text,
    profile.is_active,
    invitation.created_at,
    invitation.accepted_at
  from public.profiles as profile
  join auth.users as account on account.id = profile.id
  left join public.entity_invitations as invitation
    on invitation.org_id = profile.org_id
   and invitation.profile_id = profile.id
  where profile.org_id = (select public.current_org_id())
    and profile.role = 'entity'
    and profile.collaborating_entity_id = p_collaborating_entity_id
  order by profile.last_name, profile.first_name, profile.id;
end;
$$;

create or replace function public.list_forum_moderation_queue()
 RETURNS TABLE(target_type text, target_id uuid, post_id uuid, author_id uuid, author_first_name text, content text, visibility text, is_pinned boolean, category_id uuid, flag_count integer, first_flagged_at timestamp with time zone, reasons jsonb, comments jsonb, media_file_url text, media_thumbnail_url text, media_file_type text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $$
  select * from (
    select 'post'::text, post.id, post.id, post.author_id, post.author_first_name,
      post.content, post.visibility, post.is_pinned, post.category_id,
      count(flag.id)::integer, min(flag.created_at),
      jsonb_agg(flag.reason order by flag.created_at, flag.id),
      coalesce(jsonb_agg(flag.comment order by flag.created_at, flag.id)
        filter (where flag.comment is not null), '[]'::jsonb),
      null::text, null::text, null::text
    from public.forum_posts as post
    join public.forum_flags as flag
      on flag.org_id = post.org_id and flag.post_id = post.id and flag.state = 'pending'
    where post.org_id = (select public.current_org_id()) and (select public.has_permission('forum.moderate'))
    group by post.id
    union all
    select 'reply'::text, reply.id, reply.post_id, reply.author_id, reply.author_first_name,
      reply.content, reply.visibility, false, post.category_id,
      count(flag.id)::integer, min(flag.created_at),
      jsonb_agg(flag.reason order by flag.created_at, flag.id),
      coalesce(jsonb_agg(flag.comment order by flag.created_at, flag.id)
        filter (where flag.comment is not null), '[]'::jsonb),
      null::text, null::text, null::text
    from public.forum_replies as reply
    join public.forum_posts as post on post.org_id = reply.org_id and post.id = reply.post_id
    join public.forum_flags as flag
      on flag.org_id = reply.org_id and flag.reply_id = reply.id and flag.state = 'pending'
    where reply.org_id = (select public.current_org_id()) and (select public.has_permission('forum.moderate'))
    group by reply.id, post.category_id
    union all
    select 'media'::text, item.id, null::uuid, item.uploaded_by, item.uploader_first_name,
      item.caption, item.moderation_state, false, null::uuid,
      count(flag.id)::integer, min(flag.created_at),
      jsonb_agg(flag.reason order by flag.created_at, flag.id),
      coalesce(jsonb_agg(flag.comment order by flag.created_at, flag.id)
        filter (where flag.comment is not null), '[]'::jsonb),
      item.file_url, item.thumbnail_url, item.file_type
    from public.media_items as item
    join public.forum_flags as flag
      on flag.org_id = item.org_id and flag.media_id = item.id and flag.state = 'pending'
    where item.org_id = (select public.current_org_id()) and (select public.has_permission('gallery.moderate'))
    group by item.id
  ) as queue(
    target_type, target_id, post_id, author_id, author_first_name, content,
    visibility, is_pinned, category_id, flag_count, first_flagged_at,
    reasons, comments, media_file_url, media_thumbnail_url, media_file_type
  )
  order by first_flagged_at, target_id;
$$;

create or replace function public.list_staff_conversations(p_unread_only boolean DEFAULT false, p_assigned_to_me boolean DEFAULT false, p_participant_role text DEFAULT 'all'::text, p_query text DEFAULT ''::text)
 RETURNS TABLE(conversation_id uuid, participant_id uuid, participant_first_name text, participant_last_name text, participant_role text, participant_city text, participant_language text, assigned_staff_id uuid, assigned_staff_first_name text, assigned_staff_last_name text, unread_count bigint, latest_message_at timestamp with time zone, latest_message_preview text, latest_sender_id uuid, conversation_created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  search_query tsquery := private.conversation_prefix_tsquery(left(coalesce(p_query, ''), 200));
begin
  if actor is null or not (select public.has_permission('messages.inbox')) then
    raise exception 'only staff may list organization conversations'
      using errcode = 'insufficient_privilege';
  end if;
  if p_participant_role not in ('all', 'player', 'entity') then
    raise exception 'invalid conversation participant filter'
      using errcode = 'check_violation';
  end if;

  return query
  select
    conversation.id,
    participant.id,
    participant.first_name,
    participant.last_name,
    participant.role,
    participant.city,
    participant.preferred_language,
    conversation.assigned_staff_id,
    assigned.first_name,
    assigned.last_name,
    unread.total,
    latest.created_at,
    left(latest.content, 160),
    latest.sender_id,
    conversation.created_at
  from public.conversations as conversation
  join public.profiles as participant
    on participant.org_id = conversation.org_id
   and participant.id = conversation.user_id
  left join public.profiles as assigned
    on assigned.org_id = conversation.org_id
   and assigned.id = conversation.assigned_staff_id
  left join public.conversation_read_states as read_state
    on read_state.conversation_id = conversation.id
   and read_state.user_id = actor
  left join public.messages as read_message
    on read_message.id = read_state.last_read_message_id
  left join lateral (
    select message.sender_id, message.content, message.created_at
    from public.messages as message
    where message.conversation_id = conversation.id
    order by message.created_at desc, message.id desc
    limit 1
  ) as latest on true
  cross join lateral (
    select count(*)::bigint as total
    from public.messages as message
    where message.conversation_id = conversation.id
      and message.sender_id <> actor
      and (
        read_message.id is null
        or (message.created_at, message.id) > (read_message.created_at, read_message.id)
      )
  ) as unread
  where conversation.org_id = (select public.current_org_id())
    and (not p_unread_only or unread.total > 0)
    and (not p_assigned_to_me or conversation.assigned_staff_id = actor)
    and (p_participant_role = 'all' or participant.role = p_participant_role)
    and (
      search_query is null
      or to_tsvector(
        'simple',
        public.immutable_unaccent(
          concat_ws(' ', participant.first_name, participant.last_name)
        ) || ' ' || concat_ws(' ', participant.first_name, participant.last_name)
      ) @@ search_query
    )
  order by
    (unread.total > 0) desc,
    latest.created_at desc nulls last,
    conversation.created_at desc,
    conversation.id
  limit 200;
end;
$$;

create or replace function public.list_staff_feedback_submissions(p_type text DEFAULT NULL::text, p_status text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, author_id uuid, author_first_name text, author_last_name text, type text, content text, image_url text, status text, resolved_by uuid, resolved_at timestamp with time zone, conversation_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
begin
  if not public.has_permission('feedback.view') then
    raise exception 'only staff may list feedback' using errcode = 'insufficient_privilege';
  end if;
  if p_type is not null and p_type not in ('activity_proposal', 'idea', 'problem', 'general') then
    raise check_violation using message = 'invalid feedback type filter';
  end if;
  if p_status is not null and p_status not in ('new', 'read', 'in_progress', 'resolved') then
    raise check_violation using message = 'invalid feedback status filter';
  end if;

  return query
  select
    submission.id,
    submission.author_id,
    author.first_name,
    author.last_name,
    submission.type,
    public.decrypt_field(submission.content_encrypted),
    submission.image_url,
    submission.status,
    submission.resolved_by,
    submission.resolved_at,
    conversation.id,
    submission.created_at,
    submission.updated_at
  from public.feedback_submissions as submission
  join public.profiles as author
    on author.org_id = submission.org_id and author.id = submission.author_id
  join public.conversations as conversation
    on conversation.org_id = submission.org_id and conversation.user_id = submission.author_id
  where submission.org_id = (select public.current_org_id())
    and (p_type is null or submission.type = p_type)
    and (p_status is null or submission.status = p_status)
  order by submission.created_at desc, submission.id desc;
end;
$$;

create or replace function public.list_staff_members()
 RETURNS TABLE(profile_id uuid, first_name text, last_name text, email text, role text, is_active boolean, invited_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
begin
  if not (select public.has_permission('team.manage')) then
    raise insufficient_privilege using message = 'only active admins may list staff members';
  end if;
  return query
  select
    profile.id,
    profile.first_name,
    profile.last_name,
    account.email::text,
    profile.role,
    profile.is_active,
    invitation.created_at
  from public.profiles as profile
  join auth.users as account on account.id = profile.id
  left join public.staff_invitations as invitation on invitation.profile_id = profile.id
  where profile.org_id = (select public.current_org_id())
    and profile.role in ('staff', 'admin')
  order by profile.is_active desc, profile.last_name, profile.first_name, profile.id;
end;
$$;

create or replace function public.list_staff_mentoring_requests()
 RETURNS TABLE(id uuid, player_id uuid, player_first_name text, player_last_name text, topic text, topic_detail text, preferred_date date, preferred_time time without time zone, status text, scheduled_at timestamp with time zone, assigned_staff_id uuid, assigned_staff_name text, staff_notes text, completed_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
  select
    request.id,
    request.player_id,
    player.first_name,
    player.last_name,
    request.topic,
    case
      when request.topic_detail_encrypted is null then null
      else public.decrypt_field(request.topic_detail_encrypted)
    end,
    request.preferred_date,
    request.preferred_time,
    request.status,
    request.scheduled_at,
    request.assigned_staff_id,
    case
      when staff.id is null then null
      else concat_ws(' ', staff.first_name, staff.last_name)
    end,
    case
      when request.staff_notes_encrypted is null then null
      else public.decrypt_field(request.staff_notes_encrypted)
    end,
    request.completed_at,
    request.created_at,
    request.updated_at
  from public.mentoring_requests as request
  join public.profiles as player
    on player.org_id = request.org_id
   and player.id = request.player_id
  left join public.profiles as staff
    on staff.org_id = request.org_id
   and staff.id = request.assigned_staff_id
  where request.org_id = (select public.current_org_id())
    and public.has_permission('mentoring.manage')
  order by
    case request.status
      when 'requested' then 0
      when 'scheduled' then 1
      when 'completed' then 2
      else 3
    end,
    request.created_at,
    request.id;
$$;

create or replace function public.list_staff_referrals(p_status text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, entity_user_id uuid, referred_profile_id uuid, assigned_staff_id uuid, referred_first_name text, referred_last_name text, referred_phone text, referred_email text, documentation_status text, notes text, status text, entity_name text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $$
  select
    referral.id,
    referral.entity_user_id,
    referral.referred_profile_id,
    referral.assigned_staff_id,
    referral.referred_first_name,
    referral.referred_last_name,
    public.decrypt_field(referral.referred_phone),
    public.decrypt_field(referral.referred_email),
    referral.documentation_status,
    public.decrypt_field(referral.notes),
    referral.status,
    entity.name,
    referral.created_at,
    referral.updated_at
  from public.entity_referrals as referral
  join public.collaborating_entities as entity
    on entity.org_id = referral.org_id
   and entity.id = referral.collaborating_entity_id
  where (select public.has_permission('referrals.manage'))
    and (p_status is null or referral.status = p_status)
  order by
    case when referral.status = 'pending' then 0 else 1 end,
    referral.created_at,
    referral.id;
$$;

create or replace function public.list_survey_responses(p_survey_id uuid)
 RETURNS TABLE(id uuid, player_id uuid, player_name text, language text, answers jsonb, status text, completed_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
begin
  if not (select public.has_permission('surveys.results')) then
    raise exception 'SURVEYS/STAFF_ONLY' using errcode = '42501';
  end if;
  return query
  select
    response.id,
    response.player_id,
    btrim(profile.first_name || ' ' || profile.last_name),
    case when profile.preferred_language in ('ca', 'es', 'en', 'ar', 'fa')
      then profile.preferred_language else 'ca' end,
    public.decrypt_field(response.answers_encrypted)::jsonb,
    response.status,
    response.completed_at,
    response.updated_at
  from public.survey_responses as response
  join public.profiles as profile
    on profile.org_id = response.org_id and profile.id = response.player_id
  where response.org_id = (select public.current_org_id())
    and response.survey_id = p_survey_id
  order by response.completed_at desc nulls last, response.updated_at desc, response.id;
end;
$$;

create or replace function public.list_surveys()
 RETURNS TABLE(id uuid, title jsonb, event_id uuid, published_at timestamp with time zone, closes_at timestamp with time zone, audience_kind text, audience_config jsonb, questions jsonb, response_count bigint, completed_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
  select
    survey.id,
    survey.title,
    survey.event_id,
    survey.published_at,
    survey.closes_at,
    survey.audience_kind,
    survey.audience_config,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', question.id,
        'type', question.question_type,
        'prompt', question.prompt,
        'options', question.options,
        'required', question.required,
        'sortOrder', question.sort_order
      ) order by question.sort_order, question.id)
      from public.survey_questions as question
      where question.org_id = survey.org_id and question.survey_id = survey.id
    ), '[]'::jsonb),
    (select count(*) from public.survey_responses as response
      where response.org_id = survey.org_id and response.survey_id = survey.id),
    (select count(*) from public.survey_responses as response
      where response.org_id = survey.org_id and response.survey_id = survey.id
        and response.status = 'completed')
  from public.surveys as survey
  where survey.org_id = (select public.current_org_id())
    and (select (public.has_permission('surveys.manage') or public.has_permission('surveys.results')))
  order by survey.created_at desc, survey.id desc;
$$;

create or replace function public.moderate_forum_target(p_target_type text, p_target_id uuid, p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
begin
  if not (case when p_target_type = 'media' then (select public.has_permission('gallery.moderate'))
           else (select public.has_permission('forum.moderate')) end)
    or p_target_type not in ('post', 'reply', 'media')
    or p_action not in ('dismiss', 'hide', 'delete')
    or (p_target_type = 'media' and p_action = 'delete')
  then
    raise exception 'forum moderation action denied' using errcode = 'insufficient_privilege';
  end if;

  if p_target_type = 'post' then
    perform 1 from public.forum_posts where org_id = actor_org and id = p_target_id for update;
  elsif p_target_type = 'reply' then
    perform 1 from public.forum_replies where org_id = actor_org and id = p_target_id for update;
  else
    perform 1 from public.media_items where org_id = actor_org and id = p_target_id for update;
  end if;
  if not found then
    raise exception 'forum moderation target not found' using errcode = 'no_data_found';
  end if;

  update public.forum_flags
  set state = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end,
    reviewed_at = now(), reviewed_by = actor
  where org_id = actor_org and state = 'pending' and (
    (p_target_type = 'post' and post_id = p_target_id)
    or (p_target_type = 'reply' and reply_id = p_target_id)
    or (p_target_type = 'media' and media_id = p_target_id)
  );

  if p_target_type = 'post' then
    update public.forum_posts
    set visibility = case p_action
        when 'dismiss' then case when visibility = 'hidden_pending_review' then 'visible' else visibility end
        when 'hide' then case when visibility = 'deleted' then 'deleted' else 'hidden' end
        else 'deleted' end,
      content = case when p_action = 'delete' then null else content end,
      image_url = case when p_action = 'delete' then null else image_url end,
      is_pinned = case when p_action = 'delete' then false else is_pinned end,
      flag_count = 0
    where org_id = actor_org and id = p_target_id;
  elsif p_target_type = 'reply' then
    update public.forum_replies
    set visibility = case p_action
        when 'dismiss' then case when visibility = 'hidden_pending_review' then 'visible' else visibility end
        when 'hide' then case when visibility = 'deleted' then 'deleted' else 'hidden' end
        else 'deleted' end,
      content = case when p_action = 'delete' then null else content end,
      image_url = case when p_action = 'delete' then null else image_url end,
      flag_count = 0
    where org_id = actor_org and id = p_target_id;
  else
    update public.media_items
    set moderation_state = case p_action
        when 'dismiss' then case when moderation_state = 'hidden_pending_review'
          then 'visible' else moderation_state end
        else 'hidden' end,
      flag_count = 0
    where org_id = actor_org and id = p_target_id;
  end if;
end;
$$;

create or replace function public.prepare_media_item_deletion(p_media_item_id uuid)
 RETURNS TABLE(file_object_key text, thumbnail_object_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
begin
  return query
  select item.file_url, item.thumbnail_url
  from public.media_items as item
  where item.id = p_media_item_id
    and item.org_id = (select public.current_org_id())
    and (item.uploaded_by = (select auth.uid()) or (select (public.has_permission('gallery.moderate') or public.has_permission('forum.moderate'))));
  if not found then
    raise exception 'media deletion denied' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function public.preview_notification_audience(p_audience_kind text, p_audience_config jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(participant_id uuid, full_name text, language text, device_count integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $$
begin
  if not (select public.has_permission('notifications.send')) then
    raise exception 'NOTIFICATIONS/STAFF_ONLY' using errcode = '42501';
  end if;
  if p_audience_kind not in ('all', 'interest', 'signup', 'entity', 'custom_group') then
    raise exception 'NOTIFICATIONS/INVALID_AUDIENCE' using errcode = '22023';
  end if;

  return query
  select
    profile.id,
    btrim(profile.first_name || ' ' || profile.last_name),
    case
      when profile.preferred_language in ('ca', 'es', 'en', 'ar', 'fa')
        then profile.preferred_language
      else 'ca'
    end,
    count(distinct push_token.id)::integer
  from public.profiles as profile
  join public.push_tokens as push_token on push_token.user_id = profile.id
  where profile.org_id = (select public.current_org_id())
    and profile.role = 'player'
    and profile.is_active
    and profile.push_notifications_enabled
    and (
      p_audience_kind = 'all'
      or (
        p_audience_kind = 'interest'
        and exists (
          select 1
          from public.service_interests as interest
          join public.services as service
            on service.org_id = interest.org_id
           and service.id = interest.service_id
          where interest.org_id = profile.org_id
            and interest.user_id = profile.id
            and service.category_id = nullif(p_audience_config->>'service_category_id', '')::uuid
        )
      )
      or (
        p_audience_kind = 'signup'
        and exists (
          select 1
          from public.event_signups as signup
          where signup.org_id = profile.org_id
            and signup.player_id = profile.id
            and signup.event_id = nullif(p_audience_config->>'event_id', '')::uuid
            and signup.state in ('interested', 'confirmed')
        )
      )
      or (
        p_audience_kind = 'entity'
        and lower(btrim(profile.reference_entity)) =
          lower(btrim(nullif(p_audience_config->>'entity_name', '')))
      )
      or (
        p_audience_kind = 'custom_group'
        and exists (
          select 1
          from public.custom_notification_group_members as membership
          where membership.org_id = profile.org_id
            and membership.participant_id = profile.id
            and membership.group_id = nullif(p_audience_config->>'custom_group_id', '')::uuid
        )
      )
    )
  group by profile.id, profile.first_name, profile.last_name, profile.preferred_language
  order by profile.last_name, profile.first_name, profile.id;
end;
$$;

create or replace function public.purge_expired_entity_invitations(p_now timestamp with time zone DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  removed integer;
begin
  if (select auth.role()) <> 'service_role' and not (select public.has_permission('entities.manage')) then
    raise exception 'only service role or admin may purge entity invitations'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.entity_invitations
  where expires_at < p_now - interval '24 months'
     or accepted_at < p_now - interval '24 months';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

create or replace function public.purge_expired_entity_referrals(p_now timestamp with time zone DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  removed integer;
begin
  if (select auth.role()) <> 'service_role' and not (select public.has_permission('entities.manage')) then
    raise exception 'only service role or admin may purge expired referral intake'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.entity_referrals
  where referred_profile_id is null
    and created_at < p_now - interval '24 months';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

create or replace function public.register_internal_document(p_object_key text, p_name text, p_content_type text, p_file_size bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  document_id uuid;
begin
  if not (select public.has_permission('settings.documents')) then
    raise insufficient_privilege using message = 'internal documents require staff access';
  end if;
  if not p_object_key like actor_org::text || '/documents/%'
    or nullif(btrim(p_name), '') is null
    or length(btrim(p_name)) > 255
    or p_content_type not in (
      'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
    or p_file_size not between 1 and 10485760
  then
    raise check_violation using message = 'invalid internal document metadata';
  end if;
  insert into public.internal_documents (
    org_id, uploaded_by, object_key, name, content_type, file_size
  ) values (
    actor_org, actor, p_object_key, btrim(p_name), p_content_type, p_file_size
  ) returning id into document_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org, actor, 'internal_document.create', 'internal_document', document_id,
    jsonb_build_object('content_type', p_content_type, 'file_size', p_file_size)
  );
  return document_id;
end;
$$;

create or replace function public.remove_staff_member(p_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  subject_role text;
begin
  if not (select public.has_permission('team.manage')) then
    raise insufficient_privilege using message = 'only active admins may remove staff members';
  end if;
  perform private.lock_staff_admin_count(actor_org);
  select role into subject_role
  from public.profiles
  where id = p_profile_id and org_id = actor_org and role in ('staff', 'admin') and is_active
  for update;
  if subject_role is null then
    raise no_data_found using message = 'active staff member not found';
  end if;
  if subject_role = 'admin' then
    perform private.assert_another_active_admin(actor_org, p_profile_id);
  end if;

  update public.profiles set is_active = false where id = p_profile_id;
  update auth.users
  set banned_until = now() + interval '100 years', updated_at = now()
  where id = p_profile_id;
  delete from auth.refresh_tokens where user_id = p_profile_id::text;
  delete from auth.sessions where user_id = p_profile_id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org, actor, 'staff.remove', 'profile', p_profile_id,
    jsonb_build_object('role', subject_role, 'sessions_revoked', true)
  );
end;
$$;

create or replace function public.reorder_service_categories(p_category_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
declare
  category_count integer;
begin
  if not public.has_permission('services.edit') then
    raise insufficient_privilege using message = 'only staff may reorder service categories';
  end if;
  if p_category_ids is null or cardinality(p_category_ids) = 0 then
    raise check_violation using message = 'the complete category order is required';
  end if;
  if cardinality(p_category_ids) <> (
    select count(distinct category_id) from unnest(p_category_ids) as category_id
  ) then
    raise check_violation using message = 'category order contains duplicate ids';
  end if;

  select count(*)
  into category_count
  from public.service_categories as category
  where category.org_id = public.current_org_id();

  if cardinality(p_category_ids) <> category_count
    or exists (
      select 1
      from unnest(p_category_ids) as requested(category_id)
      where not exists (
        select 1
        from public.service_categories as category
        where category.org_id = public.current_org_id()
          and category.id = requested.category_id
      )
    ) then
    raise check_violation using message =
      'category order must contain every category in the current organization exactly once';
  end if;

  update public.service_categories as category
  set sort_order = requested.ordinality::integer * 10
  from unnest(p_category_ids) with ordinality as requested(category_id, ordinality)
  where category.org_id = public.current_org_id()
    and category.id = requested.category_id;
end;
$$;

create or replace function public.review_entity_service(p_service_id uuid, p_decision text, p_payload jsonb, p_comment text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
declare
  reviewed_service public.services%rowtype;
  public_comment text := nullif(btrim(p_comment), '');
  public_comment_id uuid;
begin
  if not (select public.has_permission('services.review')) then
    raise insufficient_privilege using message =
      'only staff may review entity service submissions';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise check_violation using message = 'invalid entity service review decision';
  end if;
  if public_comment is not null and length(public_comment) > 4000 then
    raise check_violation using message = 'review comments accept at most 4000 characters';
  end if;
  if p_decision = 'reject' and public_comment is null then
    raise check_violation using message = 'rejection requires a human comment';
  end if;

  select service.*
  into reviewed_service
  from public.services as service
  where service.id = p_service_id
    and service.org_id = (select public.current_org_id())
    and service.submitted_by is not null
    and service.status = 'pending'
  for update;

  if not found then
    raise insufficient_privilege using message =
      'only a pending entity submission can be reviewed';
  end if;

  if p_decision = 'approve' then
    if jsonb_typeof(p_payload) <> 'object'
      or p_payload ->> 'serviceId' is distinct from p_service_id::text
      or p_payload ->> 'status' is distinct from 'published' then
      raise check_violation using message =
        'approval requires the reviewed service publication payload';
    end if;

    update public.services as service
    set status = 'approved',
        reviewed_by = (select auth.uid()),
        reviewed_at = now(),
        rejection_reason = null
    where service.id = reviewed_service.id;

    perform public.save_admin_service(p_payload);

    if public_comment is not null then
      insert into public.service_submission_comments (
        service_id,
        body,
        is_internal
      ) values (
        reviewed_service.id,
        public_comment,
        false
      ) returning id into public_comment_id;
    end if;

    insert into public.service_submission_notifications (
      org_id,
      service_id,
      kind,
      created_by,
      recipient_id,
      decision_comment_id
    ) values (
      reviewed_service.org_id,
      reviewed_service.id,
      'approved',
      (select auth.uid()),
      reviewed_service.submitted_by,
      public_comment_id
    );

    return reviewed_service.id;
  end if;

  if p_payload is not null then
    raise check_violation using message = 'rejection does not accept a service payload';
  end if;

  update public.services as service
  set status = 'rejected',
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      rejection_reason = public_comment
  where service.id = reviewed_service.id;

  insert into public.service_submission_comments (
    service_id,
    body,
    is_internal
  ) values (
    reviewed_service.id,
    public_comment,
    false
  ) returning id into public_comment_id;

  insert into public.service_submission_notifications (
    org_id,
    service_id,
    kind,
    created_by,
    recipient_id,
    decision_comment_id
  ) values (
    reviewed_service.org_id,
    reviewed_service.id,
    'rejected',
    (select auth.uid()),
    reviewed_service.submitted_by,
    public_comment_id
  );

  return reviewed_service.id;
end;
$$;

create or replace function public.save_admin_service(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
declare
  allowed_keys constant text[] := array[
    'serviceId', 'categoryId', 'title', 'description', 'providerName',
    'location', 'zone', 'costType', 'costAmount', 'costDetails',
    'contactName', 'contactPhone', 'contactEmail', 'contactRole',
    'schedule', 'externalUrl', 'availability', 'metadata', 'status',
    'publishedAt', 'expiresAt', 'images'
  ];
  saved_service_id uuid;
  selected_category_id uuid;
  publication_status text;
  images jsonb;
begin
  if not (public.has_permission('services.edit') or public.has_permission('services.publish')) then
    raise insufficient_privilege using message =
      'only staff may create or edit directory services';
  end if;
  if jsonb_typeof(p_payload) <> 'object'
    or not p_payload ?& allowed_keys
    or p_payload - allowed_keys <> '{}'::jsonb then
    raise check_violation using message = 'invalid admin service payload shape';
  end if;

  selected_category_id := (p_payload ->> 'categoryId')::uuid;
  publication_status := p_payload ->> 'status';
  images := p_payload -> 'images';

  if publication_status not in ('draft', 'published') then
    raise check_violation using message = 'staff CRUD accepts only draft or published status';
  end if;
  if jsonb_typeof(images) <> 'array' or jsonb_array_length(images) > 12 then
    raise check_violation using message = 'services accept an array of at most twelve images';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(images) as image(value)
    where jsonb_typeof(image.value) <> 'object'
      or not image.value ?& array['url', 'altText']
      or image.value - array['url', 'altText'] <> '{}'::jsonb
      or length(btrim(image.value ->> 'url')) = 0
      or not public.is_localized_content_valid(
        image.value -> 'altText',
        500,
        publication_status = 'published'
      )
  ) then
    raise check_violation using message = 'invalid service image or multilingual alt text';
  end if;

  saved_service_id := nullif(p_payload ->> 'serviceId', '')::uuid;
  if saved_service_id is null then
    insert into public.services (
      category_id, title, description, provider_name, location, zone,
      cost_type, cost_amount, cost_details, contact_name, contact_phone,
      contact_email, contact_role, schedule, external_url, availability,
      metadata, status, published_at, expires_at, created_by
    ) values (
      selected_category_id,
      p_payload -> 'title',
      case
        when jsonb_typeof(p_payload -> 'description') = 'null' then null
        else p_payload -> 'description'
      end,
      p_payload ->> 'providerName',
      p_payload ->> 'location',
      p_payload ->> 'zone',
      p_payload ->> 'costType',
      (p_payload ->> 'costAmount')::numeric,
      p_payload ->> 'costDetails',
      p_payload ->> 'contactName',
      p_payload ->> 'contactPhone',
      p_payload ->> 'contactEmail',
      p_payload ->> 'contactRole',
      p_payload ->> 'schedule',
      p_payload ->> 'externalUrl',
      p_payload ->> 'availability',
      p_payload -> 'metadata',
      publication_status,
      (p_payload ->> 'publishedAt')::timestamptz,
      (p_payload ->> 'expiresAt')::timestamptz,
      auth.uid()
    )
    returning id into saved_service_id;
  else
    update public.services as service
    set category_id = selected_category_id,
        title = p_payload -> 'title',
        description = case
          when jsonb_typeof(p_payload -> 'description') = 'null' then null
          else p_payload -> 'description'
        end,
        provider_name = p_payload ->> 'providerName',
        location = p_payload ->> 'location',
        zone = p_payload ->> 'zone',
        cost_type = p_payload ->> 'costType',
        cost_amount = (p_payload ->> 'costAmount')::numeric,
        cost_details = p_payload ->> 'costDetails',
        contact_name = p_payload ->> 'contactName',
        contact_phone = p_payload ->> 'contactPhone',
        contact_email = p_payload ->> 'contactEmail',
        contact_role = p_payload ->> 'contactRole',
        schedule = p_payload ->> 'schedule',
        external_url = p_payload ->> 'externalUrl',
        availability = p_payload ->> 'availability',
        metadata = p_payload -> 'metadata',
        status = publication_status,
        published_at = (p_payload ->> 'publishedAt')::timestamptz,
        expires_at = (p_payload ->> 'expiresAt')::timestamptz
    where service.id = saved_service_id
      and service.org_id = public.current_org_id()
    returning service.id into saved_service_id;

    if not found then
      raise insufficient_privilege using message =
        'service is unavailable in the current organization';
    end if;
  end if;

  delete from public.service_images as image
  where image.service_id = saved_service_id
    and image.org_id = public.current_org_id();

  insert into public.service_images (service_id, url, alt_text, position)
  select
    saved_service_id,
    image.value ->> 'url',
    image.value -> 'altText',
    image.ordinality::integer - 1
  from jsonb_array_elements(images) with ordinality as image(value, ordinality);

  return saved_service_id;
end;
$$;

create or replace function public.save_forum_category(p_category_id uuid, p_name jsonb, p_slug text, p_icon text, p_color text, p_sort_order integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
declare
  actor_org uuid := (select public.current_org_id());
  result uuid;
begin
  if not (select public.has_permission('forum.moderate'))
    or jsonb_typeof(p_name) <> 'object'
    or exists (
      select 1
      from unnest(array['ca', 'es', 'en', 'ar', 'fa']) as language(code)
      where nullif(btrim(p_name ->> language.code), '') is null
    )
  then
    raise exception 'forum category action denied or invalid'
      using errcode = 'insufficient_privilege';
  end if;

  if p_category_id is null then
    insert into public.forum_categories (org_id, name, slug, icon, color, sort_order)
    values (
      actor_org,
      p_name,
      lower(btrim(p_slug)),
      btrim(p_icon),
      btrim(p_color),
      p_sort_order
    )
    returning id into result;
    return result;
  end if;

  update public.forum_categories
  set
    name = p_name,
    slug = lower(btrim(p_slug)),
    icon = btrim(p_icon),
    color = btrim(p_color),
    sort_order = p_sort_order
  where id = p_category_id and org_id = actor_org
  returning id into result;
  if result is null then
    raise exception 'forum category not found' using errcode = 'no_data_found';
  end if;
  return result;
end;
$$;

create or replace function public.save_survey(p_id uuid, p_title jsonb, p_event_id uuid, p_published_at timestamp with time zone, p_closes_at timestamp with time zone, p_audience_kind text, p_audience_config jsonb, p_questions jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  saved_id uuid;
  question jsonb;
begin
  if not (select public.has_permission('surveys.manage')) then
    raise exception 'SURVEYS/STAFF_ONLY' using errcode = '42501';
  end if;
  if not private.valid_survey_copy(p_title, 160)
    or p_audience_kind not in ('all', 'interest', 'signup', 'entity', 'custom_group')
    or p_published_at is null
    or (p_closes_at is not null and p_closes_at <= p_published_at)
    or not private.validate_survey_questions(p_questions)
  then
    raise exception 'SURVEYS/INVALID_DEFINITION' using errcode = '23514';
  end if;
  if p_event_id is not null and not exists (
    select 1 from public.events where id = p_event_id and org_id = actor_org
  ) then
    raise exception 'SURVEYS/EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_id is null then
    insert into public.surveys (
      org_id, event_id, title, published_at, closes_at, audience_kind, audience_config, created_by
    ) values (
      actor_org, p_event_id, p_title, p_published_at, p_closes_at,
      p_audience_kind, coalesce(p_audience_config, '{}'::jsonb), actor
    ) returning id into saved_id;
  else
    if exists (
      select 1 from public.survey_responses
      where org_id = actor_org and survey_id = p_id
    ) then
      raise exception 'SURVEYS/RESPONSES_EXIST' using errcode = '55000';
    end if;
    update public.surveys set
      event_id = p_event_id,
      title = p_title,
      published_at = p_published_at,
      closes_at = p_closes_at,
      audience_kind = p_audience_kind,
      audience_config = coalesce(p_audience_config, '{}'::jsonb)
    where id = p_id and org_id = actor_org
    returning id into saved_id;
    if saved_id is null then
      raise exception 'SURVEYS/NOT_FOUND' using errcode = 'P0002';
    end if;
    delete from public.survey_questions where survey_id = saved_id and org_id = actor_org;
  end if;

  for question in select value from jsonb_array_elements(p_questions)
  loop
    insert into public.survey_questions (
      id, org_id, survey_id, prompt, question_type, options, required, sort_order
    ) values (
      (question->>'id')::uuid,
      actor_org,
      saved_id,
      question->'prompt',
      question->>'type',
      nullif(question->'options', 'null'::jsonb),
      (question->>'required')::boolean,
      (question->>'sortOrder')::integer
    );
  end loop;
  return saved_id;
end;
$$;

create or replace function public.schedule_mentoring_request(p_request_id uuid, p_scheduled_at timestamp with time zone, p_assigned_staff_id uuid, p_staff_notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor_org uuid := public.current_org_id();
  request public.mentoring_requests%rowtype;
  normalized_notes text := nullif(btrim(p_staff_notes), '');
  notification_kind text;
  notification_id uuid;
  publication_id uuid;
begin
  if actor_org is null or not public.has_permission('mentoring.manage') then
    raise exception 'only staff may schedule mentoring'
      using errcode = 'insufficient_privilege';
  end if;

  select row.* into request
  from public.mentoring_requests as row
  where row.org_id = actor_org and row.id = p_request_id
  for update;

  if not found then
    raise no_data_found using message = 'mentoring request not found';
  end if;

  if request.status not in ('requested', 'scheduled')
    or p_scheduled_at <= now()
    or normalized_notes is not null and length(normalized_notes) > 2000
    or not exists (
      select 1 from public.profiles as staff
      where staff.org_id = actor_org
        and staff.id = p_assigned_staff_id
        and (select private.profile_has_permission(staff.id, 'mentoring.manage'))
        and staff.is_active
    )
  then
    raise check_violation using message = 'invalid mentoring schedule';
  end if;

  notification_kind := case when request.status = 'requested' then 'scheduled' else 'changed' end;

  update public.mentoring_requests
  set
    status = 'scheduled',
    scheduled_at = p_scheduled_at,
    assigned_staff_id = p_assigned_staff_id,
    staff_notes_encrypted = case
      when normalized_notes is null then null
      else public.encrypt_field(normalized_notes)
    end,
    completed_at = null
  where id = request.id;

  insert into public.mentoring_notification_events (
    org_id, request_id, recipient_id, kind
  ) values (
    request.org_id, request.id, request.player_id, notification_kind
  )
  returning id into notification_id;

  insert into public.push_publications (
    org_id, content_type, content_id, recipient_id, scheduled_for, state
  ) values (
    request.org_id,
    'mentoring_update',
    notification_id,
    request.player_id,
    now(),
    'processing'
  )
  returning id into publication_id;

  insert into public.push_deliveries (
    org_id, publication_id, push_token_id, recipient_id, language, next_attempt_at
  )
  select
    request.org_id,
    publication_id,
    push_token.id,
    player.id,
    case
      when player.preferred_language in ('ca', 'es', 'en', 'ar', 'fa')
        then player.preferred_language
      else 'ca'
    end,
    now()
  from public.profiles as player
  join public.push_tokens as push_token on push_token.user_id = player.id
  where player.org_id = request.org_id
    and player.id = request.player_id
    and player.role = 'player'
    and player.is_active
    and player.push_notifications_enabled
  on conflict on constraint push_deliveries_publication_token_unique do nothing;

  perform private.invoke_push_dispatch('mentoring_update');
end;
$$;

create or replace function public.send_message(p_conversation_id uuid, p_message_id uuid, p_content text, p_image_url text)
 RETURNS messages
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  result public.messages;
begin
  if actor is null then
    raise exception 'authentication is required' using errcode = 'insufficient_privilege';
  end if;

  insert into public.messages (
    id, org_id, conversation_id, sender_id, content, image_url
  )
  select
    p_message_id,
    conversation.org_id,
    conversation.id,
    actor,
    nullif(btrim(p_content), ''),
    nullif(btrim(p_image_url), '')
  from public.conversations as conversation
  where conversation.id = p_conversation_id
    and conversation.org_id = actor_org
    and (
      conversation.user_id = actor
      or (select public.has_permission('messages.inbox'))
    )
  on conflict (id) do nothing;

  select message.* into result
  from public.messages as message
  where message.id = p_message_id
    and message.conversation_id = p_conversation_id
    and message.sender_id = actor
    and message.content is not distinct from nullif(btrim(p_content), '')
    and message.image_url is not distinct from nullif(btrim(p_image_url), '');

  if result.id is null then
    raise exception 'message is not writable or the id belongs to another payload'
      using errcode = 'insufficient_privilege';
  end if;
  return result;
end;
$$;

create or replace function public.set_collaborating_entity_active(p_collaborating_entity_id uuid, p_is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  affected integer;
begin
  if not (select public.has_permission('entities.manage')) then
    raise exception 'only admins may change collaborating entity access'
      using errcode = 'insufficient_privilege';
  end if;

  update public.collaborating_entities
  set is_active = p_is_active
  where id = p_collaborating_entity_id
    and org_id = actor_org;
  get diagnostics affected = row_count;

  if affected = 0 then
    raise no_data_found using message = 'collaborating entity not found';
  end if;

  if not p_is_active then
    update public.profiles
    set is_active = false
    where org_id = actor_org
      and collaborating_entity_id = p_collaborating_entity_id;

    update auth.users as auth_user
    set banned_until = now() + interval '100 years', updated_at = now()
    where exists (
      select 1
      from public.profiles as profile
      where profile.id = auth_user.id
        and profile.org_id = actor_org
        and profile.collaborating_entity_id = p_collaborating_entity_id
    );

    delete from auth.refresh_tokens as refresh_token
    where exists (
      select 1
      from public.profiles as profile
      where profile.id::text = refresh_token.user_id
        and profile.org_id = actor_org
        and profile.collaborating_entity_id = p_collaborating_entity_id
    );

    delete from auth.sessions as session
    where exists (
      select 1
      from public.profiles as profile
      where profile.id = session.user_id
        and profile.org_id = actor_org
        and profile.collaborating_entity_id = p_collaborating_entity_id
    );
  end if;

  insert into public.audit_log (
    org_id, actor_id, action, target_type, target_id, changes
  ) values (
    actor_org,
    actor,
    'entity.access',
    'collaborating_entity',
    p_collaborating_entity_id,
    jsonb_build_object('is_active', p_is_active)
  );
end;
$$;

create or replace function public.set_entity_collaborator_active(p_profile_id uuid, p_is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  subject_entity uuid;
begin
  if not (select public.has_permission('entities.manage')) then
    raise exception 'only admins may change entity collaborator access'
      using errcode = 'insufficient_privilege';
  end if;

  select profile.collaborating_entity_id into subject_entity
  from public.profiles as profile
  join public.collaborating_entities as entity
    on entity.org_id = profile.org_id
   and entity.id = profile.collaborating_entity_id
  where profile.id = p_profile_id
    and profile.org_id = actor_org
    and profile.role = 'entity'
    and (not p_is_active or entity.is_active);

  if subject_entity is null then
    raise no_data_found using message = 'entity collaborator not found';
  end if;

  update public.profiles
  set is_active = p_is_active
  where id = p_profile_id and org_id = actor_org;

  update auth.users
  set
    banned_until = case when p_is_active then null else now() + interval '100 years' end,
    updated_at = now()
  where id = p_profile_id;

  if not p_is_active then
    delete from auth.refresh_tokens where user_id = p_profile_id::text;
    delete from auth.sessions where user_id = p_profile_id;
  end if;

  insert into public.audit_log (
    org_id, actor_id, action, target_type, target_id, changes
  ) values (
    actor_org,
    actor,
    'entity.collaborator_access',
    'profile',
    p_profile_id,
    jsonb_build_object(
      'collaborating_entity_id', subject_entity,
      'is_active', p_is_active
    )
  );
end;
$$;

create or replace function public.set_forum_post_category(p_post_id uuid, p_category_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
begin
  if not (select public.has_permission('forum.moderate')) then
    raise exception 'forum category action denied' using errcode = 'insufficient_privilege';
  end if;
  update public.forum_posts
  set category_id = p_category_id
  where id = p_post_id
    and org_id = (select public.current_org_id())
    and visibility <> 'deleted';
  if not found then
    raise exception 'forum post not found' using errcode = 'no_data_found';
  end if;
end;
$$;

create or replace function public.set_forum_post_pinned(p_post_id uuid, p_is_pinned boolean)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
begin
  if not (select public.has_permission('forum.moderate')) then
    raise exception 'forum pin action denied' using errcode = 'insufficient_privilege';
  end if;
  update public.forum_posts
  set is_pinned = p_is_pinned
  where id = p_post_id
    and org_id = (select public.current_org_id())
    and visibility <> 'deleted';
  if not found then
    raise exception 'forum post not found' using errcode = 'no_data_found';
  end if;
end;
$$;

create or replace function public.set_forum_posting_disabled(p_participant_id uuid, p_disabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
begin
  if not (select public.has_permission('forum.moderate')) then
    raise exception 'forum posting status action denied' using errcode = 'insufficient_privilege';
  end if;
  perform set_config('ramassa.trusted_profile_write', 'on', true);
  update public.profiles
  set is_forum_banned = p_disabled
  where id = p_participant_id
    and org_id = (select public.current_org_id())
    and role = 'player';
  perform set_config('ramassa.trusted_profile_write', '', true);
  if not found then
    raise exception 'participant not found' using errcode = 'no_data_found';
  end if;
end;
$$;

create or replace function public.set_media_item_privacy(p_media_item_id uuid, p_privacy_level text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor_org uuid := (select public.current_org_id());
begin
  if p_privacy_level not in ('community', 'staff_only') then
    raise exception 'invalid media privacy' using errcode = 'check_violation';
  end if;

  update public.media_items
  set privacy_level = p_privacy_level
  where id = p_media_item_id
    and org_id = actor_org
    and (uploaded_by = (select auth.uid()) or (select public.has_permission('gallery.moderate')));
  if not found then
    raise exception 'media privacy action denied' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function public.set_participant_active(participant_id uuid, next_is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
declare
  previous_is_active boolean;
begin
  if not (select public.has_permission('participants.deactivate')) then
    raise exception 'set_participant_active is a staff action'
      using errcode = 'insufficient_privilege';
  end if;

  select p.is_active into previous_is_active
  from public.profiles p
  where p.id = participant_id;

  if previous_is_active is null then
    return;
  end if;

  perform set_config('ramassa.trusted_profile_write', 'on', true);
  update public.profiles
     set is_active = next_is_active, updated_at = now()
   where id = participant_id;
  perform set_config('ramassa.trusted_profile_write', '', true);

  if not found then
    return;
  end if;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    (select public.current_org_id()),
    (select auth.uid()),
    case when next_is_active then 'profile.activate' else 'profile.deactivate' end,
    'profile',
    participant_id,
    jsonb_build_object(
      'is_active',
      jsonb_build_object('old', previous_is_active, 'new', next_is_active)
    )
  );
end;
$$;

create or replace function public.set_staff_member_role(p_profile_id uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  old_role text;
begin
  if not (select public.has_permission('team.manage')) then
    raise insufficient_privilege using message = 'only active admins may change staff roles';
  end if;
  if p_role not in ('staff', 'admin') then
    raise check_violation using message = 'staff role must be staff or admin';
  end if;
  perform private.lock_staff_admin_count(actor_org);
  select role into old_role
  from public.profiles
  where id = p_profile_id and org_id = actor_org and role in ('staff', 'admin') and is_active
  for update;
  if old_role is null then
    raise no_data_found using message = 'active staff member not found';
  end if;
  if old_role = 'admin' and p_role = 'staff' then
    perform private.assert_another_active_admin(actor_org, p_profile_id);
  end if;
  update public.profiles set role = p_role where id = p_profile_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org, actor, 'staff.role_change', 'profile', p_profile_id,
    jsonb_build_object('from', old_role, 'to', p_role)
  );
end;
$$;

create or replace function public.transition_deletion_request(p_request_id uuid, p_state text, p_resolution_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := auth.uid();
  previous_state text;
begin
  if actor is null or not public.has_permission('rgpd.erase') then
    raise exception 'staff or admin authentication required' using errcode = '42501';
  end if;

  select request.state
    into previous_state
    from public.deletion_requests request
    join public.profiles subject on subject.id = request.profile_id
   where request.id = p_request_id
     and subject.org_id = public.current_org_id()
   for update of request;

  if not found then
    raise exception 'deletion request not found' using errcode = 'P0002';
  end if;

  if p_state not in ('in_progress', 'done', 'declined')
     or previous_state in ('done', 'declined')
     or (previous_state = 'in_progress' and p_state = 'in_progress') then
    raise exception 'invalid deletion request state transition' using errcode = '23514';
  end if;

  update public.deletion_requests
     set state = p_state,
         resolution_note = nullif(btrim(p_resolution_note), ''),
         resolved_by = case when p_state in ('done', 'declined') then actor else null end,
         resolved_at = case when p_state in ('done', 'declined') then now() else null end
   where id = p_request_id;
end;
$$;

create or replace function public.transition_feedback_submission(p_submission_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  current_status text;
begin
  if not public.has_permission('feedback.view') then
    raise exception 'only staff may transition feedback' using errcode = 'insufficient_privilege';
  end if;

  select submission.status into current_status
  from public.feedback_submissions as submission
  where submission.id = p_submission_id
    and submission.org_id = (select public.current_org_id())
  for update;

  if current_status is null then
    raise no_data_found using message = 'feedback submission not found';
  end if;
  if p_status not in ('read', 'in_progress', 'resolved')
    or (current_status = 'read' and p_status = 'read')
    or (current_status = 'in_progress' and p_status in ('read', 'in_progress'))
    or current_status = 'resolved'
  then
    raise check_violation using message = 'invalid feedback state transition';
  end if;

  update public.feedback_submissions
  set status = p_status,
      resolved_by = case when p_status = 'resolved' then actor else null end,
      resolved_at = case when p_status = 'resolved' then now() else null end
  where id = p_submission_id and org_id = (select public.current_org_id());
end;
$$;

create or replace function public.update_organization_settings(p_name text, p_contact_email text, p_contact_phone text, p_logo_url text, p_primary_color text, p_secondary_color text, p_available_languages text[], p_default_language text)
 RETURNS organizations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor_org uuid := (select public.current_org_id());
  saved public.organizations;
  clean_name text := nullif(btrim(p_name), '');
  clean_primary text := upper(btrim(p_primary_color));
  clean_secondary text := upper(btrim(p_secondary_color));
  locked_language text;
begin
  if not (select public.has_permission('settings.organization'))
    and not (select public.has_permission('settings.branding'))
  then
    raise insufficient_privilege using message = 'organization settings need settings.organization or settings.branding';
  end if;
  -- Name, contact details and languages are settings.organization; the logo
  -- and colours are settings.branding. A field the caller may not change must
  -- arrive unchanged.
  if not (select public.has_permission('settings.organization')) and exists (
    select 1 from public.organizations as current_org
    where current_org.id = actor_org
      and (current_org.name is distinct from nullif(btrim(p_name), '')
        or current_org.contact_email is distinct from p_contact_email
        or current_org.contact_phone is distinct from p_contact_phone
        or current_org.available_languages is distinct from p_available_languages
        or current_org.default_language is distinct from p_default_language)
  ) then
    raise insufficient_privilege using message = 'changing the organization details needs settings.organization';
  end if;
  if not (select public.has_permission('settings.branding')) and exists (
    select 1 from public.organizations as current_org
    where current_org.id = actor_org
      and (current_org.logo_url is distinct from p_logo_url
        or upper(current_org.primary_color) is distinct from upper(btrim(p_primary_color))
        or upper(current_org.secondary_color) is distinct from upper(btrim(p_secondary_color)))
  ) then
    raise insufficient_privilege using message = 'changing the logo or colours needs settings.branding';
  end if;
  if clean_name is null or length(clean_name) > 200 then
    raise check_violation using message = 'organization name is required';
  end if;
  if clean_primary !~ '^#[0-9A-F]{6}$' or clean_secondary !~ '^#[0-9A-F]{6}$' then
    raise check_violation using message = 'brand colors must use six-digit hex values';
  end if;
  if private.hex_contrast_ratio(clean_primary, '#FFFFFF') < 4.5 then
    raise check_violation using message = 'primary color does not meet WCAG AA contrast with white text';
  end if;
  if private.hex_contrast_ratio(clean_secondary, '#0F172A') < 4.5 then
    raise check_violation using message = 'secondary color does not meet WCAG AA contrast with dark text';
  end if;
  if cardinality(p_available_languages) = 0
    or not (p_available_languages <@ array['ca', 'es', 'en', 'ar', 'fa']::text[])
    or not (p_default_language = any(p_available_languages))
  then
    raise check_violation using message = 'default language must be enabled and all languages must be supported';
  end if;

  select organization.locked_default_language into locked_language
  from public.organizations as organization
  where organization.id = actor_org
  for update;

  if locked_language is not null
    and (p_default_language <> locked_language or not (locked_language = any(p_available_languages)))
  then
    raise check_violation using message = 'Catalan must remain enabled and default for the Ramassa organization';
  end if;

  update public.organizations
  set
    name = clean_name,
    contact_email = nullif(btrim(p_contact_email), ''),
    contact_phone = nullif(btrim(p_contact_phone), ''),
    logo_url = nullif(btrim(p_logo_url), ''),
    primary_color = clean_primary,
    secondary_color = clean_secondary,
    available_languages = array(
      select entry.language
      from unnest(p_available_languages) with ordinality as entry(language, position)
      group by entry.language
      order by min(entry.position)
    ),
    default_language = p_default_language
  where id = actor_org
  returning * into saved;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org,
    (select auth.uid()),
    'organization.settings_update',
    'organization',
    actor_org,
    jsonb_build_object(
      'primary_color', clean_primary,
      'secondary_color', clean_secondary,
      'available_languages', p_available_languages,
      'default_language', p_default_language,
      'has_logo', p_logo_url is not null
    )
  );

  return saved;
end;
$$;

create or replace function public.update_participant_profile(participant_id uuid, payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  document_type_value text := payload ->> 'document_type';
  document_number_value text := nullif(payload ->> 'document_number', '');
  place_of_birth_value text := nullif(btrim(payload ->> 'place_of_birth'), '');
  -- The columns whose VALUES must never reach the audit log (ADR-004).
  encrypted_fields text[] := array['document_number', 'phone', 'address', 'postal_code'];
  before_document jsonb;
  changes_document jsonb;
begin
  if not (select public.has_permission('participants.view_personal')) then
    raise exception 'update_participant_profile is the staff path; a participant edits herself through update_own_profile()'
      using errcode = 'insufficient_privilege';
  end if;

  if place_of_birth_value is null then
    raise exception 'update_participant_profile requires place_of_birth'
      using errcode = 'not_null_violation';
  end if;

  -- A caller without participants.view_sensitive never sends the document
  -- number; for her the check runs below, on the stored value.
  if document_type_value is distinct from 'none' and document_number_value is null
    and (select public.has_permission('participants.view_sensitive'))
  then
    raise exception 'update_participant_profile requires document_number unless document_type is none'
      using errcode = 'not_null_violation';
  end if;

  -- The record as it stands, in the payload's own shape, so the diff below is a
  -- key-by-key comparison rather than nineteen hand-written IF statements that
  -- a twentieth column would silently escape. The encrypted values are decrypted
  -- HERE and never leave this block: they are what makes "did the phone actually
  -- change" answerable at all.
  select jsonb_build_object(
    'first_name', p.first_name,
    'last_name', p.last_name,
    'date_of_birth', p.date_of_birth,
    'place_of_birth', p.place_of_birth,
    'nationality', p.nationality,
    'preferred_language', p.preferred_language,
    'document_type', p.document_type,
    'document_number', public.decrypt_field(p.document_number),
    'phone', public.decrypt_field(p.phone),
    'address', public.decrypt_field(p.address),
    'city', p.city,
    'postal_code', public.decrypt_field(p.postal_code),
    'reference_entity', p.reference_entity,
    'reference_contact_name', p.reference_contact_name,
    'has_dependents', p.has_dependents,
    'num_dependents', p.num_dependents,
    'clothing_size', p.clothing_size,
    'shoe_size', p.shoe_size,
    'media_consent', p.media_consent_at is not null
  )
  into before_document
  from public.profiles p
  where p.id = participant_id;

  -- No readable row means no row this caller may edit: RLS has already decided,
  -- and there is nothing to audit.
  if before_document is null then
    return;
  end if;

  -- The four encrypted fields change only for a caller who may see them. For
  -- anyone else the stored values are kept, whatever the payload says, so a
  -- screen without them can never wipe them (RAPP-230).
  if not (select public.has_permission('participants.view_sensitive')) then
    payload := payload || jsonb_build_object(
      'document_number', before_document ->> 'document_number',
      'phone', before_document ->> 'phone',
      'address', before_document ->> 'address',
      'postal_code', before_document ->> 'postal_code'
    );
    document_number_value := nullif(payload ->> 'document_number', '');
    if document_type_value is distinct from 'none' and document_number_value is null then
      raise exception 'update_participant_profile requires document_number unless document_type is none'
        using errcode = 'not_null_violation';
    end if;
  end if;

  perform set_config('ramassa.trusted_profile_write', 'on', true);
  update public.profiles set
    first_name = payload ->> 'first_name',
    last_name = payload ->> 'last_name',
    date_of_birth = (payload ->> 'date_of_birth')::date,
    place_of_birth = place_of_birth_value,
    nationality = payload ->> 'nationality',
    preferred_language = coalesce(nullif(payload ->> 'preferred_language', ''), preferred_language),
    document_type = document_type_value,
    document_number = public.encrypt_field(document_number_value),
    phone = public.encrypt_field(nullif(payload ->> 'phone', '')),
    address = public.encrypt_field(nullif(payload ->> 'address', '')),
    city = nullif(payload ->> 'city', ''),
    postal_code = public.encrypt_field(nullif(payload ->> 'postal_code', '')),
    reference_entity = nullif(payload ->> 'reference_entity', ''),
    reference_contact_name = nullif(payload ->> 'reference_contact_name', ''),
    has_dependents = coalesce((payload ->> 'has_dependents')::boolean, false),
    num_dependents = coalesce((payload ->> 'num_dependents')::integer, 0),
    clothing_size = nullif(payload ->> 'clothing_size', ''),
    shoe_size = nullif(payload ->> 'shoe_size', ''),
    media_consent_at = case
      when (payload ->> 'media_consent')::boolean then coalesce(media_consent_at, now())
      else null
    end,
    updated_at = now()
  where id = participant_id;
  perform set_config('ramassa.trusted_profile_write', '', true);

  if not found then
    return;
  end if;

  select coalesce(jsonb_object_agg(submitted.key, entry), '{}'::jsonb)
  into changes_document
  from jsonb_each_text(payload) submitted
  cross join lateral (
    select case
      when submitted.key = any(encrypted_fields) then jsonb_build_object('changed', true)
      else jsonb_build_object(
        'old', to_jsonb(before_document ->> submitted.key),
        'new', to_jsonb(submitted.value)
      )
    end as entry
  ) built
  where before_document ? submitted.key
    and (before_document ->> submitted.key) is distinct from submitted.value;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    (select public.current_org_id()),
    actor,
    'profile.update',
    'profile',
    participant_id,
    changes_document
  );
end;
$$;

-- The fixed-role helpers are gone, so no rule can keep using them. A policy that
-- still referenced one would make this drop fail.
drop function public.is_staff_or_admin();
drop function public.is_admin();
