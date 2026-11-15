-- The app terms' introduction screen can be deleted (RAPP-761).
-- The club may want one screen only: she then goes from the summary straight
-- to the terms she signs. The terms screen itself is never deleted.
-- The app already leaves deleted screens out of her flow (RAPP-722).

-- A deleted screen is stored hidden as well, whatever screen it is.
alter table public.intake_builtin_screens
  drop constraint intake_builtin_screens_only_question_screens_hide,
  add constraint intake_builtin_screens_only_question_screens_hide
    check (not is_hidden or is_deleted or screen = any (array['documentation', 'season',
      'supporting-entities', 'participation-support', 'specific-needs', 'identity', 'background',
      'logistics', 'equipment']));

alter table public.intake_builtin_screens
  drop constraint intake_builtin_screen_deletion_scope,
  add constraint intake_builtin_screen_deletion_scope check (not is_deleted or screen <> 'terms');

create or replace function public.delete_builder_screen(p_surface text, p_key text, p_expected_keys text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  target_form_id uuid;
  keys text[];
  raw_keys text[];
  root_key text := p_key;
  expected text[];
  removed_count integer;
begin
  if p_surface is null or p_surface not in ('onboarding', 'custom_form') or p_key is null then
    raise invalid_parameter_value using message = 'no such screen';
  end if;
  -- Serialize deletes and lock this organization's definitions while deriving descendants.
  perform o.id from public.organizations o where o.id = actor_org for update;
  if p_surface = 'onboarding' then
    if p_key like 'custom:%' then
      if not private.is_uuid_text(substr(p_key, 8)) or not exists (
        select 1 from public.intake_screens s where s.id::text = substr(p_key, 8)
          and s.org_id = actor_org and not s.is_archived
      ) then
        raise no_data_found using message = 'no such screen';
      end if;
    elsif not (p_key = any (array[
      'identity', 'background', 'documentation', 'documentation-nie', 'documentation-passport',
      'documentation-other', 'logistics', 'equipment', 'season', 'applicant-status-details',
      'supporting-entities', 'participation-support', 'specific-needs', 'specific-needs-details', 'summary',
      -- The app terms' introduction can go; the terms she signs always stay (RAPP-761).
      'terms-intro'
    ])) or exists (select 1 from public.intake_builtin_screens b
                    where b.org_id = actor_org and b.screen = p_key and b.is_deleted) then
      -- The terms she signs and the authorization are complete linked forms on this board.
      raise invalid_parameter_value using message = 'no such onboarding screen';
    end if;
    perform s.id from public.intake_screens s where s.org_id = actor_org and not s.is_archived for update;
    perform p.id from public.field_placements p where p.org_id = actor_org and p.surface = p_surface for update;
    with recursive edges(child, parent) as (
      select 'custom:' || s.id, private.onboarding_step_key(p.screen_key)
        from public.intake_screens s
        join public.field_placements p on p.field_id = s.show_when_field_id
          and p.org_id = actor_org and p.surface = 'onboarding'
       where s.org_id = actor_org and not s.is_archived
      union all
      select f.screen, f.parent from private.app_follow_ups() f
       where not exists (select 1 from public.intake_builtin_screens b
                          where b.org_id = actor_org and b.screen = f.screen and b.is_deleted)
    ), family(key) as (
      select root_key
      union
      select e.child from edges e join family f on f.key = e.parent
    )
    select array_agg(key order by key) into keys from family;
  else
    if not private.is_uuid_text(p_key) then
      raise invalid_parameter_value using message = 'no such screen';
    end if;
    select s.form_id into target_form_id from public.custom_form_screens s
     where s.id::text = p_key and s.org_id = actor_org and not s.is_archived;
    if target_form_id is null then
      raise no_data_found using message = 'no such screen';
    end if;
    perform s.id from public.custom_form_screens s where s.form_id = target_form_id and not s.is_archived for update;
    perform p.id from public.field_placements p where p.org_id = actor_org and p.custom_form_id = target_form_id for update;
    with recursive edges(child, parent) as (
      select s.id::text, p.screen_key from public.custom_form_screens s
        join public.field_placements p on p.field_id = s.show_when_field_id
          and p.surface = 'custom_form' and p.custom_form_id = s.form_id and p.org_id = actor_org
       where s.org_id = actor_org and s.form_id = target_form_id and not s.is_archived
    ), family(key) as (
      select root_key
      union
      select e.child from edges e join family f on f.key = e.parent
    )
    select array_agg(key order by key) into keys from family;
  end if;
  select array_agg(distinct key order by key) into expected from unnest(p_expected_keys) key;
  if expected is distinct from keys then
    raise check_violation using message = 'the screen dependencies changed; reopen the confirmation';
  end if;
  raw_keys := array(select case when key like 'custom:%' then substr(key, 8) else key end from unnest(keys) key);
  if p_surface = 'onboarding' then
    update public.intake_screens s set is_archived = true, updated_at = now()
     where s.org_id = actor_org and s.id::text = any (raw_keys);
    insert into public.intake_builtin_screens (org_id, screen, texts, is_hidden, is_deleted, updated_by)
    select actor_org, key, '{}'::jsonb, true, true, (select auth.uid())
      from unnest(raw_keys) key where not private.is_uuid_text(key)
    on conflict (org_id, screen) do update
      set is_deleted = true, is_hidden = true, updated_by = excluded.updated_by, updated_at = now();
    update public.intake_flow_orders f
       set step_order = array(select step from unnest(f.step_order) step where not (step = any(keys))), updated_at = now()
     where f.org_id = actor_org;
  else
    update public.custom_form_screens s set is_archived = true, updated_at = now()
     where s.org_id = actor_org and s.form_id = target_form_id and s.id::text = any(raw_keys);
  end if;
  -- A controlling field stays until its conditional fields have left the screen.
  loop
    delete from public.field_placements p
     where p.org_id = actor_org and p.surface = p_surface and p.screen_key = any(raw_keys)
       and p.custom_form_id is not distinct from target_form_id
       and not exists (
         select 1 from public.profile_fields child
         join public.field_placements theirs on theirs.field_id = child.id
          where child.show_when_field_id = p.field_id and theirs.surface = p.surface
            and (theirs.screen_key is not distinct from p.screen_key
                 or (p.surface = 'onboarding' and theirs.screen_key in (
                   select f.screen from private.app_follow_ups() f where f.parent = p.screen_key)))
            and theirs.custom_form_id is not distinct from p.custom_form_id
       );
    get diagnostics removed_count = row_count;
    exit when removed_count = 0;
  end loop;
  if exists (select 1 from public.field_placements p
              where p.org_id = actor_org and p.surface = p_surface and p.screen_key = any(raw_keys)
                and p.custom_form_id is not distinct from target_form_id) then
    raise check_violation using message = 'a conditional field prevented screen deletion';
  end if;
  delete from public.consent_placements p
   where p.org_id = actor_org and p.surface = p_surface and p.screen_key = any(raw_keys)
     and p.custom_form_id is not distinct from target_form_id;
  -- ON DELETE SET NULL retains the signed body's snapshot and its history.
  delete from public.form_blocks b
   where b.org_id = actor_org and b.surface = p_surface and b.screen_key = any(raw_keys)
     and b.custom_form_id is not distinct from target_form_id;
  insert into public.audit_log(org_id, actor_id, action, target_type, changes)
  values (actor_org, (select auth.uid()), 'intake.screen_delete', 'screen',
          jsonb_build_object('surface', p_surface, 'screens', to_jsonb(keys), 'form_id', target_form_id));
end;
$$;

revoke all on function public.delete_builder_screen(text, text, text[]) from public, anon;
grant execute on function public.delete_builder_screen(text, text, text[]) to authenticated;
