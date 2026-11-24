-- The referral form moves onto the form engine (RAPP-938).
--
-- WHY
--
-- Fabián, 2026-11-23: the Onboarding screens are how every form should look,
-- and the referral form (Entitats › Formulari de derivació) moves onto the
-- engine like the forms and the surveys did. Staff build it on a board of
-- screens, each edited in the shared screen editor, and the entity fills it in
-- screen by screen.
--
-- Two things stay exactly where they are:
--   - installed phone builds read `intake_catalog()` strictly. They draw the
--     entity form from the placements and blocks of surface `entity_form` with
--     no screen, in one list. Those rows keep their shape in the catalog: no
--     screen key, and one order across the whole form;
--   - a woman's answers. `create_entity_referral` and everything after it are
--     not touched: her answers stay in `referral_custom_answers` and on the
--     referral, the required check reads the same placements, and the entity
--     signs the same blocks.
--
-- WHAT THIS MIGRATION DOES
--
--   1. Each organization gets the referral form as a form of its own
--      (`custom_forms.system_key` `entity_referral`, filled in by the entity),
--      so its screens are `custom_form_screens` and the board's own screen
--      writers serve it. It starts with one screen, which takes every field
--      and block the form asks today, in today's order.
--   2. Every placement and block of the entity form names its screen in
--      `screen_key`. One written without a screen goes on the first screen,
--      so the seed of a new organization and any older writer keep working.
--      `place_field` and `save_form_block` take a screen of the referral form;
--      `place_field` moves a field asked on another screen here, with the
--      fields that depend on it and the other parts of an app question.
--   3. The referral form has no published versions: what staff save is what
--      the entity fills in, as before. Its screens always show and depend on
--      no answer, because the database requires every required field of the
--      form. Its choices stay; only its name changes. Deleting a screen takes
--      its fields and blocks off the form, but never her names.
--   4. `intake_catalog` sends the entity form's rows as before (no screen,
--      one order), leaves the referral form out of `custom_forms` (an older
--      build lists those), and adds `entity_form`: the form, its screens and
--      the screen of each placement and block. An older build drops keys it
--      does not know.
--
-- No table holding a woman's data is added or changed.

-- 1. The referral form ------------------------------------------------------------------------------------

alter table public.custom_forms drop constraint custom_forms_system_key_check;
alter table public.custom_forms add constraint custom_forms_system_key_check
  check (system_key is null or system_key = any (array['app_terms', 'season_authorization', 'entity_referral']));

alter table public.custom_forms drop constraint custom_forms_system_form_is_legal;
alter table public.custom_forms add constraint custom_forms_system_form_is_legal
  check (system_key is null
         or (system_key = 'entity_referral' and kind = 'other')
         or (system_key <> 'entity_referral' and kind = 'legal'));

alter table public.custom_forms add constraint custom_forms_referral_form_shape
  check (system_key is distinct from 'entity_referral'
         or (filled_by = 'entity' and mandatory = 'optional' and deadline is null
             and audience = 'all' and not repeats_each_season and published_at is null));

