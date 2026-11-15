-- The app's old answer storage is dropped: profile columns, season_answers, profile_answers (RAPP-666, D13).
--
-- WHY
--
-- Step 7 of 7 (RAPP-660 to RAPP-666). Since RAPP-661 every writer saves her
-- answers by field in `custom_answers`, and since RAPP-662 every reader reads
-- them there. The old storage was kept only so each step could ship alone. It
-- now holds stale copies, and a stale copy of personal data is a liability.
--
-- WHAT GOES
--
--   1. The app's columns on `profiles`: date of birth, place of birth,
--      nationality, the document (type, number, name), phone, address,
--      municipality (with its foreign key to the catalog), postal code, her
--      entity and contact there, dependants, sizes, applicant status and its
--      details, supporting organizations, childcare, specific needs. Her names
--      stay (D2), and so do the account columns: her language, photo, consents,
--      season count, health answer and emergency contact (the authorization
--      owns those).
--   2. `profiles.search_document` and its index: the participants search reads
--      `participant_search_documents` since RAPP-662 (D12).
--   3. `season_answers` (her season answers live in per-season answer rows,
--      D10) and `profile_answers` (each answer records who gave it).
--   4. The temporary sync of RAPP-660 and RAPP-661: the three mirror triggers,
--      the referral blob trigger and their functions.
--   5. The old triggers: the season snapshot, the joined-answers recorder, the
--      applicant details and document name normalizers, the details eraser.
--   6. The functions left only for the old storage: the season and referral
--      validators of the old payloads, the raw column readers, the copy, the
--      scenario column keys, the list column and specific needs helpers.
--
-- WHAT CHANGES
--
--   - A referral's encrypted `intake_answers` keeps only her season count; its
--     answers are by field since RAPP-661.
--   - The profile guard, erasure, the test player reset, the staff, entity and
--     preview account inserts and the fixture season cleanup stop naming the
--     old storage.
--   - The erasure registry drops the two tables.

-- 1. The temporary sync and the old triggers ------------------------------------

drop trigger profiles_temporary_app_answers_sync on public.profiles;
drop trigger season_answers_temporary_app_answers_sync on public.season_answers;
drop trigger profile_answers_temporary_app_answers_sync on public.profile_answers;
drop trigger entity_referrals_temporary_blob_answers on public.entity_referrals;
drop trigger profiles_snapshot_season_answers on public.profiles;
drop trigger profiles_record_joined_answers on public.profiles;
drop trigger normalize_applicant_status_details on public.profiles;
drop trigger normalize_document_name on public.profiles;
drop trigger profiles_erase_applicant_status_details on public.profiles;

drop function private.mirror_app_answers_from_profile();
drop function private.mirror_app_answers_from_season();
drop function private.mirror_app_answer_origin();
drop function private.mirror_app_answer(uuid, uuid, text, text, uuid, jsonb, timestamptz);
drop function private.copy_app_answers();
drop function private.app_answer_value(public.profile_fields, jsonb);
drop function private.app_field_raw_values(public.profiles);
drop function private.season_field_raw_values(text, text, text[], text, text);
drop function private.support_needs_parts(text);
drop function private.mirror_referral_blob_answers();
drop function private.referral_blob_answers(public.entity_referrals);
drop function private.season_answers_valid(jsonb);
drop function private.referral_answers_valid(jsonb);
drop function private.snapshot_season_answers_on_change();
drop function private.snapshot_season_answers(uuid);
drop function private.record_joined_profile_answers();
drop function private.normalize_applicant_status_details();
drop function private.normalize_document_name();
drop function private.erase_applicant_status_details();
-- Helpers of the old payloads: the column keys of a test player scenario, a
-- list column's array, the encoded specific needs string.
drop function private.scenario_answer_keys();
drop function private.text_array_answer(jsonb);
drop function private.support_needs_valid(text);

-- 2. A referral keeps only her season count in its blob ---------------------------

