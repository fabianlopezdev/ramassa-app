-- Her record is read by field (RAPP-662, D2, D3, D9, D10).
--
-- WHY
--
-- Step 3 of 7 (RAPP-660 to RAPP-666). Since RAPP-661 every writer saves her
-- data as answers by field, and the old app columns go stale. Her record now
-- reads the same answers: her names and her account settings stay on her
-- account (D2), every other field arrives as an answer keyed by its field id,
-- and the database leaves out every answer the caller's level does not read
-- (D9), with no list of columns and levels written here.
--
-- WHAT CHANGES
--
--   1. `private.field_answers_for(profile, everything)`: her current answers by
--      field id (this season's for a seasonal field), decrypted, keeping only
--      the fields whose level the caller reads, or every one for her own read.
--   2. `get_participant_profile` and `get_own_profile` return her names, her
--      account settings and `answers`. The app columns leave their result.
--      The staff read still writes its access audit row in the same statement.
--   3. `participant_season_answers` returns one row per season with that
--      season's answers by field. It needs participants.view; each answer
--      follows its field's level (it needed participants.view_personal).
--   4. `participant_profile_answers` returns who gave each answer and when, per
--      field, with the app question it belongs to; it reads the answers.
--   5. `participant_custom_answers`, `my_custom_answers` and the RAPP-660
--      TEMPORARY filter: they return every field's answers now.
--   6. What she answered, from the answers (`private.app_question_answered`):
--      `my_answered_questions`, `my_questions_to_ask` and the test player
--      panel (`test_player_scenario`).
--   7. A referral: `get_entity_referral` returns the entity's answers by field
--      (the sender reads them all, the team by level) and her season count;
--      `referral_answer_keys` names the answered fields by system key and id.
--
-- The apps keep their screens: their shared actions turn the answers back into
-- the old column names (`columnsFromFieldAnswers`, TEMPORARY until RAPP-663
-- and RAPP-664).
--
-- Docs: https://www.postgresql.org/docs/17/sql-createfunction.html (a changed
-- result type needs DROP FUNCTION first), https://www.postgresql.org/docs/17/functions-aggregate.html.

-- 1. Her answers, by the caller's levels ---------------------------------------------------------------------

-- Her current answers by field id: this season's for a seasonal field, none
-- for a seasonal field when no season is current. `p_everything` is her own
-- read; otherwise each answer needs its field's level (`private.reads_privacy`).
create or replace function private.field_answers_for(p_profile_id uuid, p_everything boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(
           a.question_id::text, coalesce(a.value, (public.decrypt_field(a.value_encrypted))::jsonb)),
         '{}'::jsonb)
    from public.custom_answers a
    join public.profile_fields f on f.id = a.question_id
   where a.profile_id = p_profile_id
     and a.season_key = case when private.field_is_seasonal(f.id)
                             then private.current_season_id(f.org_id)
                             else '00000000-0000-0000-0000-000000000000'::uuid end
     and (p_everything or private.reads_privacy(p_profile_id, f.privacy));
$$;
revoke all on function private.field_answers_for(uuid, boolean) from public, anon, authenticated;

-- 2. Her record --------------------------------------------------------------------------------------------

drop function public.get_participant_profile(uuid);
create function public.get_participant_profile(participant_id uuid)
returns table (
  id uuid, first_name text, last_name text, preferred_language text, avatar_url text,
  media_consent boolean, terms_accepted_at timestamptz, is_active boolean, is_forum_banned boolean,
  anonymized_at timestamptz, created_at timestamptz, updated_at timestamptz, season_number smallint,
  health_info text, emergency_contact_name text, emergency_contact_relation text,
  emergency_contact_phone text, is_test_account boolean, role text, answers jsonb)
