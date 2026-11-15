-- RAPP-696: saving a legal form is a Correcció or a Nova versió.
--
-- WHY
--
-- The season authorization and the app terms are published as immutable
-- versions, and every publish made every player sign or accept again. A typo
-- fix should not do that. The Desa dialog on every form now asks which kind
-- of change it is:
--
--   - Correcció: the text is fixed. Whoever answered the version before it
--     has nothing to do. Her signature or acceptance still points at the
--     version she saw, which stays recorded.
--   - Nova versió: everybody answers again, as every publish did before.
--
-- WHAT THIS MIGRATION DOES
--
--   1. `is_correction` on `authorization_versions` and `app_terms_versions`,
--      set when the version is published and never changed after.
--   2. `private.authorization_signature_covers` and
--      `private.terms_acceptance_covers`: a signature or acceptance on a
--      version counts for a later published version reached only through
--      corrections (the authorization within its season). A draft is covered
--      only by its own signature, as before.
--   3. The status checks read them: `my_authorization_status` (her app's
--      gate) and `private.signed_terms_version` (the terms gate, the wizard,
--      her record and the scenario switches all go through it).
--   4. Publishing takes the kind: `publish_authorization_draft(season,
--      is_correction)` and `publish_app_terms_draft(is_correction)`. A
--      correction needs a published version to correct (in the target season
--      for the authorization).
--   5. The version lists say which versions are corrections, and the
--      authorization list counts each version's signatures, so the Control
--      Center knows when anyone has answered.
--   6. The authorization's content may carry `screen_order`: the order of
--      its two movable screens (document and health), which her form follows.
--      The consents and signature screen always ends it.
--   7. `onboarding_finished_count()`: how many players finished Onboarding,
--      so a screen save asks Correcció or Nova versió once anyone has.
--
-- Docs: https://www.postgresql.org/docs/current/sql-createfunction.html (a
-- changed return type or argument list needs DROP then CREATE) and
-- https://supabase.com/docs/guides/database/postgres/row-level-security
-- (security definer functions with an empty search path, permission checks
-- inside).

-- 1. The kind of each version ------------------------------------------------------------------------

alter table public.authorization_versions
  add column is_correction boolean not null default false;
comment on column public.authorization_versions.is_correction is
  'Published as a correction (RAPP-696): a signature on the version before it, in the same season, still counts. Set at publish; a published version never changes.';

alter table public.app_terms_versions
  add column is_correction boolean not null default false;
comment on column public.app_terms_versions.is_correction is
  'Published as a correction (RAPP-696): an acceptance of the version before it still counts. Set at publish; a published version never changes.';

-- 2. What a signature or an acceptance covers ----------------------------------------------------------

create or replace function private.authorization_signature_covers(
  p_signed_version_id uuid, p_version public.authorization_versions)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_signed_version_id is not null and p_version.id is not null and (
    p_signed_version_id = p_version.id
    or (p_version.published_at is not null and exists (
      select 1 from public.authorization_versions signed
       where signed.id = p_signed_version_id
         and signed.season_id = p_version.season_id
         and signed.published_at is not null
         and signed.version_number < p_version.version_number
         -- Every version after hers, up to this one, is a correction.
         and not exists (
           select 1 from public.authorization_versions later
            where later.season_id = p_version.season_id
              and later.published_at is not null
              and later.version_number > signed.version_number
              and later.version_number <= p_version.version_number
              and not later.is_correction))));
$$;

