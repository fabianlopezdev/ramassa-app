-- Her writers save answers by field (RAPP-661, D2, D3, D9, D10).
--
-- WHY
--
-- Step 2 of 7 (RAPP-660 to RAPP-666). RAPP-660 gave every app field the shape
-- of a staff field and copied its answers into `custom_answers`. Now every path
-- that saves her data writes field answers, keyed by field id. Only her names
-- stay on her account (D2). The readers move in RAPP-662: until then they read
-- the old columns, which no writer updates any more. That staleness is accepted
-- because nothing deploys before the final QA (decision, 2026-10-25: answers
-- only, no double writes).
--
-- WHAT CHANGES
--
--   1. One payload for every writer: her names (`first_name`, `last_name`), the
--      writer's own account settings (her app language, her photo, her media
--      consent, her season count), and `answers`, an object of field id to
--      answer. A null or empty answer removes it. A key a writer does not know
--      is refused, so an older build fails loudly and never loses what she
--      typed. `packages/shared` defines the same shape with Zod
--      (`fieldAnswersPayloadSchema`).
--   2. `private.write_field_answers` writes a set of answers: each field must
--      be a live field of her organization (asked of her, on her own
--      surfaces). An answer given again unchanged keeps whoever gave it first.
--      The others go through `private.write_custom_answer`, Sensitive ones
--      encrypted, with their source and author. Source and author on each
--      answer replace `profile_answers`, which no writer fills any more.
--   3. The rules come from the fields and their placements:
--        - a required placement needs an answer:
--          `private.missing_required_custom_answers` covers every field but
--          her names, and the season check reads the season placements;
--        - a condition (`show_when`) that stops holding removes the answer;
--        - an option keyed `none` stands alone in a several-choice answer;
--        - the document rule reads the document fields by their system keys
--          and the type's option keys (D7): no type, or `none`, takes the
--          number away; where she registers or a joined record is edited,
--          `other` needs the document's name and any other type its number.
--   4. The writers moved: `complete_onboarding` and its signed wrapper,
--      `update_own_profile`, `update_participant_profile`,
--      `private.apply_profile_prefill`, `update_my_season_answers`,
--      `save_my_custom_answers`, `set_participant_custom_answers`, and the
--      test player switches (`answers` takes field ids; `custom_answers` folds
--      into it).
--   5. A seasonal answer is kept per season in `custom_answers` (D10). Signing
--      no longer copies her profile's season columns into `season_answers`:
--      through the RAPP-660 mirror that copy would now overwrite her answers
--      with the stale columns.
--   6. The audit of a staff edit names the fields that changed. A Sensitive
--      field's value never enters it: the field's level decides, with no list
--      of columns written here.
--
-- The entity referral form and invitations move in the next migration.
--
-- Docs: https://www.postgresql.org/docs/17/functions-json.html (jsonb `-`
-- text[], jsonb_each), https://www.postgresql.org/docs/17/plpgsql-control-structures.html.

-- 1. One answer, its conditions and the document rule -------------------------------------------------------

-- The answer a field has now, decrypted: this season's for a seasonal field.
create function private.field_answer_now(p_profile_id uuid, p_field public.profile_fields)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(a.value, (public.decrypt_field(a.value_encrypted))::jsonb)
    from public.custom_answers a
   where a.profile_id = p_profile_id
     and a.question_id = p_field.id
     and a.season_key = case when private.field_is_seasonal(p_field.id)
                             then private.current_season_id(p_field.org_id)
                             else '00000000-0000-0000-0000-000000000000'::uuid end;
$$;

