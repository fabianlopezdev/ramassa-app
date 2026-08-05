-- Organization events, fixed event categories, and DST-safe occurrence materialization.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function public.is_event_recurrence_rule_valid(recurrence_rule text)
returns boolean
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select recurrence_rule is null
    or recurrence_rule ~ '^FREQ=WEEKLY;INTERVAL=[1-4];COUNT=([1-9]|[1-4][0-9]|5[0-2])$';
$$;

create table public.event_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id()
    references public.organizations (id) on delete cascade,
  name jsonb not null,
  icon text not null,
  color text not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_categories_org_id_id_unique unique (org_id, id),
  constraint event_categories_name_complete
    check (public.is_localized_content_valid(name, 200, true)),
  constraint event_categories_icon_catalog
    check (
      icon in (
        'dumbbell',
        'graduation-cap',
        'theater',
        'briefcase-business',
        'languages',
        'footprints',
        'users'
      )
    ),
  constraint event_categories_color_catalog
    check (color in ('primary', 'secondary', 'accent', 'chart-1', 'chart-2', 'chart-3'))
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id()
    references public.organizations (id) on delete cascade,
  category_id uuid not null,
  title jsonb not null,
  description jsonb,
  location text not null check (length(btrim(location)) between 1 and 500),
  location_url text check (location_url is null or location_url ~* '^https://'),
  starts_at timestamptz not null,
  ends_at timestamptz,
  time_zone text not null default 'Europe/Madrid'
    check (time_zone = 'Europe/Madrid'),
  recurrence_rule text,
  is_recurring boolean generated always as (recurrence_rule is not null) stored,
  max_participants integer check (max_participants between 1 and 10000),
  signup_mode text not null default 'none'
    check (signup_mode in ('none', 'interest', 'confirm')),
  status text not null default 'draft'
    check (status in ('draft', 'published')),
  published_at timestamptz,
  expires_at timestamptz,
  created_by uuid default auth.uid()
    references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_org_id_id_unique unique (org_id, id),
  constraint events_category_same_org
    foreign key (org_id, category_id)
    references public.event_categories (org_id, id),
  constraint events_title_valid
    check (public.is_localized_content_valid(title, 200, false)),
  constraint events_description_valid
    check (
      description is null
      or public.is_localized_content_valid(description, 10000, false)
    ),
  constraint events_end_after_start
    check (ends_at is null or ends_at > starts_at),
  constraint events_recurrence_rule_supported
    check (public.is_event_recurrence_rule_valid(recurrence_rule)),
  constraint events_published_at_required
    check (status = 'draft' or published_at is not null),
  constraint events_expiry_after_publication
    check (
      expires_at is null
      or (published_at is not null and expires_at > published_at)
    ),
  constraint events_published_languages_complete
    check (
      status = 'draft'
      or (
        public.is_localized_content_valid(title, 200, true)
        and (
          description is null
          or public.is_localized_content_valid(description, 10000, true)
        )
      )
    )
);

create table public.event_occurrences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  constraint event_occurrences_event_same_org
    foreign key (org_id, event_id)
    references public.events (org_id, id) on delete cascade,
  constraint event_occurrences_end_after_start
    check (ends_at is null or ends_at > starts_at),
  constraint event_occurrences_unique_start
    unique (org_id, event_id, starts_at)
);

comment on table public.events is 'Event series masters. A null recurrence_rule is one-off; the supported finite weekly RRULE subset is materialized into event_occurrences.';
comment on column public.events.starts_at is 'First occurrence stored as a UTC timestamptz and displayed in Europe/Madrid.';
comment on table public.event_occurrences is 'Materialized event instances. Weekly arithmetic happens in Europe/Madrid local time before conversion to UTC, preserving wall-clock time across DST.';

create or replace function private.materialize_event_occurrences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  local_start timestamp;
  event_duration interval;
  recurrence_interval integer := 0;
  occurrence_count integer := 1;
begin
  delete from public.event_occurrences where event_id = new.id;

  local_start := new.starts_at at time zone new.time_zone;
  event_duration := case
    when new.ends_at is null then null
    else new.ends_at - new.starts_at
  end;

  if new.recurrence_rule is not null then
    recurrence_interval := substring(new.recurrence_rule from 'INTERVAL=([1-4])')::integer;
    occurrence_count := substring(
      new.recurrence_rule from 'COUNT=([1-9]|[1-4][0-9]|5[0-2])'
    )::integer;
  end if;

  insert into public.event_occurrences (org_id, event_id, starts_at, ends_at)
  select
    new.org_id,
    new.id,
    (
      local_start
      + make_interval(weeks => occurrence_index * recurrence_interval)
    ) at time zone new.time_zone,
    case
      when event_duration is null then null
      else (
        (
          local_start
          + make_interval(weeks => occurrence_index * recurrence_interval)
        ) at time zone new.time_zone
      ) + event_duration
    end
  from generate_series(0, occurrence_count - 1) as occurrence_index;

  return new;
end;
$$;

revoke all on function private.materialize_event_occurrences() from public, anon, authenticated;

create trigger event_categories_set_updated_at
  before update on public.event_categories
  for each row
  execute function public.set_updated_at();

create trigger events_set_updated_at
  before update on public.events
  for each row
  execute function public.set_updated_at();

create trigger events_materialize_occurrences
  after insert or update of org_id, starts_at, ends_at, time_zone, recurrence_rule
  on public.events
  for each row
  execute function private.materialize_event_occurrences();

create index event_categories_org_order_idx
  on public.event_categories (org_id, sort_order, id);

