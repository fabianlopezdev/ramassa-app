-- Screens that depend on an answer of another screen (RAPP-715).
--
-- WHY
--
-- Ramassà asks some questions only to the players they concern: the
-- passport number to a woman who has a passport, a follow-up about childcare
-- to a woman who needs it. Until now only the app's own follow-ups did that,
-- in code. One rule now serves every screen: "show this screen when her
-- answer to [question] is one of [answers]".
--
-- THE MODEL
--
-- A screen of Onboarding the team made (`intake_screens`) or a screen of a
-- form the team created (`custom_form_screens`) can carry a condition:
-- `show_when_field_id`, a choice field (single choice, multiple choice,
-- searchable list, yes/no, yes/no/maybe, the app's choice fields included),
-- and `show_when_values`, the answers that open it: option ids for a field
-- with options, `yes` / `no` / `maybe` for the others. For a multiple choice,
-- one ticked answer among them opens it.
--
-- The question lives where the field is placed on the same form: its parent
-- screen. The parent must come earlier, so a condition never points to the
-- screen itself, to a later screen or to one of its own follow-ups (a loop).
-- Nesting has no limit. Placing the field later on, or on the screen or one
-- of its follow-ups, is refused for the same reason.
--
-- THE ORDERING RULE
--
-- A conditional screen sits right after its parent, after the parent's
-- earlier follow-ups and their own follow-ups (depth first: 3, 3a, 3a.1, 3b).
-- Follow-ups of one parent keep their own order. The database stores this
-- order (Onboarding's flow order and each screen's anchor, a form's
-- sort_order) every time a condition or the order changes. An older app
-- build that does not read conditions walks the stored order: it shows a
-- conditional screen in its place, to everyone. The database never requires
-- an answer, a signature or a consent on a screen whose condition does not
-- hold for her, so an older build can always finish.
--
-- A hidden screen hides its follow-ups. A follow-up whose question is no
-- longer asked on the form (its parent was deleted) keeps its condition: it
-- opens only for a stored answer that matches.
--
-- THE APP'S OWN FOLLOW-UPS
--
-- The document follow-up becomes one screen per answer: `documentation-nie`,
-- `documentation-passport`, `documentation-other`, each with its own
-- wording. Saved wording of `documentation-details` is copied onto the
-- three. Their conditions are the app's (`DETAIL_SCREEN_BRANCHES` in
-- `packages/shared/onboarding/screen-texts.ts`), expressed in the same model.
--
-- WHAT THIS MIGRATION DOES
--
--   1. The two columns on both screen tables.
--   2. Helpers: where a screen's question lives, the order with follow-ups
--      after their parents, whether a screen opens for her.
--   3. `public.save_screen_condition` sets or removes a condition.
--   4. Saving an order keeps follow-ups after their parents; placing a field
--      keeps every condition pointing earlier.
--   5. A hidden parent hides its follow-ups; her required answers,
--      signatures and consents count only on the screens that open for her.
--   6. The catalog, a form's published version and the Onboarding setup file
--      carry the conditions. An older file imports as before, and its
--      `documentation-details` wording lands on the three document screens.
--   7. The document split.
--
-- Docs: https://www.postgresql.org/docs/current/plpgsql-control-structures.html
--       https://www.postgresql.org/docs/current/functions-array.html

-- 1. The condition ------------------------------------------------------------------------------------------

alter table public.intake_screens
  add column show_when_field_id uuid references public.profile_fields (id) on delete set null,
  add column show_when_values text[],
  add constraint intake_screens_condition_whole
    check ((show_when_field_id is null) = (show_when_values is null)
           and (show_when_values is null or cardinality(show_when_values) between 1 and 500));
alter table public.custom_form_screens
  add column show_when_field_id uuid references public.profile_fields (id) on delete set null,
  add column show_when_values text[],
  add constraint custom_form_screens_condition_whole
    check ((show_when_field_id is null) = (show_when_values is null)
           and (show_when_values is null or cardinality(show_when_values) between 1 and 500));
create index intake_screens_show_when_field_idx
  on public.intake_screens (show_when_field_id) where show_when_field_id is not null;
create index custom_form_screens_show_when_field_idx
  on public.custom_form_screens (show_when_field_id) where show_when_field_id is not null;
comment on column public.intake_screens.show_when_field_id is
  'The choice field whose answer opens this screen (RAPP-715); null: it always shows.';
comment on column public.intake_screens.show_when_values is
  'The answers that open it: option ids, or yes / no / maybe.';
comment on column public.custom_form_screens.show_when_field_id is
  'The choice field whose answer opens this screen (RAPP-715); null: it always shows.';
comment on column public.custom_form_screens.show_when_values is
  'The answers that open it: option ids, or yes / no / maybe.';

-- 2. Helpers ------------------------------------------------------------------------------------------------

-- The field types a screen can depend on.
create or replace function private.condition_field_types()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['single_choice', 'multiple_choice', 'search_choice', 'yes_no', 'yes_no_maybe'];
$$;