-- The answer of one of the app's fields, found by its system key (D7).
create function private.system_field_answer(p_profile_id uuid, p_system_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.field_answer_now(p_profile_id, f)
    from public.profile_fields f
    join public.profiles p on p.id = p_profile_id and p.org_id = f.org_id
   where f.system_key = p_system_key;
$$;

-- Removes the answers whose condition no longer holds: the conditional fields
-- among `p_fields`, and those that open on one of them. A removed answer may
-- close another condition in turn. Returns the fields whose answer went.
create function private.clear_hidden_answers(p_profile_id uuid, p_fields uuid[])
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleared uuid[];
begin
  if coalesce(cardinality(p_fields), 0) = 0 then
    return '{}'::uuid[];
  end if;
  with hidden as (
    select f.id,
           case when private.field_is_seasonal(f.id) then private.current_season_id(f.org_id)
                else '00000000-0000-0000-0000-000000000000'::uuid end as season_key
      from public.profile_fields f
      join public.profile_fields gate on gate.id = f.show_when_field_id
      join public.profiles p on p.id = p_profile_id and p.org_id = f.org_id
     where (f.id = any (p_fields) or f.show_when_field_id = any (p_fields))
       and private.field_answer_now(p_profile_id, gate) is distinct from to_jsonb(f.show_when_option_id::text)
  ), gone as (
    delete from public.custom_answers a
     using hidden h
     where a.profile_id = p_profile_id and a.question_id = h.id and a.season_key = h.season_key
    returning a.question_id
  )
  select coalesce(array_agg(gone.question_id), '{}'::uuid[]) into cleared from gone;
  if cardinality(cleared) > 0 then
    cleared := cleared || private.clear_hidden_answers(p_profile_id, cleared);
  end if;
  return cleared;
end;
$$;

-- The document rule, read from its fields by their system keys and the type's
-- option keys (D7). No type, or `none`, means no document, so a number cannot
-- stand alone. When `p_require_number` (where she registers, edits herself, or
-- the team edits a joined record) a type other than `other` needs its number,
-- as the shared rule says (`refineDocumentNumber`); `other` needs the
-- document's name where she registers (`p_require_name`). A woman the team or
-- an entity is still completing may get them later. A field that no longer has
-- the type the rule reads is left alone. Returns the field whose answer went.
create function private.apply_document_rule(
  p_profile_id uuid,
  p_require_number boolean,
  p_require_name boolean default false
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  her_org uuid := (select p.org_id from public.profiles p where p.id = p_profile_id);
  type_field public.profile_fields;
  number_field public.profile_fields;
  name_field public.profile_fields;
  type_answer jsonb;
  type_key text;
  cleared uuid[] := '{}'::uuid[];
begin
  select * into type_field from public.profile_fields f
   where f.org_id = her_org and f.system_key = 'document_type';
  select * into number_field from public.profile_fields f
   where f.org_id = her_org and f.system_key = 'document_number';
  select * into name_field from public.profile_fields f
   where f.org_id = her_org and f.system_key = 'document_name';
  if type_field.id is null or number_field.id is null
     or type_field.question_type not in ('single_choice', 'search_choice') then
    return cleared;
  end if;
  type_answer := private.field_answer_now(p_profile_id, type_field);
  select o.key into type_key from public.custom_question_options o
   where o.question_id = type_field.id and to_jsonb(o.id::text) = type_answer;

  if type_answer is null or type_key = 'none' then
    with gone as (
      delete from public.custom_answers a
       where a.profile_id = p_profile_id and a.question_id = number_field.id
      returning a.question_id
    )
    select coalesce(array_agg(distinct gone.question_id), '{}'::uuid[]) into cleared from gone;
  elsif type_key = 'other' then
    if p_require_name and name_field.id is not null and not name_field.is_archived
       and private.field_answer_now(p_profile_id, name_field) is null then
      raise not_null_violation using message = 'enter the name of the other document';
    end if;
  elsif p_require_number and not number_field.is_archived
        and private.field_answer_now(p_profile_id, number_field) is null then
    raise not_null_violation using message = 'a document needs its number';
  end if;
  return cleared;
end;
$$;

revoke all on function private.field_answer_now(uuid, public.profile_fields) from public, anon, authenticated;
revoke all on function private.system_field_answer(uuid, text) from public, anon, authenticated;
revoke all on function private.clear_hidden_answers(uuid, uuid[]) from public, anon, authenticated;
revoke all on function private.apply_document_rule(uuid, boolean, boolean) from public, anon, authenticated;

-- An answer fits its field: its type's rules, and an option keyed `none` (D5:
-- "no specific needs") stands alone in a several-choice answer, as the
-- structured specific needs required before they were split.
CREATE OR REPLACE FUNCTION private.custom_answer_valid(p_field public.profile_fields, p_value jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select private.custom_answer_value_valid(
           p_field.question_type, p_field.settings, p_value,
           array(select o.id::text from public.custom_question_options o
                  where o.question_id = p_field.id and not o.is_archived))
     and not (p_field.question_type = 'multiple_choice' and jsonb_typeof(p_value) = 'array'
              and jsonb_array_length(p_value) > 1
              and exists (select 1 from public.custom_question_options o
                           where o.question_id = p_field.id and o.key = 'none' and p_value ? o.id::text));
$function$;

-- 2. The one writer of a set of answers ------------------------------------------------------------------

-- `p_answers` is an object of field id to answer; null or empty removes it.
--   p_hers       her own surfaces: only the fields she is asked (onboarding or
--                season placement)
--   p_sensitive  what a Sensitive field does: 'write', 'skip' (left as it is,
--                for a caller who cannot read it) or 'refuse'
-- Returns the fields whose answer changed, the ones a condition cleared included.
create function private.write_field_answers(
  p_profile_id uuid,
  p_answers jsonb,
  p_source text,
  p_answered_by uuid default null,
  p_hers boolean default false,
  p_sensitive text default 'write'
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  her_org uuid := (select p.org_id from public.profiles p where p.id = p_profile_id);
  entry record;
  field public.profile_fields;
  given jsonb;
  changed uuid[] := '{}'::uuid[];
begin
  if p_answers is null or jsonb_typeof(p_answers) = 'null' then
    return changed;
  end if;
  if jsonb_typeof(p_answers) <> 'object' then
    raise check_violation using message = 'answers must be an object';
  end if;
  if p_sensitive not in ('write', 'skip', 'refuse') or her_org is null then
    raise invalid_parameter_value using message = 'write_field_answers needs her profile and a Sensitive rule';
  end if;
  for entry in select key, value from jsonb_each(p_answers) order by key loop
    field := null;
    select * into field from public.profile_fields f
     where f.org_id = her_org and f.id::text = entry.key and not f.is_archived;
    if field.id is null or (p_hers and not private.field_asked_of_her(field.id)) then
      -- Nothing given for a field she is not asked: nothing to do. A form that
      -- sends every field it knows never fails on one taken off her surfaces.
      continue when p_hers and private.custom_answer_is_empty(entry.value);
      if p_hers then
        raise insufficient_privilege using message = 'not a question she is asked';
      end if;
      raise no_data_found using message = 'no such field';
    end if;
    -- Her names stay on her account (D2): they travel as first_name and last_name.
    if field.system_key in ('first_name', 'last_name') then
      raise check_violation using message = 'her names stay on her account';
    end if;
    if field.privacy = 'sensitive' and p_sensitive <> 'write' then
      if p_sensitive = 'refuse' then
        raise insufficient_privilege using message = 'a Sensitive answer needs participants.view_sensitive';
      end if;
      continue;
    end if;
    given := case when private.custom_answer_is_empty(entry.value) then null
                  else private.custom_answer_tidied(field.question_type, entry.value) end;
    -- Given again unchanged: whoever gave it first stays its source.
    continue when given is not distinct from private.field_answer_now(p_profile_id, field);
    perform private.write_custom_answer(p_profile_id, field, entry.value, p_source, p_answered_by);
    changed := changed || field.id;
  end loop;
  return changed || private.clear_hidden_answers(p_profile_id, changed);
end;
$$;
revoke all on function private.write_field_answers(uuid, jsonb, text, uuid, boolean, text)
  from public, anon, authenticated;

-- An app question has an answer: her names and language always do, her photo
-- and season count are on her account, every other question through any of
-- its fields. Replaces `profile_answers` where a writer asks it.
create function private.app_question_answered(p_profile_id uuid, p_question text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_question in ('first_name', 'last_name', 'preferred_language') then true
    when p_question = 'avatar' then exists (
      select 1 from public.profiles p where p.id = p_profile_id and p.avatar_url is not null)
    when p_question = 'season_number' then exists (
      select 1 from public.profiles p where p.id = p_profile_id and p.season_number is not null)
    else exists (
      select 1 from public.profile_fields f
        join public.profiles p on p.id = p_profile_id and p.org_id = f.org_id
       where f.system_key is not null
         and private.system_key_question(f.system_key) = p_question
         and private.field_answer_now(p_profile_id, f) is not null)
  end;
$$;
revoke all on function private.app_question_answered(uuid, text) from public, anon, authenticated;

-- 3. Required answers, read from the placements ------------------------------------------------------------

-- The fields required where she is asked that have no answer: every field but
-- her names (on her account). The name says custom for its callers; since
-- RAPP-661 it covers the app's fields too. A field is required where its
-- placement says, a condition that does not hold asks nothing, and her contact
-- at an entity is asked only once she names one.
CREATE OR REPLACE FUNCTION private.missing_required_custom_answers(p_profile_id uuid, p_placement text)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(array_agg(f.id order by pl.sort_order, f.sort_order), array[]::uuid[])
    from public.profile_fields f
    join public.profiles p on p.id = p_profile_id and p.org_id = f.org_id
    join public.field_placements pl
      on pl.field_id = f.id and pl.required
     and pl.surface = case p_placement when 'wizard' then 'onboarding' when 'season' then 'season' end
   where not f.is_archived
     and f.system_key is distinct from 'first_name'
     and f.system_key is distinct from 'last_name'
     and (pl.surface <> 'onboarding'
          or not private.is_uuid_text(pl.screen_key)
          or exists (select 1 from public.intake_screens s
                      where s.id = pl.screen_key::uuid and s.org_id = f.org_id and not s.is_archived))
     and not (private.field_is_seasonal(f.id) and private.current_season_id(f.org_id) is null)
     and (f.show_when_field_id is null or exists (
           select 1 from public.profile_fields gate
            where gate.id = f.show_when_field_id
              and private.field_answer_now(p_profile_id, gate) = to_jsonb(f.show_when_option_id::text)))
     and (f.system_key is distinct from 'reference_contact_name'
          or private.system_field_answer(p_profile_id, 'reference_entity') is not null)
     and private.field_answer_now(p_profile_id, f) is null;
$function$;

-- The season questions she must answer before signing a new season: the
-- required season placements, by field.
CREATE OR REPLACE FUNCTION private.missing_required_season_answers(p_profile_id uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(array_agg('custom:' || id::text), array[]::text[])
    from unnest(private.missing_required_custom_answers(p_profile_id, 'season')) id;
$function$;

-- 4. Her registration ---------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_onboarding(payload jsonb)
 RETURNS public.profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
  stored public.profiles;
  saved public.profiles;
  answers jsonb := coalesce(nullif(payload -> 'answers', 'null'::jsonb), '{}'::jsonb);
  terms_version_value text := nullif(payload ->> 'terms_version', '');
  locale_shown_value text := nullif(payload ->> 'locale_shown', '');
  first_name_value text;
  last_name_value text;
  preferred_language_value text;
  avatar_url_value text;
  media_consent_at_value timestamptz;
  entity_field uuid;
  missing uuid[];
begin
  if caller is null then
    raise exception 'complete_onboarding requires an authenticated caller'
      using errcode = 'insufficient_privilege';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object'
     or payload - array['first_name', 'last_name', 'preferred_language', 'avatar_url', 'media_consent',
                        'terms_version', 'locale_shown', 'answers'] <> '{}'::jsonb then
    raise invalid_parameter_value
      using message = 'complete_onboarding takes her names, her settings and her answers by field';
  end if;
  if terms_version_value is null or locale_shown_value is null then
    raise exception 'complete_onboarding requires terms_version and locale_shown'
      using errcode = 'not_null_violation';
  end if;

  select * into stored from public.profiles where id = caller for update;
  if stored.id is not null and stored.role not in ('player', 'invited') then
    raise exception 'complete_onboarding is the participant path'
      using errcode = 'insufficient_privilege';
  end if;

  -- A name she sent takes her answer; one she did not send keeps what is stored.
  first_name_value := case when payload ? 'first_name'
    then nullif(private.name_trim(payload ->> 'first_name'), '') else stored.first_name end;
  last_name_value := case when payload ? 'last_name'
    then nullif(private.name_trim(payload ->> 'last_name'), '') else stored.last_name end;
  preferred_language_value := coalesce(
    nullif(payload ->> 'preferred_language', ''), stored.preferred_language, 'ca');
  avatar_url_value := case when payload ? 'avatar_url'
    then nullif(payload ->> 'avatar_url', '') else stored.avatar_url end;
  media_consent_at_value := case
    when nullif(payload ->> 'media_consent', '') is null then stored.media_consent_at
    when (payload ->> 'media_consent')::boolean then coalesce(stored.media_consent_at, now())
    else null
  end;
  if first_name_value is null or last_name_value is null then
    raise exception 'complete_onboarding requires first_name and last_name'
      using errcode = 'not_null_violation';
  end if;

  -- Her account first: her answers need it.
  if stored.id is null then
    insert into public.profiles (
      id, org_id, role, first_name, last_name, preferred_language, avatar_url,
      terms_accepted_at, media_consent_at)
    values (
      caller, (select public.default_organization_id()), 'player', first_name_value, last_name_value,
      preferred_language_value, avatar_url_value, now(), media_consent_at_value)
    returning * into saved;
  else
    -- Role and org are not the wizard's to change, except that joining makes
    -- an invited woman a player (RAPP-300).
    update public.profiles set
      role = 'player',
      first_name = first_name_value,
      last_name = last_name_value,
      preferred_language = preferred_language_value,
      avatar_url = avatar_url_value,
      terms_accepted_at = now(),
      media_consent_at = media_consent_at_value,
      updated_at = now()
    where id = caller
    returning * into saved;
  end if;

  -- Her answers by field. One she confirmed unchanged keeps the team's or the
  -- entity's record; one she cleared is no longer answered.
  perform private.write_field_answers(caller, answers, 'player', null, true);
  perform private.apply_document_rule(caller, true, true);

  -- Every required placement of her onboarding, and of the season form, which
  -- the wizard asks too, has an answer once hers are saved (RAPP-611).
  missing := private.missing_required_custom_answers(caller, 'wizard')
          || private.missing_required_custom_answers(caller, 'season');
  -- "None" is an answer to the entity question: the field sent, even empty.
  select f.id into entity_field from public.profile_fields f
   where f.org_id = saved.org_id and f.system_key = 'reference_entity';
  if entity_field is not null and answers ? entity_field::text then
    missing := array_remove(missing, entity_field);
  end if;
  if cardinality(missing) > 0 then
    raise not_null_violation using message = 'complete_onboarding requires an answer to a required question';
  end if;

  insert into public.terms_acceptances (profile_id, terms_version, locale_shown)
  values (caller, terms_version_value, locale_shown_value);

  return saved;
end;
$function$;

CREATE OR REPLACE FUNCTION private.complete_onboarding_signed(payload jsonb, p_signing jsonb)
 RETURNS public.profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
  saved public.profiles;
  previous_ids uuid[];
  acceptance uuid;
  drawing jsonb := nullif(p_signing->'signature','null'::jsonb);
  cannot_draw boolean;
begin
  if caller is null then raise insufficient_privilege using message='authenticated signing required'; end if;
  if jsonb_typeof(p_signing) is distinct from 'object'
    or (p_signing->'terms_accepted') is distinct from 'true'::jsonb
    or jsonb_typeof(p_signing->'media_consent') is distinct from 'boolean'
    or jsonb_typeof(p_signing->'unable_to_draw') is distinct from 'boolean'
    or (payload->'media_consent') is distinct from (p_signing->'media_consent')
    or length(coalesce(p_signing->>'device',''))>200
  then raise check_violation using message='explicit terms acceptance and matching media choice required'; end if;
  cannot_draw := (p_signing->>'unable_to_draw')::boolean;
  if (cannot_draw and drawing is not null) or
    (not cannot_draw and not private.app_signature_valid(drawing))
  then raise check_violation using message='draw a valid signature or use the cannot-draw alternative'; end if;

  -- Serialize calls for an existing account and identify this acceptance exactly,
  -- including two acceptances made in one transaction with the same timestamp.
  perform 1 from public.profiles where id=caller for update;
  select coalesce(array_agg(id),'{}'::uuid[]) into previous_ids
    from public.terms_acceptances where profile_id=caller;
  -- Every answer, the staff fields' included, travels in `answers` (RAPP-661)
  -- and is saved and checked in the same transaction as her account.
  saved := public.complete_onboarding(payload);
  select id into strict acceptance from public.terms_acceptances
    where profile_id=caller and not (id=any(previous_ids));
  insert into public.app_terms_signatures
    (acceptance_id,profile_id,org_id,signature,unable_to_draw,media_consent,device)
  values (acceptance,caller,saved.org_id,drawing,cannot_draw,(p_signing->>'media_consent')::boolean,nullif(p_signing->>'device',''));
  return saved;
end $function$;

-- 5. Her own edits ------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_own_profile(payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception 'update_own_profile requires an authenticated caller'
      using errcode = 'insufficient_privilege';
  end if;
  -- `role`, `org_id`, `terms_accepted_at`, `is_active` and `is_forum_banned`
  -- are not hers to change: a payload carrying them is refused.
  if payload is null or jsonb_typeof(payload) <> 'object'
     or payload - array['first_name', 'last_name', 'preferred_language', 'avatar_url', 'media_consent',
                        'season_number', 'answers'] <> '{}'::jsonb then
    raise invalid_parameter_value
      using message = 'her profile takes her names, her settings and her answers by field';
  end if;
  -- Her first name, last name and app language are always required (RAPP-611).
  if (payload ? 'first_name' and nullif(private.name_trim(payload ->> 'first_name'), '') is null)
     or (payload ? 'last_name' and nullif(private.name_trim(payload ->> 'last_name'), '') is null) then
    raise check_violation using message = 'her first name, last name and app language are always required';
  end if;
  if coalesce(nullif(payload ->> 'season_number', '') not in ('1', '2', '3', '4', '5'), false) then
    raise invalid_parameter_value using message = 'a season answer is outside its choices';
  end if;
  if not exists (select 1 from public.profiles where id = caller) then
    return;
  end if;

  update public.profiles set
    first_name = case when payload ? 'first_name' then private.name_trim(payload ->> 'first_name') else first_name end,
    last_name = case when payload ? 'last_name' then private.name_trim(payload ->> 'last_name') else last_name end,
    preferred_language = coalesce(nullif(payload ->> 'preferred_language', ''), preferred_language),
    avatar_url = coalesce(nullif(payload ->> 'avatar_url', ''), avatar_url),
    -- Revocable in both directions, unlike the terms.
    media_consent_at = case
      when not (payload ? 'media_consent') then media_consent_at
      when (payload ->> 'media_consent')::boolean then coalesce(media_consent_at, now())
      else null
    end,
    season_number = case when payload ? 'season_number'
      then nullif(payload ->> 'season_number', '')::smallint else season_number end,
    updated_at = now()
  where id = caller;

  -- Editing is never stricter than registering: a value she gives is checked
  -- by its field, and a document type needs its number.
  perform private.write_field_answers(caller, payload -> 'answers', 'player', null, true);
  perform private.apply_document_rule(caller, true);
end;
$function$;
revoke all on function public.update_own_profile(jsonb) from public, anon;
grant execute on function public.update_own_profile(jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.update_my_season_answers(p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
  answers jsonb := p_payload -> 'answers';
begin
  if not exists (select 1 from public.profiles where id = caller and role = 'player') then
    raise insufficient_privilege using message = 'only a player answers her season questions';
  end if;
  -- Only the fields placed on the season form travel here.
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or p_payload - 'answers' <> '{}'::jsonb
     or jsonb_typeof(answers) is distinct from 'object'
     or exists (
       select 1 from jsonb_each(answers) given
        where not private.custom_answer_is_empty(given.value)
          and not exists (
            select 1 from public.field_placements pl
              join public.profile_fields f on f.id = pl.field_id
             where pl.surface = 'season' and f.id::text = given.key
               and f.org_id = (select public.current_org_id())))
  then
    raise invalid_parameter_value using message = 'a season answer is outside its choices';
  end if;

  -- An empty answer to a field off the season form changes nothing.
  perform private.write_field_answers(
    caller,
    (select coalesce(jsonb_object_agg(given.key, given.value), '{}'::jsonb)
       from jsonb_each(answers) given
      where exists (select 1 from public.field_placements pl
                     where pl.surface = 'season' and pl.field_id::text = given.key)),
    'player', null, true);

  -- Re-registration asks the season questions staff made required (RAPP-611):
  -- they are checked here, the call that ends it.
  if cardinality(private.missing_required_season_answers(caller)) > 0 then
    raise not_null_violation using message = 'a required season question has no answer';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.save_player_custom_answers(p_profile_id uuid, p_org_id uuid, p_answers jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists (select 1 from public.profiles p where p.id = p_profile_id and p.org_id = p_org_id) then
    raise insufficient_privilege using message = 'not a question she is asked';
  end if;
  perform private.write_field_answers(p_profile_id, p_answers, 'player', null, true);
end;
$function$;

-- 6. The team's edits ---------------------------------------------------------------------------------------

drop function private.apply_profile_prefill(uuid, jsonb, text);

-- What the team or an entity gives before she joins (RAPP-300): only what is
-- sent changes, each answer recorded as theirs. A woman still being completed
-- may get her document number later. Returns the fields whose answer changed.
create function private.apply_profile_prefill(
  p_profile_id uuid,
  p_payload jsonb,
  p_source text,
  p_answered_by uuid default null
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  changed uuid[];
begin
  if p_source not in ('staff', 'entity') then
    raise exception 'apply_profile_prefill takes staff or entity answers'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or p_payload - array['first_name', 'last_name', 'preferred_language', 'season_number', 'answers'] <> '{}'::jsonb then
    raise invalid_parameter_value
      using message = 'a prefill takes her names, her language, her season count and her answers by field';
  end if;
  if (p_payload ? 'first_name' and nullif(private.name_trim(p_payload ->> 'first_name'), '') is null)
    or (p_payload ? 'last_name' and nullif(private.name_trim(p_payload ->> 'last_name'), '') is null)
  then
    raise exception 'a name can be corrected but not removed'
      using errcode = 'not_null_violation';
  end if;
  if coalesce(nullif(p_payload ->> 'season_number', '') not in ('1', '2', '3', '4', '5'), false) then
    raise invalid_parameter_value using message = 'a season answer is outside its choices';
  end if;

  update public.profiles p set
    first_name = case when p_payload ? 'first_name' then private.name_trim(p_payload ->> 'first_name') else p.first_name end,
    last_name = case when p_payload ? 'last_name' then private.name_trim(p_payload ->> 'last_name') else p.last_name end,
    preferred_language = coalesce(nullif(p_payload ->> 'preferred_language', ''), p.preferred_language),
    season_number = case when p_payload ? 'season_number'
      then nullif(p_payload ->> 'season_number', '')::smallint else p.season_number end,
    -- "This is her third year" means two seasons before this one (RAPP-306).
    prior_seasons = case when nullif(p_payload ->> 'season_number', '') is not null
      then greatest((p_payload ->> 'season_number')::smallint - 1, 0) else p.prior_seasons end,
    updated_at = now()
  where p.id = p_profile_id
  returning p.id into target;
  if target is null then
    return '{}'::uuid[];
  end if;

  changed := private.write_field_answers(
    p_profile_id, p_payload -> 'answers', p_source,
    -- The team member who typed it; an entity's answer names its contact.
    coalesce(p_answered_by, case when p_source = 'staff' then (select auth.uid()) end));
  return changed || private.apply_document_rule(p_profile_id, false);
end;
$$;
revoke all on function private.apply_profile_prefill(uuid, jsonb, text, uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_participant_profile(participant_id uuid, payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  target public.profiles;
  sees_sensitive boolean;
  before_answers jsonb;
  after_answers jsonb;
  changed uuid[];
  changes jsonb := '{}'::jsonb;
  account_key text;
begin
  if not (select private.participant_permission(participant_id, 'participants.view_personal')) then
    raise exception 'update_participant_profile is the staff path; a participant edits herself through update_own_profile()'
      using errcode = 'insufficient_privilege';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object'
     or payload - array['first_name', 'last_name', 'preferred_language', 'media_consent', 'season_number',
                        'answers'] <> '{}'::jsonb then
    raise invalid_parameter_value
      using message = 'her record takes her names, her settings and her answers by field';
  end if;
  -- Her first name, last name and app language are always required (RAPP-611).
  if (payload ? 'first_name' and nullif(private.name_trim(payload ->> 'first_name'), '') is null)
     or (payload ? 'last_name' and nullif(private.name_trim(payload ->> 'last_name'), '') is null) then
    raise check_violation using message = 'her first name, last name and app language are always required';
  end if;
  if coalesce(nullif(payload ->> 'season_number', '') not in ('1', '2', '3', '4', '5'), false) then
    raise invalid_parameter_value using message = 'a season answer is outside its choices';
  end if;

  select * into target from public.profiles p
   where p.id = participant_id and p.org_id = actor_org for update;
  -- No such participant in this organization: nothing to change, nothing to audit.
  if target.id is null then
    return;
  end if;
  sees_sensitive := (select private.participant_permission(participant_id, 'participants.view_sensitive'));

  -- Her answers as they stand, for the audit below: decrypted here and never
  -- logged when the field is Sensitive.
  select coalesce(jsonb_object_agg(f.id::text, private.field_answer_now(participant_id, f)), '{}'::jsonb)
    into before_answers
    from public.profile_fields f where f.org_id = actor_org;

  update public.profiles p set
    first_name = case when payload ? 'first_name' then private.name_trim(payload ->> 'first_name') else p.first_name end,
    last_name = case when payload ? 'last_name' then private.name_trim(payload ->> 'last_name') else p.last_name end,
    preferred_language = coalesce(nullif(payload ->> 'preferred_language', ''), p.preferred_language),
    -- Her consent stays hers until she joins (RAPP-300).
    media_consent_at = case
      when target.role <> 'player' or not (payload ? 'media_consent') then p.media_consent_at
      when (payload ->> 'media_consent')::boolean then coalesce(p.media_consent_at, now())
      else null
    end,
    season_number = case when payload ? 'season_number'
      then nullif(payload ->> 'season_number', '')::smallint else p.season_number end,
    prior_seasons = case when target.role = 'invited' and nullif(payload ->> 'season_number', '') is not null
      then greatest((payload ->> 'season_number')::smallint - 1, 0) else p.prior_seasons end,
    updated_at = now()
  where p.id = participant_id;

  -- A Sensitive field changes only for a caller who may read it. For anyone
  -- else it stays as stored, whatever the payload says (RAPP-230).
  changed := private.write_field_answers(
    participant_id, payload -> 'answers', 'staff', actor, false,
    case when sees_sensitive then 'write' else 'skip' end);
  changed := changed || private.apply_document_rule(participant_id, target.role = 'player');

  select coalesce(jsonb_object_agg(f.id::text, private.field_answer_now(participant_id, f)), '{}'::jsonb)
    into after_answers
    from public.profile_fields f where f.org_id = actor_org and f.id = any (changed);
  select coalesce(jsonb_object_agg(f.id::text,
           case when f.privacy = 'sensitive' then jsonb_build_object('changed', true)
                else jsonb_build_object('old', before_answers -> f.id::text, 'new', after_answers -> f.id::text) end),
           '{}'::jsonb)
    into changes
    from public.profile_fields f where f.id = any (changed);

  foreach account_key in array array['first_name', 'last_name', 'preferred_language', 'season_number'] loop
    if payload ? account_key and (to_jsonb(target) ->> account_key) is distinct from (
         select to_jsonb(p) ->> account_key from public.profiles p where p.id = participant_id) then
      changes := changes || jsonb_build_object(account_key, jsonb_build_object(
        'old', to_jsonb(target) -> account_key,
        'new', (select to_jsonb(p) -> account_key from public.profiles p where p.id = participant_id)));
    end if;
  end loop;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'profile.update', 'profile', participant_id, changes);
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_participant_custom_answers(p_profile_id uuid, p_answers jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := (select public.current_org_id());
  actor uuid := (select auth.uid());
  changed uuid[];
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view_personal')) then
    raise insufficient_privilege using message = 'editing her answers needs participants.view_personal';
  end if;
  if not exists (select 1 from public.profiles
                  where id = p_profile_id and org_id = actor_org and role in ('player', 'invited')) then
    raise no_data_found using message = 'no such participant';
  end if;
  changed := private.write_field_answers(
    p_profile_id, coalesce(p_answers, 'null'::jsonb), 'staff', actor, false,
    case when (select private.participant_permission(p_profile_id, 'participants.view_sensitive'))
         then 'write' else 'refuse' end);
  changed := changed || private.apply_document_rule(p_profile_id, false);
  -- The fields only: answers may be Sensitive and never enter the log (ADR-004).
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'profile.custom_answers_update', 'profile', p_profile_id,
          jsonb_build_object('questions', to_jsonb(changed)));
end;
$function$;

-- Skipping a required question for her needs an answer to it first: read from
-- her answers by field, no longer from `profile_answers`.
CREATE OR REPLACE FUNCTION private.apply_intake_question_states(p_profile_id uuid, p_states jsonb, p_actor uuid, p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  entry record;
  old_state text;
  custom_id uuid;
  custom_field public.profile_fields;
  changes jsonb := '{}'::jsonb;
begin
  if p_states is null or jsonb_typeof(p_states) <> 'object' then
    raise invalid_parameter_value using message = 'question states are an object';
  end if;

  for entry in select key as question, value as state from jsonb_each_text(p_states) loop
    if entry.state is null or entry.state not in ('auto', 'ask', 'skip') then
      raise invalid_parameter_value using message = 'unknown state ' || coalesce(entry.state, 'null');
    end if;

    -- A Ramassà field (RAPP-643).
    if entry.question like 'custom:%' then
      if entry.question !~ '^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise invalid_parameter_value using message = 'unknown question ' || entry.question;
      end if;
      custom_id := substr(entry.question, 8)::uuid;
      custom_field := null;
      select * into custom_field from public.profile_fields f
       where f.id = custom_id and f.org_id = p_org_id and f.kind = 'custom' and not f.is_archived;
      if custom_field.id is null then
        raise invalid_parameter_value using message = 'unknown question ' || entry.question;
      end if;
      if entry.state = 'skip' and private.field_required_for_her(custom_id)
         and not exists (
           select 1 from public.custom_answers a
            where a.profile_id = p_profile_id and a.question_id = custom_id)
      then
        raise check_violation
          using message = 'a required question needs an answer before it can be hidden: ' || entry.question;
      end if;

      select s.state into old_state from public.custom_question_states s
       where s.profile_id = p_profile_id and s.question_id = custom_id;
      old_state := coalesce(old_state, 'auto');
      continue when old_state = entry.state;

      if entry.state = 'auto' then
        delete from public.custom_question_states s
         where s.profile_id = p_profile_id and s.question_id = custom_id;
      else
        insert into public.custom_question_states (profile_id, org_id, question_id, state, updated_by)
        values (p_profile_id, p_org_id, custom_id, entry.state, p_actor)
        on conflict (profile_id, question_id) do update
          set state = excluded.state, updated_at = now(), updated_by = excluded.updated_by;
      end if;
      changes := changes || jsonb_build_object(
        entry.question, jsonb_build_object('old', old_state, 'new', entry.state));
      continue;
    end if;

    -- An app question, as before.
    if not (entry.question = any (private.wizard_intake_questions())) then
      raise invalid_parameter_value using message = 'unknown question ' || entry.question;
    end if;
    if entry.state = 'skip'
      and entry.question = any (private.required_intake_questions())
      and not private.app_question_answered(p_profile_id, entry.question)
    then
      raise check_violation
        using message = 'a required question needs an answer before it can be hidden: ' || entry.question;
    end if;

    select s.state into old_state from public.intake_question_states s
     where s.profile_id = p_profile_id and s.question = entry.question;
    old_state := coalesce(old_state, 'auto');
    continue when old_state = entry.state;

    if entry.state = 'auto' then
      delete from public.intake_question_states s
       where s.profile_id = p_profile_id and s.question = entry.question;
    else
      insert into public.intake_question_states (profile_id, org_id, question, state, updated_by)
      values (p_profile_id, p_org_id, entry.question, entry.state, p_actor)
      on conflict (profile_id, question) do update
        set state = excluded.state, updated_at = now(), updated_by = excluded.updated_by;
    end if;
    changes := changes || jsonb_build_object(
      entry.question, jsonb_build_object('old', old_state, 'new', entry.state));
  end loop;

  if changes <> '{}'::jsonb then
    insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
    values (p_org_id, p_actor, 'profile.intake_questions_update', 'profile', p_profile_id, changes);
  end if;
end;
$function$;

-- 7. The test player switches -------------------------------------------------------------------------------

-- `answers` takes the shared payload in `fill` and field ids in `clear`; the
-- staff fields' switch (`custom_answers`) folds into it.
CREATE OR REPLACE FUNCTION private.scenario_answers(p_target public.profiles, p_change jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  fill jsonb := coalesce(p_change -> 'fill', '{}'::jsonb);
  clear jsonb := coalesce(p_change -> 'clear', '[]'::jsonb);
  item text;
  field public.profile_fields;
  cleared uuid[] := '{}'::uuid[];
begin
  if jsonb_typeof(fill) <> 'object' or jsonb_typeof(clear) <> 'array'
     or (fill ? 'answers' and jsonb_typeof(fill -> 'answers') <> 'object') then
    raise invalid_parameter_value using message = 'answers take fill (an object) and clear (a list)';
  end if;
  for item in select jsonb_array_elements_text(clear) loop
    field := null;
    select * into field from public.profile_fields f
     where f.org_id = p_target.org_id and f.id::text = item;
    -- Her names are never empty: they are corrected, never cleared.
    if field.id is null or field.system_key in ('first_name', 'last_name') then
      raise invalid_parameter_value using message = 'unknown field ' || item;
    end if;
    -- A joined woman keeps a complete profile, as every finished onboarding does.
    if p_target.role = 'player' and exists (
         select 1 from public.field_placements pl
          where pl.field_id = field.id and pl.required and pl.surface in ('onboarding', 'season')) then
      raise object_not_in_prerequisite_state
        using message = 'she has joined: set the app terms to not accepted before clearing a required answer';
    end if;
    cleared := cleared || field.id;
  end loop;

  if fill <> '{}'::jsonb then
    perform private.apply_profile_prefill(p_target.id, fill, 'staff');
  end if;
  if cardinality(cleared) > 0 then
    delete from public.custom_answers a where a.profile_id = p_target.id and a.question_id = any (cleared);
    perform private.clear_hidden_answers(p_target.id, cleared);
    perform private.apply_document_rule(p_target.id, false);
  end if;

  -- The field names only: the values are made up, but the audit log never
  -- holds answers (ADR-004).
  return jsonb_build_object(
    'filled', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb)
                 from (select jsonb_object_keys(fill - 'answers') k
                       union all
                       select jsonb_object_keys(coalesce(fill -> 'answers', '{}'::jsonb))) keys),
    'cleared', to_jsonb(cleared));
end;
$function$;

drop function private.scenario_custom_answers(public.profiles, jsonb);

CREATE OR REPLACE FUNCTION public.set_test_player_scenario(p_profile_id uuid, p_change jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

-- Nothing answered but the name her invitation gave her: every answer goes.
-- Her account settings and her signatures reset; the app's old columns are
-- left to RAPP-666, since no reader of answers looks at them.
CREATE OR REPLACE FUNCTION private.scenario_reset(p_target public.profiles)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Not joined, with an open invitation.
  perform private.scenario_terms(p_target, '{"accepted": false}'::jsonb);
  -- No signature and no consent, this season or any other.
  delete from public.authorization_signatures where profile_id = p_target.id;
  delete from public.authorization_consent_events where profile_id = p_target.id;
  delete from public.season_answers where profile_id = p_target.id;
  delete from public.profile_answers
   where profile_id = p_target.id and question not in ('first_name', 'last_name');
  delete from public.custom_answers where profile_id = p_target.id;
  update public.profiles p set
    avatar_url = null, media_consent_at = null, season_number = null, prior_seasons = 0,
    health_info = null, emergency_contact_name = null, emergency_contact_relation = null,
    emergency_contact_phone = null, updated_at = now()
  where p.id = p_target.id;
  return '{}'::jsonb;
end;
$function$;

-- She joins as every woman does: with every required placement answered.
CREATE OR REPLACE FUNCTION private.scenario_terms(p_target profiles, p_change jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      -- Read from her answers by field and the required placements (RAPP-661).
      if cardinality(private.missing_required_custom_answers(p_target.id, 'wizard')
                     || private.missing_required_custom_answers(p_target.id, 'season')) > 0 then
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
$function$;

-- 8. Signing a season keeps her answers -------------------------------------------------------------------

-- Her season answers are rows of their season (D10): signing has nothing to copy.
drop trigger authorization_signatures_snapshot_season_answers on public.authorization_signatures;
drop function private.snapshot_season_answers_on_signature();