update public.entity_referrals r
   set intake_answers = case
         when blob.value ? 'season_number'
         then public.encrypt_field(jsonb_build_object('season_number', blob.value -> 'season_number')::text)
       end
  from (select e.id, coalesce(nullif(public.decrypt_field(e.intake_answers), '')::jsonb, '{}'::jsonb) as value
          from public.entity_referrals e
         where e.intake_answers is not null) blob
 where blob.id = r.id and blob.value - 'season_number' <> '{}'::jsonb;

-- 3. The functions that named the old storage ---------------------------------------

create or replace function private.guard_profile_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- A client write (her app, the admin, a direct table write) never leaves a
  -- name blank (pending fix 24). The database's own writes (security definer
  -- functions, the erasure) are not clients.
  if current_user in ('authenticated', 'anon')
     and tg_op = 'UPDATE'
     and ((new.first_name is distinct from old.first_name and private.name_trim(new.first_name) = '')
          or (new.last_name is distinct from old.last_name and private.name_trim(new.last_name) = ''))
  then
    raise exception 'PROFILES/NAME_REQUIRED' using errcode = '23514';
  end if;

  -- Staff who cannot read her emergency contact cannot write it either
  -- (pending fix 27): the stricter of its saved and the current level.
  if current_user in ('authenticated', 'anon')
     and tg_op = 'UPDATE'
     and (new.emergency_contact_name is distinct from old.emergency_contact_name
          or new.emergency_contact_relation is distinct from old.emergency_contact_relation)
     and not private.may_write_emergency_contact(old.id, old.org_id, old.emergency_contact_privacy)
  then
    raise exception 'PROFILES/EMERGENCY_CONTACT_HIDDEN' using errcode = '42501';
  end if;

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
    or new.health_info is distinct from old.health_info
    or new.emergency_contact_phone is distinct from old.emergency_contact_phone
    or new.emergency_contact_privacy is distinct from old.emergency_contact_privacy
  then
    -- These columns change only through their own action (an RPC).
    raise exception 'PROFILES/PRIVILEGED_COLUMN' using errcode = '42501';
  end if;

  return new;
end;
$function$;

