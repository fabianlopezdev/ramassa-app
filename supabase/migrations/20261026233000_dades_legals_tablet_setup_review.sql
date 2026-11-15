-- Dades legals: the walk-in tablet, the setup file and the review ask Onboarding consents (RAPP-699).
--
-- WHY
--
-- Fabián, 2026-10-26: close the three gaps left by the Dades legals build.
--
-- WHAT THIS MIGRATION DOES
--
--   1. The walk-in tablet. After the authorization, the tablet asks the
--      consents placed on the live Onboarding screens, in her language.
--      `submit_walk_in_signing` takes `p_consents` (by key) and keeps them in
--      `public.walk_in_consents` with the text she read, until the team
--      confirms or merges her. Then they become her consent events (method
--      `staff_device`, form Onboarding, the coach present as `recorded_by`).
--      Discarding the walk-in drops them. An older tablet sends none, which
--      is accepted.
--   2. The setup file. The export carries `consents` (every consent by key,
--      the system ones with their wording) and `consent_placements` (where
--      each is asked on Onboarding). On import a system consent takes the
--      file's wording by key; a staff consent is made by key, or takes the
--      file's wording when the key exists. An older file without them still
--      imports.
--   3. The review. When she reviews Onboarding screens again (RAPP-697), a
--      tick she changed records a new decision and one she left as it was
--      records nothing. Her phone fills the ticks with her current state.

-- 1. Her consent ticks shown on Onboarding ---------------------------------------------------------------

-- Her ticks of the consents placed on the live Onboarding screens (or on
-- `p_screens`), checked, with the text in her language. Null ticks (an older
-- build) give none and check nothing.
create or replace function private.onboarding_consents_shown(
  p_org_id uuid, p_consents jsonb, p_language text, p_screens text[] default null)
