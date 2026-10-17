-- Season re-registration (RAPP-306).
--
-- Every season, returning players registered again on paper. In the app,
-- nothing asked her again once she had joined. Now:
--   - staff with settings.organization create seasons and choose the current
--     one; publishing the current season's authorization (RAPP-304) makes every
--     returning player re-register on her next app open, through the RAPP-304
--     gate, which now also says whether she is returning;
--   - the four registration questions (applicant status, other supporting
--     entities, childcare, specific needs) are optional wizard questions, and
--     their answers are kept per season with history: a trigger keeps the
--     current season's copy whenever they change and when she signs a season;
--   - the season number is counted: the seasons she played before the app
--     (staff enter them, or the entity's "which year" answer sets them) plus
--     the seasons she signed. Nobody types it any more;
--   - staff see who has and has not re-registered; a paper record counts.

-- 1. Seasons ------------------------------------------------------------------------------------------

create or replace function public.create_season(p_name text, p_starts_on date, p_make_current boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  saved uuid;
begin
  if not (select public.has_permission('settings.organization')) then
    raise insufficient_privilege using message = 'creating a season needs settings.organization';
  end if;
  if nullif(btrim(p_name), '') is null or length(btrim(p_name)) > 50 or p_starts_on is null then
    raise check_violation using message = 'a season needs a name and a start date';
  end if;

  if coalesce(p_make_current, false) then
    update public.seasons set is_current = false where org_id = actor_org and is_current;
  end if;
  insert into public.seasons (org_id, name, starts_on, is_current)
  values (actor_org, btrim(p_name), p_starts_on, coalesce(p_make_current, false))
  returning id into saved;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'season.create', 'season', saved,
          jsonb_build_object('name', btrim(p_name), 'starts_on', p_starts_on, 'current', coalesce(p_make_current, false)));
  return saved;
end;
$$;

create or replace function public.set_current_season(p_season_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
begin
  if not (select public.has_permission('settings.organization')) then
    raise insufficient_privilege using message = 'the current season needs settings.organization';
  end if;
  if not exists (select 1 from public.seasons where id = p_season_id and org_id = actor_org) then
    raise insufficient_privilege using message = 'no season of this organization';
  end if;
  update public.seasons set is_current = false where org_id = actor_org and is_current and id <> p_season_id;
  update public.seasons set is_current = true where id = p_season_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'season.current', 'season', p_season_id, '{}'::jsonb);
end;
$$;

-- 2. Earlier seasons and the counted season number ---------------------------------------------------------

alter table public.profiles
  add column prior_seasons smallint not null default 0
    constraint profiles_prior_seasons_check check (prior_seasons between 0 and 20);

comment on column public.profiles.prior_seasons is
  'Seasons she played before the app (RAPP-306). The season number is these plus the seasons she signed.';
comment on column public.profiles.season_number is
  'Superseded by the counted season number (RAPP-306): kept as the entity reported it; reads count prior_seasons plus signed seasons.';

-- Which season of the programme this is for her: earlier seasons plus the
-- seasons she signed (in the app, on a staff device or on paper). Null when
-- neither is known.
create or replace function private.season_number(p_profile_id uuid)
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(
    coalesce((select p.prior_seasons from public.profiles p where p.id = p_profile_id), 0)
    + (select count(distinct sig.season_id) from public.authorization_signatures sig
        where sig.profile_id = p_profile_id),
    0)::smallint;
$$;

create or replace function public.set_prior_seasons(p_profile_id uuid, p_count integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
begin
  if not (select public.has_permission('participants.view_personal')) then
    raise insufficient_privilege using message = 'earlier seasons need participants.view_personal';
  end if;
  if p_count is null or p_count < 0 or p_count > 20 then
    raise check_violation using message = 'earlier seasons are between 0 and 20';
  end if;
  update public.profiles set prior_seasons = p_count
   where id = p_profile_id and org_id = actor_org and role in ('player', 'invited');
  if not found then
    raise insufficient_privilege using message = 'no participant of this organization';
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'profile.prior_seasons', 'profile', p_profile_id,
          jsonb_build_object('prior_seasons', p_count));
end;
$$;

-- 3. Season answers, one row per season ----------------------------------------------------------------------

create table public.season_answers (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  season_id uuid not null references public.seasons (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  applicant_status bytea,
  supporting_entities text[],
  childcare_need text check (childcare_need is null or childcare_need in ('yes', 'no', 'maybe')),
  specific_needs bytea,
  updated_at timestamptz not null default now(),
  primary key (profile_id, season_id)
);

comment on table public.season_answers is
  'Her registration answers per season, with history (RAPP-306). Applicant status and specific needs are encrypted and sensitive.';

alter table public.season_answers enable row level security;
create policy season_answers_select_team on public.season_answers
  for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (select public.has_permission('participants.view_personal'))
  );
revoke all on table public.season_answers from anon, authenticated;
-- The encrypted columns are read through participant_season_answers().
grant select (profile_id, season_id, org_id, supporting_entities, childcare_need, updated_at)
  on table public.season_answers to authenticated;

-- Copies her current answers into the current season's row.
create or replace function private.snapshot_season_answers(p_profile_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.season_answers (profile_id, season_id, org_id, applicant_status,
                                     supporting_entities, childcare_need, specific_needs)
  select p.id, private.current_season_id(p.org_id), p.org_id, p.applicant_status,
         p.supporting_entities, p.childcare_need, p.specific_needs
    from public.profiles p
   where p.id = p_profile_id and private.current_season_id(p.org_id) is not null
  on conflict (profile_id, season_id) do update set
    applicant_status = excluded.applicant_status,
    supporting_entities = excluded.supporting_entities,
    childcare_need = excluded.childcare_need,
    specific_needs = excluded.specific_needs,
    updated_at = now();
$$;

create or replace function private.snapshot_season_answers_on_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role in ('player', 'invited') then
    perform private.snapshot_season_answers(new.id);
  end if;
  return new;
end;
$$;

create trigger profiles_snapshot_season_answers
  after update of applicant_status, supporting_entities, childcare_need, specific_needs
  on public.profiles
  for each row execute function private.snapshot_season_answers_on_change();

-- Signing a season keeps that season's answers, even unchanged ones.
create or replace function private.snapshot_season_answers_on_signature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.season_id = private.current_season_id(new.org_id) then
    perform private.snapshot_season_answers(new.profile_id);
  end if;
  return new;
end;
$$;

create trigger authorization_signatures_snapshot_season_answers
  after insert on public.authorization_signatures
  for each row execute function private.snapshot_season_answers_on_signature();

-- Her season answers, from the re-registration flow.
create or replace function public.update_my_season_answers(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if not exists (select 1 from public.profiles where id = caller and role = 'player') then
    raise insufficient_privilege using message = 'only a player answers her season questions';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or p_payload - array['applicant_status', 'supporting_entities', 'childcare_need', 'specific_needs'] <> '{}'::jsonb
    or not private.season_answers_valid(p_payload)
  then
    raise invalid_parameter_value using message = 'a season answer is outside its choices';
  end if;

  update public.profiles p set
    applicant_status = case when p_payload ? 'applicant_status'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'applicant_status'), '')) else p.applicant_status end,
    supporting_entities = case when p_payload ? 'supporting_entities'
      then private.text_array_answer(p_payload -> 'supporting_entities') else p.supporting_entities end,
    childcare_need = case when p_payload ? 'childcare_need'
      then nullif(p_payload ->> 'childcare_need', '') else p.childcare_need end,
    specific_needs = case when p_payload ? 'specific_needs'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'specific_needs'), '')) else p.specific_needs end,
    updated_at = now()
  where p.id = caller;

  insert into public.profile_answers (profile_id, org_id, question, source)
  select caller, p.org_id, key, 'player'
    from public.profiles p, jsonb_object_keys(p_payload) key
   where p.id = caller
  on conflict (profile_id, question) do update set source = 'player', answered_at = now();
