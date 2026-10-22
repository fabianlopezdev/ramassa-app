-- A test fixture season stays inside the test scenario tool (RAPP-619).
--
-- WHY
--
-- The scenario switches make a past season, marked `is_test_fixture`, so a
-- test player can be a returning one. Three things leaked out of it:
--   - the design role could make it the current season (`set_current_season`),
--     and every real player then had nothing to sign;
--   - every player read it (`seasons_select_org`) and it showed in every staff
--     season picker;
--   - it stayed after "reset" and after the test player was deleted.
--
-- WHAT THIS MIGRATION DOES
--
--   1. The table refuses a current fixture season, and `set_current_season`
--      refuses a fixture with the same answer as an unknown season.
--   2. Nobody reads a fixture season from the table: real players and every
--      team member see the real seasons only. The scenario tool reads it
--      through its own functions, which run as their owner.
--   3. When the last signature on a fixture season goes (reset, "not
--      returning", the test player's deletion) and nothing else uses it, the
--      season goes too.

-- 1. Never current ---------------------------------------------------------------------------------------

-- A fixture that was made current before this migration hands the place back
-- to the latest real season.
do $$
declare
  wrong record;
begin
  for wrong in select id, org_id from public.seasons where is_current and is_test_fixture loop
    update public.seasons set is_current = false where id = wrong.id;
    update public.seasons set is_current = true
     where id = (select s.id from public.seasons s
                  where s.org_id = wrong.org_id and not s.is_test_fixture
                  order by s.starts_on desc limit 1);
  end loop;
end;
$$;

alter table public.seasons
  add constraint seasons_test_fixture_never_current check (not (is_current and is_test_fixture));

create or replace function public.set_current_season(p_season_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
begin
  if not (select private.can_design_onboarding()) then
    raise insufficient_privilege using message = 'the current season needs settings.organization or onboarding.design';
  end if;
  -- A test fixture gets the answer of an unknown season: staff never see one.
  if not exists (
    select 1 from public.seasons
     where id = p_season_id and org_id = actor_org and not is_test_fixture
  ) then
    raise insufficient_privilege using message = 'no season of this organization';
  end if;
  update public.seasons set is_current = false where org_id = actor_org and is_current and id <> p_season_id;
  update public.seasons set is_current = true where id = p_season_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'season.current', 'season', p_season_id, '{}'::jsonb);
end;
$$;

-- 2. Read by nobody from the table ---------------------------------------------------------------------

drop policy seasons_select_org on public.seasons;
create policy seasons_select_org on public.seasons
  for select to authenticated
  using (org_id = (select public.current_org_id()) and not is_test_fixture);

-- 3. Gone when unused ----------------------------------------------------------------------------------

create or replace function private.drop_unused_test_fixture_season()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.seasons s
   where s.id = old.season_id
     and s.is_test_fixture
     and not s.is_current
     and not exists (select 1 from public.authorization_signatures sig where sig.season_id = s.id)
     and not exists (select 1 from public.authorization_versions v where v.season_id = s.id)
     and not exists (select 1 from public.season_answers a where a.season_id = s.id)
     and not exists (select 1 from public.custom_answers c where c.season_id = s.id);
  return null;
end;
$$;

revoke all on function private.drop_unused_test_fixture_season() from public, anon, authenticated;

create trigger authorization_signatures_drop_unused_test_fixture_season
  after delete on public.authorization_signatures
  for each row execute function private.drop_unused_test_fixture_season();
