-- The signature is a block of the form builders; the consent type goes (RAPP-690).
--
-- WHY
--
-- Fabián, 2026-10-26: a signature is no data about her. It is the act of
-- agreeing to a text inside a given form, so it belongs to the form builders
-- (the Onboarding screens and the entity form). This replaces RAPP-671, which
-- merged the signature into a consent answer type with a `requires_signature`
-- setting. Dades de les jugadores keeps only real data: a tick the team acts
-- on (contact by WhatsApp) is a yes or no field.
--
-- WHAT THIS MIGRATION DOES
--
--   1. The consent answer type goes. Every consent field becomes a yes or no
--      field with its label; an accepted answer becomes `yes`. A signed answer
--      sets its strokes aside in the audit log (`intake.answer_set_aside`,
--      RAPP-665), encrypted. Staging holds none; the QA seeds hold some.
--      `private.field_is_hers_only` says a file only, as before RAPP-671.
--   2. `public.form_blocks`: a block of a form, today only a signature block.
--      It sits on an Onboarding screen or on the entity form, in the same
--      order as the fields placed there (`reorder_placements` orders both),
--      and holds the text to accept in five languages, Catalan required. It
--      is always required where it sits. Staff edit it through
--      `save_form_block` and `remove_form_block`; every save writes the text
--      to the audit log (`intake.block_save`), which keeps its history.
--      `intake_catalog` returns the blocks. An app screen with a block is
--      never hidden.
--   3. `public.form_signatures`: one signature of one block. The text exactly
--      as shown and its language, who signed (her, or the entity person, with
--      the name), the strokes in the format of the authorization pad, and
--      `signed_at`. Only the two form RPCs write it:
--        - `complete_onboarding_signed` takes `signatures` in its payload, by
--          block id, and refuses her registration while an Onboarding block
--          has no signature of hers;
--        - `create_entity_referral` takes `signatures` the same way and
--          refuses the referral while an entity form block has none.
--      Staff with participants.view_personal read them on her page
--      (`participant_form_signatures`). Erasure deletes them.
--
-- The season authorization signing (`authorization_signatures`, `p_signing`)
-- is a separate flow and is not touched.

-- 1. The consent type goes ----------------------------------------------------------------------------------

-- The consent fields, before they change type.
create temporary table rapp_690_consent_fields as
select f.id, f.org_id, f.settings, f.created_by from public.profile_fields f where f.question_type = 'consent';

-- The text a consent asked her to accept stays in the audit log of the field,
-- named after the team member who created it.
insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
select c.org_id, c.created_by, 'intake.field_change', 'profile_field', c.id,
       jsonb_build_object('from', 'consent', 'to', 'yes_no', 'settings', c.settings)
  from rapp_690_consent_fields c
 where c.created_by is not null;

-- A signed answer: the strokes leave the field, kept encrypted (RAPP-665).
-- Her own answer, so the row names her.
insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
select a.org_id, coalesce(a.answered_by, a.profile_id), 'intake.answer_set_aside', 'profile', a.profile_id,
       jsonb_build_object('field_id', a.question_id, 'season_id', a.season_id, 'type', 'consent',
                          'source', a.source, 'answered_at', a.answered_at,
                          'value_encrypted', encode(public.encrypt_field(plain.value::text), 'base64'))
  from public.custom_answers a
  join rapp_690_consent_fields c on c.id = a.question_id
  cross join lateral (
    select coalesce(a.value, (public.decrypt_field(a.value_encrypted))::jsonb) as value) plain
 where jsonb_typeof(plain.value) = 'object' and plain.value ? 'signature';

update public.profile_fields
   set question_type = 'yes_no', settings = '{}'::jsonb, updated_at = now()
 where id in (select id from rapp_690_consent_fields);

-- An accepted answer is the yes key: a consent was only ever stored accepted.
update public.custom_answers a
   set value = case when a.value is null then null else '"yes"'::jsonb end,
       value_encrypted = case when a.value_encrypted is null then null
                              else public.encrypt_field('"yes"') end
 where a.question_id in (select id from rapp_690_consent_fields);

update public.referral_custom_answers r
   set value_encrypted = public.encrypt_field('"yes"')
 where r.question_id in (select id from rapp_690_consent_fields);

drop table rapp_690_consent_fields;