create or replace function private.terms_acceptance_covers(
  p_accepted_version_id uuid, p_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_accepted_version_id is not null and p_version_id is not null and (
    p_accepted_version_id = p_version_id
    or exists (
      select 1
        from public.app_terms_versions shown
        join public.app_terms_versions accepted
          on accepted.org_id = shown.org_id
         and accepted.id = p_accepted_version_id
         and accepted.published_at is not null
         and accepted.version_number < shown.version_number
       where shown.id = p_version_id
         and shown.published_at is not null
         -- Every version after hers, up to this one, is a correction.
         and not exists (
           select 1 from public.app_terms_versions later
            where later.org_id = shown.org_id
              and later.published_at is not null
              and later.version_number > accepted.version_number
              and later.version_number <= shown.version_number
              and not later.is_correction)));
$$;

revoke all on function private.authorization_signature_covers(uuid, public.authorization_versions)
  from public, anon, authenticated;
revoke all on function private.terms_acceptance_covers(uuid, uuid) from public, anon, authenticated;

-- 3. The gates read them ---------------------------------------------------------------------------------

-- The terms she signed cover the version shown: hers, or one corrected since.
create or replace function private.signed_terms_version(p_profile_id uuid, p_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_version_id is not null and exists (
    select 1 from public.terms_acceptances t
     where t.profile_id = p_profile_id
       and private.terms_acceptance_covers(t.version_id, p_version_id)
       and (t.accepted_before_signatures
            or exists (select 1 from public.app_terms_signatures s where s.acceptance_id = t.id)));
$$;

revoke all on function private.signed_terms_version(uuid, uuid) from public, anon, authenticated;

-- The body of `20261022160000_test_players_see_drafts.sql`, with a signature
-- on a corrected version counting.
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
         and ((sig.method = 'paper' and cv.published_at is not null)
              or private.authorization_signature_covers(sig.version_id, cv))
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

-- 4. Publishing takes the kind -----------------------------------------------------------------------------

-- The body of `20261026180000_publish_authorization_to_a_season.sql`, with the kind.
drop function public.publish_authorization_draft(uuid);

create function public.publish_authorization_draft(
  p_season_id uuid default null, p_is_correction boolean default false)
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
  if p_is_correction is null then
    raise invalid_parameter_value using message = 'say whether this is a correction';
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
  -- A correction fixes a version of that season (RAPP-696).
  if p_is_correction and not exists (
    select 1 from public.authorization_versions v
     where v.season_id = target.id and v.published_at is not null
  ) then
    raise object_not_in_prerequisite_state
      using message = 'a correction needs a published version of that season to correct';
  end if;
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
     set season_id = target.id, version_number = next_number, published_at = now(),
         published_by = actor, is_correction = p_is_correction
   where id = draft.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'authorization.publish', 'authorization_version', draft.id,
          jsonb_build_object('season_id', target.id, 'version_number', next_number, 'from_draft', true,
                             'is_correction', p_is_correction,
                             'test_signatures_dropped', draft_signatures,
                             'test_consent_events_dropped', draft_consent_events,
                             'for_current_season', target.id is not distinct from current_season.id));
  return next_number;
end;
$$;

revoke all on function public.publish_authorization_draft(uuid, boolean) from public, anon;
grant execute on function public.publish_authorization_draft(uuid, boolean) to authenticated;

-- The body of `20261022160000_test_players_see_drafts.sql`, with the kind.
drop function public.publish_app_terms_draft();

create function public.publish_app_terms_draft(p_is_correction boolean default false)
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
  if p_is_correction is null then
    raise invalid_parameter_value using message = 'say whether this is a correction';
  end if;
  select * into draft from public.app_terms_versions
   where org_id = actor_org and published_at is null
   for update;
  if draft.id is null then
    raise object_not_in_prerequisite_state using message = 'there is no draft to publish';
  end if;
  -- One publish at a time per organization.
  perform 1 from public.organizations where id = actor_org for update;
  -- A correction fixes a published version (RAPP-696).
  if p_is_correction and not exists (
    select 1 from public.app_terms_versions v
     where v.org_id = actor_org and v.published_at is not null
  ) then
    raise object_not_in_prerequisite_state
      using message = 'a correction needs a published version to correct';
  end if;
  -- Test players' acceptances of the draft go: a published version never
  -- carries one (RAPP-619).
  delete from public.terms_acceptances where version_id = draft.id;
  get diagnostics draft_acceptances = row_count;
  select coalesce(max(version_number), 0) + 1 into next_number
    from public.app_terms_versions where org_id = actor_org;
  update public.app_terms_versions
     set version_number = next_number, published_at = now(), published_by = actor,
         is_correction = p_is_correction
   where id = draft.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'app_terms.publish', 'app_terms_version', draft.id,
          jsonb_build_object('version_number', next_number, 'is_correction', p_is_correction,
                             'test_acceptances_dropped', draft_acceptances));
  return next_number;