create or replace function private.entity_referral_form_id(p_org_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select f.id from public.custom_forms f where f.org_id = p_org_id and f.system_key = 'entity_referral';
$$;
revoke all on function private.entity_referral_form_id(uuid) from public, anon, authenticated;

-- The referral form of an organization, made with its first screen when it has none.
create or replace function private.ensure_entity_referral_form(p_org_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  referral_form uuid := private.entity_referral_form_id(p_org_id);
begin
  if referral_form is null then
    insert into public.custom_forms (org_id, name, filled_by, mandatory, deadline, audience,
                                     repeats_each_season, kind, system_key)
    values (p_org_id,
            '{"ca": "Formulari de derivació", "es": "Formulario de derivación", "en": "Referral form"}'::jsonb,
            'entity', 'optional', null, 'all', false, 'other', 'entity_referral')
    on conflict (org_id, system_key) where system_key is not null do nothing
    returning id into referral_form;
    referral_form := coalesce(referral_form, private.entity_referral_form_id(p_org_id));
  end if;
  if not exists (select 1 from public.custom_form_screens s where s.form_id = referral_form and not s.is_archived) then
    insert into public.custom_form_screens (org_id, form_id, title, sort_order)
    values (p_org_id, referral_form, '{"ca": "La derivació", "es": "La derivación", "en": "The referral"}'::jsonb,
            coalesce((select max(s.sort_order) + 1 from public.custom_form_screens s where s.form_id = referral_form), 0));
  end if;
  return referral_form;
end;
$$;
revoke all on function private.ensure_entity_referral_form(uuid) from public, anon, authenticated;

-- The first screen of the referral form, made when there is none.
create or replace function private.entity_referral_first_screen(p_org_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  referral_form uuid := private.ensure_entity_referral_form(p_org_id);
begin
  return (select s.id::text from public.custom_form_screens s
           where s.form_id = referral_form and not s.is_archived
           order by s.sort_order, s.created_at limit 1);
end;
$$;
revoke all on function private.entity_referral_first_screen(uuid) from public, anon, authenticated;

-- Whether a key is a live screen of the organization's referral form.
create or replace function private.is_entity_referral_screen(p_org_id uuid, p_screen_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.is_uuid_text(p_screen_key) and exists (
    select 1 from public.custom_form_screens s
      join public.custom_forms f on f.id = s.form_id and f.system_key = 'entity_referral'
     where s.id = p_screen_key::uuid and s.org_id = p_org_id and not s.is_archived), false);
$$;
revoke all on function private.is_entity_referral_screen(uuid, text) from public, anon, authenticated;

select private.ensure_entity_referral_form(o.id) from public.organizations o;

-- 2. Every row of the entity form names its screen ---------------------------------------------------------

-- A row written without a screen goes on the first one; any other screen must be the form's.
create or replace function private.entity_form_row_screen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.surface <> 'entity_form' then
    return new;
  end if;
  if new.screen_key is null then
    new.screen_key := private.entity_referral_first_screen(new.org_id);
  elsif not private.is_entity_referral_screen(new.org_id, new.screen_key) then
    raise check_violation using message = 'an entity form row names a screen of the referral form';
  end if;
  return new;
end;
$$;
revoke all on function private.entity_form_row_screen() from public, anon, authenticated;

-- Named so they run before the other row triggers, which read the screen.
create trigger field_placements_a_entity_form_screen
  before insert or update of surface, screen_key on public.field_placements
  for each row execute function private.entity_form_row_screen();
create trigger form_blocks_a_entity_form_screen
  before insert or update of surface, screen_key on public.form_blocks
  for each row execute function private.entity_form_row_screen();

alter table public.field_placements drop constraint field_placements_screen_on_onboarding;
alter table public.form_blocks drop constraint form_blocks_screen_on_onboarding;

-- Today's rows go on the first screen, in the order they hold. The move is
-- one statement per table, so no condition is ever left apart from its question.
select set_config('ramassa.moving_placements', 'on', true);
update public.field_placements p
   set screen_key = private.entity_referral_first_screen(p.org_id)
 where p.surface = 'entity_form' and p.screen_key is null;
update public.form_blocks b
   set screen_key = private.entity_referral_first_screen(b.org_id)
 where b.surface = 'entity_form' and b.screen_key is null;
select set_config('ramassa.moving_placements', 'off', true);

alter table public.field_placements add constraint field_placements_screen_on_onboarding
  check ((surface = any (array['onboarding', 'custom_form', 'entity_form'])) = (screen_key is not null));
alter table public.form_blocks add constraint form_blocks_screen_on_onboarding
  check ((surface = any (array['onboarding', 'custom_form', 'entity_form'])) = (screen_key is not null));

-- A field of the entity form moves to another of its screens with the fields
-- that depend on it and the other parts of its app question.
create or replace function private.move_entity_form_field(p_org_id uuid, p_field_id uuid, p_screen_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  moved uuid;
begin
  moved := private.move_field_group(p_org_id, p_field_id, 'entity_form', null, p_screen_key);
  perform set_config('ramassa.moving_placements', 'on', true);
  update public.field_placements p
     set screen_key = p_screen_key,
         sort_order = private.next_form_position(p_org_id, 'entity_form', p_screen_key),
         updated_at = now()
    from public.profile_fields part
    join private.system_profile_fields() s on s.system_key = part.system_key
    join public.profile_fields head on head.org_id = part.org_id and head.system_key = s.part_of
   where p.org_id = p_org_id and p.surface = 'entity_form' and p.field_id = part.id
     and part.org_id = p_org_id
     and head.id in (select q.field_id from public.field_placements q
                      where q.org_id = p_org_id and q.surface = 'entity_form' and q.screen_key = p_screen_key)
     and p.screen_key is distinct from p_screen_key;
  perform set_config('ramassa.moving_placements', 'off', true);
  return moved;
end;
$$;
revoke all on function private.move_entity_form_field(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.place_field(p_field_id uuid, p_surface text, p_screen_key text default null::text, p_required boolean default null::boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  field public.profile_fields;
  form_id uuid;
  saved_id uuid;
  -- The screen of the referral form a field goes on (RAPP-938); none, the first.
  entity_screen text;
begin
  select * into field from public.profile_fields where id = p_field_id and org_id = actor_org and not is_archived;
  if field.id is null then
    raise no_data_found using message = 'no such question';
  end if;
  -- A survey's question goes on its own survey only (RAPP-929).
  if field.kind = 'survey' and (p_surface is distinct from 'custom_form'
       or private.custom_form_of_screen(actor_org, p_screen_key) is distinct from field.survey_form_id) then
    raise check_violation using message = 'a survey question goes on its own survey only';
  end if;
  if p_surface is null or p_surface not in ('onboarding', 'entity_form', 'season', 'authorization', 'custom_form') then
    raise check_violation using message = 'a field is placed on onboarding, the entity form, the season, the authorization or a form';
  end if;
  -- Her names live on her account: her Onboarding, the entity form and her forms ask them.
  if private.is_name_field(field) and p_surface not in ('entity_form', 'onboarding', 'custom_form') then
    raise check_violation using message = 'her names are asked on her onboarding, the entity form and her forms';
  end if;
  if p_surface = 'onboarding' then
    -- An app screen or one of the app's follow-ups (RAPP-720).
    if p_screen_key is null or not (
         private.is_onboarding_app_screen(p_screen_key)
         or (private.is_uuid_text(p_screen_key)
             and exists (select 1 from public.intake_screens s
                          where s.id = p_screen_key::uuid and s.org_id = actor_org
                            and not s.is_archived))) then
      raise no_data_found using message = 'no such screen';
    end if;
  elsif p_surface = 'custom_form' then
    form_id := private.custom_form_of_screen(actor_org, p_screen_key);
    if form_id is null or form_id = private.entity_referral_form_id(actor_org) then
      raise no_data_found using message = 'no such screen';
    end if;
    -- A survey asks only its own questions: her answers there are not her record (RAPP-929).
    if field.kind <> 'survey'
       and exists (select 1 from public.custom_forms f where f.id = form_id and f.kind = 'survey') then
      raise check_violation using message = 'a survey asks its own questions only';
    end if;
    if private.field_is_hers_only(field.question_type, field.settings)
       and exists (select 1 from public.custom_forms f where f.id = form_id and f.filled_by <> 'player') then
      raise check_violation using message = 'a file or a signature is asked of her only';
    end if;
  elsif p_surface = 'entity_form' then
    if p_screen_key is not null and not private.is_entity_referral_screen(actor_org, p_screen_key) then
      raise no_data_found using message = 'no such screen of the referral form';
    end if;
    entity_screen := coalesce(p_screen_key, private.entity_referral_first_screen(actor_org));
  elsif p_screen_key is not null then
    raise check_violation using message = 'only an onboarding placement names a screen';
  end if;
  if private.field_is_hers_only(field.question_type, field.settings) and p_surface = 'entity_form' then
    raise check_violation using message = 'a file or a signature is asked of her only';
  end if;

  if p_surface in ('onboarding', 'custom_form') then
    -- Already on this screen: nothing to do (a picker sends a controller and
    -- its condition together, and the controller brings the condition).
    select p.id into saved_id from public.field_placements p
     where p.field_id = p_field_id and p.surface = p_surface
       and p.custom_form_id is not distinct from form_id and p.screen_key = p_screen_key;
    if saved_id is not null then
      return saved_id;
    end if;
    -- On another screen of the same form: it moves here (RAPP-782). A field
    -- may also sit on every sibling document follow-up (RAPP-720).
    if exists (select 1 from public.field_placements p
                where p.field_id = p_field_id and p.surface = p_surface
                  and p.custom_form_id is not distinct from form_id
                  and not private.can_share_field(p.screen_key, p_screen_key)) then
      return private.move_field_group(actor_org, p_field_id, p_surface, form_id, p_screen_key);
    end if;
  elsif p_surface = 'entity_form' and p_screen_key is not null then
    -- On the referral form once (RAPP-938): already here, nothing to do; on
    -- another of its screens, it moves here.
    select p.id into saved_id from public.field_placements p
     where p.field_id = p_field_id and p.surface = 'entity_form';
    if saved_id is not null then
      if (select p.screen_key from public.field_placements p where p.id = saved_id) = p_screen_key then
        return saved_id;
      end if;
      return private.move_entity_form_field(actor_org, p_field_id, p_screen_key);
    end if;
  elsif exists (select 1 from public.field_placements
                 where field_id = p_field_id and surface = p_surface) then
    raise unique_violation using message = 'the field is already asked there';
  end if;

  -- A hidden screen asks nothing required (RAPP-711): a field placed on it is optional.
  if private.screen_is_hidden(actor_org, p_surface, p_screen_key) and coalesce(p_required, false) then
    raise check_violation using message = 'a hidden screen asks nothing required';
  end if;
  insert into public.field_placements (org_id, field_id, surface, screen_key, custom_form_id, sort_order, required)
  values (actor_org, p_field_id, p_surface, coalesce(entity_screen, p_screen_key), form_id,
          coalesce((select max(p.sort_order) + 1 from public.field_placements p
                     where p.org_id = actor_org and p.surface = p_surface
                       and p.screen_key is not distinct from coalesce(entity_screen, p_screen_key)), 0),
          coalesce(p_required, field.default_required)
            and not private.screen_is_hidden(actor_org, p_surface, p_screen_key))
  returning id into saved_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.field_place', 'profile_field', p_field_id,
          jsonb_build_object('placement_id', saved_id, 'surface', p_surface,
                             'screen', coalesce(entity_screen, p_screen_key), 'custom_form', form_id));
  return saved_id;
end;
$$;

create or replace function public.save_form_block(p_id uuid, p_surface text, p_screen_key text, p_kind text, p_body jsonb, p_title jsonb, p_points jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  block_kind text := coalesce(p_kind, 'signature');
  block_body jsonb := private.json_value_or_null(p_body);
  block_title jsonb := private.json_value_or_null(p_title);
  block_points jsonb := private.json_value_or_null(p_points);
  form_id uuid;
  saved_id uuid;
  -- The screen of the referral form a block goes on (RAPP-938); none, the first.
  block_screen text := p_screen_key;
begin
  if block_kind not in ('signature', 'text', 'points') then
    raise check_violation using message = 'a block is a signature, a text or points';
  end if;
  if not private.form_block_content_valid(block_kind, block_body, block_title, block_points) then
    raise check_violation using message = case block_kind
      when 'signature' then 'a signature needs its text in Catalan'
      when 'text' then 'a text needs its text in Catalan'
      else 'points need a title and a text in Catalan, one to eight of them' end;
  end if;
  if p_id is null then
    if p_surface is null or p_surface not in ('onboarding', 'entity_form', 'custom_form') then
      raise check_violation using message = 'a block goes on an onboarding screen, the entity form or a form';
    end if;
    if p_surface = 'entity_form' and block_kind <> 'signature' then
      raise check_violation using message = 'the entity form holds signature blocks only';
    end if;
    if p_surface = 'onboarding' then
      -- An app screen or one of the app's follow-ups (RAPP-720).
      if p_screen_key is null or not (
           private.is_onboarding_app_screen(p_screen_key)
           or (private.is_uuid_text(p_screen_key)
               and exists (select 1 from public.intake_screens s
                            where s.id = p_screen_key::uuid and s.org_id = actor_org
                              and not s.is_archived))) then
        raise no_data_found using message = 'no such screen';
      end if;
    elsif p_surface = 'custom_form' then
      form_id := private.custom_form_of_screen(actor_org, p_screen_key);
      if form_id is null then
        raise no_data_found using message = 'no such screen';
      end if;
      if exists (select 1 from public.custom_forms f where f.id = form_id and f.filled_by <> 'player') then
        raise check_violation using message = 'a block goes on a form she fills in';
      end if;
    elsif p_surface = 'entity_form' then
      if p_screen_key is not null and not private.is_entity_referral_screen(actor_org, p_screen_key) then
        raise no_data_found using message = 'no such screen of the referral form';
      end if;
      block_screen := coalesce(p_screen_key, private.entity_referral_first_screen(actor_org));
    elsif p_screen_key is not null then
      raise check_violation using message = 'only an onboarding block names a screen';
    end if;
    -- A text or points block asks nothing, so a hidden screen takes one.
    if block_kind = 'signature' and private.screen_is_hidden(actor_org, p_surface, p_screen_key) then
      raise check_violation using message = 'a hidden screen holds no signature';
    end if;
    insert into public.form_blocks (org_id, surface, screen_key, custom_form_id, kind, body, title, points, sort_order)
    values (actor_org, p_surface, block_screen, form_id, block_kind, block_body, block_title, block_points,
            private.next_form_position(actor_org, p_surface, block_screen))
    returning id into saved_id;
  else
    update public.form_blocks b
       set body = block_body, title = block_title, points = block_points, updated_at = now()
     where b.id = p_id and b.org_id = actor_org and b.kind = block_kind
    returning b.id into saved_id;
    if saved_id is null then
      raise no_data_found using message = 'no such block';
    end if;
  end if;
  -- The texts as saved, every time: the audit log is the history of the block.
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.block_save', 'form_block', saved_id,
          jsonb_build_object('created', p_id is null, 'kind', block_kind, 'body', block_body,
                             'title', block_title, 'points', block_points));
  return saved_id;
end;
$$;

-- 3. What the referral form keeps ----------------------------------------------------------------------------

-- Its choices stay: only its name changes. It is never published.
create or replace function private.entity_referral_form_stays()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.system_key = 'entity_referral'
     and (new.system_key, new.kind, new.filled_by, new.mandatory, new.deadline, new.audience,
          new.repeats_each_season, new.is_archived, new.version, new.published_at, new.org_id)
         is distinct from
         (old.system_key, old.kind, old.filled_by, old.mandatory, old.deadline, old.audience,
          old.repeats_each_season, old.is_archived, old.version, old.published_at, old.org_id) then
    raise check_violation using message = 'the referral form keeps its choices; only its name changes';
  end if;
  return new;
end;
$$;
revoke all on function private.entity_referral_form_stays() from public, anon, authenticated;
create trigger custom_forms_entity_referral_stays
  before update on public.custom_forms
  for each row execute function private.entity_referral_form_stays();

-- The app's legal forms keep their own rule; the referral form says its own.
create or replace function private.app_terms_form_choices_stay()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.system_key in ('app_terms', 'season_authorization')
     and (new.filled_by <> old.filled_by or new.mandatory <> old.mandatory
          or new.deadline is distinct from old.deadline or new.audience <> old.audience
          or new.repeats_each_season <> old.repeats_each_season) then
    raise check_violation using message = case old.system_key
      when 'app_terms' then 'the app terms are asked of every player, to use the app'
      else 'the season authorization is asked of every player, every season, to use the app' end;
  end if;
  return new;
end;
$$;

create or replace function private.entity_referral_form_unpublished()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.custom_forms f where f.id = new.form_id and f.system_key = 'entity_referral') then
    raise check_violation using message = 'the referral form has no published versions';
  end if;
  return new;
end;
$$;
revoke all on function private.entity_referral_form_unpublished() from public, anon, authenticated;
create trigger custom_form_versions_entity_referral_unpublished
  before insert on public.custom_form_versions
  for each row execute function private.entity_referral_form_unpublished();

-- Its screens always show and depend on no answer: the database requires every
-- required field of the form. A deleted screen takes its fields and blocks off
-- the form, never her names.
create or replace function private.entity_referral_screen_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.custom_forms f
                  where f.id = new.form_id and f.system_key = 'entity_referral') then
    return new;
  end if;
  if new.is_hidden or new.show_when_field_id is not null or new.system_screen is not null then
    raise check_violation using message = 'a screen of the referral form always shows';
  end if;
  if tg_op = 'UPDATE' and new.is_archived and not old.is_archived then
    if exists (select 1 from public.field_placements p
                 join public.profile_fields f on f.id = p.field_id
                where p.org_id = new.org_id and p.surface = 'entity_form' and p.screen_key = new.id::text
                  and private.is_name_field(f)) then
      raise check_violation using message = 'the entity form always asks her names';
    end if;
    -- The whole screen goes at once, each condition with its question.
    perform set_config('ramassa.moving_placements', 'on', true);
    delete from public.field_placements p
     where p.org_id = new.org_id and p.surface = 'entity_form' and p.screen_key = new.id::text;
    perform set_config('ramassa.moving_placements', 'off', true);
    -- ON DELETE SET NULL keeps every signature given on a block.
    delete from public.form_blocks b
     where b.org_id = new.org_id and b.surface = 'entity_form' and b.screen_key = new.id::text;
  end if;
  return new;
end;
$$;
revoke all on function private.entity_referral_screen_rules() from public, anon, authenticated;
create trigger custom_form_screens_entity_referral_rules
  before insert or update on public.custom_form_screens
  for each row execute function private.entity_referral_screen_rules();

-- 4. The catalog and the setup file --------------------------------------------------------------------------

-- The entity form in one order across its screens, as an older build and the
-- Onboarding setup file read it: screen by screen, then each screen's order,
-- a field before a block and an app field first on a tie.
create or replace function private.entity_form_order(p_org_id uuid)
returns table (id uuid, place integer)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id,
         (row_number() over (order by s.sort_order nulls last, s.created_at, i.sort_order, i.rank,
                                      i.app_rank, i.created_at, i.id) - 1)::integer
    from (select p.id, p.screen_key, p.sort_order, 0 as rank,
                 case when f.kind = 'builtin' then 0 else 1 end as app_rank, p.created_at
            from public.field_placements p
            join public.profile_fields f on f.id = p.field_id
           where p.org_id = p_org_id and p.surface = 'entity_form'
          union all
          select b.id, b.screen_key, b.sort_order, 1, 0, b.created_at
            from public.form_blocks b
           where b.org_id = p_org_id and b.surface = 'entity_form') i
    left join public.custom_form_screens s on s.id::text = i.screen_key;
$$;
revoke all on function private.entity_form_order(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION private.intake_catalog_core(p_with_surveys boolean)
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
  reads_team_forms boolean := with_archived or (select public.has_permission('participants.view'))
    -- The survey builder reads its surveys' drafts (RAPP-929).
    or (p_with_surveys and (select public.has_permission('surveys.results')));
  forms_shown uuid[];
  forms_json jsonb;
  form_placements_json jsonb;
  form_blocks_json jsonb;
  form_consents_json jsonb;
  -- The old Health screen an older build draws: the questions of the
  -- authorization she is shown (RAPP-773). Designers read the form itself.
  old_health_json jsonb := case when with_archived then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', private.stable_uuid((x.p ->> 'id') || ':authorization'), 'field_id', x.p -> 'field_id',
             'surface', 'authorization', 'screen_key', null, 'sort_order', x.place,
             'required', x.p -> 'required', 'label_override', x.p -> 'label_override',
             'help_override', x.p -> 'help_override')
           order by x.place)
      from (select value as p, row_number() over (order by (value ->> 'sort_order')::integer) - 1 as place
              from jsonb_array_elements(coalesce(
                     private.authorization_snapshot_for(actor_org, (select auth.uid())) -> 'placements',
                     '[]'::jsonb))) x
      join public.profile_fields f on f.id = (x.p ->> 'field_id')::uuid and not f.is_archived), '[]'::jsonb) end;
  -- The entity form as an older build reads it (RAPP-938): one order across its screens.
  entity_places jsonb := coalesce((
    select jsonb_object_agg(o.id::text, o.place) from private.entity_form_order(actor_org) o), '{}'::jsonb);
