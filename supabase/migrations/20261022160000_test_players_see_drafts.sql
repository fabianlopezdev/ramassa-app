-- Test players see the draft app terms and the draft authorization (RAPP-619,
-- pending fix 23).
--
-- WHY
--
-- The design role writes drafts of the app terms (RAPP-613) and of the
-- season authorization (RAPP-614), but only settings.organization publishes,
-- so Marc could not see his drafts on the phone without asking an admin to
-- publish a text every real player would then have to accept again.
--
-- WHAT THIS MIGRATION DOES
--
--   1. `private.sees_onboarding_drafts(profile)`: a test player (a test
--      account that is a player or an invited woman). Staff test accounts and
--      every real woman never see a draft.
--   2. `private.app_terms_version_for(org, profile)` and
--      `private.authorization_version_for(org, profile)`: the version a woman
--      is shown. A test player gets the organization's draft when one exists
--      (the authorization draft for the current season), everyone else the
--      published current version.
--   3. Her paths read it: the onboarding catalog's `terms` (with `is_draft`),
--      the terms gate, accepting the terms, the authorization status (with
--      `is_draft`) and signing. The wizard's acceptance names the draft as
--      `terms_version = 'draft'`.
--   4. An acceptance or a signature on a draft is always a test fixture, and
--      only a test player's (a trigger and `record_signature` refuse anyone
--      else). Publishing or discarding a draft deletes them first, so a
--      published version never carries a draft acceptance or signature.
--   5. The scenario switches follow the same rule, and `test_player_scenario`
--      says when she sees a draft, for the note on her page.
--
-- Docs: https://supabase.com/docs/guides/database/postgres/row-level-security
-- (security definer functions with an empty search path, permission checks
-- inside) and https://www.postgresql.org/docs/current/plpgsql-trigger.html
-- (a BEFORE row trigger that fills or refuses a row).

-- 1. Who sees drafts ---------------------------------------------------------------------------------------

create or replace function private.sees_onboarding_drafts(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_profile_id is not null and exists (
    select 1 from public.profiles p
     where p.id = p_profile_id and p.is_test_account and p.role in ('player', 'invited'));
$$;

-- 2. The version she is shown -------------------------------------------------------------------------------

create or replace function private.app_terms_version_for(p_org_id uuid, p_profile_id uuid)
returns public.app_terms_versions
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  draft public.app_terms_versions;
begin
  if private.sees_onboarding_drafts(p_profile_id)
     and exists (select 1 from public.profiles p where p.id = p_profile_id and p.org_id = p_org_id) then
    select * into draft from public.app_terms_versions v
     where v.org_id = p_org_id and v.published_at is null;
    if draft.id is not null then
      return draft;
    end if;
  end if;
  return private.current_app_terms_version(p_org_id);
end;
$$;

-- A draft has no season: a test player signs it for the current season, so
-- the returned row carries that season (it is never written back).
create or replace function private.authorization_version_for(p_org_id uuid, p_profile_id uuid)
returns public.authorization_versions
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  draft public.authorization_versions;
  current_season uuid := private.current_season_id(p_org_id);
begin
  if current_season is not null
     and private.sees_onboarding_drafts(p_profile_id)
     and exists (select 1 from public.profiles p where p.id = p_profile_id and p.org_id = p_org_id) then
    select * into draft from public.authorization_versions v
     where v.org_id = p_org_id and v.published_at is null;
    if draft.id is not null then
      draft.season_id := current_season;
      return draft;
    end if;
  end if;
  return private.current_authorization_version(p_org_id);
end;
$$;

revoke all on function private.sees_onboarding_drafts(uuid) from public, anon, authenticated;
revoke all on function private.app_terms_version_for(uuid, uuid) from public, anon, authenticated;
revoke all on function private.authorization_version_for(uuid, uuid) from public, anon, authenticated;

-- 3. The app terms -------------------------------------------------------------------------------------------

-- The wizard sends the number it showed, or 'draft'. An acceptance of a
-- draft is a test player's and a test fixture; nobody else's lands on one.
create or replace function private.terms_acceptance_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.version_id is null and new.terms_version = 'draft' then
    select v.id into new.version_id
      from public.profiles p
      join public.app_terms_versions v on v.org_id = p.org_id and v.published_at is null
     where p.id = new.profile_id;
    if new.version_id is null then
      raise check_violation using message = 'the draft terms she was shown were published or discarded';
    end if;
  elsif new.version_id is null then
    select v.id into new.version_id
      from public.profiles p
      join public.app_terms_versions v on v.org_id = p.org_id and v.published_at is not null
     where p.id = new.profile_id
       and v.version_number = case when new.terms_version ~ '^[0-9]{1,6}$'
                                   then new.terms_version::integer else 1 end;
  end if;
  if exists (select 1 from public.app_terms_versions v where v.id = new.version_id and v.published_at is null) then
    if not private.sees_onboarding_drafts(new.profile_id) then
      raise check_violation using message = 'only a test player accepts a draft of the terms';
    end if;
    new.terms_version := 'draft';
    new.is_test_fixture := true;
  end if;
  return new;
end;
$$;

create or replace function public.my_terms_acceptance_needed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select shown.id is not null
       and not private.signed_terms_version(p.id, shown.id)
      from public.profiles p
      left join lateral private.app_terms_version_for(p.org_id, p.id) shown on true
     where p.id = (select auth.uid()) and p.role = 'player'), false);
