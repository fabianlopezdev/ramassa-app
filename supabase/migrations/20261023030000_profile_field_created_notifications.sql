-- A new field of the player profile layout rings the other designers' bells (RAPP-650).
--
-- WHY
--
-- Any admin, and the onboarding design role, may add a field to the Fitxa de
-- la jugadora (RAPP-649). Fabián asked that the other admins see who added
-- what and when: the Fitxa shows the creator and date on each field, and the
-- bell (RAPP-640) says a field was added. The archive dialog also says how
-- many answers a field keeps, which the catalog does not carry (it sends
-- only whether a field has answers).
--
-- WHAT THIS MIGRATION DOES
--
--   1. staff_notifications accepts the event `field_created`.
--   2. Its readers: `private.staff_notification_permissions` names the two
--      permissions that design the layout (settings.organization,
--      onboarding.design); `private.staff_notification_name` shows the
--      field's Catalan name while the field is live.
--   3. A field written by a person records who: a before-insert trigger fills
--      `created_by` with the signed-in team member when the writer left it
--      empty (the old question forms write through the compatibility view,
--      which has no creator).
--   4. An after-insert trigger on profile_fields notifies the designers of
--      the organization, never the person who added it. Built-in fields and
--      rows written without a signed-in person (the seed, a new
--      organization) ring nothing. As every bell trigger, a failure to
--      notify is a warning and the field is still saved.
--   5. public.profile_field_answer_count(id): how many answers (hers and the
--      entities') a field keeps, for the people who design the layout.
--
-- Docs: https://supabase.com/docs/guides/database/postgres/triggers and
-- https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker

-- 1. The event -------------------------------------------------------------------------------------

alter table public.staff_notifications drop constraint staff_notifications_event_check;
alter table public.staff_notifications add constraint staff_notifications_event_check check (event in (
  'message', 'referral', 'walk_in', 'deletion_request', 'mentoring_request',
  'feedback', 'forum_report', 'gallery_report', 'field_created'
));

-- 2. Its readers -----------------------------------------------------------------------------------

create or replace function private.staff_notification_permissions(p_event text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_event
    when 'message' then array['messages.inbox']
    when 'referral' then array['referrals.manage']
    when 'walk_in' then array['participants.invite']
    when 'deletion_request' then array['rgpd.erase']
    when 'mentoring_request' then array['mentoring.manage']
    when 'feedback' then array['feedback.view']
    when 'forum_report' then array['forum.moderate']
    when 'gallery_report' then array['gallery.moderate']
    when 'field_created' then array['settings.organization', 'onboarding.design']
    else array[]::text[]
  end;
$$;

create or replace function private.staff_notification_name(p_event text, p_source_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case p_event
    when 'message' then (
      select person.first_name
        from public.conversations as conversation
        join public.profiles as person on person.id = conversation.user_id
       where conversation.id = p_source_id and person.anonymized_at is null)
    when 'referral' then (
      select entity.name
        from public.entity_referrals as referral
        join public.collaborating_entities as entity
          on entity.org_id = referral.org_id and entity.id = referral.collaborating_entity_id
       where referral.id = p_source_id)
    when 'walk_in' then (
      select signing.first_name from public.walk_in_signings as signing
       where signing.id = p_source_id)
    when 'deletion_request' then (
      select person.first_name
        from public.deletion_requests as request
        join public.profiles as person on person.id = request.profile_id
       where request.id = p_source_id and person.anonymized_at is null)
    when 'mentoring_request' then (
      select person.first_name
        from public.mentoring_requests as request
        join public.profiles as person on person.id = request.player_id
       where request.id = p_source_id and person.anonymized_at is null)
    when 'feedback' then (
      select person.first_name
        from public.feedback_submissions as submission
        join public.profiles as person on person.id = submission.author_id
       where submission.id = p_source_id and person.anonymized_at is null)
    -- The field's own name, never an answer: nothing personal.
    when 'field_created' then (
      select field.label ->> 'ca' from public.profile_fields as field
       where field.id = p_source_id and not field.is_archived)
    else null
  end;
$$;

revoke all on function private.staff_notification_permissions(text) from public, anon, authenticated;
revoke all on function private.staff_notification_name(text, uuid) from public, anon, authenticated;

-- 3. Who created a field ---------------------------------------------------------------------------

create or replace function private.profile_field_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if new.kind = 'custom' and new.created_by is null and actor is not null
     and exists (select 1 from public.profiles where id = actor and org_id = new.org_id) then
    new.created_by := actor;
  end if;
  return new;
end;
$$;

revoke all on function private.profile_field_creator() from public, anon, authenticated;

create trigger profile_fields_creator
  before insert on public.profile_fields
  for each row execute function private.profile_field_creator();

-- 4. The bell --------------------------------------------------------------------------------------

create or replace function private.notify_profile_field_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if new.kind <> 'custom' or actor is null then
    return null;
  end if;
  begin
    perform private.notify_staff(new.org_id, 'field_created', new.id,
      '/settings?tab=profile-layout', array[actor, new.created_by]);
  exception when others then
    -- The bell is a hint: never refuse the field over it.
    raise warning 'staff notification for profile_fields % failed: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function private.notify_profile_field_created() from public, anon, authenticated;

create trigger profile_fields_notify_staff
  after insert on public.profile_fields
  for each row execute function private.notify_profile_field_created();

-- 5. Answers a field keeps -------------------------------------------------------------------------

create or replace function public.profile_field_answer_count(p_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
begin
  if not exists (select 1 from public.profile_fields where id = p_id and org_id = actor_org) then
    raise no_data_found using message = 'no such question';
  end if;
  return (select count(*) from public.custom_answers a where a.question_id = p_id)
       + (select count(*) from public.referral_custom_answers r where r.question_id = p_id);
end;
$$;

comment on function public.profile_field_answer_count(uuid) is
  'How many answers a profile field keeps, hers and the entities'' (RAPP-650). Designers only.';

revoke all on function public.profile_field_answer_count(uuid) from public, anon, authenticated;
grant execute on function public.profile_field_answer_count(uuid) to authenticated;
