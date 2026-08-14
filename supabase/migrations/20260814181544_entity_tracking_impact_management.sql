-- Stable collaborating-entity tenancy, entity tracking and privacy-safe impact
-- reporting, read-only entity events, and audited entity lifecycle management
-- (RAPP-55).

create table public.collaborating_entities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collaborating_entities_org_id_id_unique unique (org_id, id),
  constraint collaborating_entities_name_length check (
    length(btrim(name)) between 1 and 200
  )
);

comment on table public.collaborating_entities is
  'Stable tenant-owned social entities. Deactivation is soft so referral history remains attributable.';

create unique index collaborating_entities_org_lower_name_unique
  on public.collaborating_entities (org_id, lower(btrim(name)));
create index collaborating_entities_org_active_name_idx
  on public.collaborating_entities (org_id, is_active, name, id);
create index collaborating_entities_created_by_idx
  on public.collaborating_entities (created_by)
  where created_by is not null;

create trigger collaborating_entities_set_updated_at
  before update on public.collaborating_entities
  for each row execute function public.set_updated_at();

-- Backfill one durable entity for every deployed entity profile before adding
-- the membership and referral foreign keys. Mutable reference_entity text is
-- only a compatibility label after this migration, never an authorization key.
insert into public.collaborating_entities (org_id, name, created_by)
select
  profile.org_id,
  btrim(profile.reference_entity),
  min(profile.id::text)::uuid
from public.profiles as profile
where profile.role = 'entity'
  and nullif(btrim(profile.reference_entity), '') is not null
group by profile.org_id, btrim(profile.reference_entity)
on conflict do nothing;

alter table public.profiles
  add column collaborating_entity_id uuid;

update public.profiles as profile
set collaborating_entity_id = entity.id
from public.collaborating_entities as entity
where profile.role = 'entity'
  and entity.org_id = profile.org_id
  and lower(btrim(entity.name)) = lower(btrim(profile.reference_entity));

alter table public.profiles
  add constraint profiles_collaborating_entity_tenant_fkey
    foreign key (org_id, collaborating_entity_id)
    references public.collaborating_entities (org_id, id) on delete restrict,
  add constraint profiles_entity_membership_shape_check
    check (
      (role = 'entity' and collaborating_entity_id is not null)
      or (role <> 'entity' and collaborating_entity_id is null)
    );

create index profiles_collaborating_entity_idx
  on public.profiles (org_id, collaborating_entity_id, is_active, id)
  where collaborating_entity_id is not null;

alter table public.entity_referrals
  add column collaborating_entity_id uuid;

update public.entity_referrals as referral
set collaborating_entity_id = profile.collaborating_entity_id
from public.profiles as profile
where profile.org_id = referral.org_id
  and profile.id = referral.entity_user_id;

alter table public.entity_referrals
  alter column collaborating_entity_id set not null,
  add constraint entity_referrals_collaborating_entity_tenant_fkey
    foreign key (org_id, collaborating_entity_id)
    references public.collaborating_entities (org_id, id) on delete restrict;

create index entity_referrals_collaborating_entity_updated_idx
  on public.entity_referrals (org_id, collaborating_entity_id, updated_at desc, id);
create index entity_referrals_collaborating_entity_profile_idx
  on public.entity_referrals (org_id, collaborating_entity_id, referred_profile_id)
  where referred_profile_id is not null;

create table public.entity_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  collaborating_entity_id uuid not null,
  email text not null,
  profile_id uuid not null,
  invited_by uuid not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint entity_invitations_org_id_id_unique unique (org_id, id),
  constraint entity_invitations_entity_tenant_fkey
    foreign key (org_id, collaborating_entity_id)
    references public.collaborating_entities (org_id, id) on delete restrict,
  constraint entity_invitations_profile_tenant_fkey
    foreign key (org_id, profile_id)
    references public.profiles (org_id, id) on delete cascade,
  constraint entity_invitations_inviter_tenant_fkey
    foreign key (org_id, invited_by)
    references public.profiles (org_id, id) on delete restrict,
  constraint entity_invitations_email_is_an_address check (
    email = lower(btrim(email))
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  constraint entity_invitations_expiry_after_creation check (expires_at > created_at),
  constraint entity_invitations_acceptance_before_expiry check (
    accepted_at is null or accepted_at <= expires_at
  )
);

comment on table public.entity_invitations is
  'Address-bound entity collaborator invitations. No bearer token or secret is stored or returned.';

create unique index entity_invitations_pending_email_unique
  on public.entity_invitations (lower(email))
  where accepted_at is null;
create index entity_invitations_org_entity_created_idx
  on public.entity_invitations (org_id, collaborating_entity_id, created_at desc, id);