$$;

create or replace function public.accept_current_app_terms(
  p_version_id uuid, p_locale_shown text, p_signing jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  her public.profiles;
  current_version public.app_terms_versions;
  drawing jsonb := nullif(p_signing -> 'signature', 'null'::jsonb);
  cannot_draw boolean;
  media boolean;
  acceptance uuid;
begin
  select * into her from public.profiles where id = caller for update;
  if her.id is null or her.role <> 'player' then
    raise insufficient_privilege using message = 'accepting the app terms again is for a player who joined';
  end if;
  -- A test player is shown the draft when there is one (RAPP-619).
  current_version := private.app_terms_version_for(her.org_id, caller);
  if current_version.id is null or p_version_id is distinct from current_version.id then
    raise object_not_in_prerequisite_state using message = 'accept the current version';
  end if;
  if p_locale_shown is null or p_locale_shown not in ('ca', 'es', 'en', 'ar', 'fa') then
    raise check_violation using message = 'the language shown is one of the five';
  end if;
  -- The same signing rules as joining (complete_onboarding_signed).
  if jsonb_typeof(p_signing) is distinct from 'object'
    or (p_signing -> 'terms_accepted') is distinct from 'true'::jsonb
    or jsonb_typeof(p_signing -> 'media_consent') is distinct from 'boolean'
    or jsonb_typeof(p_signing -> 'unable_to_draw') is distinct from 'boolean'
    or length(coalesce(p_signing ->> 'device', '')) > 200
  then
    raise check_violation using message = 'explicit terms acceptance and a media choice required';
  end if;
  cannot_draw := (p_signing ->> 'unable_to_draw')::boolean;
  media := (p_signing ->> 'media_consent')::boolean;
  if (cannot_draw and drawing is not null) or (not cannot_draw and not private.app_signature_valid(drawing)) then
    raise check_violation using message = 'draw a valid signature or use the cannot-draw alternative';
  end if;

  insert into public.terms_acceptances (profile_id, terms_version, locale_shown, version_id)
  values (caller, coalesce(current_version.version_number::text, 'draft'), p_locale_shown, current_version.id)
  returning id into acceptance;
  insert into public.app_terms_signatures
    (acceptance_id, profile_id, org_id, signature, unable_to_draw, media_consent, device)
  values (acceptance, caller, her.org_id, drawing, cannot_draw, media, nullif(p_signing ->> 'device', ''));
  -- Her photo choice, as she made it on this screen.
  update public.profiles
     set media_consent_at = case when media then coalesce(media_consent_at, now()) else null end,
         updated_at = now()
   where id = caller;
end;
$$;

create or replace function public.publish_app_terms_draft()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  draft public.app_terms_versions;
  next_number integer;
  draft_acceptances integer;
begin
  -- Publishing asks every player again: an admin decision, not a design one.
  if not (select public.has_permission('settings.organization')) then
    raise insufficient_privilege using message = 'publishing the app terms needs settings.organization';
  end if;
  select * into draft from public.app_terms_versions
   where org_id = actor_org and published_at is null
   for update;
  if draft.id is null then
    raise object_not_in_prerequisite_state using message = 'there is no draft to publish';
  end if;
  -- One publish at a time per organization.
  perform 1 from public.organizations where id = actor_org for update;
  -- Test players' acceptances of the draft go: a published version never
  -- carries one (RAPP-619).
  delete from public.terms_acceptances where version_id = draft.id;
  get diagnostics draft_acceptances = row_count;
  select coalesce(max(version_number), 0) + 1 into next_number
    from public.app_terms_versions where org_id = actor_org;
  update public.app_terms_versions
     set version_number = next_number, published_at = now(), published_by = actor
   where id = draft.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'app_terms.publish', 'app_terms_version', draft.id,
          jsonb_build_object('version_number', next_number,
                             'test_acceptances_dropped', draft_acceptances));
  return next_number;