begin
  if (select auth.uid()) is null or actor_org is null then
    raise insufficient_privilege using message = 'the question catalog needs an account';
  end if;
  if reads_team_forms then
    -- The team reads each form's draft, and designers its published versions.
    select coalesce(array_agg(f.id), array[]::uuid[]) into forms_shown
      from public.custom_forms f
     where f.org_id = actor_org and (with_archived or not f.is_archived)
       -- Surveys only for the dashboard that asks for them (RAPP-929).
       and (p_with_surveys or f.kind <> 'survey')
       -- The referral form is sent as `entity_form` (RAPP-938): an older build lists these.
       and f.system_key is distinct from 'entity_referral';
    forms_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'filled_by', f.filled_by, 'mandatory', f.mandatory,
        'deadline', f.deadline,
        -- A survey's activity and closing time (RAPP-929).
        'event_id', f.event_id, 'closes_at', f.closes_at,
        -- What an older build reads (RAPP-700).
        'appears', case when f.audience = 'chosen' then 'sent'
                        when f.repeats_each_season then 'every_season' else 'once' end,
        'audience', f.audience, 'repeats_each_season', f.repeats_each_season,
        -- Legal or other, and the app's own legal forms (RAPP-771).
        'kind', f.kind, 'system_key', f.system_key,
        'recipient_count', (select count(*) from public.custom_form_recipients r where r.form_id = f.id),
        'version', f.version, 'published_at', f.published_at, 'is_archived', f.is_archived,
        'versions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'version', v.version, 'season_id', v.season_id, 'is_correction', v.is_correction,
            'published_at', v.published_at) order by v.version desc)
            from public.custom_form_versions v where v.form_id = f.id and f.system_key is null), '[]'::jsonb)
          -- The app terms' versions are their ledger's (RAPP-772).
          || coalesce((
          select jsonb_agg(jsonb_build_object(
            'version', v.version_number, 'season_id', null, 'is_correction', v.is_correction,
            'published_at', v.published_at) order by v.version_number desc)
            from public.app_terms_versions v
           where f.system_key = 'app_terms' and v.org_id = f.org_id and v.published_at is not null), '[]'::jsonb)
          -- The authorization's are its ledger's, numbered per season (RAPP-773).
          || coalesce((
          select jsonb_agg(jsonb_build_object(
            'version', v.version_number, 'season_id', v.season_id, 'is_correction', v.is_correction,
            'published_at', v.published_at) order by v.published_at desc, v.version_number desc)
            from public.authorization_versions v
           where f.system_key = 'season_authorization' and v.org_id = f.org_id
             and v.published_at is not null), '[]'::jsonb),
        'screens', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', s.id, 'title', s.title, 'intro', s.intro, 'sort_order', s.sort_order,
            'is_hidden', s.is_hidden,
            -- The answer that opens it (RAPP-715); null: it always shows.
            'show_when_field_id', s.show_when_field_id, 'show_when_values', to_jsonb(s.show_when_values),
            -- Its help line and buttons, and its locked part (RAPP-771).
            'texts', s.texts, 'system_screen', s.system_screen,
            -- The season documents (RAPP-773).
            'attachments', s.attachments)
            order by s.sort_order, s.created_at)
            from public.custom_form_screens s
           where s.form_id = f.id and not s.is_archived), '[]'::jsonb))
        order by f.created_at, f.id)
        from public.custom_forms f where f.id = any (forms_shown)), '[]'::jsonb);
    form_placements_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'field_id', p.field_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'custom_form_id', p.custom_form_id, 'sort_order', p.sort_order, 'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.screen_key, p.sort_order, p.created_at)
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id and not f.is_archived
       where p.surface = 'custom_form' and p.custom_form_id = any (forms_shown)), '[]'::jsonb);
    form_blocks_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'surface', b.surface, 'screen_key', b.screen_key, 'custom_form_id', b.custom_form_id,
        'kind', b.kind, 'body', b.body, 'title', b.title, 'points', b.points,
        -- A legal form's own signature and its texts (RAPP-773).
        'settings', b.settings, 'sort_order', b.sort_order)
        order by b.screen_key, b.sort_order, b.created_at)
        from public.form_blocks b
       where b.surface = 'custom_form' and b.custom_form_id = any (forms_shown)), '[]'::jsonb);
    form_consents_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'consent_id', p.consent_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'custom_form_id', p.custom_form_id, 'sort_order', p.sort_order, 'required', p.required,
        -- The form's own wording of the consent (RAPP-771).
        'body_override', p.body_override)
        order by p.screen_key, p.sort_order, p.created_at)
        from public.consent_placements p
        join public.consents c on c.id = p.consent_id and not c.is_archived
       where p.surface = 'custom_form' and p.custom_form_id = any (forms_shown)), '[]'::jsonb);
  else
    -- She reads the published version of each live form she fills in
    -- (RAPP-701); a test player the draft of a legal form (RAPP-771).
    with live as (
      select f.id, f.audience, f.repeats_each_season, f.published_at, f.kind, f.system_key, v.version, v.content
        from public.custom_forms f
        cross join lateral private.custom_form_version_for(f.id, (select auth.uid())) v
       where f.org_id = actor_org and f.filled_by = 'player' and not f.is_archived
         and f.system_key is null
         -- A survey reaches her through my_surveys, never the catalog (RAPP-929).
         and f.kind <> 'survey'
      union all
      -- The terms form as the version she is shown holds it (RAPP-772).
      select f.id, f.audience, f.repeats_each_season, f.published_at, f.kind, f.system_key,
             coalesce(v.version_number, (select coalesce(max(x.version_number), 0) + 1
                                           from public.app_terms_versions x where x.org_id = f.org_id)),
             private.app_terms_version_snapshot(v)
        from public.custom_forms f
        cross join lateral private.app_terms_version_for(f.org_id, (select auth.uid())) v
       where f.org_id = actor_org and f.system_key = 'app_terms' and v.id is not null
         and private.app_terms_version_snapshot(v) is not null
      union all
      -- The authorization form as the version she is shown holds it (RAPP-773).
      select f.id, f.audience, f.repeats_each_season, f.published_at, f.kind, f.system_key,
             coalesce(v.version_number, (select coalesce(max(x.version_number), 0) + 1
                                           from public.authorization_versions x where x.season_id = v.season_id)),
             private.authorization_version_snapshot(v)
        from public.custom_forms f
        cross join lateral private.authorization_version_for(f.org_id, (select auth.uid())) v
       where f.org_id = actor_org and f.system_key = 'season_authorization' and v.id is not null
         and private.authorization_version_snapshot(v) is not null)
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'name', l.content -> 'name', 'filled_by', 'player',
        'mandatory', l.content ->> 'mandatory', 'deadline', l.content -> 'deadline',
        'appears', case when l.audience = 'chosen' then 'sent'
                        when l.repeats_each_season then 'every_season' else 'once' end,
        'audience', l.audience, 'repeats_each_season', l.repeats_each_season,
        'kind', l.kind, 'system_key', l.system_key,
        'version', l.version, 'published_at', l.published_at, 'is_archived', false,
        'screens', l.content -> 'screens')), '[]'::jsonb),
      coalesce((
        select jsonb_agg(p || jsonb_build_object('surface', 'custom_form', 'custom_form_id', l2.id))
          from live l2
          cross join lateral jsonb_array_elements(l2.content -> 'placements') p
          join public.profile_fields f on f.id = (p ->> 'field_id')::uuid and not f.is_archived), '[]'::jsonb),
      coalesce((
        -- A version published before RAPP-770 names no kind: its blocks are signatures.
        select jsonb_agg(b || jsonb_build_object('surface', 'custom_form', 'custom_form_id', l2.id,
                                                 'kind', coalesce(b ->> 'kind', 'signature')))
          from live l2
          cross join lateral jsonb_array_elements(l2.content -> 'blocks') b), '[]'::jsonb),
      coalesce((
        select jsonb_agg(p || jsonb_build_object('surface', 'custom_form', 'custom_form_id', l2.id))
          from live l2
          cross join lateral jsonb_array_elements(l2.content -> 'consent_placements') p
          join public.consents c on c.id = (p ->> 'consent_id')::uuid and not c.is_archived), '[]'::jsonb)
      into forms_json, form_placements_json, form_blocks_json, form_consents_json
      from live l;
  end if;
  return jsonb_build_object(
    -- Ramassà screens. The fields each one asks are its placements, below.
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'intro', s.intro, 'after_screen', s.after_screen,
        'sort_order', s.sort_order, 'is_archived', s.is_archived, 'is_hidden', s.is_hidden,
            -- The answer that opens it (RAPP-715); null: it always shows.
            'show_when_field_id', s.show_when_field_id, 'show_when_values', to_jsonb(s.show_when_values),
            -- Its help line and buttons (RAPP-771).
            'texts', s.texts)
        order by array_position(private.intake_builtin_screens(), s.after_screen), s.sort_order, s.created_at)
        from public.intake_screens s
       where s.org_id = actor_org and (with_archived or not s.is_archived)), '[]'::jsonb),
    -- The app's questions as staff worded or hid them (RAPP-666).
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
    'builtin_screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'screen', b.screen, 'texts', b.texts,
        'is_deleted', b.is_deleted,
        'is_hidden', b.is_deleted or (b.is_hidden and private.builtin_screen_hideable(b.screen)))
        order by b.screen)
        from public.intake_builtin_screens b where b.org_id = actor_org), '[]'::jsonb),
    -- The wizard steps as staff arranged them (RAPP-612); null is the app's order.
    'flow_order', (
      select to_jsonb(f.step_order) from public.intake_flow_orders f where f.org_id = actor_org),
    -- The built-in questions that need an answer (RAPP-611).
    'required_questions', to_jsonb(private.required_intake_questions(actor_org)),
    -- The app terms she accepts (RAPP-613, RAPP-772).
    'terms', (
      select jsonb_build_object('id', v.id, 'version_number', v.version_number,
                                'content', private.app_terms_version_content(v),
                                'is_draft', v.published_at is null,
                                'form_id', private.app_terms_form_id(actor_org),
                                'legacy_compatible', private.app_terms_version_compatible(v))
        from private.app_terms_version_for(actor_org, (select auth.uid())) v
       where v.id is not null),
    -- The profile layout (RAPP-649): sections, fields and where each is asked.
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'key', s.key, 'title', s.title, 'sort_order', s.sort_order, 'is_builtin', s.is_builtin)
        order by s.sort_order, s.created_at)
        from public.profile_sections s where s.org_id = actor_org), '[]'::jsonb),
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'section_id', f.section_id, 'kind', f.kind, 'survey_form_id', f.survey_form_id, 'system_key', f.system_key,
        'question_type', f.question_type, 'label', f.label, 'help', f.help, 'privacy', f.privacy,
        'read_permission', f.read_permission,
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
       where f.org_id = actor_org and (with_archived or not f.is_archived)
         -- A survey's questions only for the dashboard that asks for them (RAPP-929).
         and (p_with_surveys or f.kind <> 'survey')), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'field_id', p.field_id, 'surface', p.surface,
        -- The entity form as an older build reads it: no screen, one order (RAPP-938).
        'screen_key', case when p.surface = 'entity_form' then null else p.screen_key end,
        'sort_order', case when p.surface = 'entity_form'
                           then coalesce((entity_places ->> p.id::text)::integer, p.sort_order)
                           else p.sort_order end,
        'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.surface, p.screen_key, p.sort_order, p.created_at)
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id
       where p.org_id = actor_org and p.surface <> 'custom_form'
         and (with_archived or not f.is_archived)), '[]'::jsonb) || old_health_json,
    -- The blocks of each screen and of the entity form (RAPP-690).
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'surface', b.surface,
        'screen_key', case when b.surface = 'entity_form' then null else b.screen_key end,
        'kind', b.kind, 'body', b.body, 'title', b.title, 'points', b.points,
        'sort_order', case when b.surface = 'entity_form'
                           then coalesce((entity_places ->> b.id::text)::integer, b.sort_order)
                           else b.sort_order end)
        order by b.surface, b.screen_key, b.sort_order, b.created_at)
        from public.form_blocks b where b.org_id = actor_org and b.surface <> 'custom_form'), '[]'::jsonb),
    -- Dades legals (RAPP-699): the consents and where each is asked.
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'key', c.key, 'system_key', c.system_key, 'name', c.name, 'body', c.body,
        'is_archived', c.is_archived)
        order by c.created_at, c.key)
        from public.consents c
       where c.org_id = actor_org and (with_archived or not c.is_archived)), '[]'::jsonb),
    'consent_placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'consent_id', p.consent_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'sort_order', p.sort_order, 'required', p.required)
        order by p.surface, p.screen_key, p.sort_order, p.created_at)
        from public.consent_placements p
        join public.consents c on c.id = p.consent_id and not c.is_archived
       where p.org_id = actor_org and p.surface <> 'custom_form'), '[]'::jsonb),
    -- The forms the team created (RAPP-700, RAPP-701), with their screens in order.
    'custom_forms', forms_json,
    'custom_form_placements', form_placements_json,
    'custom_form_blocks', form_blocks_json,
    'custom_form_consent_placements', form_consents_json,
    -- The referral form (RAPP-938): its screens and the screen of each of its
    -- fields and blocks, by id. An older build drops this key.
    'entity_form', (
      select jsonb_build_object(
        'id', f.id, 'name', f.name,
        'screens', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', s.id, 'title', s.title, 'intro', s.intro, 'sort_order', s.sort_order, 'texts', s.texts)
            order by s.sort_order, s.created_at)
            from public.custom_form_screens s
           where s.form_id = f.id and not s.is_archived), '[]'::jsonb),
        'items', coalesce((
          select jsonb_agg(jsonb_build_object('id', i.id, 'screen_key', i.screen_key))
            from (select p.id, p.screen_key from public.field_placements p
                   where p.org_id = actor_org and p.surface = 'entity_form'
                  union all
                  select b.id, b.screen_key from public.form_blocks b
                   where b.org_id = actor_org and b.surface = 'entity_form') i), '[]'::jsonb))
        from public.custom_forms f
       where f.org_id = actor_org and f.system_key = 'entity_referral')
  );
