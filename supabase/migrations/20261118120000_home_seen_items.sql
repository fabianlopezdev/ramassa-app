-- What she has already seen on Inici (RAPP-821).
--
-- The badge on the Inici tab counts what she has not dealt with yet. A form or a
-- survey is dealt with when she completes it, and that is already recorded. An
-- announcement is dealt with when she has seen it and a new activity when she
-- has opened it, and nothing recorded either until now.

-- 1. The two records ----------------------------------------------------------------------------------------

create table public.announcement_reads (
  org_id uuid not null references public.organizations (id) on delete cascade,
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id uuid not null,
  seen_at timestamptz not null default now(),
  primary key (announcement_id, user_id),
  constraint announcement_reads_user_tenant_fkey
    foreign key (org_id, user_id)
    references public.profiles (org_id, id) on delete cascade
);

create table public.event_reads (
  org_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null,
  user_id uuid not null,
  seen_at timestamptz not null default now(),
  primary key (event_id, user_id),
  constraint event_reads_event_tenant_fkey
    foreign key (org_id, event_id)
    references public.events (org_id, id) on delete cascade,
  constraint event_reads_user_tenant_fkey
    foreign key (org_id, user_id)
    references public.profiles (org_id, id) on delete cascade
);

comment on table public.announcement_reads is
  'One row per announcement a person has seen on Inici or opened (RAPP-821).';
comment on table public.event_reads is
  'One row per activity a person has opened (RAPP-821).';

create index announcement_reads_user_idx
  on public.announcement_reads (user_id, announcement_id);
create index announcement_reads_org_user_idx
  on public.announcement_reads (org_id, user_id);
create index event_reads_user_idx
  on public.event_reads (user_id, event_id);
create index event_reads_org_user_idx
  on public.event_reads (org_id, user_id);
create index event_reads_org_event_idx
  on public.event_reads (org_id, event_id);

alter table public.announcement_reads enable row level security;
alter table public.announcement_reads force row level security;
alter table public.event_reads enable row level security;
alter table public.event_reads force row level security;

create policy announcement_reads_select_self
  on public.announcement_reads for select to authenticated
  using (
    user_id = (select auth.uid())
    and org_id = (select public.current_org_id())
  );

create policy event_reads_select_self
  on public.event_reads for select to authenticated
  using (
    user_id = (select auth.uid())
    and org_id = (select public.current_org_id())
  );

-- Rows are written only by `mark_home_items_seen`, never by a direct insert.
revoke all on table public.announcement_reads from public, anon, authenticated;
revoke all on table public.event_reads from public, anon, authenticated;
grant select on table public.announcement_reads to authenticated;
grant select on table public.event_reads to authenticated;

-- 2. When the record starts ---------------------------------------------------------------------------------

-- Everything published before this migration ran counts as seen, so nobody
-- opens the app to a badge for every old announcement. The moment is fixed when
-- the migration runs on each database.
do $do$
begin
  execute format(
    'create function private.home_seen_started_at() returns timestamptz '
    'language sql immutable set search_path = '''' as %L',
    format('select %L::timestamptz', now())
  );
end;
$do$;

comment on function private.home_seen_started_at() is
  'When this database started recording what is seen on Inici (RAPP-821).';

-- 3. What she has seen --------------------------------------------------------------------------------------

-- `since` is the later of the start of the record and the day she joined: what
-- was published before it counts as seen.
create function private.my_home_seen()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'since',
    greatest(
      private.home_seen_started_at(),
      (select profile.created_at from public.profiles as profile
       where profile.id = (select auth.uid()))
    ),
    'announcement_ids',
    coalesce(
      (select jsonb_agg(seen.announcement_id)
       from public.announcement_reads as seen
       where seen.user_id = (select auth.uid())
         and seen.org_id = (select public.current_org_id())),
      '[]'::jsonb
    ),
    'event_ids',
    coalesce(
      (select jsonb_agg(seen.event_id)
       from public.event_reads as seen
       where seen.user_id = (select auth.uid())
         and seen.org_id = (select public.current_org_id())),
      '[]'::jsonb
    )
  );
$$;

create function public.my_home_seen()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.my_home_seen();
$$;

comment on function public.my_home_seen() is
  'What the signed-in person has seen on Inici: the start of her record and the announcements and activities seen since (RAPP-821).';

-- 4. Marking as seen ----------------------------------------------------------------------------------------

create function private.mark_home_items_seen(
  p_announcement_ids uuid[],
  p_event_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  max_items constant integer := 200;
begin
  if actor is null or actor_org is null then
    raise exception 'home seen access denied' using errcode = 'insufficient_privilege';
  end if;

  if coalesce(cardinality(p_announcement_ids), 0) > max_items
    or coalesce(cardinality(p_event_ids), 0) > max_items then
    raise exception 'too many items marked as seen' using errcode = 'program_limit_exceeded';
  end if;

  -- Only what she can see is recorded: published content of her organization.
  insert into public.announcement_reads (org_id, announcement_id, user_id)
  select actor_org, announcement.id, actor
  from public.announcements as announcement
  where announcement.id = any (coalesce(p_announcement_ids, '{}'::uuid[]))
    and announcement.org_id = actor_org
    and public.is_content_visible(
      announcement.status, announcement.published_at, announcement.expires_at
    )
  on conflict (announcement_id, user_id) do nothing;

  insert into public.event_reads (org_id, event_id, user_id)
  select actor_org, event.id, actor
  from public.events as event
  where event.id = any (coalesce(p_event_ids, '{}'::uuid[]))
    and event.org_id = actor_org
    and public.is_content_visible(event.status, event.published_at, event.expires_at)
  on conflict (event_id, user_id) do nothing;
end;
$$;

create function public.mark_home_items_seen(
  p_announcement_ids uuid[] default '{}'::uuid[],
  p_event_ids uuid[] default '{}'::uuid[]
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.mark_home_items_seen(p_announcement_ids, p_event_ids);
$$;

comment on function public.mark_home_items_seen(uuid[], uuid[]) is
  'Records announcements and activities the signed-in person has seen (RAPP-821). Seen once is seen for good.';

revoke all on function private.my_home_seen() from public, anon, authenticated;
revoke all on function public.my_home_seen() from public, anon, authenticated;
revoke all on function private.mark_home_items_seen(uuid[], uuid[]) from public, anon, authenticated;
revoke all on function public.mark_home_items_seen(uuid[], uuid[]) from public, anon, authenticated;
revoke all on function private.home_seen_started_at() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.my_home_seen() to authenticated;
grant execute on function public.my_home_seen() to authenticated;
grant execute on function private.mark_home_items_seen(uuid[], uuid[]) to authenticated;
grant execute on function public.mark_home_items_seen(uuid[], uuid[]) to authenticated;

-- 5. What happens to these rows when she asks to be erased ---------------------------------------------------

-- The body of `20261104130000_text_and_points_blocks.sql`, plus the two new tables.
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
    ('form_blocks', null, 'not_personal', 'The blocks of the forms: a signature with the text it asks to accept, a text, a list of points.'),
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
    ('custom_form_reminders', null, 'not_personal', 'When the team was reminded to renew a repeating form.'),
    ('announcement_reads', 'user_id', 'purge', 'The announcements she has seen.'),
    ('event_reads', 'user_id', 'purge', 'The activities she has opened.')
  ) as disposition(table_name, participant_column, disposition, reason);
$function$;