create index entity_invitations_profile_tenant_idx
  on public.entity_invitations (org_id, profile_id);
create index entity_invitations_inviter_tenant_idx
  on public.entity_invitations (org_id, invited_by);

alter table public.collaborating_entities enable row level security;
alter table public.collaborating_entities force row level security;
alter table public.entity_invitations enable row level security;
alter table public.entity_invitations force row level security;

-- A deactivated profile has no tenant or role at the database boundary. A user
-- with a brand-new auth identity and no profile still reaches participant
-- onboarding because complete_onboarding uses default_organization_id instead.
create or replace function public.current_org_id()
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select org_id
  from public.profiles
  where id = (select auth.uid())
    and is_active;
$$;

create or replace function public.current_app_role()
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select role
  from public.profiles
  where id = (select auth.uid())
    and is_active;
$$;

create or replace function public.current_collaborating_entity_id()
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select profile.collaborating_entity_id
  from public.profiles as profile
  join public.collaborating_entities as entity
    on entity.org_id = profile.org_id
   and entity.id = profile.collaborating_entity_id
  where profile.id = (select auth.uid())
    and profile.role = 'entity'
    and profile.is_active
    and entity.is_active;
$$;

create or replace function public.is_staff_or_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('staff', 'admin')
      and is_active
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
      and is_active
  );
$$;

revoke all on function public.current_collaborating_entity_id()
  from public, anon, authenticated;
grant execute on function public.current_collaborating_entity_id()
  to authenticated;

create policy collaborating_entities_select_own_or_staff
  on public.collaborating_entities for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      id = (select public.current_collaborating_entity_id())
      or (select public.is_staff_or_admin())
    )
  );

create policy entity_invitations_select_org_staff
  on public.entity_invitations for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (select public.is_staff_or_admin())
  );

revoke all on table public.collaborating_entities, public.entity_invitations
  from public, anon, authenticated;
grant select on table public.collaborating_entities, public.entity_invitations
  to authenticated;

-- Referral ownership follows the durable entity membership, not the individual
-- collaborator who happened to submit the row.
drop policy entity_referrals_select_own_or_staff on public.entity_referrals;
create policy entity_referrals_select_own_entity_or_staff
  on public.entity_referrals for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      collaborating_entity_id = (select public.current_collaborating_entity_id())
      or (select public.is_staff_or_admin())
    )
  );

drop policy referral_updates_select_own_entity_or_staff on public.referral_updates;
create policy referral_updates_select_own_entity_or_staff
  on public.referral_updates for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.is_staff_or_admin())
      or exists (
        select 1
        from public.entity_referrals as referral
        where referral.org_id = referral_updates.org_id
          and referral.id = referral_updates.referral_id
          and referral.collaborating_entity_id =
            (select public.current_collaborating_entity_id())
      )
    )
  );

