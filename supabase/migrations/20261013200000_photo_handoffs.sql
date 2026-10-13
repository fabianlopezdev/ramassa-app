-- Desktop to phone photo handoff (RAPP-254, from RAPP-170, part of RAPP-212).
--
-- At the desk, "Take photo with phone" opens a handoff: a single-use request,
-- bound to the person who made it, that expires in ten minutes. The desktop
-- shows it as a QR code. The phone (the Ramassà app, or the web admin in the
-- phone's browser) signs in as the same person, takes the photo, uploads it
-- through the media worker, and completes the handoff. Completing it does the
-- target's own work: for an internal document, it registers the document,
-- with the same checks as an upload from the desk. The desktop sees the
-- completion through Realtime.
--
-- Internal documents are the first target. Never photos of players: the
-- targets are paperwork.

create table public.photo_handoffs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  target text not null check (target in ('internal_document')),
  document_name text not null check (length(btrim(document_name)) between 1 and 255),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  result_id uuid
);

comment on table public.photo_handoffs is 'Single-use requests to take a photo with the phone for a desktop record (RAPP-254).';

alter table public.photo_handoffs enable row level security;
alter table public.photo_handoffs force row level security;

-- Only the person who asked sees the request, on the desk and on the phone.
create policy photo_handoffs_read_own on public.photo_handoffs
  for select to authenticated
  using (requested_by = (select auth.uid()) and org_id = (select public.current_org_id()));

revoke insert, update, delete, truncate on public.photo_handoffs from anon, authenticated;

alter publication supabase_realtime add table public.photo_handoffs;

-- Opening a handoff -------------------------------------------------------------------------------

create or replace function public.create_photo_handoff(p_target text, p_document_name text)
returns table (handoff_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  saved public.photo_handoffs%rowtype;
begin
  if p_target = 'internal_document' then
    if not (select public.has_permission('settings.documents')) then
      raise exception 'permission denied' using errcode = '42501';
    end if;
  else
    raise exception 'HANDOFF/TARGET' using errcode = 'check_violation';
  end if;
  if nullif(btrim(p_document_name), '') is null or length(btrim(p_document_name)) > 255 then
    raise exception 'HANDOFF/NAME' using errcode = 'check_violation';
  end if;

  insert into public.photo_handoffs (org_id, requested_by, target, document_name, expires_at)
  values (actor_org, actor, p_target, btrim(p_document_name), now() + interval '10 minutes')
  returning * into saved;

  return query select saved.id, saved.expires_at;
end;
$$;

revoke all on function public.create_photo_handoff(text, text) from public, anon;
grant execute on function public.create_photo_handoff(text, text) to authenticated;

-- Completing it -------------------------------------------------------------------------------------

create or replace function public.complete_photo_handoff(
  p_id uuid,
  p_object_key text,
  p_content_type text,
  p_file_size bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  handoff public.photo_handoffs%rowtype;
  made uuid;
begin
  select * into handoff from public.photo_handoffs where id = p_id for update;
  -- Someone else's request reads as no request at all.
  if handoff.id is null or handoff.requested_by is distinct from actor then
    raise exception 'HANDOFF/NOT_FOUND' using errcode = 'P0002';
  end if;
  if handoff.completed_at is not null then
    raise exception 'HANDOFF/USED' using errcode = 'check_violation';
  end if;
  if handoff.expires_at < now() then
    raise exception 'HANDOFF/EXPIRED' using errcode = 'check_violation';
  end if;
  if p_content_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'HANDOFF/NOT_A_PHOTO' using errcode = 'check_violation';
  end if;

  if handoff.target = 'internal_document' then
    -- Same checks as a document uploaded at the desk, including the folder.
    made := public.register_internal_document(p_object_key, handoff.document_name, p_content_type, p_file_size);
  end if;

  update public.photo_handoffs set completed_at = now(), result_id = made where id = handoff.id;
  return made;
end;
$$;

revoke all on function public.complete_photo_handoff(uuid, text, text, bigint) from public, anon;
grant execute on function public.complete_photo_handoff(uuid, text, text, bigint) to authenticated;

-- The erasure registry learns photo_handoffs (RAPP-26).

CREATE OR REPLACE FUNCTION public.personal_data_disposition()
 RETURNS TABLE(table_name text, participant_column text, disposition text, reason text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select * from (values
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
    ('photo_handoffs', null, 'not_personal', 'A staff member''s request to take a document photo with the phone.')
  ) as disposition(table_name, participant_column, disposition, reason);
$function$;