-- Whether a stored answer is one of the answers that open a screen.
create or replace function private.answer_matches(p_answer jsonb, p_values text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(case jsonb_typeof(p_answer)
    when 'string' then (p_answer #>> '{}') = any (p_values)
    when 'array' then exists (select 1 from jsonb_array_elements_text(p_answer) a where a = any (p_values))
    when 'boolean' then (case when p_answer = 'true'::jsonb then 'yes' else 'no' end) = any (p_values)
    else false end, false);
$$;

-- The step key of an Onboarding screen key: `custom:<id>` for a team screen.
create or replace function private.onboarding_step_key(p_screen_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when private.is_uuid_text(p_screen_key) then 'custom:' || p_screen_key else p_screen_key end;
$$;

-- The screen holding the question a screen depends on (its parent), as a
-- screen key; null for a screen with no condition or whose question is asked
-- nowhere on its form.
create or replace function private.screen_parent_key(p_org_id uuid, p_surface text, p_screen_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.screen_key
    from (select s.show_when_field_id as field_id, null::uuid as form_id
            from public.intake_screens s
           where p_surface = 'onboarding' and private.is_uuid_text(p_screen_key)
             and s.id = p_screen_key::uuid and s.org_id = p_org_id
          union all
          select s.show_when_field_id, s.form_id
            from public.custom_form_screens s
           where p_surface = 'custom_form' and private.is_uuid_text(p_screen_key)
             and s.id = p_screen_key::uuid and s.org_id = p_org_id) c
    join public.field_placements p
      on p.field_id = c.field_id and p.org_id = p_org_id and p.surface = p_surface
     and p.custom_form_id is not distinct from c.form_id
   limit 1;
$$;
revoke all on function private.screen_parent_key(uuid, text, text) from public, anon, authenticated;

-- A step and its follow-ups, depth first, in the order of the list.
create or replace function private.step_and_branches(p_step text, p_steps text[], p_parents jsonb, p_depth integer)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  result text[] := array[p_step];
  child text;
begin
  if p_depth > 64 then
    return result;
  end if;
  foreach child in array p_steps loop
    if child <> p_step and p_parents ->> child = p_step then
      result := array_cat(result, private.step_and_branches(child, p_steps, p_parents, p_depth + 1));
    end if;
  end loop;
  return result;
end;
$$;

-- The ordering rule: each follow-up right after its parent and the parent's
-- earlier follow-ups. `p_parents` maps a step to its parent step.
create or replace function private.with_branches_after_parents(p_steps text[], p_parents jsonb)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  steps text[] := coalesce(p_steps, array[]::text[]);
  result text[] := array[]::text[];
  step text;
begin
  foreach step in array steps loop
    if p_parents ->> step is null or not ((p_parents ->> step) = any (steps)) then
      result := array_cat(result, private.step_and_branches(step, steps, p_parents, 0));
    end if;
  end loop;
  -- A step caught in a loop the rules refuse stays, at the end.
  foreach step in array steps loop
    if not (step = any (result)) then
      result := array_append(result, step);
    end if;
  end loop;
  return result;
end;
$$;

-- Onboarding's follow-ups: each conditional team screen's step and its parent's step.
create or replace function private.onboarding_screen_parents(p_org_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg('custom:' || s.id, private.onboarding_step_key(p.screen_key)), '{}'::jsonb)
    from public.intake_screens s
    join public.field_placements p
      on p.field_id = s.show_when_field_id and p.org_id = s.org_id and p.surface = 'onboarding'
   where s.org_id = p_org_id and not s.is_archived and s.show_when_field_id is not null;
$$;
revoke all on function private.onboarding_screen_parents(uuid) from public, anon, authenticated;

-- Onboarding's movable steps in her order, as her phone plans them
-- (`wizardFlowOrder`): the stored order, each step it leaves out after the
-- step it follows in the app's own order, then the ordering rule.
create or replace function private.onboarding_step_order(p_org_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  defaults text[] := array[]::text[];
  saved text[];
  placed text[] := array[]::text[];
  anchor text;
  step text;
  before text;
  at integer;
begin
  foreach anchor in array array['identity', 'background', 'documentation', 'logistics', 'season'] loop
    defaults := array_append(defaults, anchor);
    if anchor = 'logistics' then
      defaults := array_append(defaults, 'equipment');
    elsif anchor = 'season' then
      defaults := array_cat(defaults, array['supporting-entities', 'participation-support', 'specific-needs']);
    end if;
    defaults := array_cat(defaults, coalesce((
      select array_agg('custom:' || s.id order by s.sort_order, s.created_at)
        from public.intake_screens s
       where s.org_id = p_org_id and not s.is_archived and s.after_screen = anchor), array[]::text[]));
  end loop;
  select f.step_order into saved from public.intake_flow_orders f where f.org_id = p_org_id;
  foreach step in array coalesce(saved, array[]::text[]) loop
    if step = any (defaults) and not (step = any (placed)) then
      placed := array_append(placed, step);
    end if;
  end loop;
  for i in 1 .. coalesce(cardinality(defaults), 0) loop
    step := defaults[i];
    continue when step = any (placed);
    before := null;
    for j in reverse i - 1 .. 1 loop
      if defaults[j] = any (placed) then
        before := defaults[j];
        exit;
      end if;
    end loop;
    if before is null then
      placed := array_prepend(step, placed);
    else
      at := array_position(placed, before);
      placed := array_cat(array_append(placed[1:at], step), placed[at + 1:]);
    end if;
  end loop;
  return private.with_branches_after_parents(placed, private.onboarding_screen_parents(p_org_id));
end;
$$;
revoke all on function private.onboarding_step_order(uuid) from public, anon, authenticated;

-- A form's follow-ups: each conditional screen and its parent screen.
create or replace function private.custom_form_screen_parents(p_form_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(s.id::text, p.screen_key), '{}'::jsonb)
    from public.custom_form_screens s
    join public.field_placements p
      on p.field_id = s.show_when_field_id and p.surface = 'custom_form' and p.custom_form_id = s.form_id
   where s.form_id = p_form_id and not s.is_archived and s.show_when_field_id is not null;
$$;
revoke all on function private.custom_form_screen_parents(uuid) from public, anon, authenticated;

-- A form's live screens in her order, by the ordering rule.
create or replace function private.custom_form_screen_order(p_form_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select private.with_branches_after_parents(
    coalesce((select array_agg(s.id::text order by s.sort_order, s.created_at)
                from public.custom_form_screens s
               where s.form_id = p_form_id and not s.is_archived), array[]::text[]),
    private.custom_form_screen_parents(p_form_id));
$$;
revoke all on function private.custom_form_screen_order(uuid) from public, anon, authenticated;

-- Stores Onboarding's order and anchors each team screen to the step before
-- it (the body `save_intake_flow_order` had).
create or replace function private.store_intake_flow_order(p_org_id uuid, p_steps text[], p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  anchor text := 'identity';
  entry record;
begin
  insert into public.intake_flow_orders (org_id, step_order, updated_at, updated_by)
  values (p_org_id, p_steps, now(), p_actor)
  on conflict (org_id) do update
    set step_order = excluded.step_order, updated_at = now(), updated_by = excluded.updated_by;
  for entry in select step, step_position from unnest(p_steps) with ordinality as o(step, step_position) loop
    if entry.step like 'custom:%' then
      update public.intake_screens
         set after_screen = anchor, sort_order = entry.step_position::integer, updated_at = now()
       where id = substr(entry.step, 8)::uuid and org_id = p_org_id
         and (after_screen is distinct from anchor or sort_order is distinct from entry.step_position::integer);
    else
      anchor := private.flow_step_anchor(entry.step);
    end if;
  end loop;
end;
$$;
revoke all on function private.store_intake_flow_order(uuid, text[], uuid) from public, anon, authenticated;

-- Keeps the stored orders by the ordering rule, for older builds: Onboarding's
-- when it has a follow-up, a form's always.
create or replace function private.keep_branches_after_parents(p_org_id uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.intake_screens s
              where s.org_id = p_org_id and not s.is_archived and s.show_when_field_id is not null) then
    perform private.store_intake_flow_order(p_org_id, private.onboarding_step_order(p_org_id), p_actor);
  end if;
end;
$$;
revoke all on function private.keep_branches_after_parents(uuid, uuid) from public, anon, authenticated;

create or replace function private.keep_form_branches_after_parents(p_form_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.custom_form_screens s
     set sort_order = o.place::integer - 1, updated_at = now()
    from unnest(private.custom_form_screen_order(p_form_id)) with ordinality as o(id, place)
   where s.id = o.id::uuid and s.sort_order is distinct from o.place::integer - 1;
$$;
revoke all on function private.keep_form_branches_after_parents(uuid) from public, anon, authenticated;

-- Whether a screen opens for her: live, not hidden (nor its parent), and her
-- stored answer opens it and every screen above it. The app's screens open
-- unless hidden; their own follow-ups are the app's.
create or replace function private.screen_opens_for(
  p_profile_id uuid, p_org_id uuid, p_surface text, p_screen_key text, p_depth integer default 0)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  is_live boolean;
  hidden boolean;
  depends_on uuid;
  opening text[];
  field public.profile_fields;
begin
  if p_screen_key is null then
    return true;
  end if;
  if not private.is_uuid_text(p_screen_key) then
    return not private.screen_is_hidden(p_org_id, p_surface, p_screen_key);
  end if;
  if p_depth > 64 then
    return false;
  end if;
  if p_surface = 'onboarding' then
    select not s.is_archived, s.is_hidden, s.show_when_field_id, s.show_when_values
      into is_live, hidden, depends_on, opening
      from public.intake_screens s where s.id = p_screen_key::uuid and s.org_id = p_org_id;
  elsif p_surface = 'custom_form' then
    select not s.is_archived, s.is_hidden, s.show_when_field_id, s.show_when_values
      into is_live, hidden, depends_on, opening
      from public.custom_form_screens s where s.id = p_screen_key::uuid and s.org_id = p_org_id;
  else
    return true;
  end if;
  if not coalesce(is_live, false) or hidden then
    return false;
  end if;
  if depends_on is not null then
    select * into field from public.profile_fields where id = depends_on;
    if field.id is null or field.is_archived
       or not private.answer_matches(private.field_answer_now(p_profile_id, field), opening) then
      return false;
    end if;
  end if;
  return private.screen_opens_for(p_profile_id, p_org_id, p_surface,
                                  private.screen_parent_key(p_org_id, p_surface, p_screen_key), p_depth + 1);
end;
$$;
revoke all on function private.screen_opens_for(uuid, uuid, text, text, integer) from public, anon, authenticated;

-- The same for a screen of a form's published version, read from the version
-- itself: its screens with their conditions and its placements.
create or replace function private.content_screen_opens(
  p_profile_id uuid, p_content jsonb, p_screen_key text, p_depth integer default 0)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  screen jsonb;
  field public.profile_fields;
  parent text;
begin
  if p_depth > 64 then
    return false;
  end if;
  select s into screen from jsonb_array_elements(p_content -> 'screens') s where s ->> 'id' = p_screen_key;
  if screen is null then
    return false;
  end if;
  if private.json_value_or_null(screen -> 'show_when_field_id') is null then
    return true;
  end if;
  select * into field from public.profile_fields where id = (screen ->> 'show_when_field_id')::uuid;
  if field.id is null or field.is_archived or not private.answer_matches(
       private.field_answer_now(p_profile_id, field),
       array(select jsonb_array_elements_text(coalesce(screen -> 'show_when_values', '[]'::jsonb)))) then
    return false;
  end if;
  select p ->> 'screen_key' into parent
    from jsonb_array_elements(p_content -> 'placements') p
   where p ->> 'field_id' = field.id::text
   limit 1;
  return parent is null or private.content_screen_opens(p_profile_id, p_content, parent, p_depth + 1);
end;
$$;
revoke all on function private.content_screen_opens(uuid, jsonb, text, integer) from public, anon, authenticated;

-- Every Onboarding screen that opens for her: the app's and the team's.
create or replace function private.onboarding_open_screens(p_profile_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  with her as (select p.org_id from public.profiles p where p.id = p_profile_id)
  select coalesce(array_agg(k.screen_key), array[]::text[])
    from (select distinct s.screen as screen_key from private.system_profile_fields() s
          union
          select i.id::text from public.intake_screens i, her
           where i.org_id = her.org_id and not i.is_archived) k, her
   where private.screen_opens_for(p_profile_id, her.org_id, 'onboarding', k.screen_key);
$$;
revoke all on function private.onboarding_open_screens(uuid) from public, anon, authenticated;

-- 3. Setting a condition ------------------------------------------------------------------------------------

create or replace function public.save_screen_condition(p_screen_id uuid, p_field_id uuid, p_values text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  asked_on text;
  the_form uuid;
  field public.profile_fields;
  answers text[];
  parent text;
  ancestor text;
  depth integer := 0;
  order_keys text[];
  screen_step text;
  parent_step text;
begin
  if exists (select 1 from public.intake_screens s
              where s.id = p_screen_id and s.org_id = actor_org and not s.is_archived) then
    asked_on := 'onboarding';
  else
    select s.form_id into the_form
      from public.custom_form_screens s
      join public.custom_forms f on f.id = s.form_id and not f.is_archived
     where s.id = p_screen_id and s.org_id = actor_org and not s.is_archived;
    if the_form is null then
      raise no_data_found using message = 'no such screen';
    end if;
    asked_on := 'custom_form';
  end if;

  if p_field_id is null then
    if asked_on = 'onboarding' then
      update public.intake_screens set show_when_field_id = null, show_when_values = null, updated_at = now()
       where id = p_screen_id;
    else
      update public.custom_form_screens set show_when_field_id = null, show_when_values = null, updated_at = now()
       where id = p_screen_id;
    end if;
    insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
    values (actor_org, (select auth.uid()), 'intake.screen_condition',
            case asked_on when 'onboarding' then 'intake_screen' else 'custom_form_screen' end, p_screen_id,
            jsonb_build_object('surface', asked_on, 'field', null, 'values', null));
    return;
  end if;

  select * into field from public.profile_fields
   where id = p_field_id and org_id = actor_org and not is_archived;
  if field.id is null then
    raise no_data_found using message = 'no such question';
  end if;
  if not (field.question_type = any (private.condition_field_types())) then
    raise check_violation using message = 'a screen depends on the answer to a choice question';
  end if;
  answers := array(select distinct v from unnest(coalesce(p_values, array[]::text[])) v where v is not null order by v);
  if cardinality(answers) = 0 then
    raise check_violation using message = 'a screen depends on at least one answer';
  end if;
  if field.question_type in ('yes_no', 'yes_no_maybe') then
    if exists (select 1 from unnest(answers) v
                where not (v = any (case field.question_type when 'yes_no' then array['yes', 'no']
                                                             else array['yes', 'no', 'maybe'] end))) then
      raise check_violation using message = 'an answer of this question';
    end if;
  elsif exists (select 1 from unnest(answers) v
                 where not exists (select 1 from public.custom_question_options o
                                    where o.question_id = field.id and o.id::text = v and not o.is_archived)) then
    raise check_violation using message = 'an answer of this question';
  end if;

  select p.screen_key into parent from public.field_placements p
   where p.field_id = field.id and p.org_id = actor_org and p.surface = asked_on
     and p.custom_form_id is not distinct from the_form;
  if parent is null then
    raise check_violation using message = 'the question is asked on an earlier screen of the same form';
  end if;
  if parent = p_screen_id::text then
    raise check_violation using message = 'a screen cannot depend on a question asked on it';
  end if;
  ancestor := parent;
  while ancestor is not null and depth < 64 loop
    if ancestor = p_screen_id::text then
      raise check_violation using message = 'that condition would make a loop';
    end if;
    ancestor := private.screen_parent_key(actor_org, asked_on, ancestor);
    depth := depth + 1;
  end loop;
  if asked_on = 'onboarding' then
    order_keys := private.onboarding_step_order(actor_org);
    screen_step := 'custom:' || p_screen_id;
    parent_step := private.onboarding_step_key(parent);
  else
    order_keys := private.custom_form_screen_order(the_form);
    screen_step := p_screen_id::text;
    parent_step := parent;
  end if;
  if array_position(order_keys, parent_step) is null
     or array_position(order_keys, parent_step) > array_position(order_keys, screen_step) then
    raise check_violation using message = 'the question is asked on an earlier screen of the same form';
  end if;

  if asked_on = 'onboarding' then
    update public.intake_screens set show_when_field_id = field.id, show_when_values = answers, updated_at = now()
     where id = p_screen_id;
    perform private.keep_branches_after_parents(actor_org, (select auth.uid()));
  else
    update public.custom_form_screens set show_when_field_id = field.id, show_when_values = answers, updated_at = now()
     where id = p_screen_id;
    perform private.keep_form_branches_after_parents(the_form);
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.screen_condition',
          case asked_on when 'onboarding' then 'intake_screen' else 'custom_form_screen' end, p_screen_id,
          jsonb_build_object('surface', asked_on, 'field', field.id, 'values', to_jsonb(answers)));
end;
$$;
revoke all on function public.save_screen_condition(uuid, uuid, text[]) from public, anon;
grant execute on function public.save_screen_condition(uuid, uuid, text[]) to authenticated;

-- 4. Placing a field keeps every condition pointing earlier ---------------------------------------------

create or replace function private.placement_keeps_screen_conditions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  dependent record;
  ancestor text;
  depth integer;
  order_keys text[];
  placed_at integer;
  dependent_at integer;
begin
  if new.surface not in ('onboarding', 'custom_form') or new.screen_key is null then
    return new;
  end if;
  for dependent in
    select s.id from public.intake_screens s
     where new.surface = 'onboarding' and s.org_id = new.org_id
       and s.show_when_field_id = new.field_id and not s.is_archived
    union all
    select s.id from public.custom_form_screens s
     where new.surface = 'custom_form' and s.form_id = new.custom_form_id
       and s.show_when_field_id = new.field_id and not s.is_archived
  loop
    if new.screen_key = dependent.id::text then
      raise check_violation using message = 'a screen cannot depend on a question asked on it';
    end if;
    ancestor := new.screen_key;
    depth := 0;
    while ancestor is not null and depth < 64 loop
      if ancestor = dependent.id::text then
        raise check_violation using message = 'that condition would make a loop';
      end if;
      ancestor := private.screen_parent_key(new.org_id, new.surface, ancestor);
      depth := depth + 1;
    end loop;
    if new.surface = 'onboarding' then
      order_keys := private.onboarding_step_order(new.org_id);
      placed_at := array_position(order_keys, private.onboarding_step_key(new.screen_key));
      dependent_at := array_position(order_keys, 'custom:' || dependent.id);
    else
      order_keys := private.custom_form_screen_order(new.custom_form_id);
      placed_at := array_position(order_keys, new.screen_key);
      dependent_at := array_position(order_keys, dependent.id::text);
    end if;
    if placed_at is not null and dependent_at is not null and placed_at > dependent_at then
      raise check_violation using message = 'the question is asked on an earlier screen of the same form';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.placement_keeps_screen_conditions() from public, anon, authenticated;

create trigger field_placements_keep_screen_conditions
  before insert or update of screen_key on public.field_placements
  for each row execute function private.placement_keeps_screen_conditions();

-- 5. A hidden parent hides its follow-ups ------------------------------------------------------------------

create or replace function private.screen_is_hidden_at(p_org_id uuid, p_surface text, p_screen_key text, p_depth integer)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_screen_key is null or p_depth > 64 then
    return false;
  end if;
  if p_surface = 'onboarding' and private.is_uuid_text(p_screen_key) then
    if exists (select 1 from public.intake_screens s
                where s.id = p_screen_key::uuid and s.org_id = p_org_id and s.is_hidden) then
      return true;
    end if;
  elsif p_surface = 'onboarding' then
    return exists (select 1 from public.intake_builtin_screens b
                    where b.org_id = p_org_id and b.screen = p_screen_key and b.is_hidden)
           and private.builtin_screen_hideable(p_screen_key);
  elsif p_surface = 'custom_form' and private.is_uuid_text(p_screen_key) then
    if exists (select 1 from public.custom_form_screens s
                where s.id = p_screen_key::uuid and s.org_id = p_org_id and s.is_hidden) then
      return true;
    end if;
  else
    return false;
  end if;
  return private.screen_is_hidden_at(p_org_id, p_surface,
                                     private.screen_parent_key(p_org_id, p_surface, p_screen_key), p_depth + 1);
end;
$$;
revoke all on function private.screen_is_hidden_at(uuid, text, text, integer) from public, anon, authenticated;

create or replace function private.screen_is_hidden(p_org_id uuid, p_surface text, p_screen_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.screen_is_hidden_at(p_org_id, p_surface, p_screen_key, 0);
$$;
revoke all on function private.screen_is_hidden(uuid, text, text) from public, anon, authenticated;

-- Her required answers, signatures and consents: only on the screens that open for her.

CREATE OR REPLACE FUNCTION private.missing_required_custom_answers(p_profile_id uuid, p_placement text, p_custom_form_id uuid DEFAULT NULL::uuid)
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
     and pl.surface = case p_placement when 'wizard' then 'onboarding' when 'season' then 'season'
                                        when 'authorization' then 'authorization'
                                        when 'custom_form' then 'custom_form' end
     and (p_placement <> 'custom_form' or pl.custom_form_id = p_custom_form_id)
   where not f.is_archived
     and f.system_key is distinct from 'first_name'
     and f.system_key is distinct from 'last_name'
     and (pl.surface <> 'onboarding'
          or not private.is_uuid_text(pl.screen_key)
          or exists (select 1 from public.intake_screens s
                      where s.id = pl.screen_key::uuid and s.org_id = f.org_id and not s.is_archived))
     and (pl.surface <> 'custom_form' or private.custom_form_screen_live(pl.screen_key))
     and not (private.field_is_seasonal(f.id) and private.current_season_id(f.org_id) is null)
     and (f.show_when_field_id is null or exists (
           select 1 from public.profile_fields gate
            where gate.id = f.show_when_field_id
              and private.field_answer_now(p_profile_id, gate) = to_jsonb(f.show_when_option_id::text)))
     and (f.system_key is distinct from 'reference_contact_name'
          or private.system_field_answer(p_profile_id, 'reference_entity') is not null)
     -- Only on a screen that opens for her (RAPP-715).
     and (pl.surface not in ('onboarding', 'custom_form')
          or private.screen_opens_for(p_profile_id, f.org_id, pl.surface, pl.screen_key))
     and private.field_answer_now(p_profile_id, f) is null;
$function$;

CREATE OR REPLACE FUNCTION private.unsigned_form_blocks(p_org_id uuid, p_surface text, p_profile_id uuid, p_referral_id uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(array_agg(b.id order by b.screen_key, b.sort_order), array[]::uuid[])
    from public.form_blocks b
   where b.org_id = p_org_id
     and b.surface = case p_surface when 'wizard' then 'onboarding' else 'entity_form' end
     and (b.surface <> 'onboarding'
          or not private.is_uuid_text(b.screen_key)
          or exists (select 1 from public.intake_screens s
                      where s.id = b.screen_key::uuid and s.org_id = b.org_id and not s.is_archived))
     -- A block on a screen that does not open for her is not asked (RAPP-715).
     and (b.surface <> 'onboarding' or p_profile_id is null
          or private.screen_opens_for(p_profile_id, b.org_id, 'onboarding', b.screen_key))
     and not exists (
       select 1 from public.form_signatures g
        where g.block_id = b.id
          -- The text she signed is still the block's text in the language she read (RAPP-691).
          and g.body = b.body ->> g.language
          and case p_surface when 'wizard' then g.profile_id = p_profile_id
                             else g.referral_id = p_referral_id end);
$function$;

CREATE OR REPLACE FUNCTION private.record_onboarding_consents(p_profile_id uuid, p_consents jsonb, p_language text, p_screens text[] DEFAULT NULL::text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  her public.profiles;
  shown record;
begin
  select * into her from public.profiles where id = p_profile_id;
  for shown in
    select * from private.onboarding_consents_shown(
      her.org_id, p_consents, coalesce(nullif(p_language, ''), her.preferred_language),
      -- The screens she was shown (RAPP-715).
      coalesce(p_screens, private.onboarding_open_screens(p_profile_id)))
  loop
    insert into public.consent_events
      (org_id, profile_id, consent_id, consent_key, granted, method, language, wording, required,
       form, screen_key)
    values (her.org_id, her.id, shown.consent_id, shown.consent_key, shown.granted, 'app',
            shown.language, shown.wording, shown.required, 'onboarding', shown.screen_key);
    perform private.apply_consent_effects(her.id, shown.consent_key, shown.granted, her.id);
  end loop;
end;
$function$;

-- Saving an order keeps every follow-up after its parent.

CREATE OR REPLACE FUNCTION public.save_intake_flow_order(p_order text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := private.require_question_builder();
  steps text[] := coalesce(p_order, array[]::text[]);
begin
  -- The same checks an imported setup's flow order passes (pending fix 31).
  case private.intake_flow_order_problem(actor_org, steps)
    when 'too_many' then
      raise check_violation using message = 'too many steps';
    when 'repeated' then
      raise check_violation using message = 'each step appears once';
    when 'fixed_end' then
      raise check_violation using message = 'the summary, the terms and the authorization always end the onboarding';
    when 'unknown_step', 'archived_screen' then
      raise check_violation using message = 'not a step of this onboarding';
    else
      null;
  end case;

  if cardinality(steps) = 0 then
    delete from public.intake_flow_orders where org_id = actor_org;
    update public.intake_screens
       set after_screen = home_after_screen, sort_order = home_sort_order, updated_at = now()
     where org_id = actor_org
       and (after_screen is distinct from home_after_screen or sort_order is distinct from home_sort_order);
  else
    -- Each staff screen is anchored to the built-in step before it, so the
    -- question builder lists it where it shows. Its home stays.
    perform private.store_intake_flow_order(actor_org, steps, (select auth.uid()));
  end if;
  -- A follow-up stays right after its parent (RAPP-715): the order older builds walk.
  perform private.keep_branches_after_parents(actor_org, (select auth.uid()));
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.flow_reorder', 'organization', actor_org,
          jsonb_build_object('order', to_jsonb(steps)));
end;
$function$;

CREATE OR REPLACE FUNCTION public.reorder_custom_form_screens(p_form_id uuid, p_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := private.require_question_builder();
begin
  update public.custom_form_screens s
     set sort_order = array_position(p_ids, s.id) - 1, updated_at = now()
   where s.org_id = actor_org and s.form_id = p_form_id and s.id = any (p_ids);
  -- A follow-up stays right after its parent (RAPP-715).
  if exists (select 1 from public.custom_forms f where f.id = p_form_id and f.org_id = actor_org) then
    perform private.keep_form_branches_after_parents(p_form_id);
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'custom_form.screens_reorder', 'custom_form', p_form_id,
          jsonb_build_object('order', to_jsonb(p_ids)));
end;
$function$;

-- 6. The catalog, a form's published version, answering a form, the setup file ---------------------------

CREATE OR REPLACE FUNCTION public.intake_catalog()
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
  reads_team_forms boolean := with_archived or (select public.has_permission('participants.view'));
  forms_shown uuid[];
  forms_json jsonb;
  form_placements_json jsonb;
  form_blocks_json jsonb;
  form_consents_json jsonb;
begin
  if (select auth.uid()) is null or actor_org is null then
    raise insufficient_privilege using message = 'the question catalog needs an account';
  end if;
  if reads_team_forms then
    -- The team reads each form's draft, and designers its published versions.
    select coalesce(array_agg(f.id), array[]::uuid[]) into forms_shown
      from public.custom_forms f
     where f.org_id = actor_org and (with_archived or not f.is_archived);
    forms_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'filled_by', f.filled_by, 'mandatory', f.mandatory,
        'deadline', f.deadline,
        -- What an older build reads (RAPP-700).
        'appears', case when f.audience = 'chosen' then 'sent'
                        when f.repeats_each_season then 'every_season' else 'once' end,
        'audience', f.audience, 'repeats_each_season', f.repeats_each_season,
        'recipient_count', (select count(*) from public.custom_form_recipients r where r.form_id = f.id),
        'version', f.version, 'published_at', f.published_at, 'is_archived', f.is_archived,
        'versions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'version', v.version, 'season_id', v.season_id, 'is_correction', v.is_correction,
            'published_at', v.published_at) order by v.version desc)
            from public.custom_form_versions v where v.form_id = f.id), '[]'::jsonb),
        'screens', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', s.id, 'title', s.title, 'intro', s.intro, 'sort_order', s.sort_order,
            'is_hidden', s.is_hidden,
            -- The answer that opens it (RAPP-715); null: it always shows.
            'show_when_field_id', s.show_when_field_id, 'show_when_values', to_jsonb(s.show_when_values))
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
        'kind', b.kind, 'body', b.body, 'sort_order', b.sort_order)
        order by b.screen_key, b.sort_order, b.created_at)
        from public.form_blocks b
       where b.surface = 'custom_form' and b.custom_form_id = any (forms_shown)), '[]'::jsonb);
    form_consents_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'consent_id', p.consent_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'custom_form_id', p.custom_form_id, 'sort_order', p.sort_order, 'required', p.required)
        order by p.screen_key, p.sort_order, p.created_at)
        from public.consent_placements p
        join public.consents c on c.id = p.consent_id and not c.is_archived
       where p.surface = 'custom_form' and p.custom_form_id = any (forms_shown)), '[]'::jsonb);
  else
    -- She reads the published version of each live form she fills in (RAPP-701).
    with live as (
      select f.id, f.audience, f.repeats_each_season, f.published_at, v.version, v.content
        from public.custom_forms f
        cross join lateral private.custom_form_live_version(f.id) v
       where f.org_id = actor_org and f.filled_by = 'player' and not f.is_archived)
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'name', l.content -> 'name', 'filled_by', 'player',
        'mandatory', l.content ->> 'mandatory', 'deadline', l.content -> 'deadline',
        'appears', case when l.audience = 'chosen' then 'sent'
                        when l.repeats_each_season then 'every_season' else 'once' end,
        'audience', l.audience, 'repeats_each_season', l.repeats_each_season,
        'version', l.version, 'published_at', l.published_at, 'is_archived', false,
        'screens', l.content -> 'screens')), '[]'::jsonb),
      coalesce((
        select jsonb_agg(p || jsonb_build_object('surface', 'custom_form', 'custom_form_id', l2.id))
          from live l2
          cross join lateral jsonb_array_elements(l2.content -> 'placements') p
          join public.profile_fields f on f.id = (p ->> 'field_id')::uuid and not f.is_archived), '[]'::jsonb),
      coalesce((
        select jsonb_agg(b || jsonb_build_object('surface', 'custom_form', 'custom_form_id', l2.id,
                                                 'kind', 'signature'))
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
            'show_when_field_id', s.show_when_field_id, 'show_when_values', to_jsonb(s.show_when_values))
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
       where f.org_id = actor_org and (with_archived or not f.is_archived)), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'field_id', p.field_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'sort_order', p.sort_order, 'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.surface, p.screen_key, p.sort_order, p.created_at)
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id
       where p.org_id = actor_org and p.surface <> 'custom_form'
         and (with_archived or not f.is_archived)), '[]'::jsonb),
    -- The blocks of each screen and of the entity form (RAPP-690), in the
    -- order they share with the placements.
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'surface', b.surface, 'screen_key', b.screen_key, 'kind', b.kind,
        'body', b.body, 'sort_order', b.sort_order)
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
    'custom_form_consent_placements', form_consents_json
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.custom_form_content(p_form_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'name', f.name, 'mandatory', f.mandatory, 'deadline', f.deadline,
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'intro', s.intro,
                                          'sort_order', s.sort_order,
                                          -- The answer that opens it (RAPP-715).
                                          'show_when_field_id', s.show_when_field_id,
                                          'show_when_values', to_jsonb(s.show_when_values))
                       order by s.sort_order, s.created_at)
        from public.custom_form_screens s
       where s.form_id = f.id and not s.is_archived
         -- A hidden screen, and the follow-ups of a hidden screen, are left out.
         and not private.screen_is_hidden(f.org_id, 'custom_form', s.id::text)), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'field_id', p.field_id, 'screen_key', p.screen_key, 'sort_order', p.sort_order,
        'required', p.required, 'label_override', p.label_override, 'help_override', p.help_override)
        order by p.screen_key, p.sort_order)
        from public.field_placements p
       where p.surface = 'custom_form' and p.custom_form_id = f.id
         and private.custom_form_screen_live(p.screen_key)
         and not private.screen_is_hidden(f.org_id, 'custom_form', p.screen_key)), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'screen_key', b.screen_key, 'body', b.body,
                                          'sort_order', b.sort_order)
                       order by b.screen_key, b.sort_order)
        from public.form_blocks b
       where b.surface = 'custom_form' and b.custom_form_id = f.id
         and private.custom_form_screen_live(b.screen_key)
         and not private.screen_is_hidden(f.org_id, 'custom_form', b.screen_key)), '[]'::jsonb),
    'consent_placements', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'consent_id', p.consent_id, 'screen_key', p.screen_key,
                                          'sort_order', p.sort_order, 'required', p.required)
                       order by p.screen_key, p.sort_order)
        from public.consent_placements p
       where p.surface = 'custom_form' and p.custom_form_id = f.id
         and private.custom_form_screen_live(p.screen_key)
         and not private.screen_is_hidden(f.org_id, 'custom_form', p.screen_key)), '[]'::jsonb))
    from public.custom_forms f where f.id = p_form_id;