returns table (consent_id uuid, consent_key text, granted boolean, required boolean, screen_key text,
               wording text, language text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  shown_language text := case when p_language in ('ca', 'es', 'en', 'ar', 'fa') then p_language else 'ca' end;
  asked record;
begin
  if p_consents is null or p_consents = 'null'::jsonb then
    return;
  end if;
  if jsonb_typeof(p_consents) <> 'object'
     or exists (select 1 from jsonb_each(p_consents) given where jsonb_typeof(given.value) <> 'boolean')
     or exists (
       select 1 from jsonb_object_keys(p_consents) given(key)
        where not exists (
          select 1 from public.consent_placements p
            join public.consents c on c.id = p.consent_id and not c.is_archived
           where p.org_id = p_org_id and p.surface = 'onboarding' and c.key = given.key
             and private.onboarding_screen_live(p_org_id, p.screen_key)))
  then
    raise check_violation using message = 'her Onboarding consents are ticks of the consents it asks';
  end if;
  for asked in
    select c.id, c.key, c.body, p.required, p.screen_key
      from public.consent_placements p
      join public.consents c on c.id = p.consent_id and not c.is_archived
     where p.org_id = p_org_id and p.surface = 'onboarding'
       and private.onboarding_screen_live(p_org_id, p.screen_key)
       and (p_screens is null or p.screen_key = any (p_screens))
     order by p.screen_key, p.sort_order
  loop
    if asked.required and (p_consents -> asked.key) is distinct from 'true'::jsonb then
      raise check_violation using message = 'every required consent must be given';
    end if;
    consent_id := asked.id;
    consent_key := asked.key;
    granted := coalesce((p_consents ->> asked.key)::boolean, false);
    required := asked.required;
    screen_key := asked.screen_key;
    wording := private.localized_text_in(asked.body, shown_language);
    language := shown_language;
    return next;
  end loop;
end;
$$;
revoke all on function private.onboarding_consents_shown(uuid, jsonb, text, text[]) from public, anon, authenticated;

-- Her decisions on her Onboarding consents. In a review (`p_only_changes`) a
-- tick equal to her current state records nothing.
drop function private.record_onboarding_consents(uuid, jsonb, text, text[]);
create function private.record_onboarding_consents(
  p_profile_id uuid, p_consents jsonb, p_language text, p_screens text[] default null,
  p_only_changes boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  her public.profiles;
  shown record;
begin
  select * into her from public.profiles where id = p_profile_id;
  for shown in
    select * from private.onboarding_consents_shown(
      her.org_id, p_consents, coalesce(nullif(p_language, ''), her.preferred_language), p_screens)
  loop
    continue when p_only_changes and (
      select e.granted from public.consent_events e
       where e.profile_id = her.id and e.consent_id = shown.consent_id
       order by e.decided_at desc, e.id desc limit 1) is not distinct from shown.granted;
    insert into public.consent_events
      (org_id, profile_id, consent_id, consent_key, granted, method, language, wording, required,
       form, screen_key)
    values (her.org_id, her.id, shown.consent_id, shown.consent_key, shown.granted, 'app',
            shown.language, shown.wording, shown.required, 'onboarding', shown.screen_key);
    perform private.apply_consent_effects(her.id, shown.consent_key, shown.granted, her.id);
  end loop;
end;
$$;
revoke all on function private.record_onboarding_consents(uuid, jsonb, text, text[], boolean) from public, anon, authenticated;

-- 2. The walk-in tablet --------------------------------------------------------------------------------------

create table public.walk_in_consents (
  id uuid primary key default gen_random_uuid(),
  walk_in_id uuid not null references public.walk_in_signings (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  consent_id uuid not null references public.consents (id) on delete cascade,
  consent_key text not null,
  granted boolean not null,
  required boolean not null,
  screen_key text not null,
  -- The text as she read it on the tablet, in `language`.
  wording text not null check (length(btrim(wording)) > 0),
  language text not null check (language in ('ca', 'es', 'en', 'ar', 'fa')),
  decided_at timestamptz not null,
  -- The team member who was present.
  recorded_by uuid references public.profiles (id) on delete set null,
  constraint walk_in_consents_one_per_consent unique (walk_in_id, consent_id)
);
create index walk_in_consents_org_idx on public.walk_in_consents (org_id);
create index walk_in_consents_consent_idx on public.walk_in_consents (consent_id);
create index walk_in_consents_recorded_by_idx on public.walk_in_consents (recorded_by);
comment on table public.walk_in_consents is
  'A walk-in''s ticks of the Onboarding consents on the tablet (RAPP-699), until staff confirm her.';

alter table public.walk_in_consents enable row level security;
alter table public.walk_in_consents force row level security;
-- Written and moved only by the walk-in functions; read like the walk-in itself.
create policy walk_in_consents_select_team on public.walk_in_consents for select to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_permission('participants.invite')));
revoke all on public.walk_in_consents from anon, authenticated;
grant select on public.walk_in_consents to authenticated;

drop function public.submit_walk_in_signing(uuid, text, text, uuid, jsonb, timestamptz, jsonb);
create or replace function private.resolve_walk_in(p_walk_in walk_in_signings, p_profile_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
begin
  perform private.record_signature(
    p_walk_in.id, p_profile_id, p_walk_in.version_id,
    public.decrypt_field(p_walk_in.payload)::jsonb, 'staff_device', p_walk_in.collected_by,
    p_walk_in.signed_at);
  -- Her Onboarding blocks signed on the tablet (RAPP-691): hers, at the time
  -- she signed, with the team member who was present.
  insert into public.form_signatures (
    org_id, profile_id, surface, block_id, screen_key, body, language, signer_kind, signer_user_id,
    signer_name, strokes, signed_at, signed_on_tablet, witnessed_by)
  select p_walk_in.org_id, p_profile_id, 'wizard', w.block_id, w.screen_key, w.body, w.language, 'player',
         p_profile_id, concat_ws(' ', p_walk_in.first_name, p_walk_in.last_name), w.strokes, w.signed_at,
         true, w.witnessed_by
    from public.walk_in_form_signatures w
   where w.walk_in_id = p_walk_in.id;
  delete from public.walk_in_form_signatures where walk_in_id = p_walk_in.id;
  -- Her ticks of the Onboarding consents on the tablet (RAPP-699): her
  -- decisions, at the time she made them, with the text she read and the
  -- team member who was present.
  insert into public.consent_events
    (org_id, profile_id, consent_id, consent_key, granted, method, decided_at, language, wording,
     required, form, screen_key, recorded_by)
  select p_walk_in.org_id, p_profile_id, c.consent_id, c.consent_key, c.granted, 'staff_device',
         c.decided_at, c.language, c.wording, c.required, 'onboarding', c.screen_key, c.recorded_by
    from public.walk_in_consents c
   where c.walk_in_id = p_walk_in.id
   order by c.screen_key, c.consent_key;
  perform private.apply_consent_effects(p_profile_id, c.consent_key, c.granted, c.recorded_by)
     from public.walk_in_consents c where c.walk_in_id = p_walk_in.id;
  delete from public.walk_in_consents where walk_in_id = p_walk_in.id;
  update public.walk_in_signings
     set status = p_status, payload = null, resolved_profile_id = p_profile_id,
         resolved_by = (select auth.uid()), resolved_at = now()
   where id = p_walk_in.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (p_walk_in.org_id, (select auth.uid()), 'walk_in.' || p_status, 'walk_in_signing', p_walk_in.id,
          jsonb_build_object('profile_id', p_profile_id));
end;
$$
;

create or replace function public.discard_walk_in(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
begin
  if not (select public.has_permission('participants.invite')) then
    raise insufficient_privilege using message = 'discarding a walk-in needs participants.invite';
  end if;
  update public.walk_in_signings
     set status = 'discarded', payload = null, resolved_by = (select auth.uid()), resolved_at = now()
   where id = p_id and org_id = (select public.current_org_id()) and status = 'pending';
  if not found then
    raise insufficient_privilege using message = 'no pending walk-in of this organization';
  end if;
  -- Her block signatures go with the discarded signing (RAPP-691).
  delete from public.walk_in_form_signatures where walk_in_id = p_id;
  -- Her Onboarding consent ticks go with it too (RAPP-699).
  delete from public.walk_in_consents where walk_in_id = p_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values ((select public.current_org_id()), (select auth.uid()), 'walk_in.discarded',
          'walk_in_signing', p_id, '{}'::jsonb);
end;
$$
;

create function public.submit_walk_in_signing(p_id uuid, p_first_name text, p_last_name text, p_version_id uuid, p_payload jsonb, p_signed_at timestamp with time zone, p_block_signatures jsonb DEFAULT NULL::jsonb, p_consents jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
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
  if nullif(private.name_trim(p_first_name), '') is null or nullif(private.name_trim(p_last_name), '') is null then
    raise check_violation using message = 'a walk-in needs her first and last name';
  end if;
  if p_signed_at is null or p_signed_at > now() + interval '10 minutes'
    or p_signed_at < now() - interval '60 days'
  then
    raise check_violation using message = 'the signing time is outside the allowed window';
  end if;
  perform private.validate_signing_payload(p_payload, version.content);
  -- Her answers are checked now; they are written when the team confirms her.
  perform private.check_signing_answers(actor_org, null, version.content, p_payload);
  -- Her Onboarding signature blocks (RAPP-691), checked before anything is kept.
  perform private.check_walk_in_block_signatures(actor_org, p_block_signatures);
  -- Her ticks of the Onboarding consents (RAPP-699), checked the same way; an
  -- older tablet sends none.
  perform 1 from private.onboarding_consents_shown(actor_org, p_consents, p_payload ->> 'language', null);

  insert into public.walk_in_signings
    (id, org_id, first_name, last_name, version_id, payload, signed_at, collected_by)
  values (p_id, actor_org, private.name_trim(p_first_name), private.name_trim(p_last_name), p_version_id,
          public.encrypt_field(p_payload::text), p_signed_at, actor)
  on conflict (id) do nothing;
  -- They wait with the walk-in until the team confirms or merges her: the text
  -- as shown, its language, the strokes, the time and the team member present.
  insert into public.walk_in_form_signatures (
    walk_in_id, org_id, block_id, screen_key, body, language, strokes, signed_at, witnessed_by)
  select p_id, actor_org, shown.block_id, shown.screen_key, shown.body, shown.language, shown.strokes,
         p_signed_at, actor
    from private.walk_in_blocks_shown(actor_org, p_block_signatures) shown;
  -- They wait with the walk-in too, with the text as she read it.
  insert into public.walk_in_consents (
    walk_in_id, org_id, consent_id, consent_key, granted, required, screen_key, wording, language,
    decided_at, recorded_by)
  select p_id, actor_org, shown.consent_id, shown.consent_key, shown.granted, shown.required,
         shown.screen_key, shown.wording, shown.language, p_signed_at, actor
    from private.onboarding_consents_shown(actor_org, p_consents, p_payload ->> 'language', null) shown
  on conflict (walk_in_id, consent_id) do nothing;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'walk_in.submit', 'walk_in_signing', p_id, '{}'::jsonb);
  return p_id;
end;
$$
;

create or replace function private.apply_onboarding_setup(p_document jsonb, p_org_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  season_map jsonb := '{}'::jsonb;
  screen_map jsonb := '{}'::jsonb;
  option_map jsonb := '{}'::jsonb;
  section_map jsonb := '{}'::jsonb;
  field_map jsonb := '{}'::jsonb;
  -- A file of an older version is read as version 3 (RAPP-656).
  document jsonb := private.onboarding_setup_as_version_3(p_document, p_org_id);
  new_field uuid;
  placed_screen text;
  item record;
  option_item record;
  new_id uuid;
  new_screen uuid;
  question_count integer := 0;
  option_ties boolean;
  steps text[];
  legal jsonb := private.onboarding_setup_legal_plan(p_document);
  flow_problem text;
begin
  -- A file with nothing to import is refused, or an empty export could be
  -- imported again and again (pending fix 33).
  if private.onboarding_setup_is_empty(p_document) then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/EMPTY: the file holds no onboarding setup to import';
  end if;

  -- Ids inside the file are unique per type, or references are ambiguous.
  if (select count(*) <> count(distinct s ->> 'id') from jsonb_array_elements(document -> 'screens') s)
     or (select count(*) <> count(distinct s ->> 'id') from jsonb_array_elements(document -> 'seasons') s)
     or (select count(*) <> count(distinct s ->> 'id') from jsonb_array_elements(document -> 'sections') s)
     or (select count(*) <> count(distinct f ->> 'id') from jsonb_array_elements(document -> 'fields') f)
     or (select count(*) <> count(distinct o ->> 'id')
           from jsonb_array_elements(document -> 'fields') f, jsonb_array_elements(f -> 'options') o)
  then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: an id appears twice';
  end if;

  -- Seasons.
  for item in select value from jsonb_array_elements(p_document -> 'seasons') loop
    insert into public.seasons (org_id, name, starts_on, is_current)
    values (p_org_id, item.value ->> 'name', (item.value ->> 'starts_on')::date,
            coalesce((item.value ->> 'is_current')::boolean, false))
    returning id into new_id;
    season_map := season_map || jsonb_build_object(item.value ->> 'id', new_id);
  end loop;

  -- Ramassà screens. Fields reach them through placements, below.
  for item in select value, ordinality from jsonb_array_elements(document -> 'screens') with ordinality loop
    insert into public.intake_screens (
      org_id, title, intro, after_screen, sort_order, home_after_screen, home_sort_order, is_archived,
      created_at, updated_at)
    values (
      p_org_id, item.value -> 'title', private.json_value_or_null(item.value -> 'intro'),
      item.value ->> 'after_screen', (item.value ->> 'sort_order')::integer,
      coalesce(item.value ->> 'home_after_screen', item.value ->> 'after_screen'),
      coalesce((item.value ->> 'home_sort_order')::integer, (item.value ->> 'sort_order')::integer),
      coalesce((item.value ->> 'is_archived')::boolean, false),
      now() + item.ordinality * interval '1 microsecond', now())
    returning id into new_screen;
    screen_map := screen_map || jsonb_build_object(item.value ->> 'id', new_screen);
  end loop;

  -- The profile layout (RAPP-649): built-in sections and fields by their key,
  -- the others new; then where each is asked; then conditions.
  for item in select value from jsonb_array_elements(document -> 'sections') loop
    new_id := null;
    if coalesce((item.value ->> 'is_builtin')::boolean, false) then
      update public.profile_sections
         set title = item.value -> 'title', sort_order = (item.value ->> 'sort_order')::integer, updated_at = now()
       where org_id = p_org_id and key = item.value ->> 'key' and is_builtin
      returning id into new_id;
    end if;
    if new_id is null then
      new_id := gen_random_uuid();
      insert into public.profile_sections (id, org_id, key, title, sort_order)
      values (new_id, p_org_id, 'custom_' || replace(new_id::text, '-', ''), item.value -> 'title',
              (item.value ->> 'sort_order')::integer);
    end if;
    section_map := section_map || jsonb_build_object(item.value ->> 'id', new_id);
  end loop;

  for item in select value, ordinality from jsonb_array_elements(document -> 'fields') with ordinality loop
    if section_map ->> (item.value ->> 'section_id') is null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a question names a section that is not in the file';
    end if;
    if item.value ->> 'kind' = 'builtin' then
      update public.profile_fields
         set label = item.value -> 'label', help = private.json_value_or_null(item.value -> 'help'),
             section_id = (section_map ->> (item.value ->> 'section_id'))::uuid,
             sort_order = (item.value ->> 'sort_order')::integer, updated_at = now()
       where org_id = p_org_id and system_key = private.setup_system_key(item.value)
      returning id into new_field;
      if new_field is null then
        raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: an app question this app does not know';
      end if;
      -- Its options are the app's: a condition in the file finds them by key.
      for option_item in select value from jsonb_array_elements(item.value -> 'options') loop
        select o.id into new_id from public.custom_question_options o
         where o.question_id = new_field and o.key = option_item.value ->> 'key';
        if new_id is not null then
          option_map := option_map || jsonb_build_object(option_item.value ->> 'id', new_id);
        end if;
      end loop;
    else
      question_count := question_count + 1;
      insert into public.profile_fields (
        org_id, section_id, kind, question_type, label, help, privacy, default_required, settings,
        sort_order, created_by, is_archived, created_at, updated_at)
      values (
        p_org_id, (section_map ->> (item.value ->> 'section_id'))::uuid, 'custom', item.value ->> 'question_type',
        item.value -> 'label', private.json_value_or_null(item.value -> 'help'), item.value ->> 'privacy',
        coalesce((item.value ->> 'default_required')::boolean, false),
        coalesce(private.json_value_or_null(item.value -> 'settings'), '{}'::jsonb),
        (item.value ->> 'sort_order')::integer,
        p_actor, coalesce((item.value ->> 'is_archived')::boolean, false),
        now() + question_count * interval '1 microsecond', now())
      returning id into new_field;
      select count(*) <> count(distinct o ->> 'sort_order') into option_ties
        from jsonb_array_elements(item.value -> 'options') o;
      for option_item in select value, ordinality from jsonb_array_elements(item.value -> 'options') with ordinality loop
        insert into public.custom_question_options (org_id, question_id, label, sort_order, is_archived)
        values (p_org_id, new_field, option_item.value -> 'label',
                case when option_ties then option_item.ordinality::integer - 1
                     else (option_item.value ->> 'sort_order')::integer end,
                coalesce((option_item.value ->> 'is_archived')::boolean, false))
        returning id into new_id;
        option_map := option_map || jsonb_build_object(option_item.value ->> 'id', new_id);
      end loop;
    end if;
    field_map := field_map || jsonb_build_object(item.value ->> 'id', new_field);
  end loop;

  -- The built-in fields the file names are placed as the file says. A file
  -- converted from version 1 names none, so theirs stay as they are.
  -- The parts of a split field go with their first part, and the parts shown
  -- on a condition go first, so no condition is left without its field.
  delete from public.field_placements p
   using public.profile_fields f
   where f.id = p.field_id and f.org_id = p_org_id and f.kind = 'builtin'
     and f.show_when_field_id is not null
     and private.question_system_key(private.system_key_question(f.system_key))
         in (select private.question_system_key(private.system_key_question(private.setup_system_key(b)))
               from jsonb_array_elements(document -> 'fields') b where b ->> 'kind' = 'builtin');
  delete from public.field_placements p
   using public.profile_fields f
   where f.id = p.field_id and f.org_id = p_org_id and f.kind = 'builtin'
     and private.question_system_key(private.system_key_question(f.system_key))
         in (select private.question_system_key(private.system_key_question(private.setup_system_key(b)))
               from jsonb_array_elements(document -> 'fields') b where b ->> 'kind' = 'builtin');
  for item in select value from jsonb_array_elements(document -> 'placements') loop
    if field_map ->> (item.value ->> 'field_id') is null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a placement names a question that is not in the file';
    end if;
    placed_screen := private.json_value_or_null(item.value -> 'screen_key') #>> '{}';
    if private.is_uuid_text(placed_screen) then
      placed_screen := screen_map ->> placed_screen;
      if placed_screen is null then
        raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a placement names a screen that is not in the file';
      end if;
    end if;
    insert into public.field_placements (
      org_id, field_id, surface, screen_key, sort_order, required, label_override, help_override)
    values (
      p_org_id, (field_map ->> (item.value ->> 'field_id'))::uuid, item.value ->> 'surface', placed_screen,
      (item.value ->> 'sort_order')::integer, coalesce((item.value ->> 'required')::boolean, false),
      private.json_value_or_null(item.value -> 'label_override'),
      private.json_value_or_null(item.value -> 'help_override'));
  end loop;
  -- The signature blocks (RAPP-690), each on its screen; an older file has none.
  for item in select value from jsonb_array_elements(private.json_array_or_empty(p_document -> 'signature_blocks')) loop
    placed_screen := private.json_value_or_null(item.value -> 'screen_key') #>> '{}';
    if private.is_uuid_text(placed_screen) then
      placed_screen := screen_map ->> placed_screen;
      if placed_screen is null then
        raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a signature block names a screen that is not in the file';
      end if;
    end if;
    insert into public.form_blocks (org_id, surface, screen_key, kind, body, sort_order)
    values (p_org_id, item.value ->> 'surface', placed_screen, 'signature', item.value -> 'body',
            coalesce((item.value ->> 'sort_order')::integer, 0));
  end loop;
  -- Dades legals (RAPP-699); an older file has none. A system consent takes
  -- the file's wording by key; a staff consent is made by key, or takes the
  -- file's wording when the key exists.
  for item in select value from jsonb_array_elements(private.json_array_or_empty(p_document -> 'consents')) loop
    insert into public.consents (org_id, key, system_key, name, body, is_archived, created_by)
    values (p_org_id, item.value ->> 'key',
            case when item.value ->> 'key' = any (private.system_consent_keys()) then item.value ->> 'key' end,
            item.value -> 'name', item.value -> 'body', coalesce((item.value ->> 'is_archived')::boolean, false),
            case when item.value ->> 'key' = any (private.system_consent_keys()) then null else p_actor end)
    on conflict (org_id, key) do update
      set name = excluded.name, body = excluded.body, is_archived = excluded.is_archived, updated_at = now();
  end loop;
  for item in select value from jsonb_array_elements(private.json_array_or_empty(p_document -> 'consent_placements')) loop
    placed_screen := item.value ->> 'screen_key';
    if private.is_uuid_text(placed_screen) then
      placed_screen := screen_map ->> placed_screen;
      if placed_screen is null then
        raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a consent names a screen that is not in the file';
      end if;
    end if;
    select id into new_id from public.consents
     where org_id = p_org_id and key = item.value ->> 'consent_key' and not is_archived;
    if new_id is null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a consent placement names a consent that is not in the file';
    end if;
    insert into public.consent_placements (org_id, consent_id, surface, screen_key, sort_order, required)
    values (p_org_id, new_id, 'onboarding', placed_screen, coalesce((item.value ->> 'sort_order')::integer, 0),
            coalesce((item.value ->> 'required')::boolean, false)
              and item.value ->> 'consent_key' <> 'image_rights')
    on conflict (consent_id, surface) do nothing;
  end loop;
  -- A file from before the split places the first parts only.
  perform private.place_system_field_parts(p_org_id);

  for item in
    select value from jsonb_array_elements(document -> 'fields')
     where private.json_value_or_null(value -> 'show_when_field_id') is not null
  loop
    if field_map ->> (item.value ->> 'show_when_field_id') is null
       or option_map ->> (item.value ->> 'show_when_option_id') is null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a condition names a question or option that is not in the file';
    end if;
    update public.profile_fields
       set show_when_field_id = (field_map ->> (item.value ->> 'show_when_field_id'))::uuid,
           show_when_option_id = (option_map ->> (item.value ->> 'show_when_option_id'))::uuid
     where id = (field_map ->> (item.value ->> 'id'))::uuid;
  end loop;

  -- An older file's required list, then its wording, hiding and option
  -- changes of the app's questions, land on their fields and placements
  -- (RAPP-666). A hide counts only while the question is optional.
  for item in select value from jsonb_array_elements(p_document -> 'required_questions') loop
    if not (item.value ->> 'question' = any (private.wizard_intake_questions())) then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a required question this app does not know';
    end if;
    if jsonb_typeof(item.value -> 'is_required') is distinct from 'boolean' then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: the file is incomplete or damaged';
    end if;
    continue when item.value ->> 'question' = any (private.locked_required_intake_questions());
    perform private.set_app_question_required(p_org_id, item.value ->> 'question', (item.value ->> 'is_required')::boolean);
  end loop;
  for item in select value from jsonb_array_elements(p_document -> 'builtin_question_overrides') loop
    if not (item.value ->> 'question' = any (private.wizard_intake_questions())) then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a change to an app question this app does not know';
    end if;
    perform private.fold_app_option_overrides(
      p_org_id, item.value ->> 'question', private.json_value_or_null(item.value -> 'option_overrides'));
    if coalesce((item.value ->> 'is_hidden')::boolean, false)
       and not (item.value ->> 'question' = any (private.required_intake_questions(p_org_id))) then
      perform private.set_app_question_hidden(p_org_id, item.value ->> 'question', true);
    end if;
    perform private.set_app_question_wording(
      p_org_id, item.value ->> 'question',
      private.json_value_or_null(item.value -> 'label'), private.json_value_or_null(item.value -> 'help'));
  end loop;

  -- The app screens' wording.
  insert into public.intake_builtin_screens (org_id, screen, texts, is_hidden, updated_by)
  select p_org_id, b ->> 'screen', coalesce(private.json_value_or_null(b -> 'texts'), '{}'::jsonb),
         coalesce((b ->> 'is_hidden')::boolean, false), p_actor
    from jsonb_array_elements(p_document -> 'builtin_screens') b;

  -- The flow order, staff screens remapped.
  if jsonb_typeof(document -> 'flow_order') = 'array' then
    select array_agg(
             case when step.value like 'custom:%' then 'custom:' || (screen_map ->> substr(step.value, 8))
                  else step.value end
             order by step.ordinality)
      into steps
      from jsonb_array_elements_text(document -> 'flow_order') with ordinality as step(value, ordinality);
    -- The same checks as save_intake_flow_order (pending fix 31), on the
    -- screens just created with the file's archived flags.
    flow_problem := private.intake_flow_order_problem(p_org_id, coalesce(steps, array[]::text[]));
    if flow_problem is not null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: ' || case flow_problem
        when 'too_many' then 'the flow order has more than 200 steps'
        when 'repeated' then 'the flow order names a step twice'
        when 'fixed_end' then 'the summary, the terms and the authorization always end the onboarding'
        when 'archived_screen' then 'the flow order names an archived screen'
        else 'the flow order names a step that is not in the file' end;
    end if;
    if cardinality(steps) > 0 then
      insert into public.intake_flow_orders (org_id, step_order, updated_by) values (p_org_id, steps, p_actor);
    end if;
  end if;

  -- Presets and the document step note.
  if exists (
    select 1 from jsonb_array_elements(p_document -> 'presets') p
     where jsonb_typeof(p -> 'states') is distinct from 'object'
        or exists (select 1 from jsonb_each_text(p -> 'states') entry
                    where not (entry.key = any (private.wizard_intake_questions()))
                       or entry.value not in ('ask', 'skip'))
  ) then
    raise check_violation using message = 'ONBOARDING_SETUP/MALFORMED: a preset sets ask or skip on wizard questions';
  end if;
  insert into public.intake_state_presets (org_id, name, states, created_by)
  select p_org_id, btrim(p ->> 'name'), p -> 'states', p_actor
    from jsonb_array_elements(p_document -> 'presets') p;

  update public.organizations
     set document_step_explanation = private.json_value_or_null(p_document -> 'document_step_explanation')
   where id = p_org_id;

  -- The legal texts: drafts only, through the draft functions that validate them.
  if (legal -> 'app_terms' ->> 'imported')::boolean then
    perform public.save_app_terms_draft(legal -> 'app_terms' -> 'content');
  end if;
  if (legal -> 'authorization' ->> 'imported')::boolean then
    perform public.save_authorization_draft(legal -> 'authorization' -> 'content');
  end if;

  return jsonb_build_object(
    'counts', private.onboarding_setup_import_counts(p_document),
    'legal', jsonb_build_object(
      'app_terms', (legal -> 'app_terms') - 'content',
      'authorization', (legal -> 'authorization') - 'content'));
end;
$$
;

create or replace function private.check_onboarding_setup_document(p_document jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $$
begin
  if p_document is null or jsonb_typeof(p_document) <> 'object'
     or p_document ->> 'format' is distinct from 'ramassa.onboarding-setup' then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/NOT_A_SETUP: this file is not an onboarding setup export';
  end if;
  -- "1" as a string is not version 1 of something else (pending fix 33).
  if jsonb_typeof(p_document -> 'schema_version') is distinct from 'number' then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: schema_version must be the number 1, 2 or 3';
  end if;
  -- Version 3 carries the profile layout alone (RAPP-656); 1 and 2 still import.
  if (p_document ->> 'schema_version') not in ('1', '2', '3') then
    raise invalid_parameter_value using message = format(
      'ONBOARDING_SETUP/UNKNOWN_SCHEMA_VERSION: this file uses onboarding setup schema version %s; this app reads versions 1, 2 and 3. Export it again from an app at the same version.',
      coalesce(p_document ->> 'schema_version', 'none'));
  end if;
  if octet_length(p_document::text) > 5000000 then
    raise program_limit_exceeded using message = 'ONBOARDING_SETUP/TOO_LARGE: the file is larger than 5 MB';
  end if;
  if jsonb_typeof(p_document -> 'screens') is distinct from 'array'
     or jsonb_typeof(p_document -> 'builtin_question_overrides') is distinct from 'array'
     or jsonb_typeof(p_document -> 'builtin_screens') is distinct from 'array'
     or jsonb_typeof(p_document -> 'required_questions') is distinct from 'array'
     or jsonb_typeof(p_document -> 'presets') is distinct from 'array'
     or jsonb_typeof(p_document -> 'seasons') is distinct from 'array'
     or jsonb_typeof(p_document -> 'flow_order') not in ('array', 'null')
     or jsonb_typeof(p_document -> 'app_terms') is distinct from 'object'
     or jsonb_typeof(p_document -> 'app_terms' -> 'published') is distinct from 'array'
     or jsonb_typeof(p_document -> 'authorization') is distinct from 'object'
     or jsonb_typeof(p_document -> 'authorization' -> 'published') is distinct from 'array'
     -- The signature blocks (RAPP-690): absent in an older file.
     or jsonb_typeof(p_document -> 'signature_blocks') not in ('array', 'null')
     or exists (select 1 from jsonb_array_elements(private.json_array_or_empty(p_document -> 'signature_blocks')) b
                 where jsonb_typeof(b) <> 'object')
     -- Dades legals (RAPP-699): absent in an older file.
     or jsonb_typeof(p_document -> 'consents') not in ('array', 'null')
     or jsonb_typeof(p_document -> 'consent_placements') not in ('array', 'null')
     or exists (select 1 from jsonb_array_elements(private.json_array_or_empty(p_document -> 'consents')) c
                 where jsonb_typeof(c) <> 'object'
                    or coalesce(c ->> 'key', '') !~ '^[a-z][a-z0-9_]{0,39}$'
                    or not private.catalan_text_valid(c -> 'name')
                    or not private.catalan_text_valid(c -> 'body'))
     or exists (select 1 from jsonb_array_elements(private.json_array_or_empty(p_document -> 'consent_placements')) p
                 where jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 'screen_key') <> 'string')
     or exists (select 1 from jsonb_array_elements(p_document -> 'screens') s where jsonb_typeof(s) <> 'object')
     or ((p_document ->> 'schema_version') = '1'
         and exists (select 1 from jsonb_array_elements(p_document -> 'screens') s
                      where jsonb_typeof(s -> 'questions') is distinct from 'array'
                         or exists (select 1 from jsonb_array_elements(s -> 'questions') q
                                     where jsonb_typeof(q) <> 'object'
                                        or jsonb_typeof(q -> 'options') is distinct from 'array')))
     or ((p_document ->> 'schema_version') in ('2', '3') and (
           jsonb_typeof(p_document -> 'sections') is distinct from 'array'
           or jsonb_typeof(p_document -> 'fields') is distinct from 'array'
           or jsonb_typeof(p_document -> 'placements') is distinct from 'array'
           or exists (select 1 from jsonb_array_elements(p_document -> 'fields') f
                       where jsonb_typeof(f) <> 'object' or jsonb_typeof(f -> 'options') is distinct from 'array')
           or exists (select 1 from jsonb_array_elements(p_document -> 'placements') p
                       where jsonb_typeof(p) <> 'object')))
  then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: the file is incomplete or damaged';
  end if;
  if (select count(*) filter (where (s ->> 'is_current')::boolean)
        from jsonb_array_elements(p_document -> 'seasons') s) > 1 then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: more than one current season';
  end if;
end;
$$
;

create or replace function public.export_onboarding_setup(p_app_commit text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  document jsonb;
begin
  if not (select private.can_design_onboarding()) or actor_org is null then
    raise insufficient_privilege using message = 'exporting the onboarding setup needs settings.organization or onboarding.design';
  end if;
  if p_app_commit is not null and p_app_commit !~ '^[0-9A-Za-z._-]{1,64}$' then
    raise check_violation using message = 'the app commit is a short version name';
  end if;

  document := jsonb_build_object(
    'format', 'ramassa.onboarding-setup',
    'schema_version', 3,
    'app_commit', p_app_commit,
    'exported_at', now(),
    -- The profile layout (RAPP-649): sections, every field with its options, and
    -- where each is asked. Version 3 (RAPP-656) carries nothing else about them.
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'key', s.key, 'title', s.title, 'sort_order', s.sort_order, 'is_builtin', s.is_builtin)
        order by s.sort_order, s.created_at, s.id)
        from public.profile_sections s where s.org_id = actor_org), '[]'::jsonb),
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'section_id', f.section_id, 'kind', f.kind, 'system_key', f.system_key,
        'question_type', f.question_type, 'label', f.label, 'help', f.help, 'privacy', f.privacy,
        'default_required', f.default_required, 'settings', f.settings,
        'show_when_field_id', f.show_when_field_id, 'show_when_option_id', f.show_when_option_id,
        'sort_order', f.sort_order, 'is_archived', f.is_archived,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'key', o.key, 'label', o.label, 'sort_order', o.sort_order, 'is_archived', o.is_archived)
            order by o.sort_order, o.id)
            from public.custom_question_options o where o.question_id = f.id), '[]'::jsonb))
        -- The app's fields by key, then Ramassà's in their order: the same
        -- setup always gives the same file.
        order by f.kind, f.system_key, f.sort_order, f.created_at, f.id)
        from public.profile_fields f
       where f.org_id = actor_org
         and not coalesce(f.system_key = any (private.authorization_field_keys()), false)), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'field_id', p.field_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'sort_order', p.sort_order, 'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.surface, p.screen_key, p.sort_order, coalesce(f.system_key, f.id::text))
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id
       where p.org_id = actor_org and p.surface <> 'authorization'), '[]'::jsonb),
    -- Ramassà screens, in the order of their anchors.
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'intro', s.intro,
        'after_screen', s.after_screen, 'sort_order', s.sort_order,
        'home_after_screen', s.home_after_screen, 'home_sort_order', s.home_sort_order,
        'is_archived', s.is_archived)
        order by array_position(private.intake_builtin_screens(), s.after_screen), s.sort_order, s.created_at, s.id)
        from public.intake_screens s where s.org_id = actor_org), '[]'::jsonb),
    -- The placements above carry the wording, the hiding and the required
    -- flag of the app's questions (RAPP-666). The two lists stay in the file,
    -- empty, so it is still a version 3 file; an older file may fill them.
    'builtin_question_overrides', '[]'::jsonb,
    'builtin_screens', coalesce((
      select jsonb_agg(jsonb_build_object('screen', b.screen, 'texts', b.texts, 'is_hidden', b.is_hidden)
        order by b.screen)
        from public.intake_builtin_screens b where b.org_id = actor_org), '[]'::jsonb),
    'flow_order', (select to_jsonb(f.step_order) from public.intake_flow_orders f where f.org_id = actor_org),
    'required_questions', '[]'::jsonb,
    'presets', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.name, 'states', p.states) order by p.name, p.id)
        from public.intake_state_presets p where p.org_id = actor_org), '[]'::jsonb),
    'document_step_explanation', (
      select o.document_step_explanation from public.organizations o where o.id = actor_org),
    'app_terms', jsonb_build_object(
      'published', coalesce((
        select jsonb_agg(jsonb_build_object(
          'version_number', v.version_number, 'published_at', v.published_at, 'content', v.content)
          order by v.version_number)
          from public.app_terms_versions v where v.org_id = actor_org and v.published_at is not null), '[]'::jsonb),
      'draft', (
        select jsonb_build_object('content', v.content)
          from public.app_terms_versions v where v.org_id = actor_org and v.published_at is null)),
    -- Real seasons only: a test fixture season is never moved.
    'seasons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'starts_on', s.starts_on, 'is_current', s.is_current)
        order by s.starts_on, s.name)
        from public.seasons s where s.org_id = actor_org and not s.is_test_fixture), '[]'::jsonb),
    'authorization', jsonb_build_object(
      'published', coalesce((
        select jsonb_agg(jsonb_build_object(
          'season_id', v.season_id, 'version_number', v.version_number,
          'published_at', v.published_at, 'content', v.content)
          order by s.starts_on, v.version_number)
          from public.authorization_versions v
          join public.seasons s on s.id = v.season_id and not s.is_test_fixture
         where v.org_id = actor_org and v.published_at is not null), '[]'::jsonb),
      'draft', (
        select jsonb_build_object('content', v.content)
          from public.authorization_versions v where v.org_id = actor_org and v.published_at is null)),
    -- The signature blocks (RAPP-690), in the order they share with the placements.
    'signature_blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'surface', b.surface, 'screen_key', b.screen_key, 'body', b.body, 'sort_order', b.sort_order)
        order by b.surface, b.screen_key, b.sort_order, b.created_at, b.id)
        from public.form_blocks b where b.org_id = actor_org), '[]'::jsonb),
    -- Dades legals (RAPP-699): every consent by key, the system ones with
    -- their wording, and where each is asked on Onboarding. The
    -- authorization's consents travel in its draft.
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', c.key, 'system_key', c.system_key, 'name', c.name, 'body', c.body,
        'is_archived', c.is_archived)
        order by c.key)
        from public.consents c where c.org_id = actor_org), '[]'::jsonb),
    'consent_placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'consent_key', c.key, 'screen_key', p.screen_key, 'sort_order', p.sort_order,
        'required', p.required)
        order by p.screen_key, p.sort_order, c.key)
        from public.consent_placements p
        join public.consents c on c.id = p.consent_id
       where p.org_id = actor_org and p.surface = 'onboarding'), '[]'::jsonb)
  );

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'onboarding.export', 'organization', actor_org,
          jsonb_build_object('schema_version', 3, 'app_commit', p_app_commit,
                             'counts', private.onboarding_setup_counts(document)));
  return document;
