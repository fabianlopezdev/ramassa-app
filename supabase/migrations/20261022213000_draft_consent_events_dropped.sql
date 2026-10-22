-- A consent decision made on a draft goes with the draft (RAPP-619,
-- pending fix 30).
--
-- A test player who signs a draft that adds a consent, then changes that
-- consent on her profile (`set_optional_consent`), leaves a consent event
-- whose `version_id` is the draft and that no signature owns: the published
-- version does not ask that consent, so the event keeps the version of her
-- last decision. Publishing and discarding a draft deleted its signatures
-- (their consent events follow by the signature's cascade) but not these:
-- publishing kept them on the now-published version, and discarding left
-- them with no version (`version_id` is ON DELETE SET NULL).
--
-- Both now delete every consent event of the draft. Only a test player ever
-- has one (a draft is signed only by a test player, RAPP-619), so these are
-- always test fixtures. The audit row counts them.
--
-- Docs: https://www.postgresql.org/docs/current/plpgsql-statements.html#PLPGSQL-STATEMENTS-DIAGNOSTICS
-- (GET DIAGNOSTICS ... ROW_COUNT) and
-- https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK
-- (ON DELETE CASCADE and SET NULL).

CREATE OR REPLACE FUNCTION public.publish_authorization_draft()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  draft public.authorization_versions;
  season uuid;
  next_number integer;
  draft_signatures integer;
  draft_consent_events integer;
begin
  if not (select public.has_permission('settings.organization')) then
    raise insufficient_privilege using message = 'publishing the authorization needs settings.organization';
  end if;
  season := private.current_season_id(actor_org);
  if season is null then
    raise object_not_in_prerequisite_state using message = 'the organization has no current season';
  end if;
  select * into draft from public.authorization_versions
   where org_id = actor_org and published_at is null
   for update;
  if draft.id is null then
    raise object_not_in_prerequisite_state using message = 'there is no draft to publish';
  end if;
  perform 1 from public.seasons where id = season for update;
  -- Test players' signatures of the draft go: a published version never
  -- carries one (RAPP-619).
  delete from public.authorization_signatures where version_id = draft.id;
  get diagnostics draft_signatures = row_count;
  -- Her profile decisions on the draft's consents go too (pending fix 30):
  -- no signature owns them, so the cascade above misses them.
  delete from public.authorization_consent_events where version_id = draft.id;
  get diagnostics draft_consent_events = row_count;
  select coalesce(max(v.version_number), 0) + 1 into next_number
    from public.authorization_versions v where v.season_id = season;
  update public.authorization_versions
     set season_id = season, version_number = next_number, published_at = now(), published_by = actor
   where id = draft.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'authorization.publish', 'authorization_version', draft.id,
          jsonb_build_object('season_id', season, 'version_number', next_number, 'from_draft', true,
                             'test_signatures_dropped', draft_signatures,
                             'test_consent_events_dropped', draft_consent_events));
  return next_number;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.discard_authorization_draft()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := (select public.current_org_id());
  draft uuid;
  draft_signatures integer;
  draft_consent_events integer;
begin
  if not (select private.can_design_onboarding()) then
    raise insufficient_privilege using message = 'the authorization draft needs settings.organization or onboarding.design';
  end if;
  select id into draft from public.authorization_versions
   where org_id = actor_org and published_at is null
   for update;
  if draft is null then
    return;
  end if;
  -- Test players' signatures of the draft go with it (their consents follow
  -- by cascade).
  delete from public.authorization_signatures where version_id = draft;
  get diagnostics draft_signatures = row_count;
  -- Her profile decisions on the draft's consents go too (pending fix 30):
  -- no signature owns them, and the version's foreign key would only empty
  -- their version.
  delete from public.authorization_consent_events where version_id = draft;
  get diagnostics draft_consent_events = row_count;
  delete from public.authorization_versions where id = draft;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'authorization.draft_discarded', 'authorization_version',
          draft, jsonb_build_object('test_signatures_dropped', draft_signatures,
                             'test_consent_events_dropped', draft_consent_events));
end;
$function$
;

