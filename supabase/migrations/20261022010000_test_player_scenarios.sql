-- Scenario switches on a test player (RAPP-619).
--
-- WHY
--
-- The person designing the onboarding tests real situations on a made-up
-- woman: a new player with nothing answered, one whose data staff entered,
-- one who signed this season, one who comes back from an earlier season. He
-- sets the situation on her page, then opens the app as her.
--
-- WHAT THIS MIGRATION DOES
--
--   1. Three markers, so a record the switches made is never mistaken for a
--      real one: `seasons.is_test_fixture` (a past season made for a returning
--      test player), `authorization_signatures.is_test_fixture` and
--      `terms_acceptances.is_test_fixture`.
--   2. `set_test_player_scenario(profile, change)`: one audited call per
--      switch. It works on a TEST player only: a real woman, a woman of
--      another organization and an unknown id get the same refusal, whatever
--      the caller holds. The caller needs participants.view_personal, or
--      test_players.manage on the test player (`private.participant_permission`).
--      The switches:
--        - `answers`: fill some wizard questions with the sample answers the
--          page sends (recorded as staff answers in profile_answers, through
--          the same path as staff prefill), or clear them;
--        - `terms`: accepted (she joins: role player, a marked acceptance) or
--          not (she is invited again, with an open invitation, so the daily
--          purge of women who never joined keeps her);
--        - `season_signature`: this season's authorization signed (a marked
--          paper record) or not (her records for this season removed);
--        - `returning`: a marked record for an earlier season (a past season
--          is made, marked, when the organization has none) or none at all;
--        - `reset`: everything above back to a brand-new invited woman. Her
--          account, her email, her name and the questions staff chose stay.
--   3. `test_player_scenario(profile)`: what her page shows about the switches.
--   4. `my_test_scenario_stamp()`: when her situation last changed, read by
--      her app to drop a wizard draft older than the change.

-- 1. Markers -------------------------------------------------------------------------------------------

alter table public.seasons add column is_test_fixture boolean not null default false;
comment on column public.seasons.is_test_fixture is
  'A past season made by the test player scenario switches (RAPP-619), never a real one.';

alter table public.authorization_signatures add column is_test_fixture boolean not null default false;
comment on column public.authorization_signatures.is_test_fixture is
  'Made by the test player scenario switches (RAPP-619): a test player only, never a real signature.';

alter table public.terms_acceptances add column is_test_fixture boolean not null default false;
comment on column public.terms_acceptances.is_test_fixture is
  'Made by the test player scenario switches (RAPP-619): a test player only, never a real acceptance.';

-- 2. The guard -----------------------------------------------------------------------------------------

-- Her row, locked, when she is a test player of the caller's organization and
-- the caller may edit her. One refusal for every other case, so the switches
-- never tell a real woman from an unknown id.
create or replace function private.scenario_test_player(p_profile_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles;
begin
  select * into target from public.profiles p
   where p.id = p_profile_id
     and p.org_id = (select public.current_org_id())
     and p.is_test_account
     and p.role in ('player', 'invited')
   for update;
  if target.id is null
    or not (select private.participant_permission(p_profile_id, 'participants.view_personal'))
  then
    raise insufficient_privilege using message = 'scenario switches are for test players only';
  end if;
  return target;
end;
$$;

revoke all on function private.scenario_test_player(uuid) from public, anon, authenticated;

-- The profile keys a sample answer may carry: the wizard's, without the photo.
create or replace function private.scenario_answer_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'first_name', 'last_name', 'date_of_birth', 'place_of_birth', 'nationality',
    'preferred_language', 'document_type', 'document_number', 'document_name', 'phone',
    'address', 'city', 'postal_code', 'reference_entity', 'reference_contact_name',
    'has_dependents', 'num_dependents', 'clothing_size', 'shoe_size', 'applicant_status',
    'applicant_status_details', 'supporting_entities', 'childcare_need', 'specific_needs'
  ]::text[];
$$;

-- 3. The switches --------------------------------------------------------------------------------------

