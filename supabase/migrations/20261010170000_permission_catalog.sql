-- Permission catalog, presets and per-person toggles (RAPP-229, part of
-- RAPP-211, design: docs/plans/2026-10-08-native-management-app-design.md).
--
-- WHY
--
-- Team access is two fixed roles today (`staff` and `admin`). An organization
-- must be able to give someone one job only (material, attendance, creating
-- invitations), and the white-label product needs that flexibility. So access
-- becomes explicit permissions that admins toggle per person, with presets.
--
-- WHAT THIS MIGRATION DOES, AND DOES NOT DO
--
-- It adds the catalog, the presets, the per-person toggles, `has_permission`,
-- the safety rules and the audit trail. It changes nobody's access: no access
-- rule reads `has_permission` yet. RAPP-230 moves every rule that checks
-- `staff`/`admin` to the permission that names its job, and proves with a
-- matrix test that nobody's access changes. Until then, a trigger keeps each
-- person's toggles equal to the built-in preset of their role, so the two
-- models cannot drift apart.

-- The catalog -----------------------------------------------------------------------

create table public.permissions (
  code text primary key check (code ~ '^[a-z_]+\.[a-z_]+$'),
  area text not null check (
    area in ('participants', 'material', 'attendance', 'content', 'community', 'entities', 'impact', 'settings')
  ),
  sort_order integer not null unique
);

comment on table public.permissions is 'The product permission catalog. Kept equal to packages/shared/permissions/catalog.ts by tests/permission-catalog-parity.test.ts.';

-- permission-catalog:start
insert into public.permissions (code, area, sort_order) values
  ('participants.view', 'participants', 1),
  ('participants.view_personal', 'participants', 2),
  ('participants.view_sensitive', 'participants', 3),
  ('participants.notes', 'participants', 4),
  ('participants.invite', 'participants', 5),
  ('participants.deactivate', 'participants', 6),
  ('rgpd.erase', 'participants', 7),
  ('equipment.handover', 'material', 8),
  ('equipment.receive', 'material', 9),
  ('equipment.count', 'material', 10),
  ('equipment.items', 'material', 11),
  ('attendance.mark', 'attendance', 12),
  ('attendance.reports', 'attendance', 13),
  ('announcements.edit', 'content', 14),
  ('announcements.publish', 'content', 15),
  ('events.edit', 'content', 16),
  ('events.publish', 'content', 17),
  ('knowledge.edit', 'content', 18),
  ('knowledge.publish', 'content', 19),
  ('services.edit', 'content', 20),
  ('services.publish', 'content', 21),
  ('services.review', 'content', 22),
  ('forum.moderate', 'community', 23),
  ('gallery.moderate', 'community', 24),
  ('messages.inbox', 'community', 25),
  ('mentoring.manage', 'community', 26),
  ('feedback.view', 'community', 27),
  ('surveys.manage', 'community', 28),
  ('surveys.results', 'community', 29),
  ('notifications.send', 'community', 30),
  ('referrals.manage', 'entities', 31),
  ('entities.manage', 'entities', 32),
  ('impact.view', 'impact', 33),
  ('export.participants', 'impact', 34),
  ('export.participants_sensitive', 'impact', 35),
  ('export.attendance', 'impact', 36),
  ('export.events', 'impact', 37),
  ('audit.view', 'impact', 38),
  ('settings.organization', 'settings', 39),
  ('settings.branding', 'settings', 40),
  ('settings.documents', 'settings', 41),
  ('team.manage', 'settings', 42);
-- permission-catalog:end

-- The product defaults of the three built-in presets. "Restore default" copies
-- these back. RAPP-230 checks Staff and Admin against today's access rules.
create table public.permission_preset_defaults (
  builtin_key text not null check (builtin_key in ('coach', 'staff', 'admin')),
  permission_code text not null references public.permissions (code) on delete cascade,
  primary key (builtin_key, permission_code)
);