create index events_org_status_start_idx
  on public.events (org_id, status, published_at, starts_at, id);

create index events_org_category_start_idx
  on public.events (org_id, category_id, starts_at, id);

create index events_visible_start_idx
  on public.events (org_id, starts_at, id)
  where status = 'published';

create index events_org_created_by_idx
  on public.events (org_id, created_by)
  where created_by is not null;

create index event_occurrences_org_start_idx
  on public.event_occurrences (org_id, starts_at, event_id);

alter table public.event_categories enable row level security;
alter table public.event_categories force row level security;
alter table public.events enable row level security;
alter table public.events force row level security;
alter table public.event_occurrences enable row level security;
alter table public.event_occurrences force row level security;

create policy event_categories_select_org_staff_or_player
  on public.event_categories
  for select
  to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.is_staff_or_admin())
      or (select public.current_app_role()) = 'player'
    )
  );

create policy event_categories_insert_org_staff
  on public.event_categories
  for insert
  to authenticated
  with check (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
  );

create policy event_categories_update_org_staff
  on public.event_categories
  for update
  to authenticated
  using (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
  )
  with check (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
  );

create policy event_categories_delete_org_staff
  on public.event_categories
  for delete
  to authenticated
  using (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
  );

create policy events_select_org_staff_or_visible_player
  on public.events
  for select
  to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.is_staff_or_admin())
      or (
        (select public.current_app_role()) = 'player'
        and public.is_content_visible(status, published_at, expires_at)
      )
    )
  );

create policy events_insert_org_staff
  on public.events
  for insert
  to authenticated
  with check (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
    and created_by = (select auth.uid())
  );

create policy events_update_org_staff
  on public.events
  for update
  to authenticated
  using (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
  )
  with check (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
  );

create policy events_delete_org_staff
  on public.events
  for delete
  to authenticated
  using (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
  );

create policy event_occurrences_select_org_staff_or_visible_player
  on public.event_occurrences
  for select
  to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.is_staff_or_admin())
      or (
        (select public.current_app_role()) = 'player'
        and exists (
          select 1
          from public.events
          where events.id = event_occurrences.event_id
            and events.org_id = event_occurrences.org_id
            and public.is_content_visible(
              events.status,
              events.published_at,
              events.expires_at
            )
        )
      )
    )
  );

revoke all on table public.event_categories from anon, authenticated;
grant select on table public.event_categories to authenticated;
grant insert (name, icon, color, sort_order)
  on table public.event_categories to authenticated;
grant update (name, icon, color, sort_order)
  on table public.event_categories to authenticated;
grant delete on table public.event_categories to authenticated;

revoke all on table public.events from anon, authenticated;
grant select on table public.events to authenticated;
grant insert (
  category_id,
  title,
  description,
  location,
  location_url,
  starts_at,
  ends_at,
  time_zone,
  recurrence_rule,
  max_participants,
  signup_mode,
  status,
  published_at,
  expires_at
) on table public.events to authenticated;
grant update (
  category_id,
  title,
  description,
  location,
  location_url,
  starts_at,
  ends_at,
  time_zone,
  recurrence_rule,
  max_participants,
  signup_mode,
  status,
  published_at,
  expires_at
) on table public.events to authenticated;
grant delete on table public.events to authenticated;

revoke all on table public.event_occurrences from anon, authenticated;
grant select on table public.event_occurrences to authenticated;

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
    ('profiles', 'id', 'purge',
     'The record itself, including the four columns encrypted under ADR-004.'),
    ('participant_notes', 'profile_id', 'purge',
     'The team''s prose about her life. Append-only against editing, not against erasure.'),
    ('push_tokens', 'user_id', 'purge',
     'Device tokens. Anything left here could still deliver a notification to her phone.'),
    ('terms_acceptances', 'profile_id', 'purge',
     'Her consent records; there is nothing left for them to be consent to.'),
    ('deletion_requests', 'profile_id', 'purge',
     'Carries `reason`, written in her own words. The audit trail records that the request was fulfilled.'),
    ('invites', 'accepted_by', 'purge',
     'The invitation that admitted her, and separately every row carrying her email address.'),
    ('equipment_deliveries', 'profile_id', 'purge',
     'What she was given and when. Not neutral inventory: it says which women needed boots and in what month, which is an inference about her circumstances.'),
    ('audit_log', 'actor_id', 'purge',
     'Rows where SHE acted. The FK does not cascade, so leaving these would make her undeletable.'),
    ('audit_log', 'target_id', 'retain',
     'Kept on purpose (ADR-023): opaque ids only, never personal data (ADR-021). This is the evidence that access to her record was lawful and that the erasure happened, which art. 17(3) permits keeping and which erasing would destroy along with the thing it proves.'),
    ('announcements', null, 'not_personal',
     'Organization-owned operational content. Players cannot author it, and a removed staff author is detached with ON DELETE SET NULL.'),
    ('event_categories', null, 'not_personal',
     'Organization-owned event vocabulary with no participant data.'),
    ('events', null, 'not_personal',
     'Organization-owned schedules. A removed staff author is detached with ON DELETE SET NULL.'),
    ('event_occurrences', null, 'not_personal',
     'Materialized organization schedule instances with no participant data.'),
    ('organizations', null, 'not_personal',
     'A tenant, not a person. No participant column exists to purge.');
$$;

comment on function public.personal_data_disposition is 'What happens to each table when a participant is erased. Every table in public must appear; pgTAP fails when one does not, and delete_participant_permanently() sweeps from this list at runtime so the registry and the behaviour cannot drift apart.';