create or replace function private.scenario_answers(p_target public.profiles, p_change jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  fill jsonb := coalesce(p_change -> 'fill', '{}'::jsonb);
  clear text[];
  question text;
begin
  if jsonb_typeof(fill) <> 'object'
    or coalesce(jsonb_typeof(p_change -> 'clear'), 'array') <> 'array'
  then
    raise invalid_parameter_value using message = 'answers take fill (an object) and clear (a list)';
  end if;
  clear := array(select jsonb_array_elements_text(coalesce(p_change -> 'clear', '[]'::jsonb)));

  if exists (select 1 from jsonb_object_keys(fill) k where not (k = any (private.scenario_answer_keys()))) then
    raise invalid_parameter_value using message = 'a sample answer has an unknown field';
  end if;
  foreach question in array clear loop
    if not (question = any (private.wizard_intake_questions())) then
      raise invalid_parameter_value using message = 'unknown question ' || question;
    end if;
    -- A joined woman keeps a complete profile, as every finished onboarding does.
    if p_target.role = 'player' and question = any (private.required_intake_questions()) then
      raise object_not_in_prerequisite_state
        using message = 'she has joined: set the app terms to not accepted before clearing a required answer';
    end if;
  end loop;

  if fill <> '{}'::jsonb then
    perform private.apply_profile_prefill(p_target.id, fill, 'staff');
  end if;

  if cardinality(clear) > 0 then
    -- Her name and language cannot be empty, and dependants has a default:
    -- they keep their value and stop counting as answered, so she is asked.
    update public.profiles p set
      date_of_birth = case when 'date_of_birth' = any (clear) then null else p.date_of_birth end,
      place_of_birth = case when 'place_of_birth' = any (clear) then null else p.place_of_birth end,
      nationality = case when 'nationality' = any (clear) then null else p.nationality end,
      document_type = case when 'document' = any (clear) then null else p.document_type end,
      document_number = case when 'document' = any (clear) then null else p.document_number end,
      document_name = case when 'document' = any (clear) then null else p.document_name end,
      phone = case when 'phone' = any (clear) then null else p.phone end,
      address = case when 'address' = any (clear) then null else p.address end,
      city = case when 'city' = any (clear) then null else p.city end,
      postal_code = case when 'postal_code' = any (clear) then null else p.postal_code end,
      reference_entity = case when 'reference_entity' = any (clear) then null else p.reference_entity end,
      reference_contact_name = case when 'reference_contact_name' = any (clear)
        then null else p.reference_contact_name end,
      has_dependents = case when 'dependents' = any (clear) then false else p.has_dependents end,
      num_dependents = case when 'dependents' = any (clear) then 0 else p.num_dependents end,
      clothing_size = case when 'clothing_size' = any (clear) then null else p.clothing_size end,
      shoe_size = case when 'shoe_size' = any (clear) then null else p.shoe_size end,
      applicant_status = case when 'applicant_status' = any (clear) then null else p.applicant_status end,
      applicant_status_details = case when 'applicant_status' = any (clear)
        then null else p.applicant_status_details end,
      supporting_entities = case when 'supporting_entities' = any (clear)
        then null else p.supporting_entities end,
      childcare_need = case when 'childcare_need' = any (clear) then null else p.childcare_need end,
      specific_needs = case when 'specific_needs' = any (clear) then null else p.specific_needs end,
      updated_at = now()
    where p.id = p_target.id;
    delete from public.profile_answers a where a.profile_id = p_target.id and a.question = any (clear);
  end if;

  -- The field names only: the values are made up, but the audit log never
  -- holds answers (ADR-004).
  return jsonb_build_object(
    'filled', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb) from jsonb_object_keys(fill) k),
    'cleared', to_jsonb(clear));
end;
$$;