-- Who answers a field: only she gives a file.
create or replace function private.field_is_hers_only(p_type text, p_settings jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_type = 'file_upload';
$$;
revoke all on function private.field_is_hers_only(text, jsonb) from public, anon, authenticated;

-- The types a field can take: the consent is gone.
create or replace function private.custom_question_types()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['short_text', 'long_text', 'yes_no_maybe', 'single_choice', 'multiple_choice',
               'number', 'date', 'yes_no', 'phone', 'email', 'search_choice', 'item_list',
               'file_upload', 'country', 'municipality']::text[];
$$;

-- Settings by type: no consent text.
create or replace function private.custom_question_settings_valid(p_type text, p_settings jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  low numeric;
  high numeric;
begin
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    return false;
  end if;
  case p_type
    when 'number' then
      if p_settings - array['integer', 'min', 'max'] <> '{}'::jsonb
         or jsonb_typeof(p_settings -> 'integer') is distinct from 'boolean' then
        return false;
      end if;
      if p_settings ? 'min' then
        if jsonb_typeof(p_settings -> 'min') <> 'number' then return false; end if;
        low := (p_settings ->> 'min')::numeric;
        if abs(low) > 1000000000 then return false; end if;
      end if;
      if p_settings ? 'max' then
        if jsonb_typeof(p_settings -> 'max') <> 'number' then return false; end if;
        high := (p_settings ->> 'max')::numeric;
        if abs(high) > 1000000000 then return false; end if;
      end if;
      return low is null or high is null or low <= high;
    when 'date' then
      if p_settings - array['min_age', 'max_age'] <> '{}'::jsonb
         or (p_settings ? 'min_age' and not private.json_int_between(p_settings -> 'min_age', 0, 120))
         or (p_settings ? 'max_age' and not private.json_int_between(p_settings -> 'max_age', 0, 120)) then
        return false;
      end if;
      return not (p_settings ? 'min_age' and p_settings ? 'max_age')
        or (p_settings ->> 'min_age')::integer <= (p_settings ->> 'max_age')::integer;
    when 'item_list' then
      return p_settings - 'max_items' = '{}'::jsonb
        and private.json_int_between(p_settings -> 'max_items', 1, 50);
    when 'file_upload' then
      return p_settings - 'accept' = '{}'::jsonb
        and (p_settings ->> 'accept') in ('photo', 'document')
        and jsonb_typeof(p_settings -> 'accept') = 'string';
    else
      return p_settings = '{}'::jsonb;
  end case;
end;
$$;

-- The answer check: no consent. `customAnswerSchema` in packages/shared
-- states the same rules.
create or replace function private.custom_answer_value_valid(
  p_type text, p_settings jsonb, p_value jsonb, p_live_options text[])
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  kind text := jsonb_typeof(p_value);
  number_value numeric;
  date_value date;
  years integer;
  item text;
  accepted text[];
begin
  if p_value is null then
    return false;
  end if;
  case p_type
    when 'short_text' then
      return kind = 'string' and length(private.js_trim(p_value #>> '{}')) between 1 and 500;
    when 'long_text' then
      return kind = 'string' and length(private.js_trim(p_value #>> '{}')) between 1 and 4000;
    when 'yes_no_maybe' then
      return kind = 'string' and p_value #>> '{}' in ('yes', 'no', 'maybe');
    when 'yes_no' then
      return kind = 'string' and p_value #>> '{}' in ('yes', 'no');
    when 'single_choice', 'search_choice' then
      return kind = 'string' and (p_value #>> '{}') = any (coalesce(p_live_options, '{}'));
    when 'multiple_choice' then
      return kind = 'array' and jsonb_array_length(p_value) > 0
        and not exists (select 1 from jsonb_array_elements(p_value) e where jsonb_typeof(e) <> 'string')
        and (select count(distinct e) from jsonb_array_elements_text(p_value) e) = jsonb_array_length(p_value)
        and not exists (
          select 1 from jsonb_array_elements_text(p_value) e
           where not (e = any (coalesce(p_live_options, '{}'))));
    when 'number' then
      if kind <> 'number' then return false; end if;
      number_value := (p_value #>> '{}')::numeric;
      return abs(number_value) <= 1000000000
        and (not coalesce((p_settings ->> 'integer')::boolean, false) or number_value = trunc(number_value))
        and (not (p_settings ? 'min') or number_value >= (p_settings ->> 'min')::numeric)
        and (not (p_settings ? 'max') or number_value <= (p_settings ->> 'max')::numeric);
    when 'date' then
      if kind <> 'string' or (p_value #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        return false;
      end if;
      begin
        date_value := (p_value #>> '{}')::date;
      exception when others then
        return false;
      end;
      -- A typed date that does not exist (30 February) is refused, not rolled over.
      if to_char(date_value, 'YYYY-MM-DD') <> p_value #>> '{}'
         or extract(year from date_value) not between 1900 and 2100 then
        return false;
      end if;
      years := extract(year from age(current_date, date_value))::integer;
      return (not (p_settings ? 'min_age') or years >= (p_settings ->> 'min_age')::integer)
        and (not (p_settings ? 'max_age') or years <= (p_settings ->> 'max_age')::integer);
    when 'phone' then
      return kind = 'string' and (p_value #>> '{}') ~ '^\+[1-9][0-9]{7,14}$';
    when 'email' then
      return kind = 'string' and length(p_value #>> '{}') <= 254
        and (p_value #>> '{}') ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';
    when 'item_list' then
      if kind <> 'array' or jsonb_array_length(p_value) < 1
         or jsonb_array_length(p_value) > coalesce((p_settings ->> 'max_items')::integer, 20)
         or exists (select 1 from jsonb_array_elements(p_value) e where jsonb_typeof(e) <> 'string')
         or (select count(distinct e) from jsonb_array_elements_text(p_value) e) <> jsonb_array_length(p_value) then
        return false;
      end if;
      for item in select e from jsonb_array_elements_text(p_value) e loop
        if length(item) not between 1 and 120 or item <> private.js_trim(item) then
          return false;
        end if;
      end loop;
      return true;
    when 'file_upload' then
      accepted := case p_settings ->> 'accept'
        when 'photo' then array['image/jpeg', 'image/png', 'image/webp']
        else array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] end;
      return kind = 'object'
        and p_value - array['key', 'name', 'content_type', 'size'] = '{}'::jsonb
        and jsonb_typeof(p_value -> 'key') = 'string'
        and (p_value ->> 'key') ~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/intake-answers/'
                                   '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
                                   '[0-9]{4}/(0[1-9]|1[0-2])/[0-9a-f]{32}\.(jpg|png|webp|pdf)$')
        and jsonb_typeof(p_value -> 'name') = 'string'
        and length(p_value ->> 'name') between 1 and 120
        and jsonb_typeof(p_value -> 'content_type') = 'string'
        and (p_value ->> 'content_type') = any (accepted)
        and private.json_int_between(p_value -> 'size', 1, 10485760);
    -- The two lists the app ships: the canonical name, exactly as stored.
    when 'country' then
      return kind = 'string' and (p_value #>> '{}') = any (private.country_names());
    when 'municipality' then
      return kind = 'string' and private.is_municipality(p_value #>> '{}');
    else
      return false;
  end case;
end;
$$;

-- An answer in words: no consent.
create or replace function private.custom_answer_text(p_field public.profile_fields, p_value jsonb)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_field.question_type in ('single_choice', 'multiple_choice', 'search_choice') then (
      select string_agg(
               coalesce(o.label ->> 'ca', chosen.id)
                 || case when o.is_archived then ' (arxivada)' else '' end,
               '; ' order by o.sort_order)
        from (select jsonb_array_elements_text(
                       case when jsonb_typeof(p_value) = 'array' then p_value
                            else jsonb_build_array(p_value) end) as id) chosen
        left join public.custom_question_options o
          on o.id::text = chosen.id and o.question_id = p_field.id)
    when p_field.question_type in ('yes_no_maybe', 'yes_no') then
      case p_value #>> '{}' when 'yes' then 'Sí' when 'no' then 'No' when 'maybe' then 'Potser'
                            else p_value #>> '{}' end
    when p_field.question_type = 'date' and jsonb_typeof(p_value) = 'string' then
      to_char((p_value #>> '{}')::date, 'DD/MM/YYYY')
    when p_field.question_type = 'item_list' and jsonb_typeof(p_value) = 'array' then (
      select string_agg(item, '; ' order by position)
        from jsonb_array_elements_text(p_value) with ordinality as listed(item, position))
    when p_field.question_type = 'file_upload' then 'Fitxer: ' || coalesce(p_value ->> 'name', '')
    else p_value #>> '{}'
  end;
$$;

-- Saving an answer: a file is hers to give. The consent steps of RAPP-671 go.
create or replace function private.write_custom_answer(
  p_profile_id uuid, p_field public.profile_fields, p_value jsonb, p_source text,
  p_answered_by uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_seasonal boolean := private.field_is_seasonal(p_field.id);
  season uuid := case when is_seasonal then private.current_season_id(p_field.org_id) end;
  key uuid := coalesce(season, '00000000-0000-0000-0000-000000000000'::uuid);
  is_empty boolean := private.custom_answer_is_empty(p_value);
  stored jsonb := private.custom_answer_tidied(p_field.question_type, p_value);
  -- Her own answers name nobody; a staff write with no name given is the
  -- signed-in team member's.
  author uuid := case
    when p_source = 'player' then null
    when p_source = 'staff' then coalesce(p_answered_by, (select auth.uid()))
    else p_answered_by
  end;
begin
  -- Her names stay on her account (D2): chat, lists, invites and erasure read them there.
  if p_field.system_key in ('first_name', 'last_name') then
    raise check_violation using message = 'her names stay on her account';
  end if;
  if private.field_is_hers_only(p_field.question_type, p_field.settings) and p_source <> 'player'
     and not private.is_test_player(p_profile_id) then
    raise insufficient_privilege using message = 'a file is hers to give';
  end if;
  -- With no current season there is nowhere to keep a seasonal answer. Her
  -- registration never stops on it; staff are told.
  if is_seasonal and season is null then
    if p_source = 'player' then
      return;
    end if;
    raise check_violation using message = 'a seasonal question needs a current season';
  end if;
  if is_empty then
    delete from public.custom_answers
     where profile_id = p_profile_id and question_id = p_field.id and season_key = key;
    return;
  end if;
  if not private.custom_answer_valid(p_field, stored) then
    raise check_violation using message = 'the answer does not fit the question';
  end if;
  -- Her file lives in her own private folder of her organization.
  if p_field.question_type = 'file_upload'
     and (split_part(stored ->> 'key', '/', 1) <> p_field.org_id::text
          or split_part(stored ->> 'key', '/', 3) <> p_profile_id::text) then
    raise check_violation using message = 'the answer does not fit the question';
  end if;
  insert into public.custom_answers (
    profile_id, question_id, season_key, season_id, org_id, value, value_encrypted, source,
    answered_by, answered_at)
  values (
    p_profile_id, p_field.id, key, season, p_field.org_id,
    case when p_field.privacy = 'sensitive' then null else stored end,
    case when p_field.privacy = 'sensitive' then public.encrypt_field(stored::text) end,
    p_source, author, now())
  on conflict (profile_id, question_id, season_key) do update
    set value = excluded.value, value_encrypted = excluded.value_encrypted,
        source = excluded.source, answered_by = excluded.answered_by, answered_at = now();
end;
$$;

-- 2. The blocks of a form -----------------------------------------------------------------------------------

create table public.form_blocks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  surface text not null check (surface in ('onboarding', 'entity_form')),
  -- An app screen (`equipment`) or a Ramassà screen's id, on onboarding only,
  -- as a field placement names it.
  screen_key text check (screen_key is null or private.is_uuid_text(screen_key) or screen_key = any (array[
    'identity', 'background', 'documentation', 'logistics', 'equipment', 'season',
    'supporting-entities', 'participation-support', 'specific-needs']::text[])),
  kind text not null default 'signature' check (kind in ('signature')),
  -- The text she accepts, in five languages, Catalan required.
  body jsonb not null check (private.catalan_text_valid(body) and private.localized_text_valid(body)),
  -- One order with the field placements of the same screen or form.
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint form_blocks_screen_on_onboarding check ((surface = 'onboarding') = (screen_key is not null))
);
create index form_blocks_surface_idx on public.form_blocks (org_id, surface, screen_key, sort_order);
comment on table public.form_blocks is
  'A block of a form (RAPP-690): today a signature with the text to accept, on an Onboarding screen or the entity form.';

alter table public.form_blocks enable row level security;
alter table public.form_blocks force row level security;
-- Reads go through intake_catalog(); writes through save_form_block and remove_form_block.
create policy form_blocks_read on public.form_blocks for select to authenticated
  using (org_id = (select public.current_org_id()));
revoke all on public.form_blocks from anon, authenticated;
grant select on public.form_blocks to authenticated;

-- The next place on a screen or form: after its fields and its blocks.
create or replace function private.next_form_position(p_org_id uuid, p_surface text, p_screen_key text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(greatest(
    (select max(p.sort_order) from public.field_placements p
      where p.org_id = p_org_id and p.surface = p_surface and p.screen_key is not distinct from p_screen_key),
    (select max(b.sort_order) from public.form_blocks b
      where b.org_id = p_org_id and b.surface = p_surface and b.screen_key is not distinct from p_screen_key)
  ) + 1, 0);
$$;
revoke all on function private.next_form_position(uuid, text, text) from public, anon, authenticated;

-- Adds a block (`p_id` null) or saves its text. A block stays where it was added.
create or replace function public.save_form_block(
  p_id uuid, p_surface text, p_screen_key text, p_body jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  saved_id uuid;
begin
  if p_body is null or not private.catalan_text_valid(p_body) or not private.localized_text_valid(p_body) then
    raise check_violation using message = 'a signature needs its text in Catalan';
  end if;
  if p_id is null then
    if p_surface is null or p_surface not in ('onboarding', 'entity_form') then
      raise check_violation using message = 'a signature goes on an onboarding screen or the entity form';
    end if;
    if p_surface = 'onboarding' then
      if p_screen_key is null or not (
           exists (select 1 from private.system_profile_fields() s where s.screen = p_screen_key)
           or (private.is_uuid_text(p_screen_key)
               and exists (select 1 from public.intake_screens s
                            where s.id = p_screen_key::uuid and s.org_id = actor_org
                              and not s.is_archived))) then
        raise no_data_found using message = 'no such screen';
      end if;
    elsif p_screen_key is not null then
      raise check_violation using message = 'only an onboarding block names a screen';
    end if;
    insert into public.form_blocks (org_id, surface, screen_key, kind, body, sort_order)
    values (actor_org, p_surface, p_screen_key, 'signature', p_body,
            private.next_form_position(actor_org, p_surface, p_screen_key))
    returning id into saved_id;
  else
    update public.form_blocks set body = p_body, updated_at = now()
     where id = p_id and org_id = actor_org
    returning id into saved_id;
    if saved_id is null then
      raise no_data_found using message = 'no such block';
    end if;
  end if;
  -- The text as saved, every time: the audit log is the history of the text.
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.block_save', 'form_block', saved_id,
          jsonb_build_object('created', p_id is null, 'kind', 'signature', 'body', p_body));
  return saved_id;
end;
$$;

-- Removes a block. The signatures given to it keep their text and their form.
create or replace function public.remove_form_block(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  removed public.form_blocks;
begin
  delete from public.form_blocks where id = p_id and org_id = actor_org returning * into removed;
  if removed.id is null then
    raise no_data_found using message = 'no such block';
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.block_remove', 'form_block', p_id,
          jsonb_build_object('surface', removed.surface, 'screen', removed.screen_key, 'body', removed.body));
end;
$$;

-- The fields and the blocks of a screen or form share one order: the ids are of either.
create or replace function public.reorder_placements(p_surface text, p_screen_key text, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
begin
  update public.field_placements p
     set sort_order = array_position(p_ids, p.id) - 1, updated_at = now()
   where p.org_id = actor_org and p.surface = p_surface
     and p.screen_key is not distinct from p_screen_key and p.id = any (p_ids);
  update public.form_blocks b
     set sort_order = array_position(p_ids, b.id) - 1, updated_at = now()
   where b.org_id = actor_org and b.surface = p_surface
     and b.screen_key is not distinct from p_screen_key and b.id = any (p_ids);
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.placements_reorder', 'organization', actor_org,
          jsonb_build_object('surface', p_surface, 'screen', p_screen_key, 'order', to_jsonb(p_ids)));
end;
$$;

revoke all on function public.save_form_block(uuid, text, text, jsonb) from public, anon;
revoke all on function public.remove_form_block(uuid) from public, anon;
revoke all on function public.reorder_placements(text, text, uuid[]) from public, anon;
grant execute on function public.save_form_block(uuid, text, text, jsonb), public.remove_form_block(uuid),
  public.reorder_placements(text, text, uuid[]) to authenticated;

-- An app screen with a signature block is never hidden: she signs it on that screen.
create or replace function private.builtin_screen_hideable(p_screen text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from private.system_profile_fields() s where s.screen = p_screen)
     and not exists (
       select 1 from public.field_placements p
         join public.profile_fields f on f.id = p.field_id
        where p.surface = 'onboarding' and p.screen_key = p_screen and p.required
          and not f.is_archived
          and p.org_id = coalesce((select public.current_org_id()), (select public.default_organization_id())))
     and not exists (
       select 1 from public.form_blocks b
        where b.surface = 'onboarding' and b.screen_key = p_screen
          and b.org_id = coalesce((select public.current_org_id()), (select public.default_organization_id())));
$$;

-- 3. The signatures ---------------------------------------------------------------------------------------

create table public.form_signatures (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- Her, once she has an account. A referral not yet joined names her through it.
  profile_id uuid references public.profiles (id) on delete cascade,
  referral_id uuid references public.entity_referrals (id) on delete cascade,
  surface text not null check (surface in ('wizard', 'entity_form')),
  -- A removed block leaves its signatures: the text and the screen stay here.
  block_id uuid references public.form_blocks (id) on delete set null,
  screen_key text,
  body text not null check (length(btrim(body)) > 0),
  language text not null check (language in ('ca', 'es', 'en', 'ar', 'fa')),
  signer_kind text not null check (signer_kind in ('player', 'entity')),
  signer_user_id uuid references public.profiles (id) on delete set null,
  signer_name text not null,
  strokes jsonb not null check (private.app_signature_valid(strokes)),
  signed_at timestamptz not null default now(),
  constraint form_signatures_names_her check (profile_id is not null or referral_id is not null),
  constraint form_signatures_signer_fits_surface check (
    (surface = 'wizard' and signer_kind = 'player' and profile_id is not null)
    or (surface = 'entity_form' and signer_kind = 'entity' and referral_id is not null))
);
create index form_signatures_profile_idx on public.form_signatures (profile_id);
create index form_signatures_referral_idx on public.form_signatures (referral_id);
create index form_signatures_block_idx on public.form_signatures (block_id);
create index form_signatures_org_idx on public.form_signatures (org_id);
comment on table public.form_signatures is
  'A signature of a form block (RAPP-690): the text as shown, its language, who signed, the strokes and when.';

alter table public.form_signatures enable row level security;
alter table public.form_signatures force row level security;
-- Written only by the two form RPCs. Read by the team with participants.view_personal.
create policy form_signatures_read on public.form_signatures for select to authenticated using (
  org_id = (select public.current_org_id())
  and (select public.has_permission('participants.view_personal')));
revoke all on public.form_signatures from anon, authenticated;
grant select on public.form_signatures to authenticated;

-- Saves the signatures a form sent, by block id: `{block: {strokes, language}}`.
-- A block of another form, or one removed since she opened it, is passed over.
-- The text is the block's own in that language (Catalan when it has none).
create or replace function private.save_form_signatures(
  p_org_id uuid, p_surface text, p_profile_id uuid, p_referral_id uuid,
  p_signer uuid, p_signer_name text, p_signatures jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry record;
  block public.form_blocks;
  shown_language text;
  shown text;
  saved integer := 0;
begin
  if p_signatures is null or p_signatures = 'null'::jsonb then
    return 0;
  end if;
  if jsonb_typeof(p_signatures) <> 'object' then
    raise check_violation using message = 'signatures are sent by block';
  end if;
  for entry in select key, value from jsonb_each(p_signatures) loop
    if not private.is_uuid_text(entry.key) or jsonb_typeof(entry.value) <> 'object'
       or entry.value - array['strokes', 'language'] <> '{}'::jsonb
       or not private.app_signature_valid(entry.value -> 'strokes')
       or coalesce(entry.value ->> 'language', '') not in ('ca', 'es', 'en', 'ar', 'fa') then
      raise check_violation using message = 'a signature is its strokes and the language it was shown in';
    end if;
    block := null;
    select * into block from public.form_blocks b
     where b.id = entry.key::uuid and b.org_id = p_org_id
       and b.surface = case p_surface when 'wizard' then 'onboarding' else 'entity_form' end;
    if block.id is null then
      continue;
    end if;
    shown_language := case when length(btrim(coalesce(block.body ->> (entry.value ->> 'language'), ''))) > 0
                           then entry.value ->> 'language' else 'ca' end;
    shown := block.body ->> shown_language;
    insert into public.form_signatures (
      org_id, profile_id, referral_id, surface, block_id, screen_key, body, language,
      signer_kind, signer_user_id, signer_name, strokes)
    values (
      p_org_id, p_profile_id, p_referral_id, p_surface, block.id, block.screen_key, shown, shown_language,
      case p_surface when 'wizard' then 'player' else 'entity' end, p_signer,
      coalesce(nullif(btrim(p_signer_name), ''), '-'), entry.value -> 'strokes');
    saved := saved + 1;
  end loop;
  return saved;
end;
$$;
revoke all on function private.save_form_signatures(uuid, text, uuid, uuid, uuid, text, jsonb)
  from public, anon, authenticated;

-- The blocks of a form with no signature yet: her Onboarding (on a live
-- screen), or a referral's entity form. Every block is required where it sits.
create or replace function private.unsigned_form_blocks(
  p_org_id uuid, p_surface text, p_profile_id uuid, p_referral_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(b.id order by b.screen_key, b.sort_order), array[]::uuid[])
    from public.form_blocks b
   where b.org_id = p_org_id
     and b.surface = case p_surface when 'wizard' then 'onboarding' else 'entity_form' end
     and (b.surface <> 'onboarding'
          or not private.is_uuid_text(b.screen_key)
          or exists (select 1 from public.intake_screens s
                      where s.id = b.screen_key::uuid and s.org_id = b.org_id and not s.is_archived))
     and not exists (
       select 1 from public.form_signatures g
        where g.block_id = b.id
          and case p_surface when 'wizard' then g.profile_id = p_profile_id
                             else g.referral_id = p_referral_id end);
$$;
revoke all on function private.unsigned_form_blocks(uuid, text, uuid, uuid) from public, anon, authenticated;

-- Her signatures for her page: the ones she gave on her Onboarding and the
-- ones the entity gave on a referral that names her.
create or replace function public.participant_form_signatures(p_profile_id uuid)
returns table (id uuid, surface text, block_id uuid, screen_key text, body text, language text,
               signer_kind text, signer_name text, strokes jsonb, signed_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view_personal')) then
    raise insufficient_privilege using message = 'her signatures need participants.view_personal';
  end if;
  return query
  select g.id, g.surface, g.block_id, g.screen_key, g.body, g.language, g.signer_kind, g.signer_name,
         g.strokes, g.signed_at
    from public.form_signatures g
   where g.org_id = actor_org
     and (g.profile_id = p_profile_id
          or g.referral_id in (select r.id from public.entity_referrals r
                                where r.referred_profile_id = p_profile_id))
   order by g.signed_at, g.id;
end;
$$;
revoke all on function public.participant_form_signatures(uuid) from public, anon;
grant execute on function public.participant_form_signatures(uuid) to authenticated;

-- 4. The catalog returns the blocks -------------------------------------------------------------------

create or replace function public.intake_catalog()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- Ramassà screens. The fields each one asks are its placements, below.
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'intro', s.intro, 'after_screen', s.after_screen,
        'sort_order', s.sort_order, 'is_archived', s.is_archived)
        order by array_position(private.intake_builtin_screens(), s.after_screen), s.sort_order, s.created_at)
        from public.intake_screens s
       where s.org_id = actor_org and (with_archived or not s.is_archived)), '[]'::jsonb),
    -- The app's questions as staff worded or hid them (RAPP-666): the wording
    -- of the question's first field on her onboarding, and hidden when that
    -- field is placed nowhere on it.
    'overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question', q.question, 'label', p.label_override, 'help', p.help_override,
        'is_hidden', p.id is null) order by q.question)
        from unnest(private.wizard_intake_questions()) q(question)
        join public.profile_fields f
          on f.org_id = actor_org and f.system_key = private.question_system_key(q.question)
        left join public.field_placements p on p.field_id = f.id and p.surface = 'onboarding'
       where p.id is null or p.label_override is not null or p.help_override is not null), '[]'::jsonb),
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
       where v.id is not null),
    -- The profile layout (RAPP-649): sections, fields and where each is asked.
    -- Who created a field, and whether it has answers (which fixes its
    -- privacy level), only for the people who design it.
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'key', s.key, 'title', s.title, 'sort_order', s.sort_order, 'is_builtin', s.is_builtin)
        order by s.sort_order, s.created_at)
        from public.profile_sections s where s.org_id = actor_org), '[]'::jsonb),
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'section_id', f.section_id, 'kind', f.kind, 'system_key', f.system_key,
        'question_type', f.question_type, 'label', f.label, 'help', f.help, 'privacy', f.privacy,
        'default_required', f.default_required, 'settings', f.settings,
        'show_when_field_id', f.show_when_field_id, 'show_when_option_id', f.show_when_option_id,
        'sort_order', f.sort_order, 'is_archived', f.is_archived, 'created_at', f.created_at,
        'created_by', case when with_archived then f.created_by end,
        'created_by_name', case when with_archived then (
          select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
            from public.profiles p where p.id = f.created_by) end,
        'has_answers', case when with_archived then private.field_has_answers(f.id) end,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'key', o.key, 'label', o.label, 'sort_order', o.sort_order, 'is_archived', o.is_archived)
            order by o.sort_order, o.id)
            from public.custom_question_options o where o.question_id = f.id), '[]'::jsonb))
        order by f.sort_order, f.created_at)
        from public.profile_fields f
       where f.org_id = actor_org and (with_archived or not f.is_archived)), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'field_id', p.field_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'sort_order', p.sort_order, 'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.surface, p.screen_key, p.sort_order, p.created_at)
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id
       where p.org_id = actor_org and (with_archived or not f.is_archived)), '[]'::jsonb),
    -- The blocks of each screen and of the entity form (RAPP-690), in the
    -- order they share with the placements.
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'surface', b.surface, 'screen_key', b.screen_key, 'kind', b.kind,
        'body', b.body, 'sort_order', b.sort_order)
        order by b.surface, b.screen_key, b.sort_order, b.created_at)
        from public.form_blocks b where b.org_id = actor_org), '[]'::jsonb)
  );