$function$;

CREATE OR REPLACE FUNCTION public.complete_custom_form(p_response_id uuid, payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
  her public.profiles;
  response public.custom_form_responses;
  form public.custom_forms;
  live public.custom_form_versions;
  content jsonb;
  shown_language text;
  ticks jsonb := coalesce(nullif(payload -> 'consents', 'null'::jsonb), '{}'::jsonb);
  signatures jsonb := coalesce(nullif(payload -> 'signatures', 'null'::jsonb), '{}'::jsonb);
  block jsonb;
  given jsonb;
  block_language text;
  asked record;
begin
  select * into her from public.profiles where id = caller;
  select * into response from public.custom_form_responses where id = p_response_id for update;
  if her.id is null or her.role <> 'player' or response.id is null or response.profile_id <> caller then
    raise insufficient_privilege using message = 'a form is answered by the player it asks';
  end if;
  select * into form from public.custom_forms where id = response.form_id;
  select * into live from private.custom_form_live_version(form.id);
  if form.filled_by <> 'player' or form.is_archived or live.id is null then
    raise insufficient_privilege using message = 'this form is not asked now';
  end if;
  if response.status <> 'pending' then
    raise check_violation using message = 'the form is already answered';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object'
     or payload - array['answers', 'signatures', 'consents', 'language'] <> '{}'::jsonb
     or jsonb_typeof(ticks) <> 'object' or jsonb_typeof(signatures) <> 'object' then
    raise invalid_parameter_value
      using message = 'complete_custom_form takes her answers by field, her signatures, her consents and her language';
  end if;
  content := live.content;
  shown_language := case when payload ->> 'language' in ('ca', 'es', 'en', 'ar', 'fa')
                         then payload ->> 'language' else her.preferred_language end;

  perform private.write_field_answers(caller, coalesce(nullif(payload -> 'answers', 'null'::jsonb), '{}'::jsonb),
                                      'player', null, true);
  perform private.apply_document_rule(caller, true, true);

  -- Every required field the version asks has an answer (shown on its condition).
  if exists (
    select 1
      from jsonb_array_elements(content -> 'placements') p
      join public.profile_fields f on f.id = (p ->> 'field_id')::uuid and not f.is_archived
     where (p ->> 'required')::boolean
       -- Only on a screen that opens for her (RAPP-715).
       and private.content_screen_opens(caller, content, p ->> 'screen_key')
       and (f.show_when_field_id is null or exists (
             select 1 from public.profile_fields gate
              where gate.id = f.show_when_field_id
                and private.field_answer_now(caller, gate) = to_jsonb(f.show_when_option_id::text)))
       and private.field_answer_now(caller, f) is null
  ) then
    raise not_null_violation using message = 'complete_custom_form requires an answer to a required question';
  end if;

  -- Every signature block, with the text the version published.
  for block in select value from jsonb_array_elements(content -> 'blocks')
                where private.content_screen_opens(caller, content, value ->> 'screen_key') loop
    given := signatures -> (block ->> 'id');
    if given is null or jsonb_typeof(given) <> 'object'
       or given - array['strokes', 'language'] <> '{}'::jsonb
       or not private.app_signature_valid(given -> 'strokes') then
      raise not_null_violation using message = 'complete_custom_form requires her signature on every signature block';
    end if;
    block_language := case when length(btrim(coalesce(block -> 'body' ->> (given ->> 'language'), ''))) > 0
                           then given ->> 'language' else 'ca' end;
    insert into public.form_signatures (
      org_id, profile_id, surface, block_id, screen_key, body, language, signer_kind,
      signer_user_id, signer_name, strokes, custom_form_id)
    values (
      her.org_id, caller, 'custom_form',
      (select b.id from public.form_blocks b where b.id = (block ->> 'id')::uuid),
      block ->> 'screen_key', block -> 'body' ->> block_language, block_language, 'player', caller,
      coalesce(nullif(concat_ws(' ', private.name_answer_text(caller, 'first_name'),
                                     private.name_answer_text(caller, 'last_name')), ''), '-'),
      given -> 'strokes', form.id);
  end loop;

  -- Her ticks of the consents the version asks, each recorded with its text.
  if exists (select 1 from jsonb_each(ticks) t
              where jsonb_typeof(t.value) <> 'boolean'
                 or not exists (
                   select 1 from jsonb_array_elements(content -> 'consent_placements') p
                     join public.consents c on c.id = (p ->> 'consent_id')::uuid and not c.is_archived
                    where c.key = t.key)) then
    raise check_violation using message = 'her consents are ticks of the consents the form asks';
  end if;
  for asked in
    select c.id, c.key, c.body, (p ->> 'required')::boolean as required, p ->> 'screen_key' as screen_key
      from jsonb_array_elements(content -> 'consent_placements') p
      join public.consents c on c.id = (p ->> 'consent_id')::uuid and not c.is_archived
     where private.content_screen_opens(caller, content, p ->> 'screen_key')
     order by p ->> 'screen_key', (p ->> 'sort_order')::integer
  loop
    if asked.required and (ticks -> asked.key) is distinct from 'true'::jsonb then
      raise check_violation using message = 'every required consent must be given';
    end if;
    insert into public.consent_events
      (org_id, profile_id, consent_id, consent_key, granted, method, language, wording, required,
       form, screen_key, custom_form_id)
    values (her.org_id, her.id, asked.id, asked.key, coalesce((ticks ->> asked.key)::boolean, false), 'app',
            shown_language, private.localized_text_in(asked.body, shown_language), asked.required,
            'custom_form', asked.screen_key, form.id);
    perform private.apply_consent_effects(her.id, asked.key, coalesce((ticks ->> asked.key)::boolean, false), her.id);
  end loop;

  update public.custom_form_responses
     set status = 'done', answered_at = now(), answered_by = caller, filled_by = 'player',
         version = live.version
   where id = response.id;
end;
$function$;

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
        'field_id', p.field_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'sort_order', p.sort_order, 'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.surface, p.screen_key, p.sort_order, coalesce(f.system_key, f.id::text))
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id
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
        from public.form_blocks b where b.org_id = actor_org and b.surface <> 'custom_form'), '[]'::jsonb),
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