create or replace function private.scenario_terms(p_target public.profiles, p_change jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  accepted boolean := (p_change ->> 'accepted')::boolean;
  terms_version_value text := nullif(btrim(p_change ->> 'terms_version'), '');
  owner_email text;
  acceptance uuid;
begin
  if accepted is null then
    raise invalid_parameter_value using message = 'terms take accepted: true or false';
  end if;
  select lower(u.email) into owner_email from auth.users u where u.id = p_target.id;

  if accepted then
    if p_target.role = 'player' then
      return jsonb_build_object('accepted', true);
    end if;
    if terms_version_value is null then
      raise invalid_parameter_value using message = 'accepting the terms needs the terms version';
    end if;
    -- She joins as every woman does: with every required question answered.
    if exists (
      select 1 from unnest(private.required_intake_questions()) required(question)
       where not exists (
         select 1 from public.profile_answers a
          where a.profile_id = p_target.id and a.question = required.question)
    ) then
      raise check_violation using message = 'fill her required answers before she accepts the terms';
    end if;
    -- Joining spends her invitation (the RAPP-300 trigger on the role change).
    update public.profiles
       set role = 'player', terms_accepted_at = now(), updated_at = now()
     where id = p_target.id;
    insert into public.terms_acceptances (profile_id, terms_version, locale_shown, is_test_fixture)
    values (p_target.id, terms_version_value, p_target.preferred_language, true)
    returning id into acceptance;
    insert into public.app_terms_signatures
      (acceptance_id, profile_id, org_id, signature, unable_to_draw, media_consent, device)
    values (acceptance, p_target.id, p_target.org_id, null, true,
            p_target.media_consent_at is not null, 'test scenario');
  else
    delete from public.terms_acceptances where profile_id = p_target.id;
    update public.profiles
       set role = 'invited', terms_accepted_at = null, updated_at = now()
     where id = p_target.id;
    -- An open invitation, so she can sign in and the daily purge of women
    -- who never joined keeps her.
    update public.invites
       set accepted_at = null, accepted_by = null,
           expires_at = greatest(expires_at, now() + interval '30 days')
     where id = (
       select i.id from public.invites i
        where i.email = owner_email and i.org_id = p_target.org_id
        order by i.created_at desc limit 1);
    if not found then
      insert into public.invites (org_id, email, invited_by, expires_at)
      values (p_target.org_id, owner_email, (select auth.uid()), now() + interval '30 days');
    end if;
  end if;
  return jsonb_build_object('accepted', accepted);
end;
$$;

create or replace function private.scenario_season_signature(p_target public.profiles, p_change jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  signed boolean := (p_change ->> 'signed')::boolean;
  current_season uuid := private.current_season_id(p_target.org_id);
begin
  if signed is null then
    raise invalid_parameter_value using message = 'the season signature takes signed: true or false';
  end if;
  if current_season is null then
    raise object_not_in_prerequisite_state using message = 'the organization has no current season';
  end if;
  if signed then
    if not exists (
      select 1 from public.authorization_signatures s
       where s.profile_id = p_target.id and s.season_id = current_season
    ) then
      insert into public.authorization_signatures (
        org_id, profile_id, season_id, method, language, paper_signed_on, recorded_by, is_test_fixture)
      values (p_target.org_id, p_target.id, current_season, 'paper', p_target.preferred_language,
              current_date, (select auth.uid()), true);
    end if;
  else
    -- Her consents given while signing go with the signature (cascade).
    delete from public.authorization_signatures s
     where s.profile_id = p_target.id and s.season_id = current_season;
  end if;
  return jsonb_build_object('signed', signed);
end;
$$;

create or replace function private.scenario_returning(p_target public.profiles, p_change jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  returning_value boolean := (p_change ->> 'returning')::boolean;
  current_row public.seasons;
  past_season uuid;
  past_name text;
begin
  if returning_value is null then
    raise invalid_parameter_value using message = 'returning takes true or false';
  end if;
  select * into current_row from public.seasons s
   where s.org_id = p_target.org_id and s.is_current;
  if current_row.id is null then
    raise object_not_in_prerequisite_state using message = 'the organization has no current season';
  end if;

  if returning_value then
    -- The latest earlier season, or a marked one made for the purpose.
    select s.id into past_season from public.seasons s
     where s.org_id = p_target.org_id and not s.is_current and s.starts_on < current_row.starts_on
     order by s.starts_on desc limit 1;
    if past_season is null then
      past_name := 'Prova ' || to_char(current_row.starts_on - interval '1 year', 'YYYY');
      insert into public.seasons (org_id, name, starts_on, is_current, is_test_fixture)
      values (p_target.org_id, past_name, (current_row.starts_on - interval '1 year')::date, false, true)
      on conflict (org_id, name) do update set is_test_fixture = public.seasons.is_test_fixture
      returning id into past_season;
    end if;
    if not exists (
      select 1 from public.authorization_signatures s
       where s.profile_id = p_target.id and s.season_id <> current_row.id
    ) then
      insert into public.authorization_signatures (
        org_id, profile_id, season_id, method, language, paper_signed_on, recorded_by, is_test_fixture)
      values (p_target.org_id, p_target.id, past_season, 'paper', p_target.preferred_language,
              (current_row.starts_on - interval '1 year')::date, (select auth.uid()), true);
    end if;
  else
    delete from public.authorization_signatures s
     where s.profile_id = p_target.id and s.season_id <> current_row.id;
    update public.profiles set prior_seasons = 0 where id = p_target.id;
  end if;
  return jsonb_build_object('returning', returning_value);
end;
$$;

create or replace function private.scenario_reset(p_target public.profiles)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_email text;
begin
  select lower(u.email) into owner_email from auth.users u where u.id = p_target.id;

  -- Not joined, with an open invitation.
  perform private.scenario_terms(p_target, '{"accepted": false}'::jsonb);
  -- No signature and no consent, this season or any other.
  delete from public.authorization_signatures where profile_id = p_target.id;
  delete from public.authorization_consent_events where profile_id = p_target.id;
  delete from public.season_answers where profile_id = p_target.id;
  -- Nothing answered but the name the invitation gave her.
  delete from public.profile_answers
   where profile_id = p_target.id and question not in ('first_name', 'last_name');
  delete from public.custom_answers where profile_id = p_target.id;
  update public.profiles p set
    date_of_birth = null, place_of_birth = null, nationality = null,
    document_type = null, document_number = null, document_name = null,
    phone = null, address = null, city = null, postal_code = null,
    reference_entity = null, reference_contact_name = null,
    has_dependents = false, num_dependents = 0, clothing_size = null, shoe_size = null,
    avatar_url = null, media_consent_at = null,
    applicant_status = null, applicant_status_details = null, supporting_entities = null,
    season_number = null, prior_seasons = 0, childcare_need = null, specific_needs = null,
    health_info = null, emergency_contact_name = null, emergency_contact_relation = null,
    emergency_contact_phone = null, updated_at = now()
  where p.id = p_target.id;
  return '{}'::jsonb;
end;
$$;

revoke all on function private.scenario_answer_keys() from public, anon, authenticated;
revoke all on function private.scenario_answers(public.profiles, jsonb) from public, anon, authenticated;
revoke all on function private.scenario_terms(public.profiles, jsonb) from public, anon, authenticated;
revoke all on function private.scenario_season_signature(public.profiles, jsonb) from public, anon, authenticated;
revoke all on function private.scenario_returning(public.profiles, jsonb) from public, anon, authenticated;
revoke all on function private.scenario_reset(public.profiles) from public, anon, authenticated;

create or replace function public.set_test_player_scenario(p_profile_id uuid, p_change jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles := private.scenario_test_player(p_profile_id);
  kind text := p_change ->> 'kind';
  summary jsonb;
begin
  if p_change is null or jsonb_typeof(p_change) <> 'object' then
    raise invalid_parameter_value using message = 'a scenario change is an object';
  end if;
  summary := case kind
    when 'answers' then private.scenario_answers(target, p_change)
    when 'terms' then private.scenario_terms(target, p_change)
    when 'season_signature' then private.scenario_season_signature(target, p_change)
    when 'returning' then private.scenario_returning(target, p_change)
    when 'reset' then private.scenario_reset(target)
  end;
  if summary is null then
    raise invalid_parameter_value using message = 'unknown scenario switch ' || coalesce(kind, 'null');
  end if;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (target.org_id, (select auth.uid()), 'test_player.scenario', 'profile', target.id,
          jsonb_build_object('kind', kind) || summary);
end;
$$;

revoke all on function public.set_test_player_scenario(uuid, jsonb) from public, anon;
grant execute on function public.set_test_player_scenario(uuid, jsonb) to authenticated;

-- 4. What her page shows ----------------------------------------------------------------------------------

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
  return jsonb_build_object(
    'terms_accepted', target.terms_accepted_at is not null,
    'current_season', (select s.name from public.seasons s where s.id = current_season),
    'signed_this_season', exists (
      select 1 from public.authorization_signatures s
       where s.profile_id = target.id and s.season_id = current_season),
    'returning', exists (
      select 1 from public.authorization_signatures s
       where s.profile_id = target.id and s.season_id is distinct from current_season),
    'answered', (select coalesce(jsonb_agg(a.question order by a.question), '[]'::jsonb)
                   from public.profile_answers a where a.profile_id = target.id),
    'preferred_language', target.preferred_language);
end;
$$;

revoke all on function public.test_player_scenario(uuid) from public, anon;
grant execute on function public.test_player_scenario(uuid) to authenticated;

-- 5. Her app notices a change ---------------------------------------------------------------------------

-- When her situation last changed, for a test player; null for everyone else.
-- Her app drops a wizard draft older than this, so the next open shows the
-- situation that was set.
create or replace function public.my_test_scenario_stamp()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(a.created_at)
    from public.audit_log a
    join public.profiles p on p.id = a.target_id and p.is_test_account
   where a.target_id = (select auth.uid())
     and a.action = 'test_player.scenario';
$$;

revoke all on function public.my_test_scenario_stamp() from public, anon;
grant execute on function public.my_test_scenario_stamp() to authenticated;
