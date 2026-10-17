-- Staff choose which wizard questions a woman is asked (RAPP-301).
--
-- Three states per question, for one woman, set before she joins:
--   - Auto, the default and stored as no row: the RAPP-300 rule, asked only
--     when nobody answered it (public.profile_answers);
--   - Ask: always asked, opening with the staff answer to confirm or correct;
--   - Don't ask ('skip'): never asked. The summary still shows the value.
-- A required question needs an answer before it can be hidden, and a hidden
-- required question whose answer is cleared later is asked after all, so a
-- finished profile is always complete. The settings change only while she has
-- not joined; afterwards they are read-only and have no effect.
--
-- Her app reads only the resulting list (my_questions_to_ask). Staff read and
-- write through two functions that check participants.view_personal and the
-- organization, and every change is audited with the old and new state.

-- required-intake-questions:start
create or replace function private.required_intake_questions()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'first_name', 'last_name', 'date_of_birth', 'place_of_birth', 'nationality',
    'preferred_language', 'reference_entity', 'dependents', 'clothing_size', 'shoe_size'
  ]::text[];
$$;
-- required-intake-questions:end

-- The questions a wizard screen asks: every intake question except the avatar.
create or replace function private.wizard_intake_questions()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'first_name', 'last_name', 'date_of_birth', 'place_of_birth', 'nationality',
    'preferred_language', 'document', 'phone', 'address', 'city', 'postal_code',
    'reference_entity', 'reference_contact_name', 'dependents', 'clothing_size', 'shoe_size'
  ]::text[];
$$;

create table public.intake_question_states (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  question text not null,
  state text not null check (state in ('ask', 'skip')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (profile_id, question),
  constraint intake_question_states_question_check
    check (question = any (private.wizard_intake_questions()))
);

comment on table public.intake_question_states is
  'Per-woman wizard question states set by staff before she joins (RAPP-301). No row = Auto.';

-- Nobody writes the table directly: staff use the functions below. Staff with
-- participants.view_personal may read their organization's rows; she reads
-- only the resulting question list, never the staff settings.
alter table public.intake_question_states enable row level security;
revoke all on table public.intake_question_states from anon, authenticated;
grant select on table public.intake_question_states to authenticated;

create policy intake_question_states_select_team
  on public.intake_question_states
  for select
  to authenticated
  using (
    org_id = (select public.current_org_id())
    and (select public.has_permission('participants.view_personal'))
  );

create or replace function public.participant_question_states(p_profile_id uuid)
returns table (question text, state text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.has_permission('participants.view_personal')) then
    raise insufficient_privilege using message = 'reading question states needs participants.view_personal';
  end if;
  return query
    select s.question, s.state
      from public.intake_question_states s
     where s.profile_id = p_profile_id
       and s.org_id = (select public.current_org_id())
     order by s.question;
end;
$$;

create or replace function public.set_intake_question_states(p_profile_id uuid, p_states jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  target public.profiles;
  entry record;
  old_state text;
  changes jsonb := '{}'::jsonb;
begin
  if not (select public.has_permission('participants.view_personal')) then
    raise insufficient_privilege using message = 'setting question states needs participants.view_personal';
  end if;

  select * into target from public.profiles p
   where p.id = p_profile_id and p.org_id = actor_org
   for update;
  if target.id is null then
    raise insufficient_privilege using message = 'no participant of this organization';
  end if;
  -- Read-only once she has joined: the wizard is behind her.
  if target.role <> 'invited' then
    raise object_not_in_prerequisite_state
      using message = 'question states change only before she joins';
  end if;
  if p_states is null or jsonb_typeof(p_states) <> 'object' then
    raise invalid_parameter_value using message = 'question states are an object';
  end if;

  for entry in select key as question, value as state from jsonb_each_text(p_states) loop
    if not (entry.question = any (private.wizard_intake_questions())) then
      raise invalid_parameter_value using message = 'unknown question ' || entry.question;
    end if;
    if entry.state not in ('auto', 'ask', 'skip') then
      raise invalid_parameter_value using message = 'unknown state ' || entry.state;
    end if;
    if entry.state = 'skip'
      and entry.question = any (private.required_intake_questions())
      and not exists (
        select 1 from public.profile_answers a
         where a.profile_id = p_profile_id and a.question = entry.question
      )
    then
      raise check_violation
        using message = 'a required question needs an answer before it can be hidden: ' || entry.question;
    end if;

    select s.state into old_state from public.intake_question_states s
     where s.profile_id = p_profile_id and s.question = entry.question;
    old_state := coalesce(old_state, 'auto');
    continue when old_state = entry.state;

    if entry.state = 'auto' then
      delete from public.intake_question_states s
       where s.profile_id = p_profile_id and s.question = entry.question;
    else
      insert into public.intake_question_states (profile_id, org_id, question, state, updated_by)
      values (p_profile_id, actor_org, entry.question, entry.state, actor)
      on conflict (profile_id, question) do update
        set state = excluded.state, updated_at = now(), updated_by = excluded.updated_by;
    end if;
    changes := changes || jsonb_build_object(
      entry.question, jsonb_build_object('old', old_state, 'new', entry.state));
  end loop;

  if changes <> '{}'::jsonb then
    insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
    values (actor_org, actor, 'profile.intake_questions_update', 'profile', p_profile_id, changes);
  end if;
end;
$$;

-- The questions her wizard asks. Mirrors questionsToAsk in
-- packages/shared/onboarding/question-states.ts.
create or replace function public.my_questions_to_ask()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select question.name
    from unnest(private.wizard_intake_questions()) with ordinality as question(name, position)
    left join public.intake_question_states s
      on s.profile_id = (select auth.uid()) and s.question = question.name
   where (select auth.uid()) is not null
     and (
       s.state = 'ask'
       or not exists (
         select 1 from public.profile_answers a
          where a.profile_id = (select auth.uid()) and a.question = question.name
       ) and (
         s.state is null
         or (s.state = 'skip' and question.name = any (private.required_intake_questions()))
       )
     )
   order by question.position;
$$;

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
    ('photo_handoffs', null, 'not_personal', 'A staff member''s request to take a document photo with the phone.'),
    ('profile_answers', 'profile_id', 'purge', 'Which intake questions were answered, and by whom.'),
    ('intake_question_states', 'profile_id', 'purge', 'Which intake questions staff chose to ask or not ask her.')
  ) as disposition(table_name, participant_column, disposition, reason);
$function$;

revoke all on function public.participant_question_states(uuid) from public, anon;
revoke all on function public.set_intake_question_states(uuid, jsonb) from public, anon;
revoke all on function public.my_questions_to_ask() from public, anon;
grant execute on function public.participant_question_states(uuid) to authenticated;
grant execute on function public.set_intake_question_states(uuid, jsonb) to authenticated;
grant execute on function public.my_questions_to_ask() to authenticated;
