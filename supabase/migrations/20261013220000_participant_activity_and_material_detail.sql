-- Participant activity and material history (RAPP-283, part of RAPP-213).
--
-- 1. participant_activity() gains the attendance and event sign-up branches
--    its kinds already named. The function stays SECURITY INVOKER, so the
--    policies of attendance, event_signups and events decide what a caller
--    sees, exactly as they do for the other branches. The detail of these two
--    branches is the stored status code; the screens translate it.
-- 2. participant_material_detail() returns one handover with what the list
--    leaves out: who handed it over, the note, the signature strokes, the
--    reason when she did not sign, the statement language, and who recorded
--    the return. Same reach as participant_material().

create or replace function public.participant_activity(participant_id uuid)
 returns table(id uuid, kind text, occurred_at timestamp with time zone, title text, detail text)
 language sql
 stable
 set search_path to ''
as $function$
  select events.id, events.kind, events.occurred_at, events.title, events.detail
  from (
    select
      interest.id,
      'service_interest'::text as kind,
      interest.created_at as occurred_at,
      coalesce(service.title->>'ca', service.title->>'en', '') as title,
      nullif(concat_ws(' · ', nullif(service.provider_name, ''), nullif(category.name->>'ca', '')), '') as detail,
      interest.user_id as profile_id
    from public.service_interests as interest
    join public.services as service
      on service.org_id = interest.org_id and service.id = interest.service_id
    join public.service_categories as category
      on category.org_id = service.org_id and category.id = service.category_id

    union all

    select
      message.id,
      'message'::text,
      message.created_at,
      concat_ws(' ', sender.first_name, sender.last_name),
      message.content,
      conversation.user_id
    from public.messages as message
    join public.conversations as conversation
      on conversation.org_id = message.org_id and conversation.id = message.conversation_id
    join public.profiles as sender
      on sender.org_id = message.org_id and sender.id = message.sender_id
    where conversation.user_id = participant_id

    union all

    select
      referral_update.id,
      'referral_update'::text,
      referral_update.created_at,
      concat_ws(' ', entity.first_name, entity.last_name),
      public.decrypt_field(referral_update.content),
      referral.referred_profile_id
    from public.referral_updates as referral_update
    join public.entity_referrals as referral
      on referral.org_id = referral_update.org_id and referral.id = referral_update.referral_id
    join public.profiles as entity
      on entity.org_id = referral.org_id and entity.id = referral.entity_user_id
    where referral.referred_profile_id = participant_id

    union all

    select
      submission.id,
      'feedback'::text,
      submission.created_at,
      submission.type,
      public.decrypt_field(submission.content_encrypted),
      submission.author_id
    from public.feedback_submissions as submission
    where submission.author_id = participant_id

    union all

    select
      mark.id,
      'attendance'::text,
      occurrence.starts_at,
      coalesce(event.title->>'ca', event.title->>'en', ''),
      mark.status,
      mark.player_id
    from public.attendance as mark
    join public.event_occurrences as occurrence
      on occurrence.org_id = mark.org_id and occurrence.id = mark.occurrence_id
    join public.events as event
      on event.org_id = occurrence.org_id and event.id = occurrence.event_id
    where mark.player_id = participant_id

    union all

    select
      signup.id,
      'event_signup'::text,
      signup.created_at,
      coalesce(event.title->>'ca', event.title->>'en', ''),
      signup.state,
      signup.player_id
    from public.event_signups as signup
    join public.events as event
      on event.org_id = signup.org_id and event.id = signup.event_id
    where signup.player_id = participant_id
  ) as events
  where events.profile_id = participant_id
  order by events.occurred_at desc, events.id;
$function$;

create or replace function public.participant_material_detail(p_delivery_id uuid)
returns table (
  delivery_id uuid,
  delivered_by_name text,
  note text,
  signature jsonb,
  signature_state text,
  signature_reason text,
  statement_language text,
  returned_by_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    d.id,
    nullif(concat_ws(' ', giver.first_name, giver.last_name), ''),
    d.note,
    d.signature,
    d.signature_state,
    d.signature_reason,
    d.statement_language,
    nullif(concat_ws(' ', taker.first_name, taker.last_name), '')
  from public.equipment_deliveries d
  join public.profiles p on p.id = d.profile_id
  left join public.profiles giver on giver.id = d.delivered_by
  left join public.stock_movements r on r.equipment_delivery_id = d.id and r.kind = 'return'
  left join public.profiles taker on taker.id = r.recorded_by
  where d.id = p_delivery_id
    and p.org_id = (select public.current_org_id())
    and (
      (select public.has_permission('equipment.handover'))
      or (select public.has_permission('participants.view'))
    );
$$;
revoke all on function public.participant_material_detail(uuid) from public, anon;
grant execute on function public.participant_material_detail(uuid) to authenticated;