language sql
security definer
set search_path = ''
as $$
  with subject as (
    select p.*
    from public.profiles p
    where p.id = participant_id
      and p.org_id = (select public.current_org_id())
      and (select private.participant_permission(participant_id, 'participants.view'))
  ),
  access_recorded as (
    insert into public.audit_log (org_id, actor_id, action, target_type, target_id)
    select
      (select public.current_org_id()),
      (select auth.uid()),
      case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then 'profile.view_sensitive' else 'profile.view' end,
      'profile',
      s.id
    from subject s
    returning 1
  )
  select
    s.id,
    s.first_name,
    s.last_name,
    s.preferred_language,
    s.avatar_url,
    s.media_consent_at is not null,
    s.terms_accepted_at,
    s.is_active,
    s.is_forum_banned,
    s.anonymized_at,
    s.created_at,
    s.updated_at,
    -- Counted (RAPP-306): earlier seasons plus the seasons she signed.
    private.season_number(s.id),
    -- The medical answer needs its own permission (RAPP-304); the emergency
    -- contact follows the personal and sensitive levels.
    case when (select private.participant_permission(participant_id, 'participants.view_health')) then public.decrypt_field(s.health_info) end,
    case when (select private.participant_permission(participant_id, private.emergency_contact_permission(s.org_id, s.emergency_contact_privacy))) then s.emergency_contact_name end,
    case when (select private.participant_permission(participant_id, private.emergency_contact_permission(s.org_id, s.emergency_contact_privacy))) then s.emergency_contact_relation end,
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.emergency_contact_phone) end,
    s.is_test_account,
    -- Joined or not, as the writers decide it: only an invited woman is completed in parts.
    s.role,
    -- Every other field, each by its own level (D9).
    private.field_answers_for(s.id, false)
  from subject s;
$$;
revoke all on function public.get_participant_profile(uuid) from public, anon;
grant execute on function public.get_participant_profile(uuid) to authenticated, service_role;

