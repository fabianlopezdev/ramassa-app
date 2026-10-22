-- The season authorization fully editable (RAPP-614).
--
-- WHY
--
-- Staff already wrote the authorization text per season (RAPP-304), but the
-- seven consents and their required flags were fixed in code and in the
-- database, the medical question and the emergency contact were fixed
-- fields, and the form's intro, phase titles, buttons, final step and the
-- re-registration copy were bundled strings. Ramassà staff now word and shape
-- all of it per version, in five languages, without an app release.
--
-- WHAT THIS MIGRATION DOES
--
--   1. A version's content gains:
--        consents  {key: {label, required, position}}: staff add, remove,
--                  reword, reorder and mark required. The object keeps the
--                  RAPP-304 shape (keyed by consent), so an app build from
--                  before this change still reads a version whose seven
--                  consents are all present; `position` gives the order.
--                  `image_rights` keeps its meaning (it drives the photo
--                  consent), so it is never required; `health_data` is the
--                  explicit consent the health answer needs (GDPR art. 9), so
--                  a version that asks the health question carries it, and
--                  makes it required when the question is required.
--        questions {health, emergency_contact}: each asked or not, required
--                  or optional (asked = false needs required = false, so the
--                  middle phase hides only when none of its questions is
--                  required), its privacy level (health: always `health`,
--                  readable only with participants.view_health; the
--                  emergency contact: `personal` or `sensitive`), and its
--                  wording per language.
--        texts     the form intro, the progress label, the phase titles, the
--                  buttons (her "Sign and enter", the tablet's "Sign the
--                  authorization"), the final step's signature wording and the
--                  re-registration copy. A field left out shows the bundled
--                  text in her language, so no screen is ever blank.
--      `private.authorization_text_fields()` lists the fields (a parity test
--      reads the block against the app's list).
--   2. Every published version is converted to the new shape with the
--      RAPP-304 order, both questions asked with today's flags, and no text
--      override, so what players see does not change (proved by the rendered
--      parity test of the mobile form, in all five languages).
--   3. Drafts, as for the app terms (RAPP-613): one draft per organization,
--      saved and discarded by onboarding designers
--      (`private.can_design_onboarding`); publishing needs
--      settings.organization. Published versions never change and are never
--      deleted. Every write is audited.
--   4. Each consent event stores the version, the wording shown, its
--      language and whether it was required, so a record reads correctly
--      whatever later versions do with that consent. Earlier events are
--      filled from their signature's version and language.
--   5. Signing (her app, a staff tablet, a walk-in, the offline outbox and a
--      confirmed or merged walk-in) checks the payload against the version it
--      was signed on: its required consents, its questions.
--   6. Her optional consents follow the current version, and she can always
--      withdraw any consent she gave that the current version does not
--      require (GDPR art. 7(3)).
--   7. Staff views: the participant page lists each consent with its
--      wording; the emergency contact follows its privacy level; a new
--      `consents` export dataset lists every consent decision with its
--      wording. The test player scenario's "signed this season" signs the
--      current version with its consents.
--
-- Docs: https://supabase.com/docs/guides/database/postgres/row-level-security
-- (RLS on every table, security definer functions with an empty search
-- path), https://supabase.com/docs/guides/database/vault (the field key
-- behind encrypt_field / decrypt_field stays in Vault; nothing here reads
-- it), https://www.postgresql.org/docs/current/plpgsql-trigger.html (BEFORE
-- row triggers that raise to refuse a change, and that fill columns on
-- insert), https://www.postgresql.org/docs/current/sql-altertable.html
-- (DISABLE TRIGGER for the one-time conversion).

-- 1. Shape -----------------------------------------------------------------------------------------------

-- The wording fields staff may set per version, by part.
create or replace function private.authorization_text_fields(p_part text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select f.fields
    from (values
      -- authorization-text-fields:start
      ('texts', array['intro', 'flow_label', 'documents_title', 'health_title', 'consents_title', 'continue_label', 'sign_and_enter_label', 'sign_label', 'required_mark', 'signature_title', 'signature_prompt', 'signature_hint', 'cannot_draw_label', 'cannot_draw_hint', 'reregistration_title', 'reregistration_intro', 'reregistration_correct_label', 'reregistration_edit_label', 'reregistration_season_intro']),
      ('health', array['question', 'no_label', 'yes_label', 'details_label']),
      ('emergency_contact', array['title', 'name_label', 'relation_label', 'phone_label'])
      -- authorization-text-fields:end
    ) as f(part, fields)
   where f.part = p_part;
$$;

-- A wording override: any of the five languages, at most 2000 characters each.
create or replace function private.authorization_override_texts_valid(p_texts jsonb, p_part text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_texts) = 'object'
    and not exists (
      select 1 from jsonb_each(p_texts) entry
       where not (entry.key = any (private.authorization_text_fields(p_part)))
          or not private.localized_text_valid(entry.value)
          or exists (select 1 from jsonb_each_text(entry.value) language
                      where length(language.value) > 2000)),
    false);
$$;

-- The text in her language, then Catalan, then the others (the app's
-- `resolveLocalizedText` order).
create or replace function private.localized_text_in(p_text jsonb, p_language text)
returns text
language sql
immutable
set search_path = ''
as $$
  select (
    select nullif(btrim(p_text ->> candidate.language), '')
      from unnest(array[coalesce(p_language, 'ca'), 'ca', 'es', 'en', 'ar', 'fa'])
           with ordinality as candidate(language, ordinal)
     where nullif(btrim(p_text ->> candidate.language), '') is not null
     order by candidate.ordinal
     limit 1);