-- permission-preset-defaults:start
insert into public.permission_preset_defaults (builtin_key, permission_code) values
  ('coach', 'participants.view'),
  ('coach', 'equipment.handover'),
  ('coach', 'attendance.mark'),
  ('coach', 'attendance.reports'),
  ('coach', 'messages.inbox'),
  ('staff', 'participants.view'),
  ('staff', 'participants.view_personal'),
  ('staff', 'participants.notes'),
  ('staff', 'participants.invite'),
  ('staff', 'participants.deactivate'),
  ('staff', 'equipment.handover'),
  ('staff', 'equipment.receive'),
  ('staff', 'equipment.count'),
  ('staff', 'equipment.items'),
  ('staff', 'attendance.mark'),
  ('staff', 'attendance.reports'),
  ('staff', 'announcements.edit'),
  ('staff', 'announcements.publish'),
  ('staff', 'events.edit'),
  ('staff', 'events.publish'),
  ('staff', 'knowledge.edit'),
  ('staff', 'knowledge.publish'),
  ('staff', 'services.edit'),
  ('staff', 'services.publish'),
  ('staff', 'services.review'),
  ('staff', 'forum.moderate'),
  ('staff', 'gallery.moderate'),
  ('staff', 'messages.inbox'),
  ('staff', 'mentoring.manage'),
  ('staff', 'feedback.view'),
  ('staff', 'surveys.manage'),
  ('staff', 'surveys.results'),
  ('staff', 'notifications.send'),
  ('staff', 'referrals.manage'),
  ('staff', 'impact.view');

-- Admin holds every permission in the catalog.
insert into public.permission_preset_defaults (builtin_key, permission_code)
select 'admin', code from public.permissions;
-- permission-preset-defaults:end

-- Presets ---------------------------------------------------------------------------

create table public.permission_presets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- Built-in presets carry their key and no name until an admin renames them,
  -- so the staff side can show the name in the reader's language.
  builtin_key text check (builtin_key in ('coach', 'staff', 'admin')),
  name text check (name is null or length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint permission_presets_org_id_id_unique unique (org_id, id),
  constraint permission_presets_builtin_unique unique (org_id, builtin_key),
  constraint permission_presets_named check (builtin_key is not null or name is not null)
);

create table public.permission_preset_permissions (
  org_id uuid not null,
  preset_id uuid not null,
  permission_code text not null references public.permissions (code) on delete cascade,
  primary key (preset_id, permission_code),
  constraint permission_preset_permissions_preset_fkey
    foreign key (org_id, preset_id) references public.permission_presets (org_id, id) on delete cascade
);

-- Per-person access -------------------------------------------------------------------

create table public.team_member_access (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- The preset last applied, so the staff side can show "Coach, adjusted"
  -- when the toggles differ from it. Null when none was applied.
  preset_id uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint team_member_access_preset_fkey
    foreign key (org_id, preset_id) references public.permission_presets (org_id, id)
    on delete set null (preset_id)
);

create table public.team_member_permissions (
  org_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  permission_code text not null references public.permissions (code) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles (id) on delete set null,
  primary key (profile_id, permission_code)
);

create index team_member_permissions_org_code_idx
  on public.team_member_permissions (org_id, permission_code);

-- The helper every access rule will call ----------------------------------------------

-- True when the signed-in person is an active team member of their organization
-- and holds this permission. It reads the live table, so a change takes effect at
-- once, with no new sign-in. Call it wrapped in a sub-select inside a policy,
-- `(select public.has_permission('x.y'))`, so PostgreSQL evaluates it once.
-- RAPP-233 adds the aal2 requirement here and RAPP-234 the "sessions valid
-- after" check, so both land in one place.
create or replace function public.has_permission(p_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_member_permissions as grant_row
    join public.profiles as profile on profile.id = grant_row.profile_id
    where grant_row.profile_id = (select auth.uid())
      and grant_row.permission_code = p_code
      and grant_row.org_id = profile.org_id
      and profile.is_active
      and profile.role in ('staff', 'admin')
  );
$$;

comment on function public.has_permission is 'True when the signed-in active team member holds this permission. Use as (select public.has_permission(code)) in policies.';