end;
$$
;
create or replace function public.complete_onboarding_review(payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  caller uuid := (select auth.uid());
  her public.profiles;
  pending text[];
  answers jsonb := coalesce(nullif(payload -> 'answers', 'null'::jsonb), '{}'::jsonb);
  first_name_value text := nullif(private.name_trim(payload ->> 'first_name'), '');
  last_name_value text := nullif(private.name_trim(payload ->> 'last_name'), '');
  missing uuid[];
begin
  select * into her from public.profiles where id = caller for update;
  if her.id is null or her.role <> 'player' then
    raise insufficient_privilege using message = 'reviewing the onboarding is for a player who joined';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object'
     or payload - array['first_name', 'last_name', 'answers', 'signatures', 'consents'] <> '{}'::jsonb then
    raise invalid_parameter_value
      using message = 'complete_onboarding_review takes her names, her answers by field and her signatures';
  end if;
  pending := private.onboarding_review_screens(caller);

  -- Her names, when the review asked them; one left empty keeps what is stored.
  if first_name_value is not null or last_name_value is not null then
    update public.profiles
       set first_name = coalesce(first_name_value, first_name),
           last_name = coalesce(last_name_value, last_name),
           updated_at = now()
     where id = caller;
  end if;
  -- Her answers by field, through the Onboarding writer.
  perform private.write_field_answers(caller, answers, 'player', null, true);
  perform private.apply_document_rule(caller, true, true);
  perform private.save_form_signatures(
    her.org_id, 'wizard', caller, null, caller,
    concat_ws(' ', private.name_answer_text(caller, 'first_name'), private.name_answer_text(caller, 'last_name')),
    payload -> 'signatures');

  -- Her ticks of the consents on the screens she reviews (RAPP-699): a tick
  -- she changed is a new decision, one she left as it was records nothing.
  perform private.record_onboarding_consents(caller, payload -> 'consents', her.preferred_language, pending, true);

  -- Every required field on a screen she reviews has an answer.
  select coalesce(array_agg(m.id), array[]::uuid[]) into missing
    from unnest(private.missing_required_custom_answers(caller, 'wizard')) m(id)
   where exists (select 1 from public.field_placements pl
                  where pl.field_id = m.id and pl.surface = 'onboarding'
                    and pl.screen_key = any (pending));
  if cardinality(missing) > 0 then
    raise not_null_violation using message = 'complete_onboarding_review requires an answer to a required question';
  end if;
  -- Every signature block on a screen she reviews is signed as it reads now.
  if exists (
    select 1 from public.form_blocks b
     where b.org_id = her.org_id and b.surface = 'onboarding'
       and b.screen_key = any (pending)
       and not exists (
         select 1 from public.form_signatures g
          where g.block_id = b.id and g.profile_id = caller
            and g.body = b.body ->> g.language)
  ) then
    raise not_null_violation using message = 'complete_onboarding_review requires her signature on every signature block';
  end if;

  update public.profiles set onboarding_current_at = now(), updated_at = now() where id = caller;
end;
$$
;



revoke all on function public.submit_walk_in_signing(uuid, text, text, uuid, jsonb, timestamptz, jsonb, jsonb) from public, anon;
grant execute on function public.submit_walk_in_signing(uuid, text, text, uuid, jsonb, timestamptz, jsonb, jsonb) to authenticated;

-- 4. The registry -----------------------------------------------------------------------------------------

create or replace function public.personal_data_disposition()
 RETURNS TABLE(table_name text, participant_column text, disposition text, reason text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $$
  select * from (values
    ('app_terms_signatures', 'profile_id', 'purge', 'The app terms signature and photo/video choice.'),
    ('profiles', 'id', 'purge', 'The participant profile and its encrypted fields.'),
    ('participant_notes', 'profile_id', 'purge', 'Staff prose about the participant.'),
    ('push_tokens', 'user_id', 'purge', 'Registered participant devices.'),
    ('push_deliveries', 'recipient_id', 'purge', 'Per-device notification delivery history.'),
    ('custom_notification_group_members', 'participant_id', 'purge', 'Curated notification membership.'),
    ('terms_acceptances', 'profile_id', 'purge', 'Participant consent records.'),
    ('deletion_requests', 'profile_id', 'purge', 'Participant erasure requests.'),
    ('invites', 'accepted_by', 'purge', 'The invitation that admitted the participant.'),
    ('entity_invitations', 'profile_id', 'purge', 'The invitation that admitted an entity collaborator.'),
    ('equipment_deliveries', 'profile_id', 'purge', 'Participant equipment history.'),
    ('event_signups', 'player_id', 'purge', 'Participant event activity.'),
    ('attendance', 'player_id', 'purge', 'Participant attendance history.'),
    ('service_interests', 'user_id', 'purge', 'Participant service interests.'),
    ('conversations', 'user_id', 'purge', 'Participant direct correspondence.'),
    ('messages', 'sender_id', 'purge', 'Participant-authored messages.'),
    ('conversation_read_states', 'user_id', 'purge', 'Participant message read history.'),
    ('conversation_assignment_history', 'user_id', 'purge', 'Participant conversation handling history.'),
    ('forum_posts', 'author_id', 'purge', 'Participant-authored forum posts.'),
    ('forum_replies', 'author_id', 'purge', 'Participant-authored forum replies.'),
    ('forum_flags', 'flagger_id', 'purge', 'Participant safety reports and optional comments.'),
    ('media_items', 'uploaded_by', 'purge', 'Participant gallery media and its consent record.'),
    ('entity_referrals', 'referred_profile_id', 'purge', 'Referral intake cascades with the linked participant.'),
    ('referral_updates', 'author_id', 'purge', 'Referral updates authored by the participant.'),
    ('mentoring_requests', 'player_id', 'purge', 'Private support requests belonging to the player.'),
    ('mentoring_notification_events', 'recipient_id', 'purge', 'Technical mentoring schedule notifications.'),
    ('feedback_submissions', 'author_id', 'purge', 'Encrypted feedback and its private attachment key.'),
    ('survey_responses', 'player_id', 'purge', 'Attributed encrypted survey responses.'),
    ('audit_log', 'actor_id', 'purge', 'Rows where the participant acted.'),
    ('audit_log', 'target_id', 'retain', 'Opaque lawful-access and erasure record.'),
    ('entity_referrals', null, 'retain_limited', 'Unlinked referral intake is purged after 24 months.'),
    ('entity_invitations', null, 'retain_limited', 'Expired entity invitations are purged after 24 months.'),
    ('notification_templates', null, 'not_personal', 'Organization-owned notification copy.'),
    ('custom_notification_groups', null, 'not_personal', 'Organization-owned audience definitions.'),
    ('targeted_notification_sends', null, 'not_personal', 'Aggregate organization send history.'),
    ('surveys', null, 'not_personal', 'Organization-owned survey definitions.'),
    ('survey_questions', null, 'not_personal', 'Organization-owned survey questions.'),
    ('staff_invitations', null, 'not_personal', 'Organization staff access administration history.'),
    ('internal_documents', null, 'not_personal', 'Organization-owned private operational documents.'),
    ('announcements', null, 'not_personal', 'Organization-owned operational content.'),
    ('event_categories', null, 'not_personal', 'Organization-owned event vocabulary.'),
    ('events', null, 'not_personal', 'Organization-owned schedules.'),
    ('event_occurrences', null, 'not_personal', 'Materialized organization schedules.'),
    ('knowledge_categories', null, 'not_personal', 'Organization-owned knowledge vocabulary.'),
    ('knowledge_articles', 'author_id', 'purge', 'Participant-authored knowledge stories.'),
    ('push_publications', 'recipient_id', 'purge', 'Recipient-specific push publications.'),
    ('service_categories', null, 'not_personal', 'Organization-owned service vocabulary.'),
    ('services', null, 'not_personal', 'Organization-owned directory content.'),
    ('service_images', null, 'not_personal', 'Organization-owned service media.'),
    ('service_submission_comments', null, 'not_personal', 'Organization review correspondence.'),
    ('service_submission_notifications', null, 'not_personal', 'Organization staff queue.'),
    ('forum_categories', null, 'not_personal', 'Organization-owned forum vocabulary.'),
    ('collaborating_entities', null, 'not_personal', 'A tenant-owned partner organization.'),
    ('organizations', null, 'not_personal', 'A tenant, not a person.'),
    ('municipality_catalog', null, 'not_personal', 'Official geography with no participant data.'),
    ('permissions', null, 'not_personal', 'The product permission catalog.'),
    ('permission_preset_defaults', null, 'not_personal', 'Product default permissions of the built-in presets.'),
    ('permission_presets', null, 'not_personal', 'Organization-owned access presets.'),
    ('permission_preset_permissions', null, 'not_personal', 'Organization-owned access presets.'),
    ('team_member_access', null, 'not_personal', 'Team access administration; players never hold permissions.'),
    ('team_member_permissions', null, 'not_personal', 'Team access administration; players never hold permissions.'),
    ('equipment_item_types', null, 'not_personal', 'The organization''s material catalog.'),
    ('stock_movements', 'participant_id', 'purge', 'Stock movements keep their quantity so stock stays right; her link is cleared by ON DELETE SET NULL.'),
    ('stock_alerts', null, 'not_personal', 'Stock that went below zero, for the team to count.'),
    ('equipment_arrivals', null, 'not_personal', 'Goods received: source, problems and cost. No participant data.'),
    ('equipment_arrival_photos', null, 'not_personal', 'Photos of goods received and their receipts.'),
    ('stock_counts', null, 'not_personal', 'Stock counts: what was expected and what was on the shelf.'),
    ('staff_checkouts', null, 'not_personal', 'Material lent to a staff member for a trip or an event.'),
    ('photo_handoffs', null, 'not_personal', 'A staff member''s request to take a document photo with the phone.'),
    ('seasons', null, 'not_personal', 'The organization''s seasons.'),
    ('authorization_versions', null, 'not_personal', 'The organization''s published authorization texts.'),
    ('app_terms_versions', null, 'not_personal', 'The organization''s app terms texts, draft and published.'),
    ('authorization_signatures', 'profile_id', 'purge', 'Her signed or paper authorizations, with her drawn signature.'),
    ('consent_events', 'profile_id', 'purge', 'Each consent she gave or withdrew, with the text she was shown. Anonymizing keeps them as proof without her name and clears a staff reason; deleting her account deletes them.'),
    ('consents', null, 'not_personal', 'The consents of the organization, defined once (Dades legals).'),
    ('consent_placements', null, 'not_personal', 'Where each consent is asked.'),
    ('walk_in_signings', null, 'retain_limited', 'A walk-in''s tablet signing until staff confirm it; purged after 60 days.'),
    ('intake_screens', null, 'not_personal', 'Registration screens staff built.'),
    ('profile_sections', null, 'not_personal', 'Sections of the player profile layout.'),
    ('profile_fields', null, 'not_personal', 'The pieces of information the profile holds, and who created each.'),
    ('field_placements', null, 'not_personal', 'Where each piece of information is asked.'),
    ('form_blocks', null, 'not_personal', 'The signature blocks of the forms and the text each asks to accept.'),
    ('form_signatures', 'profile_id', 'purge', 'Her signatures of the form blocks, and the entity''s for her on a referral, with the strokes.'),
    ('walk_in_consents', null, 'retain_limited', 'A walk-in''s ticks of the Onboarding consents on the tablet until staff confirm her; moved to her consent history then, or purged with the walk-in.'),
    ('walk_in_form_signatures', null, 'retain_limited', 'A walk-in''s signatures of the Onboarding blocks until staff confirm her; moved to her profile then, or purged with the walk-in.'),
    ('custom_question_options', null, 'not_personal', 'Options of those questions.'),
    ('intake_builtin_screens', null, 'not_personal', 'Staff wording of the built-in onboarding screens and which are hidden.'),
    ('intake_flow_orders', null, 'not_personal', 'The order of the onboarding screens staff arranged.'),
    ('intake_state_presets', null, 'not_personal', 'Organization presets for which questions are asked.'),
    ('custom_answers', 'profile_id', 'purge', 'Every answer of her record, the app''s fields and the team''s. Anonymizing deletes them all and keeps only her birth year.'),
    ('referral_custom_answers', null, 'retain_limited', 'Extra answers sent with a referral; moved to her profile when she is invited, or purged with the referral.'),
    ('custom_question_states', 'profile_id', 'purge', 'Which fields staff chose to ask or not ask her, the app''s and the team''s.'),
    ('participant_search_documents', 'profile_id', 'purge', 'Her names and her Normal and Personal text answers, indexed for the participants search.'),
    ('staff_notifications', null, 'not_personal', 'The team''s bell: one row per team member; names render live from the source row and params hold no personal value.'),
    ('onboarding_screen_versions', null, 'not_personal', 'Which Onboarding screens were saved as a new version, and when.')
  ) as disposition(table_name, participant_column, disposition, reason);
$$
;


