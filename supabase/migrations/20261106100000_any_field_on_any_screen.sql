-- Any field on any screen (RAPP-782, decision of 2026-11-06).
--
-- A field is still asked once per form, but it is no longer tied to the
-- screen it sits on. Placing a field on a screen of a form where it already
-- sits on another screen MOVES it there, in this one call:
--
--   - the placement row keeps its id, its required flag and its wording; only
--     its screen and its order change, so her answers never move or vanish;
--   - a field that shows only after an answer moves together with the
--     question it depends on: the whole family of conditional fields linked
--     to it on that form moves to the new screen, controllers first;
--   - a field that sat on several sibling document follow-ups (RAPP-720)
--     keeps one placement on the new screen;
--   - a move onto a hidden screen makes the field optional, as a placement
--     there always is (RAPP-711);
--   - a screen that depends on the question still needs it on an earlier
--     screen (`placement_keeps_screen_conditions`, unchanged);
--   - each moved field is audited against its field (`target_id`).
--
-- Her names move too: Nom and Cognoms can be placed on any Onboarding screen.
-- They are still never removed from her Onboarding nor from the entity form.
-- Placing a field on the screen it already sits on returns that placement, so
-- a picker that sends a controller and its condition together never fails on
-- the condition the controller just brought along.

-- 1. The move flag ------------------------------------------------------------------------------

-- Set for the length of one move only, inside `private.move_field_group`. The
-- placement guard then lets the family pass through states where a condition
-- and its controller sit on different screens for a moment; the move checks
-- the end state itself before it returns.
create or replace function private.is_moving_placements()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('ramassa.moving_placements', true), '') = 'on';
$$;
revoke all on function private.is_moving_placements() from public, anon, authenticated;

-- Whether an Onboarding placement sits on an app follow-up (RAPP-720) that
-- opens on an answer to that controlling field: Nom del document on "Un altre"
-- opens on Tipus de document, wherever Tipus de document is asked. Such a
-- condition stays on its follow-up when its controller moves.
create or replace function private.follow_up_of_controller(p_screen_key text, p_controller_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from private.app_follow_ups() u
      join public.profile_fields c on c.id = p_controller_id
     where u.screen = p_screen_key and u.condition_key = c.system_key);
$$;
revoke all on function private.follow_up_of_controller(text, uuid) from public, anon, authenticated;

-- The body of `20261028090000_every_follow_up_holds_fields.sql`; the condition
-- and once-per-form checks wait while a move runs.
create or replace function private.guard_field_placement()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  field public.profile_fields%rowtype;
begin
  if tg_op in ('UPDATE', 'DELETE')
     and not private.is_moving_placements()
     and (tg_op = 'DELETE' or old.surface is distinct from new.surface
          or old.screen_key is distinct from new.screen_key)
     and exists (select 1 from public.profile_fields child
                   join public.field_placements theirs on theirs.field_id = child.id
                  where child.show_when_field_id = old.field_id
                    and theirs.surface = old.surface
                    and (theirs.screen_key is not distinct from old.screen_key
                         -- Or on a follow-up of that screen (RAPP-720).
                         or (old.surface = 'onboarding' and theirs.screen_key in (
                               select f.screen from private.app_follow_ups() f where f.parent = old.screen_key)))
                    -- A follow-up that opens on this question follows it (RAPP-782).
                    and not (tg_op = 'UPDATE' and old.surface = 'onboarding'
                             and private.follow_up_of_controller(theirs.screen_key, old.field_id)))
     -- A field that is being deleted takes its conditions' placements along.
     and exists (select 1 from public.profile_fields f where f.id = old.field_id) then
    raise check_violation using message = 'a conditional question must stay with its controlling question';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  select * into field from public.profile_fields where id = new.field_id;
  if field.org_id is distinct from new.org_id then
    raise check_violation using message = 'a placement belongs to its field''s organization';
  end if;
  if private.is_moving_placements() then
    return new;
  end if;
  if field.show_when_field_id is not null
     and not exists (select 1 from public.field_placements theirs
                      where theirs.field_id = field.show_when_field_id and theirs.surface = new.surface
                        and (theirs.screen_key is not distinct from new.screen_key
                             -- A follow-up opens on an answer of the screen it follows (RAPP-720).
                             or (new.surface = 'onboarding' and theirs.screen_key = (
                                   select f.parent from private.app_follow_ups() f where f.screen = new.screen_key))
                             -- Or on an answer to this very question, wherever it is asked (RAPP-782).
                             or (new.surface = 'onboarding'
                                 and private.follow_up_of_controller(new.screen_key, field.show_when_field_id)))) then
    raise check_violation using message = 'a condition needs an option of a single-choice question on the same screen and organisation';
  end if;
  if new.surface = 'onboarding'
     and exists (select 1 from public.field_placements other
                  where other.field_id = new.field_id and other.surface = 'onboarding'
                    and other.id <> new.id
                    and not private.can_share_field(other.screen_key, new.screen_key)) then
    raise unique_violation using message = 'the field is already asked there';
  end if;
  return new;