drop function public.get_own_profile();
create function public.get_own_profile()
returns table (
  id uuid, first_name text, last_name text, preferred_language text, avatar_url text,
  media_consent boolean, terms_accepted_at timestamptz, season_number smallint, health_info text,
  emergency_contact_name text, emergency_contact_relation text, emergency_contact_phone text,
  answers jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.first_name,
    p.last_name,
    p.preferred_language,
    p.avatar_url,
    p.media_consent_at is not null,
    p.terms_accepted_at,
    private.season_number(p.id),
    public.decrypt_field(p.health_info),
    p.emergency_contact_name,
    p.emergency_contact_relation,
    public.decrypt_field(p.emergency_contact_phone),
    -- She reads every answer about her, whatever its level.
    private.field_answers_for(p.id, true)
  from public.profiles p
  where p.id = (select auth.uid());
$$;
revoke all on function public.get_own_profile() from public, anon;
grant execute on function public.get_own_profile() to authenticated, service_role;

-- 3. Her seasons -------------------------------------------------------------------------------------------

drop function public.participant_season_answers(uuid);
create function public.participant_season_answers(p_profile_id uuid)
returns table (season_id uuid, season_name text, starts_on date, answers jsonb, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view')) then
    raise insufficient_privilege using message = 'her season answers need participants.view';
  end if;
  return query
    select s.id, s.name, s.starts_on,
           jsonb_object_agg(a.question_id::text,
                            coalesce(a.value, (public.decrypt_field(a.value_encrypted))::jsonb)),
           max(a.answered_at)
      from public.custom_answers a
      join public.profile_fields f on f.id = a.question_id
      join public.seasons s on s.id = a.season_id
     where a.profile_id = p_profile_id
       and a.org_id = (select public.current_org_id())
       and private.reads_privacy(p_profile_id, f.privacy)
     group by s.id, s.name, s.starts_on
     order by s.starts_on desc;
end;
$$;
revoke all on function public.participant_season_answers(uuid) from public, anon;
grant execute on function public.participant_season_answers(uuid) to authenticated, service_role;

-- 4. Who gave each answer ----------------------------------------------------------------------------------

drop function public.participant_profile_answers(uuid);
create function public.participant_profile_answers(p_profile_id uuid)
returns table (field_id uuid, question text, source text, answered_at timestamptz, answered_by_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view')) then
    raise insufficient_privilege using message = 'her answers need participants.view';
  end if;
  return query
  select a.question_id,
         -- The app question the field belongs to; a staff field has none.
         private.system_key_question(f.system_key),
         a.source, a.answered_at,
         private.answer_author_name(a.answered_by, a.source, actor_org)
    from public.custom_answers a
    join public.profile_fields f on f.id = a.question_id
   where a.profile_id = p_profile_id
     and a.org_id = actor_org
     and a.season_key = case when private.field_is_seasonal(f.id)
                             then private.current_season_id(f.org_id)
                             else '00000000-0000-0000-0000-000000000000'::uuid end
     and private.reads_privacy(p_profile_id, f.privacy)
   order by f.sort_order, a.question_id;
end;
$$;
revoke all on function public.participant_profile_answers(uuid) from public, anon;
grant execute on function public.participant_profile_answers(uuid) to authenticated, service_role;

-- 5. Every field's answers ---------------------------------------------------------------------------------

create or replace function public.participant_custom_answers(p_profile_id uuid)
returns table (question_id uuid, season_id uuid, season_name text, value jsonb, source text,
               answered_at timestamptz, answered_by_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view')) then
    raise insufficient_privilege using message = 'her answers need participants.view';
  end if;
  return query
  select a.question_id, a.season_id, s.name,
         coalesce(a.value, (public.decrypt_field(a.value_encrypted))::jsonb),
         a.source, a.answered_at,
         private.answer_author_name(a.answered_by, a.source, actor_org)
    from public.custom_answers a
    join public.profile_fields f on f.id = a.question_id
    left join public.seasons s on s.id = a.season_id
   where a.profile_id = p_profile_id
     and a.org_id = actor_org
     and private.reads_privacy(p_profile_id, f.privacy)
   order by f.sort_order, s.starts_on desc nulls first;
end;
$$;

create or replace function public.my_custom_answers()
returns table (question_id uuid, value jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select a.question_id,
         coalesce(a.value, (public.decrypt_field(a.value_encrypted))::jsonb)
    from public.custom_answers a
   where a.profile_id = (select auth.uid())
     and (a.season_id is null
          or a.season_id = private.current_season_id((select public.current_org_id())));
$$;

-- 6. What she answered -------------------------------------------------------------------------------------

-- The app questions she has an answer to, in the wizard's order.
create or replace function private.answered_app_questions(p_profile_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(question.name order by question.position), '{}')
    from unnest(private.wizard_intake_questions()) with ordinality as question(name, position)
   where private.app_question_answered(p_profile_id, question.name);
$$;
revoke all on function private.answered_app_questions(uuid) from public, anon, authenticated;

create or replace function public.my_answered_questions()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select unnest(private.answered_app_questions((select auth.uid())));
$$;

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
       or not private.app_question_answered((select auth.uid()), question.name) and (
         s.state is null
         or (s.state = 'skip' and question.name = any (private.required_intake_questions()))
       )
     )
   order by question.position;
$$;

create or replace function public.test_player_scenario(p_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.profiles;
  current_season uuid;
  terms_shown public.app_terms_versions;
  authorization_shown public.authorization_versions;
begin
  select * into target from public.profiles p
   where p.id = p_profile_id
     and p.org_id = (select public.current_org_id())
     and p.is_test_account
     and p.role in ('player', 'invited');
  if target.id is null
    or not (select private.participant_permission(p_profile_id, 'participants.view_personal'))
  then
    raise insufficient_privilege using message = 'scenario switches are for test players only';
  end if;
  current_season := private.current_season_id(target.org_id);
  terms_shown := private.app_terms_version_for(target.org_id, target.id);
  authorization_shown := private.authorization_version_for(target.org_id, target.id);
  return jsonb_build_object(
    -- Joined and signed the version her gate asks for (RAPP-613): the draft
    -- when there is one (RAPP-619).
    'terms_accepted', target.role = 'player' and private.signed_terms_version(target.id, terms_shown.id),
    'current_season', (select s.name from public.seasons s where s.id = current_season),
    'signed_this_season', exists (
      select 1 from public.authorization_signatures s
       where s.profile_id = target.id and s.season_id = current_season
         and (authorization_shown.published_at is not null or authorization_shown.id is null
              or s.version_id = authorization_shown.id)),
    'returning', exists (
      select 1 from public.authorization_signatures s
       where s.profile_id = target.id and s.season_id is distinct from current_season),
    -- The app questions she has an answer to, from her answers (RAPP-662).
    'answered', (select coalesce(jsonb_agg(q order by q), '[]'::jsonb)
                   from unnest(private.answered_app_questions(target.id)) q),
    -- The fields she has an answer to, for no season or this one (RAPP-610).
    'custom_answered', (select coalesce(jsonb_agg(distinct c.question_id), '[]'::jsonb)
                          from public.custom_answers c
                         where c.profile_id = target.id
                           and (c.season_id is null or c.season_id = current_season)),
    -- What her phone shows is a draft (RAPP-619), for the note on her page.
    'terms_draft', terms_shown.id is not null and terms_shown.published_at is null,
    'authorization_draft', authorization_shown.id is not null and authorization_shown.published_at is null,
    -- Her organization: a sample file is a key in her own private folder.
    'org_id', target.org_id,
    'preferred_language', target.preferred_language);
end;
$$;

-- 7. A referral --------------------------------------------------------------------------------------------

-- The entity's answers on a referral by field id: the sending entity reads
-- every one, the team each by its field's level. Nobody else reads any.
create or replace function private.referral_answers_for(p_referral_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(r.question_id::text, (public.decrypt_field(r.value_encrypted))::jsonb), '{}'::jsonb)
    from public.entity_referrals referral
    join public.referral_custom_answers r on r.referral_id = referral.id
    join public.profile_fields f on f.id = r.question_id
   where referral.id = p_referral_id
     and referral.org_id = (select public.current_org_id())
     and (
       referral.collaborating_entity_id = (select public.current_collaborating_entity_id())
       or ((select public.has_permission('referrals.manage'))
           and private.reads_privacy(null, f.privacy))
     );
$$;
revoke all on function private.referral_answers_for(uuid) from public, anon, authenticated;
-- `get_entity_referral` runs as its caller (the referral's row policy decides
-- who finds it), like `private.referral_private_fields`; the helper itself
-- decides which answers that caller reads.
grant execute on function private.referral_answers_for(uuid) to authenticated;

drop function public.get_entity_referral(uuid);
create function public.get_entity_referral(p_referral_id uuid)
returns table (
  id uuid, entity_user_id uuid, referred_profile_id uuid, assigned_staff_id uuid,
  referred_first_name text, referred_last_name text, referred_phone text, referred_email text,
  documentation_status text, notes text, status text, entity_name text,
  created_at timestamptz, updated_at timestamptz, answers jsonb, season_number integer,
  consent_confirmed_at timestamptz)
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
    -- Her answers by field, each by its level for the team (D9).
    private.referral_answers_for(referral.id),
    -- Her season count is the referral's own data (RAPP-661).
    (private_field.intake_answers ->> 'season_number')::integer,
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
revoke all on function public.get_entity_referral(uuid) from public, anon;
grant execute on function public.get_entity_referral(uuid) to authenticated, service_role;

-- The fields the entity answered on a referral, for planning her onboarding:
-- each app field by its system key, every field by its id, and her season
-- count when the entity gave it. Which fields, never the answers.
create or replace function public.referral_answer_keys(p_referral_id uuid)
returns setof text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  referral public.entity_referrals;
begin
  if not (select public.has_permission('participants.invite')) then
    raise insufficient_privilege using message = 'reading a referral to invite her needs participants.invite';
  end if;

  select * into referral
    from public.entity_referrals r
   where r.id = p_referral_id
     and r.org_id = (select public.current_org_id())
     and r.status = 'pending';
  if referral.id is null then
    return;
  end if;

  return query
    select keys.key from (
      select f.system_key as key
        from public.referral_custom_answers r
        join public.profile_fields f on f.id = r.question_id and not f.is_archived
       where r.referral_id = referral.id and f.system_key is not null
      union
      select r.question_id::text
        from public.referral_custom_answers r
        join public.profile_fields f on f.id = r.question_id and not f.is_archived
       where r.referral_id = referral.id
      union
      select 'season_number'
       where (public.decrypt_field(referral.intake_answers)::jsonb ->> 'season_number') is not null
    ) keys
    order by keys.key;
end;
$$;