end;
$$;

-- Discarding the draft drops its test acceptances by the foreign key's
-- cascade (terms_acceptances.version_id on delete cascade).

-- The catalog her wizard reads --------------------------------------------------------------------------------

create or replace function public.intake_catalog()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  -- A woman who started on her own has no profile until she completes the
  -- wizard: she reads the default organization's questions.
  actor_org uuid := coalesce((select public.current_org_id()), (select public.default_organization_id()));
  with_archived boolean := (select private.can_design_onboarding());
begin
  if (select auth.uid()) is null or actor_org is null then
    raise insufficient_privilege using message = 'the question catalog needs an account';
  end if;
  return jsonb_build_object(
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'intro', s.intro, 'after_screen', s.after_screen,
        'sort_order', s.sort_order, 'is_archived', s.is_archived,
        'questions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', q.id, 'question_type', q.question_type, 'label', q.label, 'help', q.help,
            'privacy', q.privacy, 'placements', to_jsonb(q.placements), 'sort_order', q.sort_order,
            'is_archived', q.is_archived, 'settings', q.settings, 'is_required', q.is_required,
            'show_when_question_id', q.show_when_question_id, 'show_when_option_id', q.show_when_option_id,
            'options', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', o.id, 'label', o.label, 'sort_order', o.sort_order, 'is_archived', o.is_archived)
                order by o.sort_order, o.id)
                from public.custom_question_options o where o.question_id = q.id), '[]'::jsonb))
            order by q.sort_order, q.created_at)
            from public.custom_questions q
           where q.screen_id = s.id and (with_archived or not q.is_archived)), '[]'::jsonb))
        order by array_position(private.intake_builtin_screens(), s.after_screen), s.sort_order, s.created_at)
        from public.intake_screens s
       where s.org_id = actor_org and (with_archived or not s.is_archived)), '[]'::jsonb),
    'overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question', o.question, 'label', o.label, 'help', o.help,
        -- A hide counts only while the question is optional (RAPP-611).
        'is_hidden', o.is_hidden and not (o.question = any (private.required_intake_questions(actor_org))),
        'option_overrides', o.option_overrides) order by o.question)
        from public.builtin_question_overrides o where o.org_id = actor_org), '[]'::jsonb),
    'presets', case when ((select public.has_permission('participants.view_personal')) or (select public.has_permission('onboarding.design'))) then coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'states', p.states)
        order by p.name, p.id)
        from public.intake_state_presets p where p.org_id = actor_org), '[]'::jsonb)
      else '[]'::jsonb end,
    -- Staff wording of the built-in screens and their hide switch (RAPP-612).
    -- A hide counts only while none of the screen's questions is required.
    'builtin_screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'screen', b.screen, 'texts', b.texts,
        'is_hidden', b.is_hidden and private.builtin_screen_hideable(b.screen))
        order by b.screen)
        from public.intake_builtin_screens b where b.org_id = actor_org), '[]'::jsonb),
    -- The wizard steps as staff arranged them (RAPP-612); null is the app's order.
    'flow_order', (
      select to_jsonb(f.step_order) from public.intake_flow_orders f where f.org_id = actor_org),
    -- The built-in questions that need an answer (RAPP-611): the one list her
    -- phone, her summary and the staff preview read.
    'required_questions', to_jsonb(private.required_intake_questions(actor_org)),
    -- The app terms she accepts (RAPP-613): the current published version,
    -- or the draft for a test player when there is one (RAPP-619).
    'terms', (
      select jsonb_build_object('id', v.id, 'version_number', v.version_number, 'content', v.content,
                                'is_draft', v.published_at is null)
        from private.app_terms_version_for(actor_org, (select auth.uid())) v
       where v.id is not null)
  );
