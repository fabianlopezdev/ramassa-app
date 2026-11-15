-- RAPP-694: the season authorization is published to a chosen season.
--
-- The team prepares next season's authorization before that season starts.
-- `publish_authorization_draft` takes an optional season: null means the
-- current season, as before. A chosen season must be the organization's own,
-- and the current one or a later one. A past season takes no new publish.
--
-- "Later" reads the seasons table's own dates: a season starting after the
-- current season starts. With no current season, a season starting today or
-- later. The phone is unchanged: it reads the current season's latest version
-- (`private.current_authorization_version`), so a version published for a
-- future season shows nothing until that season is marked current, and then
-- every player signs it.
--
-- The rest is the body of `20261022213000_draft_consent_events_dropped.sql`:
-- the draft's test-player signatures and consent events go on publish, as
-- before (RAPP-619, pending fix 30).

drop function public.publish_authorization_draft();

create function public.publish_authorization_draft(p_season_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  draft public.authorization_versions;
  current_season public.seasons;
  target public.seasons;
  next_number integer;
  draft_signatures integer;
  draft_consent_events integer;
begin
  if not (select public.has_permission('settings.organization')) then
    raise insufficient_privilege using message = 'publishing the authorization needs settings.organization';
  end if;
  select * into current_season from public.seasons
   where id = private.current_season_id(actor_org);
  if p_season_id is null then
    if current_season.id is null then
      raise object_not_in_prerequisite_state using message = 'the organization has no current season';
    end if;
    target := current_season;
  else
    select * into target from public.seasons where id = p_season_id and org_id = actor_org;
    if target.id is null then
      raise no_data_found using message = 'that season is not one of the organization''s';
    end if;
    if target.id is distinct from current_season.id
       and target.starts_on <= coalesce(current_season.starts_on, current_date - 1) then
      raise invalid_parameter_value using message = 'a past season takes no new authorization';
    end if;
  end if;
  select * into draft from public.authorization_versions
   where org_id = actor_org and published_at is null
   for update;
  if draft.id is null then
    raise object_not_in_prerequisite_state using message = 'there is no draft to publish';
  end if;
  perform 1 from public.seasons where id = target.id for update;
  -- Test players' signatures of the draft go: a published version never
  -- carries one (RAPP-619).
  delete from public.authorization_signatures where version_id = draft.id;
  get diagnostics draft_signatures = row_count;
  -- Her profile decisions on the draft's consents go too (pending fix 30):
  -- no signature owns them, so the cascade above misses them.
  delete from public.authorization_consent_events where version_id = draft.id;
  get diagnostics draft_consent_events = row_count;
  select coalesce(max(v.version_number), 0) + 1 into next_number
    from public.authorization_versions v where v.season_id = target.id;
  update public.authorization_versions
     set season_id = target.id, version_number = next_number, published_at = now(), published_by = actor
   where id = draft.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'authorization.publish', 'authorization_version', draft.id,
          jsonb_build_object('season_id', target.id, 'version_number', next_number, 'from_draft', true,
                             'test_signatures_dropped', draft_signatures,
                             'test_consent_events_dropped', draft_consent_events,
                             'for_current_season', target.id is not distinct from current_season.id));
  return next_number;
end;
$$;

revoke all on function public.publish_authorization_draft(uuid) from public, anon;
grant execute on function public.publish_authorization_draft(uuid) to authenticated;