end;
$$;

-- 2. The move -----------------------------------------------------------------------------------

-- How many controlling fields stand above a field: controllers move first.
create or replace function private.field_condition_depth(p_field_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  with recursive up(id, depth) as (
    select f.show_when_field_id, 1 from public.profile_fields f
     where f.id = p_field_id and f.show_when_field_id is not null
    union
    select f.show_when_field_id, up.depth + 1
      from up join public.profile_fields f on f.id = up.id
     where f.show_when_field_id is not null and up.depth < 64
  )
  select coalesce(max(depth), 0) from up;
$$;
revoke all on function private.field_condition_depth(uuid) from public, anon, authenticated;

-- Whether every Onboarding placement of a condition sits on a follow-up that
-- opens on its controller: it stays there when the controller moves.
create or replace function private.only_on_follow_ups_of(
  p_org_id uuid, p_surface text, p_field_id uuid, p_controller_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_surface = 'onboarding'
     and exists (select 1 from public.field_placements p
                  where p.org_id = p_org_id and p.field_id = p_field_id and p.surface = 'onboarding')
     and not exists (select 1 from public.field_placements p
                      where p.org_id = p_org_id and p.field_id = p_field_id and p.surface = 'onboarding'
                        and not private.follow_up_of_controller(p.screen_key, p_controller_id));
$$;
revoke all on function private.only_on_follow_ups_of(uuid, text, uuid, uuid) from public, anon, authenticated;

/**
 * Moves a field placed on a form to another screen of that form, with every
 * field linked to it by a condition on that form. Returns the field's
 * placement on the new screen. The caller has checked the organization, the
 * field and the screen.
 */
create or replace function private.move_field_group(
  p_org_id uuid,
  p_field_id uuid,
  p_surface text,
  p_form_id uuid,
  p_screen_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_hidden boolean := private.screen_is_hidden(p_org_id, p_surface, p_screen_key);
  member record;
  kept public.field_placements;
  next_order integer;
  result_id uuid;
begin
  -- One move at a time per organization, as every builder write is.
  perform o.id from public.organizations o where o.id = p_org_id for update;
  select coalesce(max(p.sort_order) + 1, 0) into next_order
    from public.field_placements p
   where p.org_id = p_org_id and p.surface = p_surface
     and p.custom_form_id is not distinct from p_form_id
     and p.screen_key = p_screen_key;
  perform set_config('ramassa.moving_placements', 'on', true);
  for member in
    with recursive placed as (
      select distinct p.field_id from public.field_placements p
       where p.org_id = p_org_id and p.surface = p_surface
         and p.custom_form_id is not distinct from p_form_id
    ), family(id) as (
      select p_field_id
      union
      select f.id
        from family
        join public.profile_fields mine on mine.id = family.id
        join public.profile_fields f
          on (f.show_when_field_id = family.id
              and not private.only_on_follow_ups_of(p_org_id, p_surface, f.id, family.id))
          or (f.id = mine.show_when_field_id
              and not private.only_on_follow_ups_of(p_org_id, p_surface, family.id, f.id))
        join placed on placed.field_id = f.id
    )
    select family.id as field_id,
           private.field_condition_depth(family.id) as depth,
           (select min(p.sort_order) from public.field_placements p
             where p.field_id = family.id and p.surface = p_surface
               and p.custom_form_id is not distinct from p_form_id) as source_order
      from family
     order by depth, source_order, family.id
  loop
    -- Its placement already on the new screen, else its first one.
    select p.* into kept from public.field_placements p
     where p.field_id = member.field_id and p.surface = p_surface
       and p.custom_form_id is not distinct from p_form_id
     order by (p.screen_key = p_screen_key) desc, p.sort_order, p.created_at
     limit 1;
    -- One placement per form: a shared follow-up field leaves its other follow-ups.
    delete from public.field_placements p
     where p.field_id = member.field_id and p.surface = p_surface
       and p.custom_form_id is not distinct from p_form_id and p.id <> kept.id;
    if kept.screen_key is distinct from p_screen_key then
      update public.field_placements
         set screen_key = p_screen_key,
             sort_order = next_order,
             required = required and not target_hidden,
             updated_at = now()
       where id = kept.id;
      next_order := next_order + 1;
      insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
      values (p_org_id, (select auth.uid()), 'intake.field_move', 'profile_field', member.field_id,
              jsonb_build_object('placement_id', kept.id, 'surface', p_surface,
                                 'from', kept.screen_key, 'to', p_screen_key,
                                 'custom_form', p_form_id));
    end if;
    if member.field_id = p_field_id then
      result_id := kept.id;
    end if;
  end loop;
  perform set_config('ramassa.moving_placements', 'off', true);
  -- The end state keeps every condition with its controller.
  if exists (
    select 1 from public.field_placements mine
      join public.profile_fields f on f.id = mine.field_id
     where mine.org_id = p_org_id and mine.surface = p_surface
       and mine.custom_form_id is not distinct from p_form_id
       and f.show_when_field_id is not null
       and not exists (
         select 1 from public.field_placements theirs
          where theirs.field_id = f.show_when_field_id and theirs.surface = p_surface
            and theirs.custom_form_id is not distinct from p_form_id
            and (theirs.screen_key is not distinct from mine.screen_key
                 or (p_surface = 'onboarding' and theirs.screen_key = (
                       select u.parent from private.app_follow_ups() u where u.screen = mine.screen_key))
                 or (p_surface = 'onboarding'
                     and private.follow_up_of_controller(mine.screen_key, f.show_when_field_id))))
  ) then
    raise check_violation using message = 'a conditional question must stay with its controlling question';
  end if;
  return result_id;
end;
$$;
revoke all on function private.move_field_group(uuid, uuid, text, uuid, text) from public, anon, authenticated;

-- 3. Placing a field ----------------------------------------------------------------------------

-- The body of `20261028090000_every_follow_up_holds_fields.sql`, with the move
-- and her names on any Onboarding screen.
create or replace function public.place_field(
  p_field_id uuid,
  p_surface text,
  p_screen_key text default null,
  p_required boolean default null
)
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
begin
  select * into field from public.profile_fields where id = p_field_id and org_id = actor_org and not is_archived;
  if field.id is null then
    raise no_data_found using message = 'no such question';
  end if;
  if p_surface is null or p_surface not in ('onboarding', 'entity_form', 'season', 'authorization', 'custom_form') then
    raise check_violation using message = 'a field is placed on onboarding, the entity form, the season, the authorization or a form';
  end if;
  -- Her names live on her account: her Onboarding and the entity form ask them.
  if private.is_name_field(field) and p_surface not in ('entity_form', 'onboarding') then
    raise check_violation using message = 'her names are asked on her onboarding and the entity form';
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
    if private.field_is_hers_only(field.question_type, field.settings)
       and exists (select 1 from public.custom_forms f where f.id = form_id and f.filled_by <> 'player') then
      raise check_violation using message = 'a file or a signature is asked of her only';
    end if;
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
  elsif exists (select 1 from public.field_placements
                 where field_id = p_field_id and surface = p_surface) then
    raise unique_violation using message = 'the field is already asked there';
  end if;

  -- A hidden screen asks nothing required (RAPP-711): a field placed on it is optional.
  if private.screen_is_hidden(actor_org, p_surface, p_screen_key) and coalesce(p_required, false) then
    raise check_violation using message = 'a hidden screen asks nothing required';
  end if;
  insert into public.field_placements (org_id, field_id, surface, screen_key, custom_form_id, sort_order, required)
  values (actor_org, p_field_id, p_surface, p_screen_key, form_id,
          coalesce((select max(p.sort_order) + 1 from public.field_placements p
                     where p.org_id = actor_org and p.surface = p_surface
                       and p.screen_key is not distinct from p_screen_key), 0),
          coalesce(p_required, field.default_required)
            and not private.screen_is_hidden(actor_org, p_surface, p_screen_key))
  returning id into saved_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.field_place', 'profile_field', p_field_id,
          jsonb_build_object('placement_id', saved_id, 'surface', p_surface, 'screen', p_screen_key,
                             'custom_form', form_id));
  return saved_id;
end;
$$;

-- 4. Removing a placement -----------------------------------------------------------------------

-- The body of `20261025220000_edit_every_field.sql`: her names move between
-- Onboarding screens and are never taken off her Onboarding.
create or replace function public.remove_placement(p_placement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  placement public.field_placements;
begin
  select p.* into placement from public.field_placements p where p.id = p_placement_id and p.org_id = actor_org;
  if placement.id is null then
    raise no_data_found using message = 'no such placement';
  end if;
  -- Her names are always asked on her Onboarding, and a referral names her (RAPP-652).
  if placement.surface in ('onboarding', 'entity_form')
     and exists (select 1 from public.profile_fields f where f.id = placement.field_id and private.is_name_field(f)) then
    raise check_violation using message = case when placement.surface = 'entity_form'
      then 'the entity form always asks her names' else 'her onboarding always asks her names' end;
  end if;
  delete from public.field_placements where id = p_placement_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.placement_remove', 'profile_field', placement.field_id,
          jsonb_build_object('placement_id', p_placement_id, 'surface', placement.surface,
                             'screen', placement.screen_key));
end;
$$;