end;
$function$;

-- 4. The authorization -----------------------------------------------------------------------------------------

drop function public.my_authorization_status();
create or replace function public.my_authorization_status()
returns table (
  required boolean, version_id uuid, season_id uuid, season_name text, version_number integer,
  content jsonb, is_returning boolean, is_draft boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select p.id, p.org_id from public.profiles p
     where p.id = (select auth.uid()) and p.role = 'player'
  ),
  current_version as (
    -- A test player is shown the draft when there is one (RAPP-619).
    select v.* from me, private.authorization_version_for(me.org_id, me.id) v where v.id is not null
  )
  select
    not exists (
      select 1 from public.authorization_signatures sig, me
       where sig.profile_id = me.id
         and sig.season_id = cv.season_id
         and ((sig.method = 'paper' and cv.published_at is not null) or sig.version_id = cv.id)
    ),
    cv.id, cv.season_id, s.name, cv.version_number, cv.content,
    -- Returning: she signed an earlier season, so this is re-registration (RAPP-306).
    exists (
      select 1 from public.authorization_signatures sig, me
       where sig.profile_id = me.id and sig.season_id <> cv.season_id
    ),
    cv.published_at is null
  from current_version cv
  join public.seasons s on s.id = cv.season_id;
$$;

revoke all on function public.my_authorization_status() from public, anon;
grant execute on function public.my_authorization_status() to authenticated;