end;
$$;

-- Her season answers, every season, as staff see them.
create or replace function public.participant_season_answers(p_profile_id uuid)
returns table (
  season_name text, starts_on date, applicant_status text, supporting_entities text[],
  childcare_need text, specific_needs text, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.has_permission('participants.view_personal')) then
    raise insufficient_privilege using message = 'her season answers need participants.view_personal';
  end if;
  return query
    select s.name, s.starts_on,
           case when (select public.has_permission('participants.view_sensitive'))
             then public.decrypt_field(a.applicant_status) end,
           a.supporting_entities, a.childcare_need,
           case when (select public.has_permission('participants.view_sensitive'))
             then public.decrypt_field(a.specific_needs) end,
           a.updated_at
      from public.season_answers a
      join public.seasons s on s.id = a.season_id
     where a.profile_id = p_profile_id
       and a.org_id = (select public.current_org_id())
     order by s.starts_on desc;
end;
$$;

-- 4. Who has re-registered ------------------------------------------------------------------------------------

-- Every active player and whether she registered for the season (the current
-- one by default): signed in the app, on a staff device or on paper.
create or replace function public.season_registration_status(p_season_id uuid default null)
returns table (
  profile_id uuid, first_name text, last_name text, registered boolean,
  method text, signed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
  season uuid := coalesce(p_season_id, private.current_season_id(actor_org));
begin
  if not (select public.has_permission('participants.view_personal')) then
    raise insufficient_privilege using message = 'the season view needs participants.view_personal';
  end if;
  if not exists (select 1 from public.seasons where id = season and org_id = actor_org) then
    return;
  end if;
  return query
    select p.id, p.first_name, p.last_name, latest.id is not null, latest.method, latest.signed_at
      from public.profiles p
      left join lateral (
        select sig.id, sig.method, sig.signed_at
          from public.authorization_signatures sig
         where sig.profile_id = p.id and sig.season_id = season
         order by sig.signed_at desc
         limit 1
      ) latest on true
     where p.org_id = actor_org and p.role = 'player' and p.is_active
     order by (latest.id is not null), p.last_name, p.first_name;
end;
$$;

-- Every player already signed in has her 2026/27 answers on record.
select private.snapshot_season_answers(p.id)
  from public.profiles p
 where p.role in ('player', 'invited');


create or replace function public.personal_data_disposition()
 RETURNS TABLE(table_name text, participant_column text, disposition text, reason text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $$
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
    ('intake_question_states', 'profile_id', 'purge', 'Which intake questions staff chose to ask or not ask her.'),
    ('seasons', null, 'not_personal', 'The organization''s seasons.'),
    ('authorization_versions', null, 'not_personal', 'The organization''s published authorization texts.'),
    ('authorization_signatures', 'profile_id', 'purge', 'Her signed or paper authorizations, with her drawn signature.'),
    ('authorization_consent_events', 'profile_id', 'purge', 'Each consent she gave or withdrew.'),
    ('season_answers', 'profile_id', 'purge', 'Her registration answers, one row per season.')
  ) as disposition(table_name, participant_column, disposition, reason);
$$;

create or replace function private.wizard_intake_questions()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $$
  select array[
    'first_name', 'last_name', 'date_of_birth', 'place_of_birth', 'nationality',
    'preferred_language', 'document', 'phone', 'address', 'city', 'postal_code',
    'reference_entity', 'reference_contact_name', 'dependents', 'clothing_size', 'shoe_size',
    'applicant_status', 'supporting_entities', 'childcare_need', 'specific_needs'
  ]::text[];
$$;

create or replace function public.complete_onboarding(payload jsonb)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  caller uuid := (select auth.uid());
  stored public.profiles;
  saved public.profiles;
  terms_version_value text := nullif(payload ->> 'terms_version', '');
  locale_shown_value text := nullif(payload ->> 'locale_shown', '');
  -- Every value below is the merge: a question the wizard sent takes her
  -- answer, and a question it did not send keeps what is stored.
  first_name_value text;
  last_name_value text;
  date_of_birth_value date;
  place_of_birth_value text;
  nationality_value text;
  preferred_language_value text;
  document_type_value text;
  document_number_value text;
  phone_value text;
  address_value text;
  city_value text;
  postal_code_value text;
  reference_entity_value text;
  reference_contact_name_value text;
  has_dependents_value boolean;
  num_dependents_value integer;
  clothing_size_value text;
  shoe_size_value text;
  avatar_url_value text;
  media_consent_at_value timestamptz;
begin
  if caller is null then
    raise exception 'complete_onboarding requires an authenticated caller'
      using errcode = 'insufficient_privilege';
  end if;

  if terms_version_value is null or locale_shown_value is null then
    raise exception 'complete_onboarding requires terms_version and locale_shown'
      using errcode = 'not_null_violation';
  end if;

  select * into stored from public.profiles where id = caller for update;
  if stored.id is not null and stored.role not in ('player', 'invited') then
    raise exception 'complete_onboarding is the participant path'
      using errcode = 'insufficient_privilege';
  end if;

  first_name_value := case when payload ? 'first_name'
    then nullif(btrim(payload ->> 'first_name'), '') else stored.first_name end;
  last_name_value := case when payload ? 'last_name'
    then nullif(btrim(payload ->> 'last_name'), '') else stored.last_name end;
  date_of_birth_value := case when payload ? 'date_of_birth'
    then nullif(payload ->> 'date_of_birth', '')::date else stored.date_of_birth end;
  place_of_birth_value := case when payload ? 'place_of_birth'
    then nullif(btrim(payload ->> 'place_of_birth'), '') else stored.place_of_birth end;
  nationality_value := case when payload ? 'nationality'
    then nullif(btrim(payload ->> 'nationality'), '') else stored.nationality end;
  preferred_language_value := coalesce(
    nullif(payload ->> 'preferred_language', ''), stored.preferred_language, 'ca');
  document_type_value := case when payload ? 'document_type'
    then nullif(payload ->> 'document_type', '') else stored.document_type end;
  document_number_value := case when payload ? 'document_number'
    then nullif(btrim(payload ->> 'document_number'), '')
    else public.decrypt_field(stored.document_number) end;
  -- No type means no document was given (RAPP-302), so a number cannot stand
  -- alone either.
  if document_type_value is null or document_type_value = 'none' then
    document_number_value := null;
  end if;
  phone_value := case when payload ? 'phone'
    then nullif(btrim(payload ->> 'phone'), '') else public.decrypt_field(stored.phone) end;
  address_value := case when payload ? 'address'
    then nullif(btrim(payload ->> 'address'), '') else public.decrypt_field(stored.address) end;
  city_value := case when payload ? 'city'
    then nullif(btrim(payload ->> 'city'), '') else stored.city end;
  postal_code_value := case when payload ? 'postal_code'
    then nullif(btrim(payload ->> 'postal_code'), '') else public.decrypt_field(stored.postal_code) end;
  reference_entity_value := case when payload ? 'reference_entity'
    then nullif(btrim(payload ->> 'reference_entity'), '') else stored.reference_entity end;
  reference_contact_name_value := case when payload ? 'reference_contact_name'
    then nullif(btrim(payload ->> 'reference_contact_name'), '') else stored.reference_contact_name end;
  has_dependents_value := coalesce(
    nullif(payload ->> 'has_dependents', '')::boolean, stored.has_dependents, false);
  num_dependents_value := case when has_dependents_value
    then coalesce(nullif(payload ->> 'num_dependents', '')::integer, stored.num_dependents, 0)
    else 0 end;
  clothing_size_value := case when payload ? 'clothing_size'
    then nullif(payload ->> 'clothing_size', '') else stored.clothing_size end;
  shoe_size_value := case when payload ? 'shoe_size'
    then nullif(payload ->> 'shoe_size', '') else stored.shoe_size end;
  avatar_url_value := case when payload ? 'avatar_url'
    then nullif(payload ->> 'avatar_url', '') else stored.avatar_url end;
  media_consent_at_value := case
    when nullif(payload ->> 'media_consent', '') is null then stored.media_consent_at
    when (payload ->> 'media_consent')::boolean then coalesce(stored.media_consent_at, now())
    else null
  end;

  if not private.season_answers_valid(payload) then
    raise invalid_parameter_value using message = 'a season answer is outside its choices';
  end if;

  if first_name_value is null or last_name_value is null then
    raise exception 'complete_onboarding requires first_name and last_name'
      using errcode = 'not_null_violation';
  end if;

  if place_of_birth_value is null then
    raise exception 'complete_onboarding requires place_of_birth'
      using errcode = 'not_null_violation';
  end if;

  -- The document is optional (RAPP-302): she may skip it. Once she chooses a
  -- type, a number is required unless the answer is "none", which is a
  -- first-class answer: many participants genuinely have no document, and
  -- onboarding must never dead-end on it.
  if document_type_value is not null and document_type_value <> 'none'
    and document_number_value is null
  then
    raise exception 'complete_onboarding requires document_number for a chosen document_type'
      using errcode = 'not_null_violation';
  end if;

  if stored.id is null then
    insert into public.profiles (
      id, org_id, role,
      first_name, last_name, date_of_birth, place_of_birth, nationality, preferred_language,
      document_type, document_number,
      phone, address, city, postal_code,
      reference_entity, reference_contact_name,
      has_dependents, num_dependents, clothing_size, shoe_size, avatar_url,
      terms_accepted_at, media_consent_at
    )
    values (
      caller, (select public.default_organization_id()), 'player',
      first_name_value, last_name_value, date_of_birth_value, place_of_birth_value,
      nationality_value, preferred_language_value,
      document_type_value, public.encrypt_field(document_number_value),
      public.encrypt_field(phone_value), public.encrypt_field(address_value), city_value,
      public.encrypt_field(postal_code_value),
      reference_entity_value, reference_contact_name_value,
      has_dependents_value, num_dependents_value, clothing_size_value, shoe_size_value,
      avatar_url_value, now(), media_consent_at_value
    )
    returning * into saved;
  else
    -- Role and org are not the wizard's to change, except that joining makes
    -- an invited woman a player (RAPP-300).
    update public.profiles set
      role = 'player',
      first_name = first_name_value,
      last_name = last_name_value,
      date_of_birth = date_of_birth_value,
      place_of_birth = place_of_birth_value,
      nationality = nationality_value,
      preferred_language = preferred_language_value,
      document_type = document_type_value,
      document_number = public.encrypt_field(document_number_value),
      phone = public.encrypt_field(phone_value),
      address = public.encrypt_field(address_value),
      city = city_value,
      postal_code = public.encrypt_field(postal_code_value),
      reference_entity = reference_entity_value,
      reference_contact_name = reference_contact_name_value,
      has_dependents = has_dependents_value,
      num_dependents = num_dependents_value,
      clothing_size = clothing_size_value,
      shoe_size = shoe_size_value,
      avatar_url = avatar_url_value,
      terms_accepted_at = now(),
      media_consent_at = media_consent_at_value,
      updated_at = now()
    where id = caller
    returning * into saved;
  end if;

  -- The registration questions (RAPP-306): optional wizard questions. A key
  -- left out keeps its value; the trigger keeps the season's copy.
  if payload ?| array['applicant_status', 'supporting_entities', 'childcare_need', 'specific_needs'] then
    update public.profiles p set
      applicant_status = case when payload ? 'applicant_status'
        then public.encrypt_field(nullif(btrim(payload ->> 'applicant_status'), '')) else p.applicant_status end,
      supporting_entities = case when payload ? 'supporting_entities'
        then private.text_array_answer(payload -> 'supporting_entities') else p.supporting_entities end,
      childcare_need = case when payload ? 'childcare_need'
        then nullif(payload ->> 'childcare_need', '') else p.childcare_need end,
      specific_needs = case when payload ? 'specific_needs'
        then public.encrypt_field(nullif(btrim(payload ->> 'specific_needs'), '')) else p.specific_needs end
    where p.id = caller
    returning * into saved;
  end if;

  -- Her own answers: a question she sent with a value becomes hers when it was
  -- unanswered or she changed it; one she confirmed unchanged keeps the staff
  -- or entity record; one she cleared is no longer answered.
  with question (name, touched, has_value, changed) as (
    values
      ('first_name', payload ? 'first_name', first_name_value is not null,
        first_name_value is distinct from stored.first_name),
      ('last_name', payload ? 'last_name', last_name_value is not null,
        last_name_value is distinct from stored.last_name),
      ('date_of_birth', payload ? 'date_of_birth', date_of_birth_value is not null,
        date_of_birth_value is distinct from stored.date_of_birth),
      ('place_of_birth', payload ? 'place_of_birth', place_of_birth_value is not null,
        place_of_birth_value is distinct from stored.place_of_birth),
      ('nationality', payload ? 'nationality', nationality_value is not null,
        nationality_value is distinct from stored.nationality),
      ('preferred_language', nullif(payload ->> 'preferred_language', '') is not null, true,
        preferred_language_value is distinct from stored.preferred_language),
      ('document', payload ?| array['document_type', 'document_number'], true,
        document_type_value is distinct from stored.document_type
        or document_number_value is distinct from public.decrypt_field(stored.document_number)),
      ('phone', payload ? 'phone', phone_value is not null,
        phone_value is distinct from public.decrypt_field(stored.phone)),
      ('address', payload ? 'address', address_value is not null,
        address_value is distinct from public.decrypt_field(stored.address)),
      ('city', payload ? 'city', city_value is not null, city_value is distinct from stored.city),
      ('postal_code', payload ? 'postal_code', postal_code_value is not null,
        postal_code_value is distinct from public.decrypt_field(stored.postal_code)),
      ('reference_entity', payload ? 'reference_entity', reference_entity_value is not null,
        reference_entity_value is distinct from stored.reference_entity),
      ('reference_contact_name', payload ? 'reference_contact_name', reference_contact_name_value is not null,
        reference_contact_name_value is distinct from stored.reference_contact_name),
      ('dependents', nullif(payload ->> 'has_dependents', '') is not null, true,
        has_dependents_value is distinct from stored.has_dependents
        or num_dependents_value is distinct from stored.num_dependents),
      ('clothing_size', payload ? 'clothing_size', clothing_size_value is not null,
        clothing_size_value is distinct from stored.clothing_size),
      ('shoe_size', payload ? 'shoe_size', shoe_size_value is not null,
        shoe_size_value is distinct from stored.shoe_size),
      ('avatar', payload ? 'avatar_url', avatar_url_value is not null,
        avatar_url_value is distinct from stored.avatar_url),
      ('applicant_status', payload ? 'applicant_status', saved.applicant_status is not null,
        public.decrypt_field(saved.applicant_status) is distinct from public.decrypt_field(stored.applicant_status)),
      ('supporting_entities', payload ? 'supporting_entities', saved.supporting_entities is not null,
        saved.supporting_entities is distinct from stored.supporting_entities),
      ('childcare_need', payload ? 'childcare_need', saved.childcare_need is not null,
        saved.childcare_need is distinct from stored.childcare_need),
      ('specific_needs', payload ? 'specific_needs', saved.specific_needs is not null,
        public.decrypt_field(saved.specific_needs) is distinct from public.decrypt_field(stored.specific_needs))
  ),
  cleared as (
    delete from public.profile_answers answer
     using question
     where answer.profile_id = caller
       and answer.question = question.name
       and question.touched
       and not question.has_value
  )
  insert into public.profile_answers (profile_id, org_id, question, source)
  select caller, saved.org_id, question.name, 'player'
    from question
   where question.touched
     and question.has_value
     and (
       question.changed
       or not exists (
         select 1 from public.profile_answers existing
          where existing.profile_id = caller and existing.question = question.name
       )
     )
  on conflict (profile_id, question) do update
    set source = 'player', answered_at = now();

  insert into public.terms_acceptances (profile_id, terms_version, locale_shown)
  values (caller, terms_version_value, locale_shown_value);

  return saved;
end;
$$;

drop function public.my_authorization_status();

create or replace function public.my_authorization_status()
 RETURNS TABLE(required boolean, version_id uuid, season_id uuid, season_name text, version_number integer, content jsonb, is_returning boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
  with me as (
    select p.id, p.org_id from public.profiles p
     where p.id = (select auth.uid()) and p.role = 'player'
  ),
  current_version as (
    select v.* from me, private.current_authorization_version(me.org_id) v where v.id is not null
  )
  select
    not exists (
      select 1 from public.authorization_signatures sig, me
       where sig.profile_id = me.id
         and sig.season_id = cv.season_id
         and (sig.method = 'paper' or sig.version_id = cv.id)
    ),
    cv.id, cv.season_id, s.name, cv.version_number, cv.content,
    -- Returning: she signed an earlier season, so this is re-registration (RAPP-306).
    exists (
      select 1 from public.authorization_signatures sig, me
       where sig.profile_id = me.id and sig.season_id <> cv.season_id
    )
  from current_version cv
  join public.seasons s on s.id = cv.season_id;
$$;

create or replace function public.get_participant_profile(participant_id uuid)
 RETURNS TABLE(id uuid, first_name text, last_name text, date_of_birth date, place_of_birth text, nationality text, preferred_language text, document_type text, document_number text, phone text, address text, city text, postal_code text, reference_entity text, reference_contact_name text, has_dependents boolean, num_dependents integer, clothing_size text, shoe_size text, avatar_url text, media_consent boolean, terms_accepted_at timestamp with time zone, is_active boolean, is_forum_banned boolean, anonymized_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, applicant_status text, supporting_entities text[], season_number smallint, childcare_need text, specific_needs text, health_info text, emergency_contact_name text, emergency_contact_relation text, emergency_contact_phone text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
  with subject as (
    select p.*
    from public.profiles p
    where p.id = participant_id
      and p.org_id = (select public.current_org_id())
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
    s.anonymized_at,
    s.created_at,
    s.updated_at,
    -- The season registration answers (RAPP-303). Applicant status and
    -- specific needs are sensitive, like the document number.
    case when (select public.has_permission('participants.view_sensitive')) then public.decrypt_field(s.applicant_status) end,
    case when (select public.has_permission('participants.view_personal')) then s.supporting_entities end,
    -- Counted (RAPP-306): earlier seasons plus the seasons she signed.
    private.season_number(s.id),
    case when (select public.has_permission('participants.view_personal')) then s.childcare_need end,
    case when (select public.has_permission('participants.view_sensitive')) then public.decrypt_field(s.specific_needs) end,
    -- The medical answer needs its own permission (RAPP-304); the emergency
    -- contact follows the personal and sensitive levels.
    case when (select public.has_permission('participants.view_health')) then public.decrypt_field(s.health_info) end,
    case when (select public.has_permission('participants.view_personal')) then s.emergency_contact_name end,
    case when (select public.has_permission('participants.view_personal')) then s.emergency_contact_relation end,
    case when (select public.has_permission('participants.view_sensitive')) then public.decrypt_field(s.emergency_contact_phone) end
  from subject s;
$$;

create or replace function public.get_own_profile()
 RETURNS TABLE(id uuid, first_name text, last_name text, date_of_birth date, place_of_birth text, nationality text, preferred_language text, document_type text, document_number text, phone text, address text, city text, postal_code text, reference_entity text, reference_contact_name text, has_dependents boolean, num_dependents integer, clothing_size text, shoe_size text, avatar_url text, media_consent boolean, terms_accepted_at timestamp with time zone, applicant_status text, supporting_entities text[], season_number smallint, childcare_need text, specific_needs text, health_info text, emergency_contact_name text, emergency_contact_relation text, emergency_contact_phone text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
  select
    p.id,
    p.first_name,
    p.last_name,
    p.date_of_birth,
    p.place_of_birth,
    p.nationality,
    p.preferred_language,
    p.document_type,
    public.decrypt_field(p.document_number),
    public.decrypt_field(p.phone),
    public.decrypt_field(p.address),
    p.city,
    public.decrypt_field(p.postal_code),
    p.reference_entity,
    p.reference_contact_name,
    p.has_dependents,
    p.num_dependents,
    p.clothing_size,
    p.shoe_size,
    p.avatar_url,
    p.media_consent_at is not null,
    p.terms_accepted_at,
    public.decrypt_field(p.applicant_status),
    p.supporting_entities,
    private.season_number(p.id),
    p.childcare_need,
    public.decrypt_field(p.specific_needs),
    public.decrypt_field(p.health_info),
    p.emergency_contact_name,
    p.emergency_contact_relation,
    public.decrypt_field(p.emergency_contact_phone)
  from public.profiles p
  where p.id = (select auth.uid());
$$;

create or replace function private.apply_profile_prefill(p_profile_id uuid, p_payload jsonb, p_source text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  target public.profiles;
begin
  if p_source not in ('staff', 'entity') then
    raise exception 'apply_profile_prefill takes staff or entity answers'
      using errcode = 'invalid_parameter_value';
  end if;

  if (p_payload ? 'first_name' and nullif(btrim(p_payload ->> 'first_name'), '') is null)
    or (p_payload ? 'last_name' and nullif(btrim(p_payload ->> 'last_name'), '') is null)
  then
    raise exception 'a name can be corrected but not removed'
      using errcode = 'not_null_violation';
  end if;

  if not private.season_answers_valid(p_payload) then
    raise invalid_parameter_value using message = 'a season answer is outside its choices';
  end if;

  update public.profiles p set
    first_name = case when p_payload ? 'first_name' then btrim(p_payload ->> 'first_name') else p.first_name end,
    last_name = case when p_payload ? 'last_name' then btrim(p_payload ->> 'last_name') else p.last_name end,
    date_of_birth = case when p_payload ? 'date_of_birth'
      then nullif(p_payload ->> 'date_of_birth', '')::date else p.date_of_birth end,
    place_of_birth = case when p_payload ? 'place_of_birth'
      then nullif(btrim(p_payload ->> 'place_of_birth'), '') else p.place_of_birth end,
    nationality = case when p_payload ? 'nationality'
      then nullif(btrim(p_payload ->> 'nationality'), '') else p.nationality end,
    preferred_language = coalesce(nullif(p_payload ->> 'preferred_language', ''), p.preferred_language),
    document_type = case when p_payload ? 'document_type'
      then nullif(p_payload ->> 'document_type', '') else p.document_type end,
    document_number = case when p_payload ? 'document_number'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'document_number'), '')) else p.document_number end,
    phone = case when p_payload ? 'phone'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'phone'), '')) else p.phone end,
    address = case when p_payload ? 'address'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'address'), '')) else p.address end,
    city = case when p_payload ? 'city' then nullif(btrim(p_payload ->> 'city'), '') else p.city end,
    postal_code = case when p_payload ? 'postal_code'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'postal_code'), '')) else p.postal_code end,
    reference_entity = case when p_payload ? 'reference_entity'
      then nullif(btrim(p_payload ->> 'reference_entity'), '') else p.reference_entity end,
    reference_contact_name = case when p_payload ? 'reference_contact_name'
      then nullif(btrim(p_payload ->> 'reference_contact_name'), '') else p.reference_contact_name end,
    has_dependents = case when nullif(p_payload ->> 'has_dependents', '') is not null
      then (p_payload ->> 'has_dependents')::boolean else p.has_dependents end,
    num_dependents = case when nullif(p_payload ->> 'num_dependents', '') is not null
      then (p_payload ->> 'num_dependents')::integer else p.num_dependents end,
    clothing_size = case when p_payload ? 'clothing_size'
      then nullif(p_payload ->> 'clothing_size', '') else p.clothing_size end,
    shoe_size = case when p_payload ? 'shoe_size'
      then nullif(p_payload ->> 'shoe_size', '') else p.shoe_size end,
    applicant_status = case when p_payload ? 'applicant_status'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'applicant_status'), '')) else p.applicant_status end,
    supporting_entities = case when p_payload ? 'supporting_entities'
      then private.text_array_answer(p_payload -> 'supporting_entities') else p.supporting_entities end,
    season_number = case when p_payload ? 'season_number'
      then nullif(p_payload ->> 'season_number', '')::smallint else p.season_number end,
    -- "This is her third year" means two seasons before this one (RAPP-306).
    prior_seasons = case when nullif(p_payload ->> 'season_number', '') is not null
      then greatest((p_payload ->> 'season_number')::smallint - 1, 0) else p.prior_seasons end,
    childcare_need = case when p_payload ? 'childcare_need'
      then nullif(p_payload ->> 'childcare_need', '') else p.childcare_need end,
    specific_needs = case when p_payload ? 'specific_needs'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'specific_needs'), '')) else p.specific_needs end,
    updated_at = now()
  where p.id = p_profile_id
  returning * into target;

  if target.id is null then
    return;
  end if;

  if not target.has_dependents and target.num_dependents <> 0 then
    update public.profiles set num_dependents = 0 where id = p_profile_id;
    target.num_dependents := 0;
  end if;

  with question (name, touched, has_value) as (
    values
      ('first_name', p_payload ? 'first_name', target.first_name is not null),
      ('last_name', p_payload ? 'last_name', target.last_name is not null),
      ('date_of_birth', p_payload ? 'date_of_birth', target.date_of_birth is not null),
      ('place_of_birth', p_payload ? 'place_of_birth', target.place_of_birth is not null),
      ('nationality', p_payload ? 'nationality', target.nationality is not null),
      ('preferred_language', nullif(p_payload ->> 'preferred_language', '') is not null, true),
      ('document', p_payload ?| array['document_type', 'document_number'],
        target.document_type is not null
        and (target.document_type = 'none' or target.document_number is not null)),
      ('phone', p_payload ? 'phone', target.phone is not null),
      ('address', p_payload ? 'address', target.address is not null),
      ('city', p_payload ? 'city', target.city is not null),
      ('postal_code', p_payload ? 'postal_code', target.postal_code is not null),
      ('reference_entity', p_payload ? 'reference_entity', target.reference_entity is not null),
      ('reference_contact_name', p_payload ? 'reference_contact_name', target.reference_contact_name is not null),
      ('dependents', nullif(p_payload ->> 'has_dependents', '') is not null, true),
      ('clothing_size', p_payload ? 'clothing_size', target.clothing_size is not null),
      ('shoe_size', p_payload ? 'shoe_size', target.shoe_size is not null),
      ('applicant_status', p_payload ? 'applicant_status', target.applicant_status is not null),
      ('supporting_entities', p_payload ? 'supporting_entities', target.supporting_entities is not null),
      ('season_number', p_payload ? 'season_number', target.season_number is not null),
      ('childcare_need', p_payload ? 'childcare_need', target.childcare_need is not null),
      ('specific_needs', p_payload ? 'specific_needs', target.specific_needs is not null)
  ),
  cleared as (
    delete from public.profile_answers answer
     using question
     where answer.profile_id = p_profile_id
       and answer.question = question.name
       and question.touched
       and not question.has_value
  )
  insert into public.profile_answers (profile_id, org_id, question, source)
  select p_profile_id, target.org_id, question.name, p_source
    from question
   where question.touched and question.has_value
  on conflict (profile_id, question) do update
    set source = excluded.source, answered_at = now();
end;
$$;


revoke all on function public.create_season(text, date, boolean) from public, anon;
revoke all on function public.set_current_season(uuid) from public, anon;
revoke all on function public.set_prior_seasons(uuid, integer) from public, anon;
revoke all on function public.update_my_season_answers(jsonb) from public, anon;
revoke all on function public.participant_season_answers(uuid) from public, anon;
revoke all on function public.season_registration_status(uuid) from public, anon;
revoke all on function public.my_authorization_status() from public, anon;
grant execute on function public.create_season(text, date, boolean) to authenticated;
grant execute on function public.set_current_season(uuid) to authenticated;
grant execute on function public.set_prior_seasons(uuid, integer) to authenticated;
grant execute on function public.update_my_season_answers(jsonb) to authenticated;
grant execute on function public.participant_season_answers(uuid) to authenticated;
grant execute on function public.season_registration_status(uuid) to authenticated;
grant execute on function public.my_authorization_status() to authenticated;
