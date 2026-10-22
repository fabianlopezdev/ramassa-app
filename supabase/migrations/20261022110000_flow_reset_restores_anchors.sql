-- "Back to the app's order" restores each staff screen where staff put it (RAPP-612).
--
-- WHY
--
-- Saving a flow order moves each staff screen's anchor (`after_screen`) and
-- `sort_order` to where it now shows, so the question builder lists it there.
-- Resetting the order deleted the stored order but left those moved anchors,
-- so the "app order" after a reset was not the order staff had built: a screen
-- staff placed after logistics stayed after identity.
--
-- WHAT THIS MIGRATION DOES
--
--   1. `intake_screens.home_after_screen` and `home_sort_order`: where staff
--      placed the screen in the question builder. A new screen starts there;
--      the question builder (save, reorder) moves both; a flow order moves
--      only `after_screen` and `sort_order`.
--   2. Saving an empty flow order (the reset) puts every staff screen back at
--      its home anchor and position, and audits it as before.
--
-- Docs: https://www.postgresql.org/docs/current/sql-altertable.html (ADD
-- COLUMN with a backfill), https://www.postgresql.org/docs/current/plpgsql-trigger.html
-- (BEFORE INSERT trigger filling a default from another column).

alter table public.intake_screens
  add column home_after_screen text check (home_after_screen is null
    or home_after_screen = any (private.intake_builtin_screens())),
  add column home_sort_order integer;

comment on column public.intake_screens.home_after_screen is
  'Where staff placed the screen in the question builder (RAPP-612): the reset of the flow order restores it.';

-- Existing screens: where they show now is the best record of where staff put them.
update public.intake_screens set home_after_screen = after_screen, home_sort_order = sort_order;

create or replace function private.intake_screen_home_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.home_after_screen := coalesce(new.home_after_screen, new.after_screen);
  new.home_sort_order := coalesce(new.home_sort_order, new.sort_order);
  return new;
end;
$$;
revoke all on function private.intake_screen_home_defaults() from public, anon, authenticated;

create trigger intake_screens_home_defaults
  before insert on public.intake_screens
  for each row execute function private.intake_screen_home_defaults();

alter table public.intake_screens
  alter column home_after_screen set not null,
  alter column home_sort_order set not null;

-- The question builder moves a screen: its home moves with it.
create or replace function public.save_intake_screen(
  p_id uuid,
  p_title jsonb,
  p_intro jsonb,
  p_after_screen text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  saved_id uuid;
  previous_anchor text;
begin
  if not private.catalan_text_valid(p_title) then
    raise check_violation using message = 'a screen needs a title in Catalan';
  end if;
  if p_id is null then
    insert into public.intake_screens (org_id, title, intro, after_screen, sort_order)
    values (actor_org, p_title, nullif(p_intro, 'null'::jsonb), p_after_screen,
            coalesce((select max(sort_order) + 1 from public.intake_screens
                       where org_id = actor_org and after_screen = p_after_screen), 0))
    returning id into saved_id;
  else
    select after_screen into previous_anchor from public.intake_screens
     where id = p_id and org_id = actor_org;
    update public.intake_screens
       set title = p_title, intro = nullif(p_intro, 'null'::jsonb), after_screen = p_after_screen,
           home_after_screen = case when previous_anchor is distinct from p_after_screen
                                    then p_after_screen else home_after_screen end,
           home_sort_order = case when previous_anchor is distinct from p_after_screen
                                  then sort_order else home_sort_order end,
           updated_at = now()
     where id = p_id and org_id = actor_org
    returning id into saved_id;
    if saved_id is null then
      raise no_data_found using message = 'no such screen';
    end if;
    if previous_anchor is distinct from p_after_screen then
      perform private.drop_from_intake_flow_order(actor_org, array[saved_id]);
    end if;
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.screen_save', 'intake_screen', saved_id,
          jsonb_build_object('after_screen', p_after_screen, 'created', p_id is null));
  return saved_id;
end;
$$;

create or replace function public.reorder_intake_screens(p_after_screen text, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
begin
  update public.intake_screens s
     set sort_order = array_position(p_ids, s.id) - 1,
         home_after_screen = s.after_screen,
         home_sort_order = array_position(p_ids, s.id) - 1,
         updated_at = now()
   where s.org_id = actor_org and s.after_screen = p_after_screen and s.id = any (p_ids);
  perform private.drop_from_intake_flow_order(actor_org, p_ids);
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.screens_reorder', 'organization', actor_org,
          jsonb_build_object('after_screen', p_after_screen, 'order', to_jsonb(p_ids)));
end;
$$;

-- An empty order is the reset: every staff screen goes home.
create or replace function public.save_intake_flow_order(p_order text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  steps text[] := coalesce(p_order, array[]::text[]);
  anchor text := 'identity';
  entry record;
begin
  if cardinality(steps) > 200 then
    raise check_violation using message = 'too many steps';
  end if;
  if (select count(distinct step) from unnest(steps) step) <> cardinality(steps) then
    raise check_violation using message = 'each step appears once';
  end if;
  if exists (select 1 from unnest(steps) step
              where step = any (array['summary', 'terms-intro', 'terms', 'authorization'])) then
    raise check_violation using message = 'the summary, the terms and the authorization always end the onboarding';
  end if;
  if exists (
    select 1 from unnest(steps) step
     where not exists (select 1 from private.wizard_screen_questions() s where s.screen = step)
       and not (step ~ '^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                and exists (select 1 from public.intake_screens i
                             where i.id = substr(step, 8)::uuid and i.org_id = actor_org
                               and not i.is_archived))) then
    raise check_violation using message = 'not a step of this onboarding';
  end if;

  if cardinality(steps) = 0 then
    delete from public.intake_flow_orders where org_id = actor_org;
    update public.intake_screens
       set after_screen = home_after_screen, sort_order = home_sort_order, updated_at = now()
     where org_id = actor_org
       and (after_screen is distinct from home_after_screen or sort_order is distinct from home_sort_order);
  else
    insert into public.intake_flow_orders (org_id, step_order, updated_at, updated_by)
    values (actor_org, steps, now(), (select auth.uid()))
    on conflict (org_id) do update
      set step_order = excluded.step_order, updated_at = now(), updated_by = excluded.updated_by;
    -- Each staff screen is anchored to the built-in step before it, so the
    -- question builder lists it where it shows. Its home stays.
    for entry in select step, step_position from unnest(steps) with ordinality as o(step, step_position) loop
      if entry.step like 'custom:%' then
        update public.intake_screens
           set after_screen = anchor, sort_order = entry.step_position::integer, updated_at = now()
         where id = substr(entry.step, 8)::uuid and org_id = actor_org;
      else
        anchor := private.flow_step_anchor(entry.step);
      end if;
    end loop;
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.flow_reorder', 'organization', actor_org,
          jsonb_build_object('order', to_jsonb(steps)));
end;
$$;

revoke all on function public.save_intake_screen(uuid, jsonb, jsonb, text) from public, anon;
revoke all on function public.reorder_intake_screens(text, uuid[]) from public, anon;
revoke all on function public.save_intake_flow_order(text[]) from public, anon;
grant execute on function public.save_intake_screen(uuid, jsonb, jsonb, text) to authenticated;
grant execute on function public.reorder_intake_screens(text, uuid[]) to authenticated;
grant execute on function public.save_intake_flow_order(text[]) to authenticated;