end;
$function$;

revoke all on function private.intake_catalog_core(boolean) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.export_onboarding_setup(p_app_commit text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        'field_id', p.field_id, 'surface', p.surface,
        -- The referral form's screens stay out of the file (RAPP-938): its
        -- fields are listed in one order and land on its first screen.
        'screen_key', case when p.surface = 'entity_form' then null else p.screen_key end,
        'sort_order', coalesce(o.place, p.sort_order), 'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.surface, p.screen_key, coalesce(o.place, p.sort_order), coalesce(f.system_key, f.id::text))
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id
        left join private.entity_form_order(actor_org) o on o.id = p.id
       where p.org_id = actor_org and p.surface not in ('authorization', 'custom_form')), '[]'::jsonb),
    -- Ramassà screens, in the order of their anchors.
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'intro', s.intro,
        'after_screen', s.after_screen, 'sort_order', s.sort_order,
        'home_after_screen', s.home_after_screen, 'home_sort_order', s.home_sort_order,
        'is_archived', s.is_archived, 'is_hidden', s.is_hidden,
        -- The answer that opens it (RAPP-715); an older file has none.
        'show_when_field_id', s.show_when_field_id, 'show_when_values', to_jsonb(s.show_when_values))
        order by array_position(private.intake_builtin_screens(), s.after_screen), s.sort_order, s.created_at, s.id)
        from public.intake_screens s where s.org_id = actor_org), '[]'::jsonb),
    -- The placements above carry the wording, the hiding and the required
    -- flag of the app's questions (RAPP-666). The two lists stay in the file,
    -- empty, so it is still a version 3 file; an older file may fill them.
    'builtin_question_overrides', '[]'::jsonb,
    'builtin_screens', coalesce((
      select jsonb_agg(jsonb_build_object('screen', b.screen, 'texts', b.texts, 'is_hidden', b.is_hidden, 'is_deleted', b.is_deleted)
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
    -- Every block of the screens (RAPP-690, RAPP-770), in the order they share
    -- with the placements. The key keeps its first name, so an older file reads.
    'signature_blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'surface', b.surface,
        'screen_key', case when b.surface = 'entity_form' then null else b.screen_key end,
        'kind', b.kind, 'body', b.body, 'title', b.title, 'points', b.points,
        'sort_order', coalesce(o.place, b.sort_order))
        order by b.surface, b.screen_key, coalesce(o.place, b.sort_order), b.created_at, b.id)
        from public.form_blocks b
        left join private.entity_form_order(actor_org) o on o.id = b.id
       where b.org_id = actor_org and b.surface <> 'custom_form'), '[]'::jsonb),
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
$function$;