CREATE OR REPLACE FUNCTION private.apply_onboarding_setup(p_document jsonb, p_org_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  opening text[];
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
      is_hidden, created_at, updated_at)
    values (
      p_org_id, item.value -> 'title', private.json_value_or_null(item.value -> 'intro'),
      item.value ->> 'after_screen', (item.value ->> 'sort_order')::integer,
      coalesce(item.value ->> 'home_after_screen', item.value ->> 'after_screen'),
      coalesce((item.value ->> 'home_sort_order')::integer, (item.value ->> 'sort_order')::integer),
      coalesce((item.value ->> 'is_archived')::boolean, false),
      -- An older file has no hide flag: the screen shows (RAPP-711).
      coalesce((item.value ->> 'is_hidden')::boolean, false),
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
     and p.surface <> 'custom_form'
     and f.show_when_field_id is not null
     and private.question_system_key(private.system_key_question(f.system_key))
         in (select private.question_system_key(private.system_key_question(private.setup_system_key(b)))
               from jsonb_array_elements(document -> 'fields') b where b ->> 'kind' = 'builtin');
  delete from public.field_placements p
   using public.profile_fields f
   where f.id = p.field_id and f.org_id = p_org_id and f.kind = 'builtin'
     and p.surface <> 'custom_form'
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
    on conflict (consent_id, surface, custom_form_id) do nothing;
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

  -- The screens that depend on an answer (RAPP-715): the question and its
  -- answers of the file, as this organization's. An older file has none.
  for item in
    select value from jsonb_array_elements(document -> 'screens')
     where private.json_value_or_null(value -> 'show_when_field_id') is not null
  loop
    opening := array(
      select coalesce(option_map ->> v.value, case when v.value in ('yes', 'no', 'maybe') then v.value end)
        from jsonb_array_elements_text(
               case when jsonb_typeof(item.value -> 'show_when_values') = 'array'
                    then item.value -> 'show_when_values' else '[]'::jsonb end) with ordinality as v(value, n)
       order by v.n);
    if field_map ->> (item.value ->> 'show_when_field_id') is null
       or cardinality(opening) = 0 or array_position(opening, null) is not null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a screen depends on a question or answer that is not in the file';
    end if;
    update public.intake_screens
       set show_when_field_id = (field_map ->> (item.value ->> 'show_when_field_id'))::uuid,
           show_when_values = opening
     where id = (screen_map ->> (item.value ->> 'id'))::uuid;
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

  -- The app screens' wording. An older file's single document follow-up
  -- lands on the three document screens (RAPP-715).
  insert into public.intake_builtin_screens (org_id, screen, texts, is_hidden, updated_by)
  select p_org_id, coalesce(split.screen, b ->> 'screen'),
         coalesce(private.json_value_or_null(b -> 'texts'), '{}'::jsonb),
         coalesce((b ->> 'is_hidden')::boolean, false), p_actor
    from jsonb_array_elements(p_document -> 'builtin_screens') b
    left join lateral unnest(
      case when b ->> 'screen' = 'documentation-details'
           then array['documentation-nie', 'documentation-passport', 'documentation-other'] end) as split(screen)
      on true
  on conflict (org_id, screen) do nothing;

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
  -- Every follow-up right after its parent (RAPP-715).
  perform private.keep_branches_after_parents(p_org_id, p_actor);

  -- A screen that asks something required or holds a signature shows (RAPP-711).
  update public.intake_screens s set is_hidden = false
   where s.org_id = p_org_id and s.is_hidden
     and private.screen_must_show(p_org_id, 'onboarding', s.id::text);

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
$function$;

-- 7. The document follow-up, one screen per answer --------------------------------------------------------

create or replace function private.builtin_screen_text_fields(p_screen text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select f.fields
    from (values
      -- builtin-screen-text-fields:start
      ('identity', array['title', 'intro', 'help', 'continue_label']),
      ('background', array['title', 'intro', 'help', 'continue_label']),
      ('documentation', array['title', 'intro', 'help', 'continue_label']),
      ('documentation-nie', array['title', 'intro', 'help', 'continue_label']),
      ('documentation-passport', array['title', 'intro', 'help', 'continue_label']),
      ('documentation-other', array['title', 'intro', 'help', 'continue_label']),
      ('logistics', array['title', 'intro', 'help', 'continue_label']),
      ('equipment', array['title', 'intro', 'help', 'continue_label']),
      ('season', array['title', 'intro', 'help', 'continue_label']),
      ('applicant-status-details', array['title', 'intro', 'help', 'continue_label']),
      ('supporting-entities', array['title', 'intro', 'help', 'continue_label']),
      ('participation-support', array['title', 'intro', 'help', 'continue_label']),
      ('specific-needs', array['title', 'intro', 'help', 'continue_label']),
      ('specific-needs-details', array['title', 'intro', 'help', 'continue_label']),
      ('summary', array['title', 'intro', 'help', 'continue_label']),
      ('terms-intro', array['help', 'continue_label']),
      ('terms', array['help', 'continue_label', 'decline_label'])
      -- builtin-screen-text-fields:end
    ) as f(screen, fields)
   where f.screen = p_screen;
$$;

-- The wording staff gave the single document follow-up lands on each of the
-- three, then the old row goes: it is no screen of the app any more.
insert into public.intake_builtin_screens (org_id, screen, texts, is_hidden, updated_at, updated_by)
select b.org_id, split.screen, b.texts, false, now(), b.updated_by
  from public.intake_builtin_screens b
  cross join unnest(array['documentation-nie', 'documentation-passport', 'documentation-other']) as split(screen)
 where b.screen = 'documentation-details'
on conflict (org_id, screen) do nothing;
delete from public.intake_builtin_screens where screen = 'documentation-details';
