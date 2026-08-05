create table public.event_signups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id()
    references public.organizations (id) on delete cascade,
  event_id uuid not null,
  player_id uuid not null references public.profiles (id) on delete cascade,
  state text not null
    check (state in ('interested', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_signups_event_same_org
    foreign key (org_id, event_id)
    references public.events (org_id, id) on delete cascade,
  constraint event_signups_event_player_unique unique (event_id, player_id)
);

alter table public.events
  add column active_signup_count integer not null default 0,
  add constraint events_active_signup_count_valid
    check (
      active_signup_count >= 0
      and (max_participants is null or active_signup_count <= max_participants)
      and (signup_mode <> 'none' or active_signup_count = 0)
    );

-- The parent row is the event-wide serialization point. PostgreSQL documents
-- that competing SELECT FOR UPDATE calls wait for the first transaction, so
-- count-check-increment is atomic even when two players claim the last place.
-- Source: https://www.postgresql.org/docs/17/explicit-locking.html
create or replace function private.enforce_event_signup_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_event public.events%rowtype;
  player_org_id uuid;
  old_is_active boolean := false;
  new_is_active boolean := false;
  expected_state text;
begin
  if tg_op = 'DELETE' then
    if old.state in ('interested', 'confirmed') then
      update public.events
      set active_signup_count = active_signup_count - 1
      where id = old.event_id;
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and (
    old.org_id <> new.org_id
    or old.event_id <> new.event_id
    or old.player_id <> new.player_id
  ) then
    raise exception using errcode = '42501', message = 'EVENTS/IDENTITY_IMMUTABLE';
  end if;

  select *
  into locked_event
  from public.events
  where id = new.event_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'EVENTS/NOT_FOUND';
  end if;

  select profiles.org_id
  into player_org_id
  from public.profiles
  where profiles.id = new.player_id;

  if player_org_id is null
     or new.org_id <> locked_event.org_id
     or player_org_id <> locked_event.org_id then
    raise exception using errcode = '42501', message = 'EVENTS/WRONG_ORGANIZATION';
  end if;

  old_is_active := tg_op = 'UPDATE' and old.state in ('interested', 'confirmed');
  new_is_active := new.state in ('interested', 'confirmed');

  if new_is_active then
    expected_state := case locked_event.signup_mode
      when 'interest' then 'interested'
      when 'confirm' then 'confirmed'
      else null
    end;

    if expected_state is null then
      raise exception using errcode = 'P0001', message = 'EVENTS/SIGNUP_CLOSED';
    end if;
    if new.state <> expected_state then
      raise exception using errcode = 'P0001', message = 'EVENTS/STATE_MISMATCH';
    end if;
  end if;

  if new_is_active and not old_is_active then
    if locked_event.max_participants is not null
       and locked_event.active_signup_count >= locked_event.max_participants then
      raise exception using errcode = 'P0001', message = 'EVENTS/CAPACITY_FULL';
    end if;
    update public.events
    set active_signup_count = active_signup_count + 1
    where id = new.event_id;
  elsif old_is_active and not new_is_active then
    update public.events
    set active_signup_count = active_signup_count - 1
    where id = new.event_id;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_event_signup_state() from public, anon, authenticated;

-- AFTER is intentional. PostgreSQL can run both row-level BEFORE INSERT and
-- BEFORE UPDATE triggers for ON CONFLICT DO UPDATE, which would reserve twice.
-- Source: https://www.postgresql.org/docs/current/trigger-definition.html
create trigger event_signups_enforce_state
  after insert or update or delete on public.event_signups
  for each row
  execute function private.enforce_event_signup_state();

create trigger event_signups_set_updated_at
  before update on public.event_signups
  for each row
  execute function public.set_updated_at();

create index event_signups_org_event_active_idx
  on public.event_signups (org_id, event_id, state)
  where state in ('interested', 'confirmed');

create index event_signups_player_updated_idx
  on public.event_signups (player_id, updated_at desc);

alter table public.event_signups enable row level security;
alter table public.event_signups force row level security;

create policy event_signups_select_org_staff_or_self
  on public.event_signups
  for select
  to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.is_staff_or_admin())
      or (
        (select public.current_app_role()) = 'player'
        and player_id = (select auth.uid())
      )
    )
  );

create policy event_signups_insert_self
  on public.event_signups
  for insert
  to authenticated
  with check (
    (select public.current_app_role()) = 'player'
    and player_id = (select auth.uid())
    and org_id = (select public.current_org_id())
    and exists (
      select 1
      from public.events
      where events.id = event_signups.event_id
        and events.org_id = event_signups.org_id
    )
  );

-- UPDATE needs a matching SELECT policy in PostgreSQL RLS. The select policy
-- above exposes only the caller's own row to a player.
-- Source: https://supabase.com/docs/guides/database/postgres/row-level-security#update-policies
create policy event_signups_update_self
  on public.event_signups
  for update
  to authenticated
  using (
    (select public.current_app_role()) = 'player'
    and player_id = (select auth.uid())
    and org_id = (select public.current_org_id())
  )
  with check (
    (select public.current_app_role()) = 'player'
    and player_id = (select auth.uid())
    and org_id = (select public.current_org_id())
    and exists (
      select 1
      from public.events
      where events.id = event_signups.event_id
        and events.org_id = event_signups.org_id
    )
  );

revoke all on table public.event_signups from anon, authenticated;
grant select on table public.event_signups to authenticated;
grant insert (event_id, player_id, state) on table public.event_signups to authenticated;
-- PostgREST upsert includes the conflict-key columns in its UPDATE projection.
-- The trigger above still makes those identity values immutable.
grant update (event_id, player_id, state) on table public.event_signups to authenticated;

comment on table public.event_signups is 'One player state per event series. Active states consume capacity; cancelled rows remain as the signup audit trail.';
comment on column public.events.active_signup_count is 'Trigger-maintained count of interested or confirmed signups. Clients can read but cannot write it.';

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
    ('event_signups', 'player_id', 'purge',
     'Her interest or confirmed attendance at an event is participant activity and must be erased.'),
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
    ('knowledge_categories', null, 'not_personal',
     'Organization-owned knowledge vocabulary with no participant data.'),
    ('knowledge_articles', 'author_id', 'purge',
     'Participant stories contain her words and first-name attribution. Anonymization and erasure remove the whole story.'),
    ('organizations', null, 'not_personal',
     'A tenant, not a person. No participant column exists to purge.');
$$;

comment on function public.personal_data_disposition is 'What happens to each table when a participant is erased. Every table in public must appear; pgTAP fails when one does not, and delete_participant_permanently() sweeps from this list at runtime so the registry and the behaviour cannot drift apart.';