create or replace function private.assert_referral_actor()
returns table (
  actor_id uuid,
  actor_org_id uuid,
  actor_role text
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  return query
  select
    profile.id,
    profile.org_id,
    profile.role
  from public.profiles as profile
  where profile.id = (select auth.uid())
    and profile.role in ('entity', 'staff', 'admin')
    and profile.is_active
    and (
      profile.role <> 'entity'
      or exists (
        select 1
        from public.collaborating_entities as entity
        where entity.org_id = profile.org_id
          and entity.id = profile.collaborating_entity_id
          and entity.is_active
      )
    );

  if not found then
    raise exception 'only active entity contacts and staff may manage referrals'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

revoke all on function private.assert_referral_actor()
  from public, anon, authenticated, service_role;

create or replace function public.create_entity_referral(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  actor_org uuid;
  actor_role text;
  actor_entity uuid;
  first_name text := nullif(btrim(p_payload ->> 'firstName'), '');
  last_name text := nullif(btrim(p_payload ->> 'lastName'), '');
  phone text := nullif(btrim(p_payload ->> 'phone'), '');
  email text := nullif(lower(btrim(p_payload ->> 'email')), '');
  documentation text := p_payload ->> 'documentationStatus';
  referral_notes text := nullif(btrim(p_payload ->> 'notes'), '');
  result uuid;
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
      'firstName', 'lastName', 'phone', 'email', 'documentationStatus', 'notes'
    ] <> '{}'::jsonb
    or first_name is null
    or length(first_name) > 100
    or last_name is null
    or length(last_name) > 100
    or (phone is not null and length(phone) > 50)
    or (email is not null and (length(email) > 254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+$'))
    or documentation not in ('none', 'missing', 'in_progress', 'complete')
    or (referral_notes is not null and length(referral_notes) > 4000)
  then
    raise check_violation using message = 'invalid entity referral payload';
  end if;

  insert into public.entity_referrals (
    org_id,
    entity_user_id,
    collaborating_entity_id,
    referred_first_name,
    referred_last_name,
    referred_phone,
    referred_email,
    documentation_status,
    notes
  ) values (
    actor_org,
    actor,
    actor_entity,
    first_name,
    last_name,
    public.encrypt_field(phone),
    public.encrypt_field(email),
    documentation,
    public.encrypt_field(referral_notes)
  )
  returning id into result;

  return result;
end;
$$;

-- PostgreSQL cannot change a function return row type in place.
drop function public.list_entity_referrals();
create function public.list_entity_referrals()
returns table (
  id uuid,
  entity_user_id uuid,
  referred_profile_id uuid,
  assigned_staff_id uuid,
  referred_first_name text,
  referred_last_name text,
  referred_phone text,
  referred_email text,
  documentation_status text,
  notes text,
  status text,
  entity_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security invoker
set search_path = ''
stable
as $$
  select
    referral.id,
    referral.entity_user_id,
    referral.referred_profile_id,
    referral.assigned_staff_id,
    referral.referred_first_name,
    referral.referred_last_name,
    public.decrypt_field(referral.referred_phone),
    public.decrypt_field(referral.referred_email),
    referral.documentation_status,
    public.decrypt_field(referral.notes),
    referral.status,
    entity.name,
    referral.created_at,
    referral.updated_at
  from public.entity_referrals as referral
  join public.collaborating_entities as entity
    on entity.org_id = referral.org_id
   and entity.id = referral.collaborating_entity_id
  where referral.collaborating_entity_id =
    (select public.current_collaborating_entity_id())
  order by referral.updated_at desc, referral.id;
$$;

drop function public.get_entity_referral(uuid);
create function public.get_entity_referral(p_referral_id uuid)
returns table (
  id uuid,
  entity_user_id uuid,
  referred_profile_id uuid,
  assigned_staff_id uuid,
  referred_first_name text,
  referred_last_name text,
  referred_phone text,
  referred_email text,
  documentation_status text,
  notes text,
  status text,
  entity_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
stable
as $$
begin
  return query
  select
    referral.id,
    referral.entity_user_id,
    referral.referred_profile_id,
    referral.assigned_staff_id,
    referral.referred_first_name,
    referral.referred_last_name,
    public.decrypt_field(referral.referred_phone),
    public.decrypt_field(referral.referred_email),
    referral.documentation_status,
    public.decrypt_field(referral.notes),
    referral.status,
    entity.name,
    referral.created_at,
    referral.updated_at
  from public.entity_referrals as referral
  join public.collaborating_entities as entity
    on entity.org_id = referral.org_id
   and entity.id = referral.collaborating_entity_id
  where referral.id = p_referral_id;

  if not found then
    raise no_data_found using message = 'referral not found';
  end if;
end;
$$;

drop function public.list_staff_referrals(text);
create function public.list_staff_referrals(p_status text default null)
returns table (
  id uuid,
  entity_user_id uuid,
  referred_profile_id uuid,
  assigned_staff_id uuid,
  referred_first_name text,
  referred_last_name text,
  referred_phone text,
  referred_email text,
  documentation_status text,
  notes text,
  status text,
  entity_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security invoker
set search_path = ''
stable
as $$
  select
    referral.id,
    referral.entity_user_id,
    referral.referred_profile_id,
    referral.assigned_staff_id,
    referral.referred_first_name,
    referral.referred_last_name,
    public.decrypt_field(referral.referred_phone),
    public.decrypt_field(referral.referred_email),
    referral.documentation_status,
    public.decrypt_field(referral.notes),
    referral.status,
    entity.name,
    referral.created_at,
    referral.updated_at
  from public.entity_referrals as referral
  join public.collaborating_entities as entity
    on entity.org_id = referral.org_id
   and entity.id = referral.collaborating_entity_id
  where (select public.is_staff_or_admin())
    and (p_status is null or referral.status = p_status)
  order by
    case when referral.status = 'pending' then 0 else 1 end,
    referral.created_at,
    referral.id;
$$;

create or replace function public.add_referral_update(
  p_referral_id uuid,
  p_update_type text,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  actor_org uuid;
  actor_role text;
  actor_entity uuid;
  clean_content text := nullif(btrim(p_content), '');
  result uuid;
begin
  select
    assert_referral_actor.actor_id,
    assert_referral_actor.actor_org_id,
    assert_referral_actor.actor_role
  into actor, actor_org, actor_role
  from private.assert_referral_actor();
  actor_entity := public.current_collaborating_entity_id();

  if p_update_type not in (
    'housing', 'documentation', 'education', 'employment', 'health', 'other'
  )
    or clean_content is null
    or length(clean_content) > 4000
  then
    raise check_violation using message = 'invalid referral update';
  end if;

  if not exists (
    select 1
    from public.entity_referrals as referral
    where referral.id = p_referral_id
      and referral.org_id = actor_org
      and referral.referred_profile_id is not null
      and (
        actor_role in ('staff', 'admin')
        or referral.collaborating_entity_id = actor_entity
      )
  ) then
    raise exception 'referral update is outside the caller boundary'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.referral_updates (
    org_id, referral_id, author_id, update_type, content
  ) values (
    actor_org, p_referral_id, actor, p_update_type, public.encrypt_field(clean_content)
  )
  returning id into result;

  return result;
end;
$$;

-- Entity collaborators may read attendance only for participants whose linked
-- referral belongs to their stable entity. All mutation privileges remain with
-- staff, so this adds no entity write path.
drop policy attendance_select_self_or_org_staff on public.attendance;
create policy attendance_select_self_staff_or_referring_entity
  on public.attendance for select to authenticated
  using (
    player_id = (select auth.uid())
    or (
      org_id = (select public.current_org_id())
      and (
        (select public.is_staff_or_admin())
        or exists (
          select 1
          from public.entity_referrals as referral
          where referral.org_id = attendance.org_id
            and referral.referred_profile_id = attendance.player_id
            and referral.collaborating_entity_id =
              (select public.current_collaborating_entity_id())
        )
      )
    )
  );

create function public.list_entity_referral_tracking()
returns table (
  referral_id uuid,
  referred_profile_id uuid,
  referred_first_name text,
  referred_last_name text,
  status text,
  attendance_present_count integer,
  attendance_absent_count integer,
  attendance_excused_count integer,
  attendance_marked_count integer,
  attendance_rate numeric,
  latest_occurrence_at timestamptz
)
language sql
security invoker
set search_path = ''
stable
as $$
  select
    referral.id,
    referral.referred_profile_id,
    referral.referred_first_name,
    referral.referred_last_name,
    referral.status,
    count(attendance.id) filter (where attendance.status = 'present')::integer,
    count(attendance.id) filter (where attendance.status = 'absent')::integer,
    count(attendance.id) filter (where attendance.status = 'excused')::integer,
    count(attendance.id)::integer,
    coalesce(
      round(
        100.0 * count(attendance.id) filter (where attendance.status = 'present')
        / nullif(count(attendance.id) filter (
          where attendance.status in ('present', 'absent')
        ), 0),
        2
      ),
      0.00
    ),
    max(occurrence.starts_at)
  from public.entity_referrals as referral
  left join public.attendance as attendance
    on attendance.org_id = referral.org_id
   and attendance.player_id = referral.referred_profile_id
  left join public.event_occurrences as occurrence
    on occurrence.org_id = attendance.org_id
   and occurrence.id = attendance.occurrence_id
  where referral.collaborating_entity_id =
      (select public.current_collaborating_entity_id())
    and referral.referred_profile_id is not null
  group by referral.id
  order by referral.referred_last_name, referral.referred_first_name, referral.id;
$$;

create function public.get_entity_impact_summary()
returns table (
  suppressed boolean,
  referred_count integer,
  active_count integer,
  inactive_count integer,
  attendance_present_count integer,
  attendance_eligible_count integer,
  attendance_marked_count integer,
  attendance_rate numeric
)
language sql
security invoker
set search_path = ''
stable
as $$
  with linked as (
    select referral.referred_profile_id, referral.status
    from public.entity_referrals as referral
    where referral.collaborating_entity_id =
        (select public.current_collaborating_entity_id())
      and referral.referred_profile_id is not null
  ), totals as (
    select
      count(distinct linked.referred_profile_id)::integer as people,
      count(distinct linked.referred_profile_id)
        filter (where linked.status = 'active')::integer as active_people,
      count(distinct linked.referred_profile_id)
        filter (where linked.status = 'inactive')::integer as inactive_people,
      count(attendance.id)
        filter (where attendance.status = 'present')::integer as present_marks,
      count(attendance.id)
        filter (where attendance.status in ('present', 'absent'))::integer as eligible_marks,
      count(attendance.id)::integer as all_marks
    from linked
    left join public.attendance as attendance
      on attendance.player_id = linked.referred_profile_id
     and attendance.org_id = (select public.current_org_id())
  )
  select
    people < 3,
    case when people >= 3 then people end,
    case when people >= 3 then active_people end,
    case when people >= 3 then inactive_people end,
    case when people >= 3 then present_marks end,
    case when people >= 3 then eligible_marks end,
    case when people >= 3 then all_marks end,
    case when people >= 3 then
      coalesce(round(100.0 * present_marks / nullif(eligible_marks, 0), 2), 0.00)
    end
  from totals;
$$;

create function public.list_entity_participation_trend()
returns table (
  month_start date,
  participant_count integer,
  attendance_present_count integer,
  attendance_eligible_count integer,
  attendance_marked_count integer,
  attendance_rate numeric
)
language sql
security invoker
set search_path = ''
stable
as $$
  with linked as (
    select distinct referral.referred_profile_id
    from public.entity_referrals as referral
    where referral.collaborating_entity_id =
        (select public.current_collaborating_entity_id())
      and referral.referred_profile_id is not null
  ), privacy as (
    select count(*)::integer as people from linked
  ), months as (
    select generate_series(
      date_trunc('month', now()) - interval '2 months',
      date_trunc('month', now()),
      interval '1 month'
    ) as month_start
  ), monthly as (
    select
      date_trunc('month', attendance.marked_at) as month_start,
      count(distinct attendance.player_id)::integer as participant_count,
      count(attendance.id)
        filter (where attendance.status = 'present')::integer as present_count,
      count(attendance.id)
        filter (where attendance.status in ('present', 'absent'))::integer as eligible_count,
      count(attendance.id)::integer as marked_count
    from public.attendance as attendance
    join linked on linked.referred_profile_id = attendance.player_id
    where attendance.org_id = (select public.current_org_id())
      and attendance.marked_at >= date_trunc('month', now()) - interval '2 months'
      and attendance.marked_at < date_trunc('month', now()) + interval '1 month'
    group by date_trunc('month', attendance.marked_at)
  )
  select
    months.month_start::date,
    coalesce(monthly.participant_count, 0),
    coalesce(monthly.present_count, 0),
    coalesce(monthly.eligible_count, 0),
    coalesce(monthly.marked_count, 0),
    coalesce(
      round(
        100.0 * monthly.present_count / nullif(monthly.eligible_count, 0),
        2
      ),
      0.00
    )
  from months
  cross join privacy
  left join monthly on monthly.month_start = months.month_start
  where privacy.people >= 3
  order by months.month_start;
$$;

-- Entities receive only currently published upcoming series. Existing staff and
-- participant event visibility remains unchanged.
drop policy events_select_org_staff_visible_or_attended_player on public.events;
create policy events_select_org_staff_player_or_entity
  on public.events for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.is_staff_or_admin())
      or (
        (select public.current_app_role()) = 'player'
        and (
          public.is_content_visible(status, published_at, expires_at)
          or (select public.has_own_attendance_for_event(events.id))
        )
      )
      or (
        (select public.current_app_role()) = 'entity'
        and (select public.current_collaborating_entity_id()) is not null
        and public.is_content_visible(status, published_at, expires_at)
        and starts_at >= now()
      )
    )
  );

create function public.list_entity_upcoming_events()
returns table (
  id uuid,
  category_id uuid,
  title jsonb,
  description jsonb,
  location text,
  location_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  time_zone text,
  is_recurring boolean
)
language sql
security invoker
set search_path = ''
stable
as $$
  select
    event.id,
    event.category_id,
    event.title,
    event.description,
    event.location,
    event.location_url,
    event.starts_at,
    event.ends_at,
    event.time_zone,
    event.is_recurring
  from public.events as event
  where (select public.current_app_role()) = 'entity'
    and event.status = 'published'
    and event.published_at <= now()
    and (event.expires_at is null or event.expires_at > now())
    and event.starts_at >= now()
  order by event.starts_at, event.id;
$$;

create function public.create_collaborating_entity(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  clean_name text := nullif(btrim(p_name), '');
  result uuid;
begin
  if not (select public.is_admin()) then
    raise exception 'only admins may create collaborating entities'
      using errcode = 'insufficient_privilege';
  end if;
  if clean_name is null or length(clean_name) > 200 then
    raise check_violation using message = 'invalid collaborating entity name';
  end if;

  perform public.assert_within_hourly_limit('entity.create', 30);

  insert into public.collaborating_entities (org_id, name, created_by)
  values (actor_org, clean_name, actor)
  returning id into result;

  insert into public.audit_log (
    org_id, actor_id, action, target_type, target_id, changes
  ) values (
    actor_org,
    actor,
    'entity.create',
    'collaborating_entity',
    result,
    jsonb_build_object('name', clean_name)
  );

  return result;
end;
$$;

create function public.list_collaborating_entities()
returns table (
  id uuid,
  name text,
  is_active boolean,
  active_collaborator_count integer,
  referral_count integer,
  pending_invitation_count integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security invoker
set search_path = ''
stable
as $$
  select
    entity.id,
    entity.name,
    entity.is_active,
    count(distinct profile.id) filter (where profile.is_active)::integer,
    count(distinct referral.id)::integer,
    count(distinct invitation.id)
      filter (where invitation.accepted_at is null and invitation.expires_at > now())::integer,
    entity.created_at,
    entity.updated_at
  from public.collaborating_entities as entity
  left join public.profiles as profile
    on profile.org_id = entity.org_id
   and profile.collaborating_entity_id = entity.id
  left join public.entity_referrals as referral
    on referral.org_id = entity.org_id
   and referral.collaborating_entity_id = entity.id
  left join public.entity_invitations as invitation
    on invitation.org_id = entity.org_id
   and invitation.collaborating_entity_id = entity.id
  where (select public.is_admin())
  group by entity.id
  order by entity.name, entity.id;
$$;

create function public.list_entity_collaborators(p_collaborating_entity_id uuid)
returns table (
  profile_id uuid,
  first_name text,
  last_name text,
  email text,
  is_active boolean,
  invited_at timestamptz,
  accepted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'only admins may list entity collaborators'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    profile.id,
    profile.first_name,
    profile.last_name,
    account.email::text,
    profile.is_active,
    invitation.created_at,
    invitation.accepted_at
  from public.profiles as profile
  join auth.users as account on account.id = profile.id
  left join public.entity_invitations as invitation
    on invitation.org_id = profile.org_id
   and invitation.profile_id = profile.id
  where profile.org_id = (select public.current_org_id())
    and profile.role = 'entity'
    and profile.collaborating_entity_id = p_collaborating_entity_id
  order by profile.last_name, profile.first_name, profile.id;
end;
$$;

create function public.invite_entity_collaborator(
  p_collaborating_entity_id uuid,
  p_email text,
  p_first_name text,
  p_last_name text
)
returns table (invitation_id uuid, profile_id uuid, email text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  clean_email text := lower(btrim(p_email));
  clean_first_name text := nullif(btrim(p_first_name), '');
  clean_last_name text := nullif(btrim(p_last_name), '');
  entity_name text;
  new_profile_id uuid := extensions.gen_random_uuid();
  new_invitation_id uuid := extensions.gen_random_uuid();
  invitation_expires_at timestamptz := now() + interval '30 days';
begin
  if not (select public.is_admin()) then
    raise exception 'only admins may invite entity collaborators'
      using errcode = 'insufficient_privilege';
  end if;
  if clean_email is null
    or length(clean_email) > 254
    or clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or clean_first_name is null
    or length(clean_first_name) > 100
    or clean_last_name is null
    or length(clean_last_name) > 100
  then
    raise check_violation using message = 'invalid entity collaborator invitation';
  end if;

  select entity.name into entity_name
  from public.collaborating_entities as entity
  where entity.id = p_collaborating_entity_id
    and entity.org_id = actor_org
    and entity.is_active;

  if entity_name is null then
    raise no_data_found using message = 'active collaborating entity not found';
  end if;
  if exists (
    select 1
    from auth.users as account
    where lower(account.email) = clean_email
  ) then
    raise unique_violation using message = 'an auth identity already uses this email';
  end if;

  perform public.assert_within_hourly_limit('entity.collaborator_invite', 30);

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    new_profile_id,
    'authenticated',
    'authenticated',
    clean_email,
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now(), '', '', '', '', '', ''
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    new_profile_id::text,
    new_profile_id,
    jsonb_build_object(
      'sub', new_profile_id::text,
      'email', clean_email,
      'email_verified', true
    ),
    'email',
    now(), now(), now()
  );

  insert into public.profiles (
    id,
    org_id,
    role,
    first_name,
    last_name,
    reference_entity,
    collaborating_entity_id,
    auth_method,
    terms_accepted_at
  ) values (
    new_profile_id,
    actor_org,
    'entity',
    clean_first_name,
    clean_last_name,
    entity_name,
    p_collaborating_entity_id,
    'magic_link',
    now()
  );

  insert into public.entity_invitations (
    id,
    org_id,
    collaborating_entity_id,
    email,
    profile_id,
    invited_by,
    expires_at
  ) values (
    new_invitation_id,
    actor_org,
    p_collaborating_entity_id,
    clean_email,
    new_profile_id,
    actor,
    invitation_expires_at
  );

  insert into public.audit_log (
    org_id, actor_id, action, target_type, target_id, changes
  ) values (
    actor_org,
    actor,
    'entity.collaborator_invite',
    'profile',
    new_profile_id,
    jsonb_build_object('collaborating_entity_id', p_collaborating_entity_id)
  );

  return query
  select new_invitation_id, new_profile_id, clean_email, invitation_expires_at;
end;
$$;

create function public.set_entity_collaborator_active(
  p_profile_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  subject_entity uuid;
begin
  if not (select public.is_admin()) then
    raise exception 'only admins may change entity collaborator access'
      using errcode = 'insufficient_privilege';
  end if;

  select profile.collaborating_entity_id into subject_entity
  from public.profiles as profile
  join public.collaborating_entities as entity
    on entity.org_id = profile.org_id
   and entity.id = profile.collaborating_entity_id
  where profile.id = p_profile_id
    and profile.org_id = actor_org
    and profile.role = 'entity'
    and (not p_is_active or entity.is_active);

  if subject_entity is null then
    raise no_data_found using message = 'entity collaborator not found';
  end if;

  update public.profiles
  set is_active = p_is_active
  where id = p_profile_id and org_id = actor_org;

  update auth.users
  set
    banned_until = case when p_is_active then null else now() + interval '100 years' end,
    updated_at = now()
  where id = p_profile_id;

  if not p_is_active then
    delete from auth.refresh_tokens where user_id = p_profile_id::text;
    delete from auth.sessions where user_id = p_profile_id;
  end if;

  insert into public.audit_log (
    org_id, actor_id, action, target_type, target_id, changes
  ) values (
    actor_org,
    actor,
    'entity.collaborator_access',
    'profile',
    p_profile_id,
    jsonb_build_object(
      'collaborating_entity_id', subject_entity,
      'is_active', p_is_active
    )
  );
end;
$$;

create function public.set_collaborating_entity_active(
  p_collaborating_entity_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  affected integer;
begin
  if not (select public.is_admin()) then
    raise exception 'only admins may change collaborating entity access'
      using errcode = 'insufficient_privilege';
  end if;

  update public.collaborating_entities
  set is_active = p_is_active
  where id = p_collaborating_entity_id
    and org_id = actor_org;
  get diagnostics affected = row_count;

  if affected = 0 then
    raise no_data_found using message = 'collaborating entity not found';
  end if;

  if not p_is_active then
    update public.profiles
    set is_active = false
    where org_id = actor_org
      and collaborating_entity_id = p_collaborating_entity_id;

    update auth.users as auth_user
    set banned_until = now() + interval '100 years', updated_at = now()
    where exists (
      select 1
      from public.profiles as profile
      where profile.id = auth_user.id
        and profile.org_id = actor_org
        and profile.collaborating_entity_id = p_collaborating_entity_id
    );

    delete from auth.refresh_tokens as refresh_token
    where exists (
      select 1
      from public.profiles as profile
      where profile.id::text = refresh_token.user_id
        and profile.org_id = actor_org
        and profile.collaborating_entity_id = p_collaborating_entity_id
    );

    delete from auth.sessions as session
    where exists (
      select 1
      from public.profiles as profile
      where profile.id = session.user_id
        and profile.org_id = actor_org
        and profile.collaborating_entity_id = p_collaborating_entity_id
    );
  end if;

  insert into public.audit_log (
    org_id, actor_id, action, target_type, target_id, changes
  ) values (
    actor_org,
    actor,
    'entity.access',
    'collaborating_entity',
    p_collaborating_entity_id,
    jsonb_build_object('is_active', p_is_active)
  );
end;
$$;

create function public.my_entity_invitation()
returns table (
  invitation_id uuid,
  collaborating_entity_id uuid,
  entity_name text,
  invited_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select invitation.id, entity.id, entity.name, invitation.created_at
  from public.entity_invitations as invitation
  join public.collaborating_entities as entity
    on entity.org_id = invitation.org_id
   and entity.id = invitation.collaborating_entity_id
  where invitation.email = lower(btrim(coalesce(
          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
          ''
        )))
    and invitation.profile_id = (select auth.uid())
    and invitation.accepted_at is null
    and invitation.expires_at > now()
    and entity.is_active
  order by invitation.created_at desc
  limit 1;
$$;

create function public.accept_my_entity_invitation()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_id uuid;
begin
  update public.entity_invitations as invitation
  set accepted_at = now()
  where invitation.profile_id = (select auth.uid())
    and invitation.email = lower(btrim(coalesce(
          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
          ''
        )))
    and invitation.accepted_at is null
    and invitation.expires_at > now()
  returning invitation.id into invitation_id;

  if invitation_id is null then
    raise no_data_found using message = 'pending entity invitation not found';
  end if;
  return invitation_id;
end;
$$;

create function public.purge_expired_entity_invitations(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  if (select auth.role()) <> 'service_role' and not (select public.is_admin()) then
    raise exception 'only service role or admin may purge entity invitations'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.entity_invitations
  where expires_at < p_now - interval '24 months'
     or accepted_at < p_now - interval '24 months';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- Keep the executable RGPD inventory exhaustive after adding two public tables.
create or replace function public.personal_data_disposition()
returns table (
  table_name text,
  participant_column text,
  disposition text,
  reason text
)
language sql
immutable
security invoker
set search_path = ''
as $$
  values
    ('profiles', 'id', 'purge', 'The participant profile and its encrypted fields.'),
    ('participant_notes', 'profile_id', 'purge', 'Staff prose about the participant.'),
    ('push_tokens', 'user_id', 'purge', 'Registered participant devices.'),
    ('push_deliveries', 'recipient_id', 'purge', 'Per-device notification delivery history.'),
    ('terms_acceptances', 'profile_id', 'purge', 'Participant consent records.'),
    ('deletion_requests', 'profile_id', 'purge', 'Participant erasure requests.'),
    ('invites', 'accepted_by', 'purge', 'The invitation that admitted the participant.'),
    ('entity_invitations', 'profile_id', 'purge', 'The address-bound invitation that admitted an entity collaborator.'),
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
    ('entity_referrals', 'referred_profile_id', 'purge',
     'Referral intake and every child update cascade with the linked participant.'),
    ('referral_updates', 'author_id', 'purge',
     'Any referral update authored by the participant is personal activity.'),
    ('audit_log', 'actor_id', 'purge', 'Rows where the participant acted.'),
    ('audit_log', 'target_id', 'retain', 'Opaque lawful-access and erasure record.'),
    ('entity_referrals', null, 'retain_limited',
     'Unlinked referral intake is encrypted and purged after 24 months.'),
    ('entity_invitations', null, 'retain_limited',
     'Expired and accepted entity invitations are purged after 24 months.'),
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
    ('service_submission_comments', null, 'not_personal', 'Organization service-review correspondence.'),
    ('service_submission_notifications', null, 'not_personal', 'Organization staff work queue.'),
    ('forum_categories', null, 'not_personal', 'Organization-owned forum vocabulary.'),
    ('collaborating_entities', null, 'not_personal', 'A tenant-owned partner organization, not a person.'),
    ('organizations', null, 'not_personal', 'A tenant, not a person.'),
    ('municipality_catalog', null, 'not_personal', 'Official geography with no participant data.');
$$;

revoke all on function public.list_entity_referrals() from public, anon;
revoke all on function public.get_entity_referral(uuid) from public, anon;
revoke all on function public.list_staff_referrals(text) from public, anon;
revoke all on function public.list_entity_referral_tracking() from public, anon;
revoke all on function public.get_entity_impact_summary() from public, anon;
revoke all on function public.list_entity_participation_trend() from public, anon;
revoke all on function public.list_entity_upcoming_events() from public, anon;
revoke all on function public.create_collaborating_entity(text) from public, anon;
revoke all on function public.list_collaborating_entities() from public, anon;
revoke all on function public.list_entity_collaborators(uuid) from public, anon;
revoke all on function public.invite_entity_collaborator(uuid, text, text, text)
  from public, anon;
revoke all on function public.set_entity_collaborator_active(uuid, boolean)
  from public, anon;
revoke all on function public.set_collaborating_entity_active(uuid, boolean)
  from public, anon;
revoke all on function public.my_entity_invitation() from public, anon;
revoke all on function public.accept_my_entity_invitation() from public, anon;
revoke all on function public.purge_expired_entity_invitations(timestamptz)
  from public, anon, authenticated;

grant execute on function public.list_entity_referrals() to authenticated;
grant execute on function public.get_entity_referral(uuid) to authenticated;
grant execute on function public.list_staff_referrals(text) to authenticated;
grant execute on function public.list_entity_referral_tracking() to authenticated;
grant execute on function public.get_entity_impact_summary() to authenticated;
grant execute on function public.list_entity_participation_trend() to authenticated;
grant execute on function public.list_entity_upcoming_events() to authenticated;
grant execute on function public.create_collaborating_entity(text) to authenticated;
grant execute on function public.list_collaborating_entities() to authenticated;
grant execute on function public.list_entity_collaborators(uuid) to authenticated;
grant execute on function public.invite_entity_collaborator(uuid, text, text, text)
  to authenticated;
grant execute on function public.set_entity_collaborator_active(uuid, boolean)
  to authenticated;
grant execute on function public.set_collaborating_entity_active(uuid, boolean)
  to authenticated;
grant execute on function public.my_entity_invitation() to authenticated;
grant execute on function public.accept_my_entity_invitation() to authenticated;
grant execute on function public.purge_expired_entity_invitations(timestamptz)
  to service_role;