end;
$function$;

-- 5. Her Onboarding sends her signatures --------------------------------------------------------------

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
  -- Her signatures of the Onboarding blocks (RAPP-690), by block id.
  signatures jsonb := payload -> 'signatures';
  unsigned uuid[];
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
  saved := public.complete_onboarding(payload - 'signatures');
  select id into strict acceptance from public.terms_acceptances
    where profile_id=caller and not (id=any(previous_ids));
  insert into public.app_terms_signatures
    (acceptance_id,profile_id,org_id,signature,unable_to_draw,media_consent,device)
  values (acceptance,caller,saved.org_id,drawing,cannot_draw,(p_signing->>'media_consent')::boolean,nullif(p_signing->>'device',''));
  -- Every signature block of her Onboarding is signed by her (RAPP-690), in
  -- the same transaction as her account.
  perform private.save_form_signatures(
    saved.org_id, 'wizard', caller, null, caller,
    concat_ws(' ', saved.first_name, saved.last_name), signatures);
  unsigned := private.unsigned_form_blocks(saved.org_id, 'wizard', caller, null);
  if cardinality(unsigned) > 0 then
    raise not_null_violation using message = 'complete_onboarding requires her signature on every signature block';
  end if;
  return saved;
end $function$;

-- 6. The entity form sends the entity person's signatures ---------------------------------------------