create or replace function public.sign_authorization(p_version_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  me public.profiles;
  version public.authorization_versions;
begin
  select * into me from public.profiles where id = caller and role = 'player';
  if me.id is null then
    raise insufficient_privilege using message = 'only a player signs her authorization';
  end if;
  version := private.authorization_version_for(me.org_id, caller);
  if version.id is null or version.id <> p_version_id then
    raise check_violation using message = 'sign the current version';
  end if;
  if exists (select 1 from public.authorization_signatures sig
              where sig.profile_id = caller and sig.season_id <> version.season_id)
     and cardinality(private.missing_required_season_answers(caller)) > 0 then
    raise not_null_violation using message = 'a required season question has no answer';
  end if;
  return private.record_signature(gen_random_uuid(), caller, p_version_id, p_payload, 'app', null, now());
end;
$$;

-- Every signing path. A draft is signed only by a test player, for the
-- current season, as a test fixture.
create or replace function private.record_signature(
  p_signature_id uuid, p_profile_id uuid, p_version_id uuid, p_payload jsonb, p_method text,
  p_witness uuid, p_signed_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles;
  version public.authorization_versions;
  consents jsonb := coalesce(p_payload -> 'consents', '{}'::jsonb);
  contact jsonb := case when jsonb_typeof(p_payload -> 'emergency_contact') = 'object'
    then p_payload -> 'emergency_contact' end;
  drawing jsonb := case
    when jsonb_typeof(p_payload -> 'signature') = 'array'
     and jsonb_array_length(p_payload -> 'signature') > 0
    then p_payload -> 'signature' end;
  shown_language text := nullif(p_payload ->> 'language', '');
  health_asked boolean;
  contact_asked boolean;
  on_draft boolean;
begin
  if exists (select 1 from public.authorization_signatures where id = p_signature_id) then
    return p_signature_id;
  end if;

  select * into target from public.profiles where id = p_profile_id;
  select * into version from public.authorization_versions where id = p_version_id;
  on_draft := version.id is not null and version.published_at is null;
  if on_draft then
    if not private.sees_onboarding_drafts(target.id) then
      raise check_violation using message = 'only a test player signs a draft';
    end if;
    version.season_id := private.current_season_id(target.org_id);
  end if;
  if target.id is null or version.id is null or version.org_id <> target.org_id
    or version.season_id is null
    or version.season_id is distinct from private.current_season_id(target.org_id)
  then
    raise check_violation using message = 'sign a version of the current season';
  end if;
  perform private.validate_signing_payload(p_payload, version.content);
  health_asked := (version.content -> 'questions' -> 'health' ->> 'asked')::boolean;
  contact_asked := (version.content -> 'questions' -> 'emergency_contact' ->> 'asked')::boolean;

  insert into public.authorization_signatures (
    id, org_id, profile_id, season_id, version_id, method, language, device,
    signed_at, signature, unable_to_draw, witnessed_by, is_test_fixture
  ) values (
    p_signature_id, target.org_id, target.id, version.season_id, version.id, p_method,
    shown_language,
    left(nullif(btrim(p_payload ->> 'device'), ''), 200),
    coalesce(p_signed_at, now()), drawing, drawing is null, p_witness, on_draft
  )
  on conflict (id) do nothing;

  -- Every consent of the version she signed, with the words she was shown.
  insert into public.authorization_consent_events
    (org_id, profile_id, signature_id, consent_key, granted, method, decided_at,
     version_id, language, wording, required)
  select target.org_id, target.id, p_signature_id, consent.consent_key,
         coalesce((consents ->> consent.consent_key)::boolean, false), p_method,
         coalesce(p_signed_at, now()), version.id, coalesce(shown_language, 'ca'),
         private.localized_text_in(consent.label, coalesce(shown_language, 'ca')), consent.required
    from private.authorization_consents(version.content) consent;

  perform set_config('ramassa.consent_event_written', 'on', true);
  update public.profiles set
    -- A question the version does not ask keeps what she said before.
    health_info = case when health_asked
      then public.encrypt_field(nullif(btrim(p_payload ->> 'health_info'), '')) else health_info end,
    emergency_contact_name = case when contact_asked and contact ? 'name'
      then nullif(btrim(contact ->> 'name'), '') else emergency_contact_name end,
    emergency_contact_relation = case when contact_asked and contact ? 'relation'
      then nullif(btrim(contact ->> 'relation'), '') else emergency_contact_relation end,
    emergency_contact_phone = case when contact_asked and contact ? 'phone'
      then public.encrypt_field(nullif(btrim(contact ->> 'phone'), '')) else emergency_contact_phone end,
    -- Image rights drive the photo consent, when the version asks them.
    media_consent_at = case
      when not (version.content -> 'consents' ? 'image_rights') then media_consent_at
      when coalesce((consents ->> 'image_rights')::boolean, false)
        then coalesce(media_consent_at, now())
      else null
    end
  where id = target.id;
  perform set_config('ramassa.consent_event_written', '', true);

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (target.org_id, coalesce(p_witness, target.id), 'authorization.sign', 'authorization_signature',
          p_signature_id,
          jsonb_build_object('version_id', version.id, 'method', p_method,
                             'unable_to_draw', drawing is null, 'witnessed_by', p_witness,
                             'draft', on_draft));
  return p_signature_id;
end;
$$;

revoke all on function private.record_signature(uuid, uuid, uuid, jsonb, text, uuid, timestamptz) from public, anon, authenticated;

create or replace function public.discard_authorization_draft()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
  draft uuid;
  draft_signatures integer;
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
  delete from public.authorization_versions where id = draft;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'authorization.draft_discarded', 'authorization_version',
          draft, jsonb_build_object('test_signatures_dropped', draft_signatures));
end;
$$;

create or replace function public.publish_authorization_draft()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  draft public.authorization_versions;
  season uuid;
  next_number integer;
  draft_signatures integer;
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
  select coalesce(max(v.version_number), 0) + 1 into next_number
    from public.authorization_versions v where v.season_id = season;
  update public.authorization_versions
     set season_id = season, version_number = next_number, published_at = now(), published_by = actor
   where id = draft.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'authorization.publish', 'authorization_version', draft.id,
          jsonb_build_object('season_id', season, 'version_number', next_number, 'from_draft', true,
                             'test_signatures_dropped', draft_signatures));
  return next_number;
