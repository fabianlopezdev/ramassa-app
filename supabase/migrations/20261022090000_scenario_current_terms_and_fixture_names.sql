-- The scenario tool follows the current app terms, and a fixture season never
-- takes a real season's name (RAPP-619, verifier findings 3 and 4).
--
-- WHY
--
--   3. `test_player_scenario` said `terms_accepted = true` for a test player
--      who joined, even after new terms were published and her gate asked her
--      again; and the "accepted" switch did nothing for a player who joined
--      (`scenario_terms` returned early). Since RAPP-613 "accepted" means a
--      signed acceptance of the CURRENT version.
--   4. `create_season('Prova 2025')` failed with a unique-key error while a
--      hidden fixture season had that name: the refusal exposed the fixture
--      and blocked a real season.
--
-- WHAT THIS MIGRATION DOES
--
--   3. The status and the switch use `private.signed_terms_version` with the
--      current version (20261022080000). The switch on a player who joined
--      records an acceptance of the current version, with the same test
--      signature record as joining.
--   4. Season names are unique among real seasons and, separately, among
--      fixture seasons (two partial unique indexes), so a fixture never
--      blocks a real season and never shows in a refusal.
--
-- Docs: https://www.postgresql.org/docs/current/indexes-partial.html (a partial
-- unique index enforces uniqueness only over the rows its predicate selects)
-- and https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT
-- (`ON CONFLICT (cols) WHERE predicate` infers a partial unique index).

-- 4. Names: real seasons and fixture seasons apart -------------------------------------------------------

alter table public.seasons drop constraint seasons_org_id_name_key;
create unique index seasons_real_name_per_org on public.seasons (org_id, name) where not is_test_fixture;
create unique index seasons_fixture_name_per_org on public.seasons (org_id, name) where is_test_fixture;

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
      on conflict (org_id, name) where is_test_fixture
        do update set is_test_fixture = public.seasons.is_test_fixture
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

revoke all on function private.scenario_returning(public.profiles, jsonb) from public, anon, authenticated;

-- 3. Terms: the current version ---------------------------------------------------------------------------

create or replace function private.scenario_terms(p_target profiles, p_change jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  accepted boolean := (p_change ->> 'accepted')::boolean;
  current_version public.app_terms_versions := private.current_app_terms_version(p_target.org_id);
  owner_email text;
  acceptance uuid;
begin
  if accepted is null then
    raise invalid_parameter_value using message = 'terms take accepted: true or false';
  end if;
  select lower(u.email) into owner_email from auth.users u where u.id = p_target.id;

  if accepted then
    if current_version.id is null then
      raise object_not_in_prerequisite_state using message = 'the organization has no app terms';
    end if;
    -- Already accepted the current version: nothing to do.
    if p_target.role = 'player' and private.signed_terms_version(p_target.id, current_version.id) then
      return jsonb_build_object('accepted', true);
    end if;
    if p_target.role <> 'player' then
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
    end if;
    -- A player who joined accepts the current version alone, as her terms
    -- screen does (accept_current_app_terms).
    insert into public.terms_acceptances (profile_id, terms_version, locale_shown, is_test_fixture, version_id)
    values (p_target.id, current_version.version_number::text, p_target.preferred_language, true,
            current_version.id)
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

revoke all on function private.scenario_terms(public.profiles, jsonb) from public, anon, authenticated;

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
    -- Joined and signed the CURRENT app terms (RAPP-613), as her gate asks.
    'terms_accepted', target.role = 'player'
      and private.signed_terms_version(target.id, (private.current_app_terms_version(target.org_id)).id),
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