CREATE OR REPLACE FUNCTION public.create_entity_referral(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid;
  actor_org uuid;
  actor_role text;
  actor_entity uuid;
  first_name text := nullif(private.name_trim(p_payload ->> 'first_name'), '');
  last_name text := nullif(private.name_trim(p_payload ->> 'last_name'), '');
  email text := nullif(lower(btrim(p_payload ->> 'email')), '');
  documentation text := p_payload ->> 'documentationStatus';
  referral_notes text := nullif(btrim(p_payload ->> 'notes'), '');
  season_number_value text := nullif(p_payload ->> 'seasonNumber', '');
  answers jsonb := coalesce(nullif(p_payload -> 'answers', 'null'::jsonb), '{}'::jsonb);
  referral public.entity_referrals;
  -- The entity person's signatures of the form's blocks (RAPP-690), by block id.
  signatures jsonb := p_payload -> 'signatures';
  signer_name text;
begin
  select
    assert_referral_actor.actor_id,
    assert_referral_actor.actor_org_id,
    assert_referral_actor.actor_role
  into actor, actor_org, actor_role
  from private.assert_referral_actor();
  actor_entity := public.current_collaborating_entity_id();

  if actor_role <> 'entity' then
    raise exception 'only entity contacts may submit referrals'
      using errcode = 'insufficient_privilege';
  end if;

  if p_payload is null
    or jsonb_typeof(p_payload) <> 'object'
    or p_payload - array[
      'first_name', 'last_name', 'email', 'documentationStatus', 'notes', 'seasonNumber',
      'consentConfirmed', 'answers', 'signatures'
    ] <> '{}'::jsonb
    or jsonb_typeof(answers) <> 'object'
    or first_name is null
    or length(first_name) > 100
    or last_name is null
    or length(last_name) > 100
    or (email is not null and (length(email) > 254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+$'))
    or documentation is null
    or documentation not in ('none', 'missing', 'in_progress', 'complete')
    or (referral_notes is not null and length(referral_notes) > 4000)
    or coalesce(season_number_value not in ('1', '2', '3', '4', '5'), false)
    -- She agreed that the entity shares her data with Ramassà (RAPP-303).
    or (p_payload -> 'consentConfirmed') is distinct from 'true'::jsonb
  then
    raise check_violation using message = 'invalid entity referral payload';
  end if;

  insert into public.entity_referrals (
    org_id,
    entity_user_id,
    collaborating_entity_id,
    referred_first_name,
    referred_last_name,
    referred_email,
    documentation_status,
    notes,
    intake_answers,
    consent_confirmed_at,
    consent_confirmed_by
  ) values (
    actor_org,
    actor,
    actor_entity,
    first_name,
    last_name,
    public.encrypt_field(email),
    documentation,
    public.encrypt_field(referral_notes),
    -- Her season count is no field: the one answer kept on the referral itself.
    case when season_number_value is null then null
         else public.encrypt_field(jsonb_build_object('season_number', season_number_value::integer)::text) end,
    now(),
    actor
  )
  returning * into referral;

  -- Every answer by field, saved in the same call, so a referral is never left
  -- without them. A required one left out refuses the referral below.
  perform private.save_referral_field_answers(referral, answers);
  perform private.apply_referral_document_rule(referral);
  perform private.check_entity_form_required(referral);

  -- The person from the entity signs every signature block of the form (RAPP-690).
  select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') into signer_name
    from public.profiles p where p.id = actor;
  perform private.save_form_signatures(
    actor_org, 'entity_form', null, referral.id, actor, signer_name, signatures);
  if cardinality(private.unsigned_form_blocks(actor_org, 'entity_form', null, referral.id)) > 0 then
    raise not_null_violation using message = 'the referral needs a signature on every signature block';
  end if;

  return referral.id;
end;
$function$;

-- 7. Erasure deletes her signatures (D11) ------------------------------------------------------------

create or replace function public.anonymize_participant(participant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid;
  subject_role text;
  subject_anonymized_at timestamptz;
  birth_field public.profile_fields;
  birth_date date;
begin
  perform private.require_recent_second_factor();
  -- SECURITY DEFINER means RLS is not doing this check, so it runs before any
  -- work, right after the step-up check, and pgTAP asserts it from three roles.
  if not (select public.has_permission('rgpd.erase')) then
    raise exception 'anonymizing a participant is a staff action'
      using errcode = 'insufficient_privilege';
  end if;

  actor_org := (select public.current_org_id());

  -- The tenant scope RLS would normally provide. Without it, SECURITY DEFINER
  -- would let a staff member of one organization anonymize another's roster.
  select p.role, p.anonymized_at into subject_role, subject_anonymized_at
  from public.profiles p
  where p.id = participant_id and p.org_id = actor_org;

  if subject_role is null then
    raise exception 'ANONYMIZE_NO_SUBJECT: no such participant in this organization'
      using errcode = 'raise_exception';
  end if;

  -- Anonymizing a colleague would strip the name off an account that still signs
  -- in and still acts, which is a different and much worse thing than what this
  -- function is for.
  if subject_role <> 'player' then
    raise exception 'ANONYMIZE_NOT_A_PARTICIPANT: only a participant record can be anonymized'
      using errcode = 'raise_exception';
  end if;

  -- Already done. Silently re-running would rewrite `anonymized_at` and lose the
  -- date the person actually left the record.
  if subject_anonymized_at is not null then
    raise exception 'ANONYMIZE_ALREADY_DONE: this record was already anonymized'
      using errcode = 'raise_exception';
  end if;

  -- The one answer that survives, read before anything goes: her birth year,
  -- from the field the registry names, only while it is still a date (D7, D11).
  birth_field := private.feature_field(actor_org, 'erasure.birth_year');
  if birth_field.id is not null then
    birth_date := (private.field_answer_now(participant_id, birth_field) #>> '{}')::date;
  end if;

  update public.profiles set
    -- Emptied rather than filled with a placeholder word: the screens read
    -- `anonymized_at` and show a translated label, so no invented name has to
    -- exist in five languages or leak out of a CSV export as though it were one.
    first_name = '',
    last_name = '',
    avatar_url = null,
    media_consent_at = null,
    is_active = false,
    anonymized_at = now(),
    updated_at = now()
  where id = participant_id;

  -- Every answer of hers (D11): the app's fields and the team's, every season.
  delete from public.custom_answers where profile_id = participant_id;
  delete from public.referral_custom_answers r
   using public.entity_referrals referral
   where r.referral_id = referral.id and referral.referred_profile_id = participant_id;
  -- What a field change set aside (RAPP-665) is hers too: it leaves with her.
  delete from public.audit_log a
   where a.action = 'intake.answer_set_aside'
     and ((a.target_type = 'profile' and a.target_id = participant_id)
          or (a.target_type = 'entity_referral'
              and a.target_id in (select referral.id from public.entity_referrals referral
                                   where referral.referred_profile_id = participant_id)));

  -- Her signatures of the form blocks (RAPP-690), hers and the entity's for her.
  delete from public.form_signatures g
   where g.profile_id = participant_id
      or g.referral_id in (select referral.id from public.entity_referrals referral
                            where referral.referred_profile_id = participant_id);

  -- Her birth year alone still answers every age band a funder report asks.
  if birth_date is not null then
    begin
      perform private.write_custom_answer(
        participant_id, birth_field,
        to_jsonb(make_date(extract(year from birth_date)::int, 1, 1)::text), 'staff', actor);
    exception when check_violation then
      -- A seasonal date field with no current season keeps nothing.
      null;
    end;
  end if;

  -- Prose about her life, which no column-level anonymization can reach. Deleted
  -- through this function and only through this function: the table has no
  -- DELETE policy precisely so that no staff member can quietly revise the
  -- record, and the right to erasure is a different thing from revising it.
  delete from public.participant_notes where profile_id = participant_id;

  -- A retained device token would keep a channel open to a real phone belonging
  -- to a person this row no longer claims to know.
  delete from public.push_tokens where user_id = participant_id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org,
    actor,
    'profile.anonymize',
    'profile',
    participant_id,
    -- WHICH things were cleared, never what was in them (ADR-021). The audit row
    -- must not become the last surviving copy of the data it describes.
    jsonb_build_object('fields_cleared', true, 'answers_deleted', true, 'notes_deleted', true,
                       'signatures_deleted', true,
                       'birth_year_kept', birth_date is not null)
  );
end;
$function$;

create or replace function private.scenario_reset(p_target profiles)
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
  delete from public.custom_answers where profile_id = p_target.id;
  delete from public.form_signatures where profile_id = p_target.id;
  update public.profiles p set
    avatar_url = null, media_consent_at = null, season_number = null, prior_seasons = 0,
    health_info = null, emergency_contact_name = null, emergency_contact_relation = null,
    emergency_contact_phone = null, updated_at = now()
  where p.id = p_target.id;
  return '{}'::jsonb;
end;
$function$;

create or replace function public.personal_data_disposition()
 RETURNS TABLE(table_name text, participant_column text, disposition text, reason text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
    ('authorization_consent_events', 'profile_id', 'purge', 'Each consent she gave or withdrew.'),
    ('walk_in_signings', null, 'retain_limited', 'A walk-in''s tablet signing until staff confirm it; purged after 60 days.'),
    ('intake_screens', null, 'not_personal', 'Registration screens staff built.'),
    ('profile_sections', null, 'not_personal', 'Sections of the player profile layout.'),
    ('profile_fields', null, 'not_personal', 'The pieces of information the profile holds, and who created each.'),
    ('field_placements', null, 'not_personal', 'Where each piece of information is asked.'),
    ('form_blocks', null, 'not_personal', 'The signature blocks of the forms and the text each asks to accept.'),
    ('form_signatures', 'profile_id', 'purge', 'Her signatures of the form blocks, and the entity''s for her on a referral, with the strokes.'),
    ('custom_question_options', null, 'not_personal', 'Options of those questions.'),
    ('intake_builtin_screens', null, 'not_personal', 'Staff wording of the built-in onboarding screens and which are hidden.'),
    ('intake_flow_orders', null, 'not_personal', 'The order of the onboarding screens staff arranged.'),
    ('intake_state_presets', null, 'not_personal', 'Organization presets for which questions are asked.'),
    ('custom_answers', 'profile_id', 'purge', 'Every answer of her record, the app''s fields and the team''s. Anonymizing deletes them all and keeps only her birth year.'),
    ('referral_custom_answers', null, 'retain_limited', 'Extra answers sent with a referral; moved to her profile when she is invited, or purged with the referral.'),
    ('custom_question_states', 'profile_id', 'purge', 'Which fields staff chose to ask or not ask her, the app''s and the team''s.'),
    ('participant_search_documents', 'profile_id', 'purge', 'Her names and her Normal and Personal text answers, indexed for the participants search.'),
    ('staff_notifications', null, 'not_personal', 'The team''s bell: one row per team member; names render live from the source row and params hold no personal value.')
  ) as disposition(table_name, participant_column, disposition, reason);
$function$;