create or replace function public.anonymize_participant(participant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid;
  subject_role text;
  subject_anonymized_at timestamptz;
  birth_field public.profile_fields;
  birth_date date;
begin
  perform private.require_recent_second_factor();
  -- SECURITY DEFINER means RLS is not doing this check, so it runs before any
  -- work, right after the step-up check, and pgTAP asserts it from three roles.
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

  -- The one answer that survives, read before anything goes: her birth year,
  -- from the field the registry names, only while it is still a date (D7, D11).
  birth_field := private.feature_field(actor_org, 'erasure.birth_year');
  if birth_field.id is not null then
    birth_date := (private.field_answer_now(participant_id, birth_field) #>> '{}')::date;
  end if;

  update public.profiles set
    -- Emptied rather than filled with a placeholder word: the screens read
    -- `anonymized_at` and show a translated label, so no invented name has to
    -- exist in five languages or leak out of a CSV export as though it were one.
    first_name = '',
    last_name = '',
    avatar_url = null,
    media_consent_at = null,
    is_active = false,
    anonymized_at = now(),
    updated_at = now()
  where id = participant_id;

  -- Every answer of hers (D11): the app's fields and the team's, every season.
  delete from public.custom_answers where profile_id = participant_id;
  delete from public.referral_custom_answers r
   using public.entity_referrals referral
   where r.referral_id = referral.id and referral.referred_profile_id = participant_id;
  -- What a field change set aside (RAPP-665) is hers too: it leaves with her.
  delete from public.audit_log a
   where a.action = 'intake.answer_set_aside'
     and ((a.target_type = 'profile' and a.target_id = participant_id)
          or (a.target_type = 'entity_referral'
              and a.target_id in (select referral.id from public.entity_referrals referral
                                   where referral.referred_profile_id = participant_id)));

  -- Her birth year alone still answers every age band a funder report asks.
  if birth_date is not null then
    begin
      perform private.write_custom_answer(
        participant_id, birth_field,
        to_jsonb(make_date(extract(year from birth_date)::int, 1, 1)::text), 'staff', actor);
    exception when check_violation then
      -- A seasonal date field with no current season keeps nothing.
      null;
    end;
  end if;

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
    -- WHICH things were cleared, never what was in them (ADR-021). The audit row
    -- must not become the last surviving copy of the data it describes.
    jsonb_build_object('fields_cleared', true, 'answers_deleted', true, 'notes_deleted', true,
                       'birth_year_kept', birth_date is not null)
  );
end;
$function$;

create or replace function private.scenario_reset(p_target profiles)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Not joined, with an open invitation.
  perform private.scenario_terms(p_target, '{"accepted": false}'::jsonb);
  -- No signature and no consent, this season or any other.
  delete from public.authorization_signatures where profile_id = p_target.id;
  delete from public.authorization_consent_events where profile_id = p_target.id;
  delete from public.custom_answers where profile_id = p_target.id;
  update public.profiles p set
    avatar_url = null, media_consent_at = null, season_number = null, prior_seasons = 0,
    health_info = null, emergency_contact_name = null, emergency_contact_relation = null,
    emergency_contact_phone = null, updated_at = now()
  where p.id = p_target.id;
  return '{}'::jsonb;
end;
$function$;

create or replace function public.invite_entity_collaborator(p_collaborating_entity_id uuid, p_email text, p_first_name text, p_last_name text)
 RETURNS TABLE(invitation_id uuid, profile_id uuid, email text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  clean_email text := lower(btrim(p_email));
  clean_first_name text := nullif(private.name_trim(p_first_name), '');
  clean_last_name text := nullif(private.name_trim(p_last_name), '');
  entity_name text;
  new_profile_id uuid := extensions.gen_random_uuid();
  new_invitation_id uuid := extensions.gen_random_uuid();
  invitation_expires_at timestamptz := now() + interval '30 days';
begin
  perform private.require_recent_second_factor();
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
    collaborating_entity_id,
    terms_accepted_at
  ) values (
    new_profile_id,
    actor_org,
    'entity',
    clean_first_name,
    clean_last_name,
    p_collaborating_entity_id,
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
$function$;

create or replace function public.invite_staff_member(p_email text, p_first_name text, p_last_name text, p_role text)
 RETURNS TABLE(profile_id uuid, email text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  clean_email text := lower(btrim(p_email));
  clean_first_name text := nullif(private.name_trim(p_first_name), '');
  clean_last_name text := nullif(private.name_trim(p_last_name), '');
  new_profile_id uuid := extensions.gen_random_uuid();
  invitation_expires_at timestamptz := now() + interval '30 days';
  org_language text;
begin
  perform private.require_recent_second_factor();
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
    id, org_id, role, first_name, last_name, preferred_language, terms_accepted_at
  ) values (
    new_profile_id, actor_org, p_role, clean_first_name, clean_last_name, org_language, now()
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
$function$;

create or replace function public.start_player_preview()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  preview_id uuid;
  preview_email text;
  preview_password text := encode(extensions.gen_random_bytes(24), 'base64');
  org_language text;
begin
  -- The design role signs in as test players instead (RAPP-615): the shared
  -- preview player reads real players' forum posts and photos.
  if actor_org is null or not (select public.is_team_member())
    or (select private.limited_to_test_players())
  then
    raise exception 'only a team member with a verified second factor can preview as a player'
      using errcode = '42501';
  end if;

  perform public.assert_within_hourly_limit('player.preview', 60);
  -- Two team members starting the first preview at once create one account.
  perform pg_advisory_xact_lock(hashtext('player-preview:' || actor_org::text));

  preview_email := 'preview+' || actor_org::text || '@preview.ramassa.invalid';
  select id into preview_id
  from public.profiles
  where org_id = actor_org and role = 'preview';

  if preview_id is null then
    preview_id := gen_random_uuid();
    select default_language into org_language from public.organizations where id = actor_org;

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', preview_id,
      'authenticated', 'authenticated', preview_email, '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', '', '', ''
    );

    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      preview_id::text,
      preview_id,
      jsonb_build_object('sub', preview_id::text, 'email', preview_email, 'email_verified', true),
      'email', now(), now(), now()
    );

    -- No personal data: a fixed name, no document, no contact details.
    insert into public.profiles (
      id, org_id, role, first_name, last_name, preferred_language, terms_accepted_at
    ) values (
      preview_id, actor_org, 'preview', 'Preview', '', org_language, now()
    );
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(preview_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = preview_id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id)
  values (actor_org, actor_id, 'player_preview.start', 'profile', preview_id);

  return jsonb_build_object('email', preview_email, 'password', preview_password);
end;
$function$;

create or replace function private.drop_unused_test_fixture_season()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  delete from public.seasons s
   where s.id = old.season_id
     and s.is_test_fixture
     and not s.is_current
     and not exists (select 1 from public.authorization_signatures sig where sig.season_id = s.id)
     and not exists (select 1 from public.authorization_versions v where v.season_id = s.id)
     and not exists (select 1 from public.custom_answers c where c.season_id = s.id);
  return null;
end;
$function$;

create or replace function public.personal_data_disposition()
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
    ('authorization_consent_events', 'profile_id', 'purge', 'Each consent she gave or withdrew.'),
    ('walk_in_signings', null, 'retain_limited', 'A walk-in''s tablet signing until staff confirm it; purged after 60 days.'),
    ('intake_screens', null, 'not_personal', 'Registration screens staff built.'),
    ('profile_sections', null, 'not_personal', 'Sections of the player profile layout.'),
    ('profile_fields', null, 'not_personal', 'The pieces of information the profile holds, and who created each.'),
    ('field_placements', null, 'not_personal', 'Where each piece of information is asked.'),
    ('custom_question_options', null, 'not_personal', 'Options of those questions.'),
    ('intake_builtin_screens', null, 'not_personal', 'Staff wording of the built-in onboarding screens and which are hidden.'),
    ('intake_flow_orders', null, 'not_personal', 'The order of the onboarding screens staff arranged.'),
    ('intake_state_presets', null, 'not_personal', 'Organization presets for which questions are asked.'),
    ('custom_answers', 'profile_id', 'purge', 'Every answer of her record, the app''s fields and the team''s. Anonymizing deletes them all and keeps only her birth year.'),
    ('referral_custom_answers', null, 'retain_limited', 'Extra answers sent with a referral; moved to her profile when she is invited, or purged with the referral.'),
    ('custom_question_states', 'profile_id', 'purge', 'Which fields staff chose to ask or not ask her, the app''s and the team''s.'),
    ('participant_search_documents', 'profile_id', 'purge', 'Her names and her Normal and Personal text answers, indexed for the participants search.'),
    ('staff_notifications', null, 'not_personal', 'The team''s bell: one row per team member; names render live from the source row and params hold no personal value.')
  ) as disposition(table_name, participant_column, disposition, reason);
$function$;

-- 4. The old storage goes ------------------------------------------------------------

drop table public.season_answers;
drop table public.profile_answers;

-- The search document and its index go with the columns it was built from.
alter table public.profiles drop column search_document;

alter table public.profiles
  drop column date_of_birth,
  drop column place_of_birth,
  drop column nationality,
  drop column document_type,
  drop column document_number,
  drop column document_name,
  drop column phone,
  drop column address,
  -- Its foreign key to `municipality_catalog` goes with it.
  drop column city,
  drop column postal_code,
  drop column reference_entity,
  drop column reference_contact_name,
  drop column has_dependents,
  drop column num_dependents,
  drop column clothing_size,
  drop column shoe_size,
  drop column applicant_status,
  drop column applicant_status_details,
  drop column supporting_entities,
  drop column childcare_need,
  drop column specific_needs;