end;
$$;

revoke all on function public.publish_app_terms_draft(boolean) from public, anon;
grant execute on function public.publish_app_terms_draft(boolean) to authenticated;

-- 5. The lists say which versions are corrections ---------------------------------------------------------

drop function public.list_authorization_versions();
create function public.list_authorization_versions()
returns table (
  id uuid, season_id uuid, season_name text, version_number integer, content jsonb,
  published_at timestamptz, is_current boolean, updated_at timestamptz,
  is_correction boolean, signature_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_design_onboarding()) then
    raise insufficient_privilege using message = 'the authorization versions need settings.organization or onboarding.design';
  end if;
  return query
    select v.id, v.season_id, s.name, v.version_number, v.content, v.published_at,
           coalesce(v.id = (private.current_authorization_version(v.org_id)).id, false), v.updated_at,
           v.is_correction,
           -- Real players' signatures: test players never count as answers.
           (select count(*)::integer from public.authorization_signatures sig
             join public.profiles p on p.id = sig.profile_id
            where sig.version_id = v.id and not p.is_test_account)
      from public.authorization_versions v
      left join public.seasons s on s.id = v.season_id
     where v.org_id = (select public.current_org_id())
     order by v.published_at is not null, s.starts_on desc, v.version_number desc;
end;
$$;

revoke all on function public.list_authorization_versions() from public, anon;
grant execute on function public.list_authorization_versions() to authenticated;

drop function public.list_app_terms_versions();
create function public.list_app_terms_versions()
returns table (
  id uuid, version_number integer, content jsonb, published_at timestamptz,
  updated_at timestamptz, acceptance_count integer, is_correction boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_design_onboarding()) then
    raise insufficient_privilege using message = 'the app terms need settings.organization or onboarding.design';
  end if;
  return query
    select v.id, v.version_number, v.content, v.published_at, v.updated_at,
           (select count(*)::integer from public.terms_acceptances t
             join public.profiles p on p.id = t.profile_id
            where t.version_id = v.id and not p.is_test_account),
           v.is_correction
      from public.app_terms_versions v
     where v.org_id = (select public.current_org_id())
     order by v.version_number desc nulls first;
end;
$$;

revoke all on function public.list_app_terms_versions() from public, anon;
grant execute on function public.list_app_terms_versions() to authenticated;

-- 6. The authorization's screen order ----------------------------------------------------------------------