$$;

create or replace function private.authorization_content_valid(p_content jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_content) = 'object'
    and p_content - array['title', 'sections', 'consents', 'attachments', 'questions', 'texts'] = '{}'::jsonb
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
    ),
    false);
$$;

-- A RAPP-304 version in the new shape: the fixed order as positions, both
-- questions asked with the flags they had, no wording override. What she
-- sees does not change. A version already in the new shape is returned as is.
create or replace function private.authorization_content_upgraded(p_content jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when p_content ? 'questions' then p_content
    else p_content
      || jsonb_build_object(
           'consents', (
             select jsonb_object_agg(
                      consent.key,
                      jsonb_build_object('label', consent.value -> 'label',
                                         'required', consent.value -> 'required',
                                         'position', legacy.ordinal - 1))
               from jsonb_each(p_content -> 'consents') consent
               join unnest(array['participation', 'data_processing', 'code_of_conduct', 'health_data',
                                 'image_rights', 'newsletter', 'messaging_groups'])
                    with ordinality as legacy(key, ordinal) on legacy.key = consent.key),
           'questions', jsonb_build_object(
             'health', jsonb_build_object('asked', true, 'required', true, 'privacy', 'health',
                                          'texts', '{}'::jsonb),
             'emergency_contact', jsonb_build_object('asked', true, 'required', false,
                                                     'privacy', 'personal', 'texts', '{}'::jsonb)),
           'texts', '{}'::jsonb,
           'attachments', coalesce(p_content -> 'attachments', '[]'::jsonb))
  end;
$$;

-- The version's consents in order.
create or replace function private.authorization_consents(p_content jsonb)
returns table (consent_key text, label jsonb, required boolean, sort_position integer)
language sql
immutable
set search_path = ''
as $$
  select consent.key, consent.value -> 'label', (consent.value ->> 'required')::boolean,
         (consent.value ->> 'position')::integer
    from jsonb_each(coalesce(p_content -> 'consents', '{}'::jsonb)) consent
   order by (consent.value ->> 'position')::integer, consent.key;
$$;

revoke all on function private.authorization_text_fields(text) from public, anon, authenticated;
revoke all on function private.authorization_override_texts_valid(jsonb, text) from public, anon, authenticated;
revoke all on function private.localized_text_in(jsonb, text) from public, anon, authenticated;
revoke all on function private.authorization_content_valid(jsonb) from public, anon, authenticated;
revoke all on function private.authorization_content_upgraded(jsonb) from public, anon, authenticated;
revoke all on function private.authorization_consents(jsonb) from public, anon, authenticated;

-- 2. Drafts and the conversion ------------------------------------------------------------------------------

alter table public.authorization_versions
  alter column season_id drop not null,
  alter column version_number drop not null,
  alter column published_at drop not null,
  alter column published_at drop default,
  add column updated_at timestamptz not null default now(),
  add column updated_by uuid references public.profiles (id) on delete set null,
  -- A draft has no season, number or publish time; a published version all three.
  add constraint authorization_versions_draft_or_published check (
    (published_at is null) = (version_number is null)
    and (published_at is null) = (season_id is null));

create unique index authorization_versions_one_draft
  on public.authorization_versions (org_id) where published_at is null;

comment on table public.authorization_versions is
  'The participation authorization per season (RAPP-304, RAPP-614): one draft per organization and numbered published versions. Published versions never change.';

-- Published versions only: staff read the draft through list_authorization_versions.
drop policy authorization_versions_select_org on public.authorization_versions;
create policy authorization_versions_select_published on public.authorization_versions
  for select to authenticated
  using (org_id = (select public.current_org_id()) and published_at is not null);

-- A published version never changes. Deleting one is refused too, except when
-- its organization or season goes (the cascade runs one trigger level deeper).
create or replace function private.authorization_versions_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.published_at is not null and (tg_op = 'UPDATE' or pg_trigger_depth() = 1) then
    raise object_not_in_prerequisite_state
      using message = 'a published authorization version is never edited; publish a new one';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger authorization_versions_immutable on public.authorization_versions;

-- The one-time conversion, with the immutability trigger out of the way.
update public.authorization_versions
   set content = private.authorization_content_upgraded(content)
 where not content ? 'questions';

create trigger authorization_versions_immutable
  before update or delete on public.authorization_versions
  for each row execute function private.authorization_versions_immutable();

revoke all on function private.authorization_versions_immutable() from public, anon, authenticated;

-- 3. Consent events keep what she was shown ------------------------------------------------------------------

alter table public.authorization_consent_events
  drop constraint authorization_consent_events_consent_key_check,
  add constraint authorization_consent_events_consent_key_check
    check (consent_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  add column version_id uuid references public.authorization_versions (id) on delete set null,
  add column wording text check (wording is null or length(wording) <= 20000),
  add column language text check (language is null or language in ('ca', 'es', 'en', 'ar', 'fa')),
  add column required boolean;

comment on column public.authorization_consent_events.wording is
  'The consent''s words as she was shown them, in `language` (RAPP-614). Null for a change outside the authorization (her profile edit of the photo consent, a staff edit).';

-- An event given while signing takes its version, wording and flag from the
-- signature's version, in the signature's language. Every insert path gets
-- it, the seed and earlier rows included.
create or replace function private.authorization_consent_event_wording()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  signature public.authorization_signatures;
  version public.authorization_versions;
begin
  if new.signature_id is not null then
    select * into signature from public.authorization_signatures where id = new.signature_id;
    new.version_id := coalesce(new.version_id, signature.version_id);
    new.language := coalesce(new.language, signature.language);
  end if;
  if new.version_id is not null and (new.wording is null or new.required is null) then
    select * into version from public.authorization_versions where id = new.version_id;
    new.wording := coalesce(new.wording, private.localized_text_in(
      version.content -> 'consents' -> new.consent_key -> 'label', coalesce(new.language, 'ca')));
    new.required := coalesce(new.required,
      (version.content -> 'consents' -> new.consent_key ->> 'required')::boolean);
    new.language := coalesce(new.language, case when new.wording is not null then 'ca' end);
  end if;
  return new;
end;
$$;

revoke all on function private.authorization_consent_event_wording() from public, anon, authenticated;

create trigger authorization_consent_events_wording
  before insert on public.authorization_consent_events
  for each row execute function private.authorization_consent_event_wording();

-- Earlier events: the wording their signature's version showed.
update public.authorization_consent_events event
   set version_id = signature.version_id,
       language = coalesce(signature.language, 'ca'),
       wording = private.localized_text_in(
         version.content -> 'consents' -> event.consent_key -> 'label', coalesce(signature.language, 'ca')),
       required = (version.content -> 'consents' -> event.consent_key ->> 'required')::boolean
  from public.authorization_signatures signature
  join public.authorization_versions version on version.id = signature.version_id
 where signature.id = event.signature_id
   and event.version_id is null;

-- 4. Signing -----------------------------------------------------------------------------------------------

-- The payload against the version it is signed on. A question the version
-- does not ask is ignored (an older build still sends both), never stored.
create or replace function private.validate_signing_payload(p_payload jsonb, p_content jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  consents jsonb := coalesce(p_payload -> 'consents', '{}'::jsonb);
  health text := nullif(btrim(p_payload ->> 'health_info'), '');
  drawing jsonb := p_payload -> 'signature';
  cannot_draw boolean := coalesce((p_payload ->> 'unable_to_draw')::boolean, false);
  shown_language text := nullif(p_payload ->> 'language', '');
  contact jsonb := case when jsonb_typeof(p_payload -> 'emergency_contact') = 'object'
    then p_payload -> 'emergency_contact' end;
  health_asked boolean := coalesce((p_content -> 'questions' -> 'health' ->> 'asked')::boolean, false);
  health_required boolean := coalesce((p_content -> 'questions' -> 'health' ->> 'required')::boolean, false);
  contact_asked boolean := coalesce((p_content -> 'questions' -> 'emergency_contact' ->> 'asked')::boolean, false);
  contact_required boolean := coalesce((p_content -> 'questions' -> 'emergency_contact' ->> 'required')::boolean, false);
begin
  if jsonb_typeof(consents) <> 'object'
    or exists (
      select 1 from private.authorization_consents(p_content) consent
       where consent.required and (consents -> consent.consent_key) is distinct from 'true'::jsonb
    )
    or exists (
      select 1 from jsonb_each(consents) given
       where not (p_content -> 'consents' ? given.key)
          or jsonb_typeof(given.value) <> 'boolean'
    )
  then
    raise check_violation using message = 'every required consent must be given';
  end if;
  if health_asked then
    if health is null and health_required then
      raise check_violation using message = 'the medical answer is required: "No" or a description';
    end if;
    if length(health) > 4000 then
      raise check_violation using message = 'the medical answer is too long';
    end if;
    -- Her health answer needs her explicit consent to its processing.
    if health is not null and p_content -> 'consents' ? 'health_data'
       and (consents -> 'health_data') is distinct from 'true'::jsonb then
      raise check_violation using message = 'the medical answer needs the health data consent';
    end if;
  end if;
  if drawing is not null and (jsonb_typeof(drawing) <> 'array' or jsonb_array_length(drawing) = 0) then
    drawing := null;
  end if;
  if drawing is not null and octet_length(drawing::text) > 200000 then
    raise check_violation using message = 'the signature is too large';
  end if;
  if (drawing is null) = (not cannot_draw) then
    raise check_violation using message = 'sign with a drawing, or record that she could not draw';
  end if;
  if shown_language is not null and shown_language not in ('ca', 'es', 'en', 'ar', 'fa') then
    raise check_violation using message = 'unsupported language';
  end if;
  if jsonb_typeof(p_payload -> 'emergency_contact') not in ('object', 'null') then
    raise check_violation using message = 'invalid emergency contact';
  end if;
  if contact_asked then
    if contact is not null and (
      length(coalesce(contact ->> 'name', '')) > 200
      or length(coalesce(contact ->> 'relation', '')) > 100
      or length(coalesce(contact ->> 'phone', '')) > 50
    ) then
      raise check_violation using message = 'invalid emergency contact';
    end if;
    if contact_required and (nullif(btrim(contact ->> 'name'), '') is null
                             or nullif(btrim(contact ->> 'phone'), '') is null) then
      raise check_violation using message = 'the emergency contact needs a name and a phone';
    end if;
  end if;
end;
$$;

revoke all on function private.validate_signing_payload(jsonb, jsonb) from public, anon, authenticated;

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
begin
  if exists (select 1 from public.authorization_signatures where id = p_signature_id) then
    return p_signature_id;
  end if;

  select * into target from public.profiles where id = p_profile_id;
  select * into version from public.authorization_versions where id = p_version_id;
  if target.id is null or version.id is null or version.org_id <> target.org_id
    or version.published_at is null
    or version.season_id is distinct from private.current_season_id(target.org_id)
  then
    raise check_violation using message = 'sign a version of the current season';
  end if;
  perform private.validate_signing_payload(p_payload, version.content);
  health_asked := (version.content -> 'questions' -> 'health' ->> 'asked')::boolean;
  contact_asked := (version.content -> 'questions' -> 'emergency_contact' ->> 'asked')::boolean;

  insert into public.authorization_signatures (
    id, org_id, profile_id, season_id, version_id, method, language, device,
    signed_at, signature, unable_to_draw, witnessed_by
  ) values (
    p_signature_id, target.org_id, target.id, version.season_id, version.id, p_method,
    shown_language,
    left(nullif(btrim(p_payload ->> 'device'), ''), 200),
    coalesce(p_signed_at, now()), drawing, drawing is null, p_witness
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
                             'unable_to_draw', drawing is null, 'witnessed_by', p_witness));
  return p_signature_id;
end;
$$;

create or replace function public.submit_walk_in_signing(
  p_id uuid, p_first_name text, p_last_name text, p_version_id uuid, p_payload jsonb,
  p_signed_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  version public.authorization_versions;
begin
  if not (select public.has_permission('consents.collect')) then
    raise insufficient_privilege using message = 'collecting signatures needs consents.collect';
  end if;
  if exists (select 1 from public.walk_in_signings where id = p_id) then
    return p_id;
  end if;
  select * into version from public.authorization_versions v
   where v.id = p_version_id and v.org_id = actor_org and v.published_at is not null
     and v.season_id = private.current_season_id(actor_org);
  if version.id is null then
    raise check_violation using message = 'sign a version of the current season';
  end if;
  if nullif(btrim(p_first_name), '') is null or nullif(btrim(p_last_name), '') is null then
    raise check_violation using message = 'a walk-in needs her first and last name';
  end if;
  if p_signed_at is null or p_signed_at > now() + interval '10 minutes'
    or p_signed_at < now() - interval '60 days'
  then
    raise check_violation using message = 'the signing time is outside the allowed window';
  end if;
  perform private.validate_signing_payload(p_payload, version.content);

  insert into public.walk_in_signings
    (id, org_id, first_name, last_name, version_id, payload, signed_at, collected_by)
  values (p_id, actor_org, btrim(p_first_name), btrim(p_last_name), p_version_id,
          public.encrypt_field(p_payload::text), p_signed_at, actor)
  on conflict (id) do nothing;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'walk_in.submit', 'walk_in_signing', p_id, '{}'::jsonb);
  return p_id;
end;
$$;

drop function private.validate_signing_payload(jsonb);

-- 5. Her optional consents -----------------------------------------------------------------------------------

-- An optional consent of the current version, from her profile. She can also
-- withdraw any consent she gave that the current version does not require,
-- even one it no longer asks.
drop function public.set_optional_consent(text, boolean);
create or replace function public.set_optional_consent(p_key text, p_granted boolean, p_language text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  me public.profiles;
  version public.authorization_versions;
  shown_language text;
  last_event public.authorization_consent_events;
begin
  select * into me from public.profiles where id = caller and role = 'player';
  if me.id is null then
    raise insufficient_privilege using message = 'only a player changes her consents';
  end if;
  version := private.current_authorization_version(me.org_id);
  shown_language := coalesce(nullif(p_language, ''), me.preferred_language, 'ca');
  if shown_language not in ('ca', 'es', 'en', 'ar', 'fa') then
    raise check_violation using message = 'unsupported language';
  end if;
  select * into last_event from public.authorization_consent_events e
   where e.profile_id = caller and e.consent_key = p_key
   order by e.decided_at desc, e.id desc limit 1;
  if p_granted is null
    or (version.content -> 'consents' -> p_key ->> 'required')::boolean is true
    or not (
      (version.content -> 'consents' -> p_key ->> 'required')::boolean is false
      or (not p_granted and last_event.granted is true)
    )
  then
    raise invalid_parameter_value using message = 'only an optional consent changes here';
  end if;

  insert into public.authorization_consent_events
    (org_id, profile_id, consent_key, granted, method, version_id, language, wording, required)
  values (
    me.org_id, caller, p_key, p_granted, 'profile',
    case when version.content -> 'consents' ? p_key then version.id else last_event.version_id end,
    case when version.content -> 'consents' ? p_key then shown_language else last_event.language end,
    case when version.content -> 'consents' ? p_key
      then private.localized_text_in(version.content -> 'consents' -> p_key -> 'label', shown_language)
      else last_event.wording end,
    false);

  if p_key = 'image_rights' then
    perform set_config('ramassa.consent_event_written', 'on', true);
    update public.profiles
       set media_consent_at = case when p_granted then coalesce(media_consent_at, now()) end
     where id = caller;
    perform set_config('ramassa.consent_event_written', '', true);
  end if;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (me.org_id, caller, 'consent.change', 'profile', caller,
          jsonb_build_object('consent', p_key, 'granted', p_granted));
end;
$$;

-- Her consents as they stand, with the words she was shown.
drop function public.my_consents();
create or replace function public.my_consents()
returns table (consent_key text, granted boolean, decided_at timestamptz, wording text, language text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (e.consent_key) e.consent_key, e.granted, e.decided_at, e.wording, e.language
    from public.authorization_consent_events e
   where e.profile_id = (select auth.uid())
   order by e.consent_key, e.decided_at desc, e.id desc;
$$;

-- 6. Staff ------------------------------------------------------------------------------------------------

drop function public.participant_consents(uuid);
create or replace function public.participant_consents(p_profile_id uuid)
returns table (
  consent_key text, granted boolean, decided_at timestamptz, method text, wording text,
  language text, required boolean, season_name text, version_number integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view_personal')) then
    raise insufficient_privilege using message = 'her consents need participants.view_personal';
  end if;
  return query
    select latest.consent_key, latest.granted, latest.decided_at, latest.method, latest.wording,
           latest.language, latest.required, s.name, v.version_number
      from (
        select distinct on (e.consent_key) e.*
          from public.authorization_consent_events e
         where e.profile_id = p_profile_id
           and e.org_id = (select public.current_org_id())
         order by e.consent_key, e.decided_at desc, e.id desc
      ) latest
      left join public.authorization_versions v on v.id = latest.version_id
      left join public.seasons s on s.id = v.season_id
     order by coalesce((v.content -> 'consents' -> latest.consent_key ->> 'position')::integer, 1000),
              latest.consent_key;
end;
$$;

drop function public.list_authorization_versions();
create or replace function public.list_authorization_versions()
returns table (
  id uuid, season_id uuid, season_name text, version_number integer, content jsonb,
  published_at timestamptz, is_current boolean, updated_at timestamptz)
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
           v.id = (private.current_authorization_version(v.org_id)).id, v.updated_at
      from public.authorization_versions v
      left join public.seasons s on s.id = v.season_id
     where v.org_id = (select public.current_org_id())
     order by v.published_at is not null, s.starts_on desc, v.version_number desc;
end;
$$;

create or replace function public.save_authorization_draft(p_content jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  saved uuid;
begin
  if not (select private.can_design_onboarding()) then
    raise insufficient_privilege using message = 'the authorization draft needs settings.organization or onboarding.design';
  end if;
  if not private.authorization_content_valid(p_content) then
    raise check_violation using message = 'the authorization needs its title, sections, consents and questions';
  end if;
  update public.authorization_versions
     set content = p_content, updated_at = now(), updated_by = actor
   where org_id = actor_org and published_at is null
  returning id into saved;
  if saved is null then
    insert into public.authorization_versions (org_id, content, updated_by)
    values (actor_org, p_content, actor)
    returning id into saved;
  end if;
  -- The shape only: the text is in the draft itself.
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'authorization.draft_saved', 'authorization_version', saved,
          jsonb_build_object(
            'consents', (select jsonb_agg(c.consent_key order by c.sort_position)
                           from private.authorization_consents(p_content) c),
            'required', (select coalesce(jsonb_agg(c.consent_key order by c.sort_position), '[]'::jsonb)
                           from private.authorization_consents(p_content) c where c.required),
            'health', (p_content -> 'questions' -> 'health') - 'texts',
            'emergency_contact', (p_content -> 'questions' -> 'emergency_contact') - 'texts'));
  return saved;
end;
$$;

create or replace function public.discard_authorization_draft()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
  discarded uuid;
begin
  if not (select private.can_design_onboarding()) then
    raise insufficient_privilege using message = 'the authorization draft needs settings.organization or onboarding.design';
  end if;
  delete from public.authorization_versions
   where org_id = actor_org and published_at is null
  returning id into discarded;
  if discarded is not null then
    insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
    values (actor_org, (select auth.uid()), 'authorization.draft_discarded', 'authorization_version',
            discarded, '{}'::jsonb);
  end if;
end;
$$;

-- Publishing makes every player sign again: an admin decision, not a design one.
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
  select coalesce(max(v.version_number), 0) + 1 into next_number
    from public.authorization_versions v where v.season_id = season;
  update public.authorization_versions
     set season_id = season, version_number = next_number, published_at = now(), published_by = actor
   where id = draft.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'authorization.publish', 'authorization_version', draft.id,
          jsonb_build_object('season_id', season, 'version_number', next_number, 'from_draft', true));
  return next_number;
end;
$$;

-- Publishing a version in one call stays for older admin builds; it now
-- needs settings.organization too.
create or replace function public.publish_authorization_version(p_content jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  season uuid;
  next_number integer;
  saved uuid;
begin
  if not (select public.has_permission('settings.organization')) then
    raise insufficient_privilege using message = 'publishing the authorization needs settings.organization';
  end if;
  season := private.current_season_id(actor_org);
  if season is null then
    raise object_not_in_prerequisite_state using message = 'the organization has no current season';
  end if;
  if not private.authorization_content_valid(p_content) then
    raise check_violation using message = 'the authorization needs its title, sections, consents and questions';
  end if;

  perform 1 from public.seasons where id = season for update;
  select coalesce(max(v.version_number), 0) + 1 into next_number
    from public.authorization_versions v where v.season_id = season;

  insert into public.authorization_versions (org_id, season_id, version_number, content, published_at, published_by)
  values (actor_org, season, next_number, p_content, now(), actor)
  returning id into saved;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'authorization.publish', 'authorization_version', saved,
          jsonb_build_object('season_id', season, 'version_number', next_number));
  return saved;
end;
$$;

-- The emergency contact's name and relation follow the level staff chose for
-- it in the current version (RAPP-614); its phone is always sensitive.
create or replace function private.emergency_contact_permission(p_org_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (private.current_authorization_version(p_org_id)).content
         -> 'questions' -> 'emergency_contact' ->> 'privacy' = 'sensitive'
    then 'participants.view_sensitive'
    else 'participants.view_personal'
  end;
$$;

revoke all on function private.record_signature(uuid, uuid, uuid, jsonb, text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.emergency_contact_permission(uuid) from public, anon, authenticated;
revoke all on function public.submit_walk_in_signing(uuid, text, text, uuid, jsonb, timestamptz) from public, anon;
revoke all on function public.set_optional_consent(text, boolean, text) from public, anon;
revoke all on function public.my_consents() from public, anon;
revoke all on function public.participant_consents(uuid) from public, anon;
revoke all on function public.list_authorization_versions() from public, anon;
revoke all on function public.save_authorization_draft(jsonb) from public, anon;
revoke all on function public.discard_authorization_draft() from public, anon;
revoke all on function public.publish_authorization_draft() from public, anon;
revoke all on function public.publish_authorization_version(jsonb) from public, anon;
grant execute on function public.submit_walk_in_signing(uuid, text, text, uuid, jsonb, timestamptz) to authenticated;
grant execute on function public.set_optional_consent(text, boolean, text) to authenticated;
grant execute on function public.my_consents() to authenticated;
grant execute on function public.participant_consents(uuid) to authenticated;
grant execute on function public.list_authorization_versions() to authenticated;
grant execute on function public.save_authorization_draft(jsonb) to authenticated;
grant execute on function public.discard_authorization_draft() to authenticated;
grant execute on function public.publish_authorization_draft() to authenticated;
grant execute on function public.publish_authorization_version(jsonb) to authenticated;

-- 7. The test player scenario signs the current version ---------------------------------------------------------

-- "Signed this season" signs the current version as a test fixture, with its
-- consents (required ones given, optional ones not) in her language, so her
-- phone and her page show the consents staff wrote. With no version, a paper
-- record, as before.
create or replace function private.scenario_season_signature(p_target public.profiles, p_change jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  signed boolean := (p_change ->> 'signed')::boolean;
  current_season uuid := private.current_season_id(p_target.org_id);
  version public.authorization_versions := private.current_authorization_version(p_target.org_id);
  shown_language text := coalesce(p_target.preferred_language, 'ca');
  signed_signature uuid;
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

-- 8. The emergency contact follows its privacy level ------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_participant_profile(participant_id uuid)
 RETURNS TABLE(id uuid, first_name text, last_name text, date_of_birth date, place_of_birth text, nationality text, preferred_language text, document_type text, document_number text, document_name text, phone text, address text, city text, postal_code text, reference_entity text, reference_contact_name text, has_dependents boolean, num_dependents integer, clothing_size text, shoe_size text, avatar_url text, media_consent boolean, terms_accepted_at timestamp with time zone, is_active boolean, is_forum_banned boolean, anonymized_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, applicant_status text, applicant_status_details text, supporting_entities text[], season_number smallint, childcare_need text, specific_needs text, health_info text, emergency_contact_name text, emergency_contact_relation text, emergency_contact_phone text, is_test_account boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.date_of_birth end,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.place_of_birth end,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.nationality end,
    s.preferred_language,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.document_type end,
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.document_number) end,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.document_name end,
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.phone) end,
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.address) end,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.city end,
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.postal_code) end,
    s.reference_entity,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.reference_contact_name end,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.has_dependents end,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.num_dependents end,
    s.clothing_size,
    s.shoe_size,
    s.avatar_url,
    s.media_consent_at is not null,
    s.terms_accepted_at,
    s.is_active,
    s.is_forum_banned,
    s.anonymized_at,
    s.created_at,
    s.updated_at,
    -- The season registration answers (RAPP-303). Applicant status and
    -- specific needs are sensitive, like the document number.
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.applicant_status) end,
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.applicant_status_details) end,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.supporting_entities end,
    -- Counted (RAPP-306): earlier seasons plus the seasons she signed.
    private.season_number(s.id),
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.childcare_need end,
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.specific_needs) end,
    -- The medical answer needs its own permission (RAPP-304); the emergency
    -- contact follows the personal and sensitive levels.
    case when (select private.participant_permission(participant_id, 'participants.view_health')) then public.decrypt_field(s.health_info) end,
    case when (select private.participant_permission(participant_id, private.emergency_contact_permission(s.org_id))) then s.emergency_contact_name end,
    case when (select private.participant_permission(participant_id, private.emergency_contact_permission(s.org_id))) then s.emergency_contact_relation end,
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.emergency_contact_phone) end,
    s.is_test_account
  from subject s;