-- The signed-in person's own permissions, for menus and screens.
create or replace function public.my_permissions()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select grant_row.permission_code
  from public.team_member_permissions as grant_row
  join public.profiles as profile on profile.id = grant_row.profile_id
  where grant_row.profile_id = (select auth.uid())
    and grant_row.org_id = profile.org_id
    and profile.is_active
    and profile.role in ('staff', 'admin')
  order by grant_row.permission_code;
$$;

-- Row-level security --------------------------------------------------------------------

alter table public.permissions enable row level security;
alter table public.permissions force row level security;
alter table public.permission_preset_defaults enable row level security;
alter table public.permission_preset_defaults force row level security;
alter table public.permission_presets enable row level security;
alter table public.permission_presets force row level security;
alter table public.permission_preset_permissions enable row level security;
alter table public.permission_preset_permissions force row level security;
alter table public.team_member_access enable row level security;
alter table public.team_member_access force row level security;
alter table public.team_member_permissions enable row level security;
alter table public.team_member_permissions force row level security;

-- The catalog and the product defaults are product facts, not secrets.
create policy permissions_read on public.permissions
  for select to authenticated using (true);
create policy permission_preset_defaults_read on public.permission_preset_defaults
  for select to authenticated using (true);

create policy permission_presets_team_manage_read on public.permission_presets
  for select to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_permission('team.manage')));

create policy permission_preset_permissions_team_manage_read on public.permission_preset_permissions
  for select to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_permission('team.manage')));

create policy team_member_access_read on public.team_member_access
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (org_id = (select public.current_org_id()) and (select public.has_permission('team.manage')))
  );

create policy team_member_permissions_read on public.team_member_permissions
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (org_id = (select public.current_org_id()) and (select public.has_permission('team.manage')))
  );

-- Every write goes through the functions below; there are no write policies.
revoke insert, update, delete on public.permissions, public.permission_preset_defaults,
  public.permission_presets, public.permission_preset_permissions,
  public.team_member_access, public.team_member_permissions from anon, authenticated;

-- Internal writers --------------------------------------------------------------------------

-- One organization's permission changes run one at a time, so the "at least one
-- team.manage holder" count cannot race.
create or replace function private.lock_team_permissions(p_org_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended(p_org_id::text, 229229));
$$;