-- The body of `20261022140000_authorization_fully_editable.sql`, with
-- `screen_order`: absent (document, then health), or both movable screens once.
create or replace function private.authorization_content_valid(p_content jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_content) = 'object'
    and p_content - array['title', 'sections', 'consents', 'attachments', 'questions', 'texts',
                          'screen_order'] = '{}'::jsonb
    and private.localized_text_valid(p_content -> 'title')
    -- Sections, as RAPP-304.
    and jsonb_typeof(p_content -> 'sections') = 'array'
    and jsonb_array_length(p_content -> 'sections') between 1 and 20
    and not exists (
      select 1 from jsonb_array_elements(p_content -> 'sections') section
       where coalesce(section ->> 'key', '') !~ '^[a-z_]{1,40}$'
          or not private.localized_text_valid(section -> 'title')
          or not private.localized_text_valid(section -> 'body')
    )
    -- Consents: 1 to 20, each with its wording, flag and place.
    and jsonb_typeof(p_content -> 'consents') = 'object'
    and (select count(*) from jsonb_object_keys(p_content -> 'consents')) between 1 and 20
    and not exists (
      select 1 from jsonb_each(p_content -> 'consents') consent
       where consent.key !~ '^[a-z][a-z0-9_]{0,39}$'
          or jsonb_typeof(consent.value) <> 'object'
          or consent.value - array['label', 'required', 'position'] <> '{}'::jsonb
          or not private.localized_text_valid(consent.value -> 'label')
          or jsonb_typeof(consent.value -> 'required') is distinct from 'boolean'
          or jsonb_typeof(consent.value -> 'position') is distinct from 'number'
          or (consent.value ->> 'position') !~ '^[0-9]{1,3}$'
    )
    and (select count(distinct consent.value ->> 'position') from jsonb_each(p_content -> 'consents') consent)
        = (select count(*) from jsonb_object_keys(p_content -> 'consents'))
    -- Image rights drive the photo consent, which she can always refuse.
    and (p_content -> 'consents' -> 'image_rights' -> 'required') is distinct from 'true'::jsonb
    -- The two questions.
    and jsonb_typeof(p_content -> 'questions') = 'object'
    and (p_content -> 'questions') - array['health', 'emergency_contact'] = '{}'::jsonb
    and (select bool_and(
           jsonb_typeof(question) = 'object'
           and question - array['asked', 'required', 'privacy', 'texts'] = '{}'::jsonb
           and jsonb_typeof(question -> 'asked') = 'boolean'
           and jsonb_typeof(question -> 'required') = 'boolean'
           -- Hidden only when not required.
           and ((question ->> 'asked')::boolean or not (question ->> 'required')::boolean))
           from (values (p_content -> 'questions' -> 'health'),
                        (p_content -> 'questions' -> 'emergency_contact')) as q(question))
    and (p_content -> 'questions' -> 'health' ->> 'privacy') = 'health'
    and (p_content -> 'questions' -> 'emergency_contact' ->> 'privacy') in ('personal', 'sensitive')
    and private.authorization_override_texts_valid(
          coalesce(p_content -> 'questions' -> 'health' -> 'texts', '{}'::jsonb), 'health')
    and private.authorization_override_texts_valid(
          coalesce(p_content -> 'questions' -> 'emergency_contact' -> 'texts', '{}'::jsonb), 'emergency_contact')
    -- Asking her health needs its explicit consent, required with the question.
    and (not (p_content -> 'questions' -> 'health' ->> 'asked')::boolean
         or (p_content -> 'consents' ? 'health_data'
             and (not (p_content -> 'questions' -> 'health' ->> 'required')::boolean
                  or (p_content -> 'consents' -> 'health_data' ->> 'required')::boolean)))
    -- Wording of the form.
    and private.authorization_override_texts_valid(coalesce(p_content -> 'texts', '{}'::jsonb), 'texts')
    -- Season documents, as RAPP-304.
    and coalesce(jsonb_typeof(p_content -> 'attachments'), 'array') = 'array'
    and coalesce(jsonb_array_length(p_content -> 'attachments'), 0) <= 10
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_content -> 'attachments', '[]'::jsonb)) attachment
       where not private.localized_text_valid(attachment -> 'label')
          or coalesce(attachment ->> 'url', '') !~ '^https://[^[:space:]]+$'
          or length(attachment ->> 'url') > 2000
    )
    -- The movable screens' order (RAPP-696): each of the two once.
    and (not p_content ? 'screen_order'
         or (jsonb_typeof(p_content -> 'screen_order') = 'array'
             and jsonb_array_length(p_content -> 'screen_order') = 2
             and (p_content -> 'screen_order') @> '["document", "health"]'::jsonb)),
    false);
$$;

-- 7. Players who finished Onboarding ----------------------------------------------------------------------

-- Real players only: a test player finishing her onboarding is not an answer.
create function public.onboarding_finished_count()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_design_onboarding()) then
    raise insufficient_privilege using message = 'the onboarding needs settings.organization or onboarding.design';
  end if;
  return (
    select count(*)::integer from public.profiles p
     where p.org_id = (select public.current_org_id())
       and p.role = 'player'
       and not p.is_test_account);
end;
$$;

revoke all on function public.onboarding_finished_count() from public, anon;
grant execute on function public.onboarding_finished_count() to authenticated;
