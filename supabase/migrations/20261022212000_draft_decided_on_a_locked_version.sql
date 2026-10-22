-- A draft acceptance or signature is decided on a locked version row
-- (RAPP-619, pending fix 29).
--
-- THE RACE
--
-- `publish_app_terms_draft()` locks the draft row (FOR UPDATE), deletes the
-- test acceptances it can see and turns the row into the published version.
-- A test player's `accept_current_app_terms(draft id)` in the same instant
-- read the row WITHOUT a lock: its trigger decided "draft" from a snapshot
-- taken before the publish committed, marked the acceptance as a draft test
-- fixture, then waited only at the foreign key check. When the publish
-- committed, the acceptance committed on the now-published version still
-- marked `terms_version = 'draft'` and `is_test_fixture`. Signing the
-- authorization draft (`record_signature`) had the same race against
-- `publish_authorization_draft()`.
--
-- THE FIX
--
-- Every path locks the version row `FOR SHARE` before it decides whether the
-- row is a draft: the acceptance trigger, `accept_current_app_terms`,
-- `sign_authorization` and `record_signature` (every signing path goes
-- through it: her app, the staff device, the walk-in confirmation and the
-- scenario switch). FOR SHARE conflicts with the publish's FOR UPDATE and
-- with any UPDATE or DELETE of the row, so it waits until the publish or the
-- discard commits. In READ COMMITTED the locked row is then re-read as
-- committed (a WHERE clause is re-checked on it), and every later statement
-- of these VOLATILE functions takes a new snapshot, so the decision is made
-- on the published row: she is recorded against the published version as an
-- ordinary acceptance or signature, or refused when the draft was discarded.
-- When she locks first, the publish waits for her commit and then deletes
-- her draft acceptance, as it always did.
--
-- FOR KEY SHARE would not do: it does not block FOR NO KEY UPDATE, the lock
-- a plain UPDATE of non-key columns takes.
--
-- Proof with two sessions: `bun run db:test:draft-publish-race`
-- (scripts/verify-draft-publish-race.ts).
--
-- Docs: https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS
-- (FOR SHARE blocks UPDATE, DELETE, FOR UPDATE and FOR NO KEY UPDATE; FOR
-- KEY SHARE does not block FOR NO KEY UPDATE),
-- https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED
-- (a waiting row lock re-reads the updated row and re-checks the WHERE
-- clause) and https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE.

create or replace function private.terms_acceptance_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  version public.app_terms_versions;
begin
  if new.version_id is null and new.terms_version = 'draft' then
    -- The wizard names the draft it showed. A draft published or discarded
    -- meanwhile is no longer one: after the lock wait the row fails
    -- `published_at is null` and nothing is found.
    select v.* into version
      from public.profiles p
      join public.app_terms_versions v on v.org_id = p.org_id and v.published_at is null
     where p.id = new.profile_id
       for share of v;
    if version.id is null then
      raise check_violation using message = 'the draft terms she was shown were published or discarded';
    end if;
  elsif new.version_id is null then
    select v.* into version
      from public.profiles p
      join public.app_terms_versions v on v.org_id = p.org_id and v.published_at is not null
     where p.id = new.profile_id
       and v.version_number = case when new.terms_version ~ '^[0-9]{1,6}$'
                                   then new.terms_version::integer else 1 end
       for share of v;
  else
    select v.* into version from public.app_terms_versions v where v.id = new.version_id for share;
  end if;
  new.version_id := version.id;

  if version.id is not null and version.published_at is null then
    if not private.sees_onboarding_drafts(new.profile_id) then
      raise check_violation using message = 'only a test player accepts a draft of the terms';
    end if;
    new.terms_version := 'draft';
    new.is_test_fixture := true;
  elsif version.id is not null and new.terms_version = 'draft' then
    -- She was shown the draft, and it was published before her acceptance
    -- could be recorded: she accepts the published version on its own screen.
    raise check_violation using message = 'the draft terms she was shown were published or discarded';
  end if;
  return new;
end;
$$;
revoke all on function private.terms_acceptance_version() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.accept_current_app_terms(p_version_id uuid, p_locale_shown text, p_signing jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- The version she names is locked before anything is decided about it
  -- (pending fix 29): a publish or discard of that draft in flight is
  -- waited for, and what follows reads the row it committed.
  perform 1 from public.app_terms_versions where id = p_version_id for share;
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
$function$
;

CREATE OR REPLACE FUNCTION public.sign_authorization(p_version_id uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
  me public.profiles;
  version public.authorization_versions;
begin
  select * into me from public.profiles where id = caller and role = 'player';
  if me.id is null then
    raise insufficient_privilege using message = 'only a player signs her authorization';
  end if;
  -- Locked before deciding (pending fix 29): a publish or discard of the
  -- draft she signs is waited for, and what follows reads what it committed.
  perform 1 from public.authorization_versions where id = p_version_id for share;
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
$function$
;

CREATE OR REPLACE FUNCTION private.record_signature(p_signature_id uuid, p_profile_id uuid, p_version_id uuid, p_payload jsonb, p_method text, p_witness uuid, p_signed_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- "Is it a draft" is decided on the locked row (pending fix 29): FOR SHARE
  -- waits for a publish or a discard holding the row and then reads the row
  -- it committed, so a draft signature never lands on a published version.
  select * into version from public.authorization_versions where id = p_version_id for share;
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
$function$
;