create or replace function private.assert_known_permissions(p_codes text[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from unnest(coalesce(p_codes, '{}'::text[])) as wanted(code)
    where not exists (select 1 from public.permissions as known where known.code = wanted.code)
  ) then
    raise exception 'PERMISSIONS/UNKNOWN_PERMISSION' using errcode = '22023';
  end if;
end;
$$;

-- "A person can grant only permissions they hold themselves." Applied to every
-- toggle that changes, in either direction, so nobody can strip a permission
-- they could not have given.
create or replace function private.assert_actor_holds(p_actor uuid, p_codes text[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from unnest(coalesce(p_codes, '{}'::text[])) as changed(code)
    where not exists (
      select 1 from public.team_member_permissions as held
      where held.profile_id = p_actor and held.permission_code = changed.code
    )
  ) then
    raise exception 'PERMISSIONS/NOT_HELD' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.assert_team_manage_remains(p_org_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.team_member_permissions as grant_row
    join public.profiles as profile on profile.id = grant_row.profile_id
    where grant_row.org_id = p_org_id
      and grant_row.permission_code = 'team.manage'
      and profile.org_id = p_org_id
      and profile.is_active
      and profile.role in ('staff', 'admin')
  ) then
    raise exception 'PERMISSIONS/LAST_TEAM_MANAGER' using errcode = '23514';
  end if;
end;
$$;

-- Replaces one person's toggles. No authorization here: callers check it.
create or replace function private.write_member_permissions(
  p_actor uuid,
  p_org_id uuid,
  p_profile_id uuid,
  p_codes text[],
  p_preset_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  wanted text[] := array(select distinct unnest(coalesce(p_codes, '{}'::text[])) order by 1);
  added text[];
  removed text[];
begin
  select coalesce(array_agg(code order by code), '{}') into added
  from unnest(wanted) as code
  where not exists (
    select 1 from public.team_member_permissions as held
    where held.profile_id = p_profile_id and held.permission_code = code
  );

  select coalesce(array_agg(held.permission_code order by held.permission_code), '{}') into removed
  from public.team_member_permissions as held
  where held.profile_id = p_profile_id
    and not (held.permission_code = any (wanted));

  delete from public.team_member_permissions
  where profile_id = p_profile_id and permission_code = any (removed);

  insert into public.team_member_permissions (org_id, profile_id, permission_code, granted_by)
  select p_org_id, p_profile_id, code, p_actor from unnest(added) as code;

  insert into public.team_member_access (profile_id, org_id, preset_id, updated_at, updated_by)
  values (p_profile_id, p_org_id, p_preset_id, now(), p_actor)
  on conflict (profile_id) do update
    set preset_id = excluded.preset_id,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  return jsonb_build_object('added', to_jsonb(added), 'removed', to_jsonb(removed), 'preset_id', p_preset_id);
end;
$$;

-- Built-in presets for one organization, with the product defaults.
create or replace function private.create_builtin_permission_presets(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.permission_presets (org_id, builtin_key)
  select p_org_id, key from unnest(array['coach', 'staff', 'admin']) as key
  on conflict (org_id, builtin_key) do nothing;

  insert into public.permission_preset_permissions (org_id, preset_id, permission_code)
  select p_org_id, preset.id, product_default.permission_code
  from public.permission_presets as preset
  join public.permission_preset_defaults as product_default
    on product_default.builtin_key = preset.builtin_key
  where preset.org_id = p_org_id
  on conflict do nothing;
end;
$$;

create or replace function private.organizations_create_builtin_presets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.create_builtin_permission_presets(new.id);
  return new;
end;
$$;

create trigger organizations_create_builtin_presets
  after insert on public.organizations
  for each row execute function private.organizations_create_builtin_presets();

-- Until RAPP-230/231 replace role changes with presets, a person's toggles follow
-- their role: staff get the organization's Staff preset, admins its Admin preset,
-- anyone else none. This is what keeps this migration free of access changes.
create or replace function private.sync_role_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  role_preset uuid;
begin
  if tg_op = 'UPDATE'
    and old.role is not distinct from new.role
    and old.org_id is not distinct from new.org_id
  then
    return new;
  end if;

  if new.role in ('staff', 'admin') then
    perform private.create_builtin_permission_presets(new.org_id);
    select id into role_preset
    from public.permission_presets
    where org_id = new.org_id and builtin_key = new.role;

    perform private.write_member_permissions(
      null,
      new.org_id,
      new.id,
      array(select permission_code from public.permission_preset_permissions where preset_id = role_preset),
      role_preset
    );
  else
    delete from public.team_member_permissions where profile_id = new.id;
    delete from public.team_member_access where profile_id = new.id;
  end if;
  return new;
end;
$$;

create trigger profiles_sync_role_permissions
  after insert or update of role, org_id on public.profiles
  for each row execute function private.sync_role_permissions();

-- Team-facing functions ---------------------------------------------------------------------

create or replace function public.set_team_member_permissions(
  p_profile_id uuid,
  p_permission_codes text[],
  p_preset_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  current_codes text[];
  wanted text[] := array(select distinct unnest(coalesce(p_permission_codes, '{}'::text[])));
  change jsonb;
begin
  if not (select public.has_permission('team.manage')) then
    raise exception 'PERMISSIONS/TEAM_MANAGE_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_profile_id and org_id = actor_org and role in ('staff', 'admin')
  ) then
    raise exception 'PERMISSIONS/NOT_A_TEAM_MEMBER' using errcode = 'P0002';
  end if;
  if p_preset_id is not null and not exists (
    select 1 from public.permission_presets where id = p_preset_id and org_id = actor_org
  ) then
    raise exception 'PERMISSIONS/UNKNOWN_PRESET' using errcode = '22023';
  end if;
  perform private.assert_known_permissions(wanted);
  perform private.lock_team_permissions(actor_org);

  select coalesce(array_agg(permission_code), '{}') into current_codes
  from public.team_member_permissions where profile_id = p_profile_id;

  perform private.assert_actor_holds(
    actor,
    array(
      select code from unnest(wanted) as code where not (code = any (current_codes))
      union
      select code from unnest(current_codes) as code where not (code = any (wanted))
    )
  );

  change := private.write_member_permissions(actor, actor_org, p_profile_id, wanted, p_preset_id);
  perform private.assert_team_manage_remains(actor_org);

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'team.permissions_update', 'profile', p_profile_id, change);
end;
$$;

comment on function public.set_team_member_permissions is 'Replaces one team member''s toggles. Needs team.manage; every changed toggle must be one the caller holds; the organization keeps at least one team.manage holder. Audited.';

-- Applies a preset's toggles to the given people ("Apply to the N people who use it?").
create or replace function public.apply_permission_preset(
  p_preset_id uuid,
  p_profile_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
  preset_codes text[];
  target uuid;
  applied integer := 0;
begin
  if not (select public.has_permission('team.manage')) then
    raise exception 'PERMISSIONS/TEAM_MANAGE_REQUIRED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.permission_presets where id = p_preset_id and org_id = actor_org) then
    raise exception 'PERMISSIONS/UNKNOWN_PRESET' using errcode = '22023';
  end if;

  select coalesce(array_agg(permission_code), '{}') into preset_codes
  from public.permission_preset_permissions where preset_id = p_preset_id;

  foreach target in array coalesce(p_profile_ids, '{}'::uuid[]) loop
    perform public.set_team_member_permissions(target, preset_codes, p_preset_id);
    applied := applied + 1;
  end loop;
  return applied;
end;
$$;

-- Creates (p_preset_id null) or edits a preset. Nobody's toggles change here:
-- applying the edit to people is apply_permission_preset, an explicit action.
create or replace function public.save_permission_preset(
  p_preset_id uuid,
  p_name text,
  p_permission_codes text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  clean_name text := nullif(btrim(p_name), '');
  wanted text[] := array(select distinct unnest(coalesce(p_permission_codes, '{}'::text[])));
  current_codes text[] := '{}';
  saved_id uuid := p_preset_id;
  is_builtin boolean := false;
begin
  if not (select public.has_permission('team.manage')) then
    raise exception 'PERMISSIONS/TEAM_MANAGE_REQUIRED' using errcode = '42501';
  end if;
  perform private.assert_known_permissions(wanted);
  perform private.lock_team_permissions(actor_org);

  if saved_id is null then
    if clean_name is null then
      raise exception 'PERMISSIONS/PRESET_NAME_REQUIRED' using errcode = '22023';
    end if;
    insert into public.permission_presets (org_id, name)
    values (actor_org, clean_name)
    returning id into saved_id;
  else
    select builtin_key is not null into is_builtin
    from public.permission_presets where id = saved_id and org_id = actor_org;
    if not found then
      raise exception 'PERMISSIONS/UNKNOWN_PRESET' using errcode = '22023';
    end if;
    if clean_name is null and not is_builtin then
      raise exception 'PERMISSIONS/PRESET_NAME_REQUIRED' using errcode = '22023';
    end if;
    update public.permission_presets
       set name = clean_name, updated_at = now()
     where id = saved_id;
    select coalesce(array_agg(permission_code), '{}') into current_codes
    from public.permission_preset_permissions where preset_id = saved_id;
  end if;

  perform private.assert_actor_holds(
    actor,
    array(
      select code from unnest(wanted) as code where not (code = any (current_codes))
      union
      select code from unnest(current_codes) as code where not (code = any (wanted))
    )
  );

  delete from public.permission_preset_permissions
  where preset_id = saved_id and not (permission_code = any (wanted));
  insert into public.permission_preset_permissions (org_id, preset_id, permission_code)
  select actor_org, saved_id, code from unnest(wanted) as code
  on conflict do nothing;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org, actor, 'team.preset_save', 'permission_preset', saved_id,
    jsonb_build_object('name', clean_name, 'permissions', to_jsonb(wanted))
  );
  return saved_id;
end;
$$;

-- "Restore default" for a built-in preset.
create or replace function public.restore_permission_preset_default(p_preset_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  key text;
begin
  select builtin_key into key
  from public.permission_presets
  where id = p_preset_id and org_id = (select public.current_org_id());
  if key is null then
    raise exception 'PERMISSIONS/NOT_A_BUILTIN_PRESET' using errcode = '22023';
  end if;
  perform public.save_permission_preset(
    p_preset_id,
    null,
    array(select permission_code from public.permission_preset_defaults where builtin_key = key)
  );
end;
$$;

-- Deleting an organization preset. People who used it keep their toggles.
create or replace function public.delete_permission_preset(p_preset_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
begin
  if not (select public.has_permission('team.manage')) then
    raise exception 'PERMISSIONS/TEAM_MANAGE_REQUIRED' using errcode = '42501';
  end if;
  if exists (select 1 from public.permission_presets where id = p_preset_id and org_id = actor_org and builtin_key is not null) then
    raise exception 'PERMISSIONS/BUILTIN_PRESET' using errcode = '22023';
  end if;
  delete from public.permission_presets where id = p_preset_id and org_id = actor_org;
  if not found then
    raise exception 'PERMISSIONS/UNKNOWN_PRESET' using errcode = '22023';
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'team.preset_delete', 'permission_preset', p_preset_id, '{}'::jsonb);
end;
$$;

-- Grants -------------------------------------------------------------------------------------

revoke all on function public.has_permission(text) from public, anon;
revoke all on function public.my_permissions() from public, anon;
revoke all on function public.set_team_member_permissions(uuid, text[], uuid) from public, anon;
revoke all on function public.apply_permission_preset(uuid, uuid[]) from public, anon;
revoke all on function public.save_permission_preset(uuid, text, text[]) from public, anon;
revoke all on function public.restore_permission_preset_default(uuid) from public, anon;
revoke all on function public.delete_permission_preset(uuid) from public, anon;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.my_permissions() to authenticated;
grant execute on function public.set_team_member_permissions(uuid, text[], uuid) to authenticated;
grant execute on function public.apply_permission_preset(uuid, uuid[]) to authenticated;
grant execute on function public.save_permission_preset(uuid, text, text[]) to authenticated;
grant execute on function public.restore_permission_preset_default(uuid) to authenticated;
grant execute on function public.delete_permission_preset(uuid) to authenticated;

revoke all on function private.lock_team_permissions(uuid) from public, anon, authenticated;
revoke all on function private.assert_known_permissions(text[]) from public, anon, authenticated;
revoke all on function private.assert_actor_holds(uuid, text[]) from public, anon, authenticated;
revoke all on function private.assert_team_manage_remains(uuid) from public, anon, authenticated;
revoke all on function private.write_member_permissions(uuid, uuid, uuid, text[], uuid) from public, anon, authenticated;
revoke all on function private.create_builtin_permission_presets(uuid) from public, anon, authenticated;
revoke all on function private.organizations_create_builtin_presets() from public, anon, authenticated;
revoke all on function private.sync_role_permissions() from public, anon, authenticated;

-- Backfill: existing organizations get the built-in presets, and existing team
-- members get the preset of their role (the trigger's rule, applied once).
do $$
declare
  organization record;
  member record;
  role_preset uuid;
begin
  for organization in select id from public.organizations loop
    perform private.create_builtin_permission_presets(organization.id);
  end loop;
  for member in select id, org_id, role from public.profiles where role in ('staff', 'admin') loop
    select id into role_preset
    from public.permission_presets where org_id = member.org_id and builtin_key = member.role;
    perform private.write_member_permissions(
      null, member.org_id, member.id,
      array(select permission_code from public.permission_preset_permissions where preset_id = role_preset),
      role_preset
    );
  end loop;
end;
$$;

-- The erasure registry stays exhaustive ------------------------------------------------------

create or replace function public.personal_data_disposition()
returns table (table_name text, participant_column text, disposition text, reason text)
language sql
immutable
set search_path = ''
as $$
  select * from (values
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
    ('team_member_permissions', null, 'not_personal', 'Team access administration; players never hold permissions.')
  ) as disposition(table_name, participant_column, disposition, reason);
$$;