end;
$$;

-- 5. The scenario switches --------------------------------------------------------------------------------------

create or replace function private.scenario_terms(p_target public.profiles, p_change jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  accepted boolean := (p_change ->> 'accepted')::boolean;
  -- The version her phone shows: the draft when there is one (RAPP-619).
  current_version public.app_terms_versions := private.app_terms_version_for(p_target.org_id, p_target.id);
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
    -- Already accepted the version she is shown: nothing to do.
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
    -- A player who joined accepts the version alone, as her terms screen
    -- does (accept_current_app_terms).
    insert into public.terms_acceptances (profile_id, terms_version, locale_shown, is_test_fixture, version_id)
    values (p_target.id, coalesce(current_version.version_number::text, 'draft'), p_target.preferred_language,
            true, current_version.id)
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
  -- The version her phone shows: the draft when there is one (RAPP-619).
  version public.authorization_versions := private.authorization_version_for(p_target.org_id, p_target.id);
  on_draft boolean;
  shown_language text := coalesce(p_target.preferred_language, 'ca');
  signed_signature uuid;
begin
  if signed is null then
    raise invalid_parameter_value using message = 'the season signature takes signed: true or false';
  end if;
  if current_season is null then
    raise object_not_in_prerequisite_state using message = 'the organization has no current season';
  end if;
  on_draft := version.id is not null and version.published_at is null;
  if signed then
    if not exists (
      select 1 from public.authorization_signatures s
       where s.profile_id = p_target.id and s.season_id = current_season
         and (not on_draft or s.version_id = version.id)
    ) then
      if version.id is null then
        insert into public.authorization_signatures (
          org_id, profile_id, season_id, method, language, paper_signed_on, recorded_by, is_test_fixture)
        values (p_target.org_id, p_target.id, current_season, 'paper', shown_language,
                current_date, (select auth.uid()), true);
      else
        insert into public.authorization_signatures (
          org_id, profile_id, season_id, version_id, method, language, device, unable_to_draw,
          recorded_by, is_test_fixture)
        values (p_target.org_id, p_target.id, current_season, version.id, 'app', shown_language,
                'test scenario', true, (select auth.uid()), true)
        returning id into signed_signature;
        insert into public.authorization_consent_events
          (org_id, profile_id, signature_id, consent_key, granted, method, version_id, language,
           wording, required)
        select p_target.org_id, p_target.id, signed_signature, consent.consent_key, consent.required, 'app',
               version.id, shown_language, private.localized_text_in(consent.label, shown_language),
               consent.required
          from private.authorization_consents(version.content) consent;
      end if;
    end if;
  else
    -- Her consents given while signing go with the signature (cascade).
    delete from public.authorization_signatures s
     where s.profile_id = p_target.id and s.season_id = current_season;
  end if;
  return jsonb_build_object('signed', signed);
end;
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
    'answered', (select coalesce(jsonb_agg(a.question order by a.question), '[]'::jsonb)
                   from public.profile_answers a where a.profile_id = target.id),
    -- The staff questions she has an answer to, for no season or this one (RAPP-610).
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
