-- Who may reach the field-encryption key and decrypt a field (RAPP-624).
--
-- WHY
--
-- public.encryption_key(), public.encrypt_field(text) and
-- public.decrypt_field(bytea) are SECURITY DEFINER functions in the exposed
-- public schema. Since 20260717191324 PUBLIC, anon and authenticated kept
-- EXECUTE on them, so `POST /rest/v1/rpc/encryption_key` with the public app
-- key returned the Vault key, and any signed-in user could decrypt any
-- ciphertext she could read.
--
-- WHAT THIS MIGRATION DOES
--
--   1. Nobody outside the database runs the three functions: EXECUTE is
--      revoked from PUBLIC, anon, authenticated and service_role. The SECURITY
--      DEFINER functions that call them run as their owner, so they keep
--      working, and each of them already checks its caller.
--      Docs: https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker
--      ("revoke execute ... from public, anon, authenticated" for definer
--      functions that must not be callable through the API), and
--      https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY
--      (a definer function runs with its owner's privileges).
--   2. Five SECURITY INVOKER functions decrypted as the signed-in user. They
--      stay invoker, so row security still decides WHICH rows each caller
--      gets, and their decryption moves to three narrow private helpers.
--      Each helper reads the ciphertext itself, by row id, and decrypts only
--      when the caller may read that row and that field:
--        private.referral_private_fields   the referral's phone, address,
--                                          notes and intake answers: the
--                                          sending entity, or referrals.manage;
--                                          the sensitive intake answers only
--                                          for the sender or
--                                          participants.view_sensitive
--        private.referral_update_content   a referral update: referrals.manage
--                                          or the referral's own entity
--        private.feedback_content          a feedback text: its author or
--                                          feedback.view
--      The conditions are the ones the tables' select policies already use,
--      so allowed callers see exactly what they saw before.
--   3. The applicant status trigger becomes SECURITY DEFINER. A trigger
--      function cannot be called directly ("trigger functions can only be
--      called as triggers"), it returns nothing decrypted, and it only clears
--      or length-checks the row being written by its own writer.
--   4. The ciphertext columns of profiles become privileged, like role or
--      is_active (RAPP-239): no direct client write. Otherwise a user could
--      copy a ciphertext she can read (feedback, a referral's intake answers)
--      into her own profile and have get_own_profile() decrypt it for her.
--      Every legitimate write goes through a SECURITY DEFINER function that
--      encrypts on the server.

-- 1. The key and the two field functions -------------------------------------------------------------

revoke all on function public.encryption_key() from public, anon, authenticated, service_role;
revoke all on function public.encrypt_field(text) from public, anon, authenticated, service_role;
revoke all on function public.decrypt_field(bytea) from public, anon, authenticated, service_role;

-- 2. Narrow helpers ------------------------------------------------------------------------------------

create function private.referral_private_fields(p_referral_id uuid)
returns table(referred_phone text, referred_email text, notes text, intake_answers jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.decrypt_field(referral.referred_phone),
    public.decrypt_field(referral.referred_email),
    public.decrypt_field(referral.notes),
    -- The sender reads everything it sent; staff read the sensitive answers
    -- only with participants.view_sensitive (RAPP-303).
    case
      when referral.intake_answers is null then null
      when referral.collaborating_entity_id = (select public.current_collaborating_entity_id())
        or (select public.has_permission('participants.view_sensitive'))
      then public.decrypt_field(referral.intake_answers)::jsonb
      else public.decrypt_field(referral.intake_answers)::jsonb
        - array['applicant_status_details', 'applicant_status', 'specific_needs', 'document_number']
    end
  from public.entity_referrals as referral
  where referral.id = p_referral_id
    and referral.org_id = (select public.current_org_id())
    and (
      referral.collaborating_entity_id = (select public.current_collaborating_entity_id())
      or (select public.has_permission('referrals.manage'))
    );
$$;

comment on function private.referral_private_fields is
  'The decrypted contact, notes and intake answers of one referral, for its sending entity or referrals.manage only (RAPP-624).';

create function private.referral_update_content(p_update_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.decrypt_field(referral_update.content)
  from public.referral_updates as referral_update
  where referral_update.id = p_update_id
    and referral_update.org_id = (select public.current_org_id())
    and (
      (select public.has_permission('referrals.manage'))
      or exists (
        select 1 from public.entity_referrals as referral
         where referral.org_id = referral_update.org_id
           and referral.id = referral_update.referral_id
           and referral.collaborating_entity_id = (select public.current_collaborating_entity_id())
      )
    );
$$;

comment on function private.referral_update_content is
  'The decrypted text of one referral update, for referrals.manage or the referral''s own entity only (RAPP-624).';

create function private.feedback_content(p_submission_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.decrypt_field(submission.content_encrypted)
  from public.feedback_submissions as submission
  where submission.id = p_submission_id
    and submission.org_id = (select public.current_org_id())
    and (
      submission.author_id = (select auth.uid())
      or (select public.has_permission('feedback.view'))
    );
$$;

comment on function private.feedback_content is
  'The decrypted text of one feedback submission, for its author or feedback.view only (RAPP-624).';

-- The invoker functions below call them as the signed-in user. The private
-- schema is not exposed by the API, so none becomes a callable endpoint.
revoke all on function private.referral_private_fields(uuid) from public, anon;
revoke all on function private.referral_update_content(uuid) from public, anon;
revoke all on function private.feedback_content(uuid) from public, anon;
grant execute on function private.referral_private_fields(uuid) to authenticated;
grant execute on function private.referral_update_content(uuid) to authenticated;
grant execute on function private.feedback_content(uuid) to authenticated;

-- The five invoker functions, unchanged except for how they decrypt.

create or replace function public.list_referral_updates(p_referral_id uuid)
returns table(id uuid, update_type text, content text, author_name text, created_at timestamp with time zone)
language sql
stable
set search_path = ''
as $$
  select
    referral_update.id,
    referral_update.update_type,
    private.referral_update_content(referral_update.id),
    concat_ws(' ', author.first_name, author.last_name),
    referral_update.created_at
  from public.referral_updates as referral_update
  join public.profiles as author
    on author.org_id = referral_update.org_id
   and author.id = referral_update.author_id
  where referral_update.referral_id = p_referral_id
  order by referral_update.created_at desc, referral_update.id;
$$;

create or replace function public.list_entity_referrals()
returns table(
  id uuid, entity_user_id uuid, referred_profile_id uuid, assigned_staff_id uuid,
  referred_first_name text, referred_last_name text, referred_phone text, referred_email text,
  documentation_status text, notes text, status text, entity_name text,
  created_at timestamp with time zone, updated_at timestamp with time zone
)
language sql
stable
set search_path = ''
as $$
  select
    referral.id,
    referral.entity_user_id,
    referral.referred_profile_id,
    referral.assigned_staff_id,
    referral.referred_first_name,
    referral.referred_last_name,
    private_field.referred_phone,
    private_field.referred_email,
    referral.documentation_status,
    private_field.notes,
    referral.status,
    entity.name,
    referral.created_at,
    referral.updated_at
  from public.entity_referrals as referral
  join public.collaborating_entities as entity
    on entity.org_id = referral.org_id
   and entity.id = referral.collaborating_entity_id
  left join lateral private.referral_private_fields(referral.id) as private_field on true
  where referral.collaborating_entity_id =
    (select public.current_collaborating_entity_id())
  order by referral.updated_at desc, referral.id;
$$;

create or replace function public.list_staff_referrals(p_status text default null::text)
returns table(
  id uuid, entity_user_id uuid, referred_profile_id uuid, assigned_staff_id uuid,
  referred_first_name text, referred_last_name text, referred_phone text, referred_email text,
  documentation_status text, notes text, status text, entity_name text,
  created_at timestamp with time zone, updated_at timestamp with time zone
)
language sql
stable
set search_path = ''
as $$
  select
    referral.id,
    referral.entity_user_id,
    referral.referred_profile_id,
    referral.assigned_staff_id,
    referral.referred_first_name,
    referral.referred_last_name,
    private_field.referred_phone,
    private_field.referred_email,
    referral.documentation_status,
    private_field.notes,
    referral.status,
    entity.name,
    referral.created_at,
    referral.updated_at
  from public.entity_referrals as referral
  join public.collaborating_entities as entity
    on entity.org_id = referral.org_id
   and entity.id = referral.collaborating_entity_id
  left join lateral private.referral_private_fields(referral.id) as private_field on true
  where (select public.has_permission('referrals.manage'))
    and (p_status is null or referral.status = p_status)
  order by
    case when referral.status = 'pending' then 0 else 1 end,
    referral.created_at,
    referral.id;
$$;

create or replace function public.get_entity_referral(p_referral_id uuid)
returns table(
  id uuid, entity_user_id uuid, referred_profile_id uuid, assigned_staff_id uuid,
  referred_first_name text, referred_last_name text, referred_phone text, referred_email text,
  documentation_status text, notes text, status text, entity_name text,
  created_at timestamp with time zone, updated_at timestamp with time zone,
  intake_answers jsonb, consent_confirmed_at timestamp with time zone
)
language plpgsql
stable
set search_path = ''
as $$
begin
  return query
  select
    referral.id,
    referral.entity_user_id,
    referral.referred_profile_id,
    referral.assigned_staff_id,
    referral.referred_first_name,
    referral.referred_last_name,
    private_field.referred_phone,
    private_field.referred_email,
    referral.documentation_status,
    private_field.notes,
    referral.status,
    entity.name,
    referral.created_at,
    referral.updated_at,
    -- The helper keeps the sensitive answers for the sender and
    -- participants.view_sensitive (RAPP-303).
    private_field.intake_answers,
    referral.consent_confirmed_at
  from public.entity_referrals as referral
  join public.collaborating_entities as entity
    on entity.org_id = referral.org_id
   and entity.id = referral.collaborating_entity_id
  left join lateral private.referral_private_fields(referral.id) as private_field on true
  where referral.id = p_referral_id;

  if not found then
    raise no_data_found using message = 'referral not found';
  end if;
end;
$$;

create or replace function public.participant_activity(participant_id uuid)
returns table(id uuid, kind text, occurred_at timestamp with time zone, title text, detail text)
language sql
stable
set search_path = ''
as $$
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
      private.referral_update_content(referral_update.id),
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
      private.feedback_content(submission.id),
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
$$;

-- participant_activity is read by signed-in users only.
revoke all on function public.participant_activity(uuid) from public, anon;
grant execute on function public.participant_activity(uuid) to authenticated;

-- 3. The applicant status trigger ---------------------------------------------------------------------

alter function private.normalize_applicant_status_details() security definer;
revoke all on function private.normalize_applicant_status_details() from public, anon, authenticated;

-- 4. The ciphertext columns are privileged ---------------------------------------------------------------

create or replace function private.guard_profile_privileged_columns()
 returns trigger
 language plpgsql
 set search_path to ''
as $$
begin
  -- A SECURITY DEFINER function runs as its owner. The five SECURITY INVOKER
  -- functions that write profiles mark their one write as trusted (below).
  if current_user not in ('authenticated', 'anon')
    or current_setting('ramassa.trusted_profile_write', true) = 'on'
  then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Profiles are created by onboarding or an invitation, never by a direct insert.
    raise exception 'PROFILES/DIRECT_INSERT' using errcode = '42501';
  end if;

  if new.id is distinct from old.id
    or new.org_id is distinct from old.org_id
    or new.role is distinct from old.role
    or new.is_active is distinct from old.is_active
    or new.is_forum_banned is distinct from old.is_forum_banned
    or new.anonymized_at is distinct from old.anonymized_at
    or new.terms_accepted_at is distinct from old.terms_accepted_at
    or new.media_consent_at is distinct from old.media_consent_at
    or new.collaborating_entity_id is distinct from old.collaborating_entity_id
    or new.created_at is distinct from old.created_at
    or new.sessions_valid_after is distinct from old.sessions_valid_after
    or new.is_test_account is distinct from old.is_test_account
    -- The encrypted fields (RAPP-624): only the server encrypts them, so a
    -- client can never plant a ciphertext a profile read would decrypt.
    or new.document_number is distinct from old.document_number
    or new.phone is distinct from old.phone
    or new.address is distinct from old.address
    or new.postal_code is distinct from old.postal_code
    or new.applicant_status is distinct from old.applicant_status
    or new.applicant_status_details is distinct from old.applicant_status_details
    or new.specific_needs is distinct from old.specific_needs
    or new.health_info is distinct from old.health_info
    or new.emergency_contact_phone is distinct from old.emergency_contact_phone
  then
    -- These columns change only through their own action (an RPC).
    raise exception 'PROFILES/PRIVILEGED_COLUMN' using errcode = '42501';
  end if;

  return new;
end;
$$;