$function$

;

-- 9. The consents export -----------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_data_export(p_dataset text, p_scope text, p_format text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_reason text DEFAULT NULL::text, p_confirmed boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  export_id uuid := gen_random_uuid();
  export_columns jsonb;
  export_rows jsonb;
  start_instant timestamptz;
  end_instant timestamptz;
begin
  perform private.require_recent_second_factor();
  if actor is null or actor_org is null or not (
    -- Custom answers (RAPP-307) need what the participants export needs.
    case (case when p_dataset in ('custom_answers', 'consents') then 'participants' else p_dataset end)
      when 'participants' then case
        when p_scope = 'full' then (select public.has_permission('export.participants_sensitive'))
          and (select public.has_permission('participants.view_sensitive'))
        else (select public.has_permission('export.participants'))
      end
      when 'attendance' then (select public.has_permission('export.attendance'))
      when 'events' then (select public.has_permission('export.events'))
      -- An unknown dataset falls through to the validation below for anyone
      -- who may export something, so the error names the real problem.
      else (select public.has_permission('export.participants'))
        or (select public.has_permission('export.attendance'))
        or (select public.has_permission('export.events'))
    end
  ) then
    raise insufficient_privilege using message = 'data exports require admin access';
  end if;
  if p_dataset not in ('participants', 'custom_answers', 'consents', 'attendance', 'events') then
    raise invalid_parameter_value using message = 'unsupported export dataset';
  end if;
  if p_scope not in ('default', 'full') then
    raise invalid_parameter_value using message = 'unsupported export scope';
  end if;
  if p_format not in ('csv', 'xlsx') then
    raise invalid_parameter_value using message = 'unsupported export format';
  end if;
  if p_start_date is not null and p_end_date is not null and p_start_date > p_end_date then
    raise invalid_datetime_format using message = 'invalid export period';
  end if;
  if p_scope = 'full' and not p_confirmed then
    raise invalid_parameter_value using message = 'full export requires explicit confirmation';
  end if;
  if p_scope = 'full' and length(btrim(coalesce(p_reason, ''))) < 10 then
    raise invalid_parameter_value using message = 'full export requires a reason of at least 10 characters';
  end if;
  if length(coalesce(p_reason, '')) > 500 then
    raise invalid_parameter_value using message = 'export reason is too long';
  end if;
  if (
    select count(*)
    from public.audit_log log
    where log.actor_id = actor
      and log.action like 'data_export.%'
      and log.created_at >= now() - interval '1 minute'
  ) >= 5 then
    raise sqlstate '42901' using message = 'export rate limit exceeded';
  end if;

  start_instant := case
    when p_start_date is null then null
    else p_start_date::timestamp at time zone 'Europe/Madrid'
  end;
  end_instant := case
    when p_end_date is null then null
    else (p_end_date + 1)::timestamp at time zone 'Europe/Madrid'
  end;

  if p_dataset = 'participants' and p_scope = 'default' then
    export_columns := '["id","first_name","last_name","date_of_birth","place_of_birth","nationality","preferred_language","city","reference_entity","reference_contact_name","has_dependents","num_dependents","clothing_size","shoe_size","is_active","created_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', profile.id,
      'first_name', profile.first_name,
      'last_name', profile.last_name,
      'date_of_birth', profile.date_of_birth,
      'place_of_birth', profile.place_of_birth,
      'nationality', profile.nationality,
      'preferred_language', profile.preferred_language,
      'city', profile.city,
      'reference_entity', profile.reference_entity,
      'reference_contact_name', profile.reference_contact_name,
      'has_dependents', profile.has_dependents,
      'num_dependents', profile.num_dependents,
      'clothing_size', profile.clothing_size,
      'shoe_size', profile.shoe_size,
      'is_active', profile.is_active,
      'created_at', profile.created_at
    ) order by profile.last_name, profile.first_name, profile.id), '[]'::jsonb)
    into export_rows
    from public.profiles profile
    where profile.org_id = actor_org
      and profile.role = 'player'
      and not profile.is_test_account;
  elsif p_dataset = 'participants' then
    export_columns := '["id","first_name","last_name","date_of_birth","place_of_birth","nationality","preferred_language","document_type","document_name","document_number","phone","address","city","postal_code","reference_entity","reference_contact_name","has_dependents","num_dependents","clothing_size","shoe_size","is_active","created_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', profile.id,
      'first_name', profile.first_name,
      'last_name', profile.last_name,
      'date_of_birth', profile.date_of_birth,
      'place_of_birth', profile.place_of_birth,
      'nationality', profile.nationality,
      'preferred_language', profile.preferred_language,
      'document_type', profile.document_type,
      'document_name', profile.document_name,
      'document_number', public.decrypt_field(profile.document_number),
      'phone', public.decrypt_field(profile.phone),
      'address', public.decrypt_field(profile.address),
      'city', profile.city,
      'postal_code', public.decrypt_field(profile.postal_code),
      'reference_entity', profile.reference_entity,
      'reference_contact_name', profile.reference_contact_name,
      'has_dependents', profile.has_dependents,
      'num_dependents', profile.num_dependents,
      'clothing_size', profile.clothing_size,
      'shoe_size', profile.shoe_size,
      'is_active', profile.is_active,
      'created_at', profile.created_at
    ) order by profile.last_name, profile.first_name, profile.id), '[]'::jsonb)
    into export_rows
    from public.profiles profile
    where profile.org_id = actor_org
      and profile.role = 'player'
      and not profile.is_test_account;
  elsif p_dataset = 'custom_answers' then
    -- Answers to the questions staff added (RAPP-307), one row per answer. The
    -- default scope holds Normal and Personal answers; Sensitive answers only
    -- the full scope, which needs participants.view_sensitive above.
    export_columns := '["participant_id","first_name","last_name","screen","question","privacy","season","answer","answered_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'participant_id', profile.id,
      'first_name', profile.first_name,
      'last_name', profile.last_name,
      'screen', screen.title ->> 'ca',
      'question', question.label ->> 'ca',
      'privacy', question.privacy,
      'season', season.name,
      'answer', private.custom_answer_text(
        question, coalesce(answer.value, (public.decrypt_field(answer.value_encrypted))::jsonb)),
      'answered_at', answer.answered_at
    ) order by profile.last_name, profile.first_name, profile.id, screen.sort_order, question.sort_order,
             season.starts_on), '[]'::jsonb)
    into export_rows
    from public.custom_answers answer
    join public.custom_questions question on question.id = answer.question_id
    join public.intake_screens screen on screen.id = question.screen_id
    join public.profiles profile on profile.id = answer.profile_id
    left join public.seasons season on season.id = answer.season_id
    where answer.org_id = actor_org
      and profile.role = 'player'
      and not profile.is_test_account
      and (p_scope = 'full' or question.privacy <> 'sensitive');
  elsif p_dataset = 'consents' then
    -- Every consent decision with the words she was shown (RAPP-614): one row
    -- per decision, signing and later changes alike. No health answer, no
    -- signature: a consent's wording is the organization's own text.
    export_columns := '["participant_id","first_name","last_name","season","version","consent_key","consent","language","required","granted","method","decided_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'participant_id', profile.id,
      'first_name', profile.first_name,
      'last_name', profile.last_name,
      'season', season.name,
      'version', version.version_number,
      'consent_key', event.consent_key,
      'consent', event.wording,
      'language', event.language,
      'required', event.required,
      'granted', event.granted,
      'method', event.method,
      'decided_at', event.decided_at
    ) order by profile.last_name, profile.first_name, profile.id, event.decided_at, event.id), '[]'::jsonb)
    into export_rows
    from public.authorization_consent_events event
    join public.profiles profile on profile.id = event.profile_id
    left join public.authorization_versions version on version.id = event.version_id
    left join public.seasons season on season.id = version.season_id
    where event.org_id = actor_org
      and profile.role = 'player'
      and not profile.is_test_account
      and (start_instant is null or event.decided_at >= start_instant)
      and (end_instant is null or event.decided_at < end_instant);
  elsif p_dataset = 'attendance' then
    export_columns := '["attendance_id","occurrence_id","event_id","category_id","player_id","first_name","last_name","status","marked_at","starts_at","ends_at","event_title_ca","event_title_es","event_title_en","event_title_ar","event_title_fa","event_location","category_name_ca","category_name_es","category_name_en","category_name_ar","category_name_fa"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'attendance_id', report.attendance_id,
      'occurrence_id', report.occurrence_id,
      'event_id', report.event_id,
      'category_id', report.category_id,
      'player_id', report.player_id,
      'first_name', report.first_name,
      'last_name', report.last_name,
      'status', report.status,
      'marked_at', report.marked_at,
      'starts_at', report.starts_at,
      'ends_at', report.ends_at,
      'event_title_ca', report.event_title ->> 'ca',
      'event_title_es', report.event_title ->> 'es',
      'event_title_en', report.event_title ->> 'en',
      'event_title_ar', report.event_title ->> 'ar',
      'event_title_fa', report.event_title ->> 'fa',
      'event_location', report.event_location,
      'category_name_ca', report.category_name ->> 'ca',
      'category_name_es', report.category_name ->> 'es',
      'category_name_en', report.category_name ->> 'en',
      'category_name_ar', report.category_name ->> 'ar',
      'category_name_fa', report.category_name ->> 'fa'
    ) order by report.starts_at, report.last_name, report.first_name, report.attendance_id), '[]'::jsonb)
    into export_rows
    from public.attendance_report_rows report
    where report.org_id = actor_org
      and not report.is_test_account
      and (start_instant is null or report.starts_at >= start_instant)
      and (end_instant is null or report.starts_at < end_instant);
  else
    export_columns := '["id","category_id","title_ca","title_es","title_en","title_ar","title_fa","location","starts_at","ends_at","time_zone","status","signup_mode","max_participants","created_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', event.id,
      'category_id', event.category_id,
      'title_ca', event.title ->> 'ca',
      'title_es', event.title ->> 'es',
      'title_en', event.title ->> 'en',
      'title_ar', event.title ->> 'ar',
      'title_fa', event.title ->> 'fa',
      'location', event.location,
      'starts_at', event.starts_at,
      'ends_at', event.ends_at,
      'time_zone', event.time_zone,
      'status', event.status,
      'signup_mode', event.signup_mode,
      'max_participants', event.max_participants,
      'created_at', event.created_at
    ) order by event.starts_at, event.id), '[]'::jsonb)
    into export_rows
    from public.events event
    where event.org_id = actor_org
      and (start_instant is null or event.starts_at >= start_instant)
      and (end_instant is null or event.starts_at < end_instant);
  end if;

  insert into public.audit_log (id, org_id, actor_id, action, target_type, target_id, changes)
  values (
    gen_random_uuid(), actor_org, actor, 'data_export.' || p_scope, 'data_export', export_id,
    jsonb_strip_nulls(jsonb_build_object(
      'dataset', p_dataset,
      'format', p_format,
      'scope', p_scope,
      'start_date', p_start_date,
      'end_date', p_end_date,
      'reason', case when p_scope = 'full' then btrim(p_reason) else null end,
      'row_count', jsonb_array_length(export_rows)
    ))
  );

  return jsonb_build_object(
    'version', 1,
    'export_id', export_id,
    'dataset', p_dataset,
    'scope', p_scope,
    'format', p_format,
    'generated_at', now(),
    'columns', export_columns,
    'rows', export_rows
  );
end;
$function$

;

revoke all on function public.create_data_export(text, text, text, date, date, text, boolean) from public, anon;
grant execute on function public.create_data_export(text, text, text, date, date, text, boolean) to authenticated;
