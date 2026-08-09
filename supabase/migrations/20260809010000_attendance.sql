-- Offline-tolerant attendance with server-enforced staff attribution and
-- last-writer-wins conflict resolution (RAPP-38).

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id()
    references public.organizations (id) on delete cascade,
  occurrence_id uuid not null
    references public.event_occurrences (id) on delete cascade,
  player_id uuid not null
    references public.profiles (id) on delete cascade,
  status text not null check (status in ('present', 'absent', 'excused')),
  marked_by uuid default auth.uid()
    references public.profiles (id) on delete set null,
  marked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_occurrence_player_unique unique (occurrence_id, player_id)
);

comment on table public.attendance is
  'One current mark per event occurrence and participant. Staff-only. Offline conflicts resolve strictly by marked_at: a timestamp newer than the stored mark wins; an equal or older retry is an idempotent no-op.';
comment on column public.attendance.marked_at is
  'Writer clock captured when the coach taps, persisted in the MMKV outbox, and used as the last-writer-wins conflict timestamp.';
comment on column public.attendance.updated_at is
  'Server clock for operational inspection. It does not participate in conflict resolution.';

create index attendance_player_marked_at_idx
  on public.attendance (player_id, marked_at desc);
create index attendance_org_updated_at_idx
  on public.attendance (org_id, updated_at desc);
create index attendance_marked_by_idx
  on public.attendance (marked_by)
  where marked_by is not null;

create or replace function private.prepare_attendance_mark()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_org_id uuid;
  occurrence_org_id uuid;
  participant_org_id uuid;
  participant_role text;
begin
  if not (select public.is_staff_or_admin()) then
    raise exception 'ATTENDANCE/STAFF_ONLY'
      using errcode = 'insufficient_privilege';
  end if;

  actor_org_id := (select public.current_org_id());

  select event_occurrences.org_id
  into occurrence_org_id
  from public.event_occurrences
  where event_occurrences.id = new.occurrence_id;

  select profiles.org_id, profiles.role
  into participant_org_id, participant_role
  from public.profiles
  where profiles.id = new.player_id;

  if occurrence_org_id is null or participant_org_id is null then
    raise exception 'ATTENDANCE/RELATED_ROW_NOT_FOUND'
      using errcode = 'foreign_key_violation';
  end if;

  if occurrence_org_id <> actor_org_id or participant_org_id <> actor_org_id then
    raise exception 'ATTENDANCE/WRONG_ORGANIZATION'
      using errcode = 'insufficient_privilege';
  end if;

  if participant_role <> 'player' then
    raise exception 'ATTENDANCE/PARTICIPANT_REQUIRED'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and (
    new.org_id <> old.org_id
    or new.occurrence_id <> old.occurrence_id
    or new.player_id <> old.player_id
  ) then
    raise exception 'ATTENDANCE/IDENTITY_IMMUTABLE'
      using errcode = 'insufficient_privilege';
  end if;

  -- An offline retry can arrive after another device has already written a
  -- later tap. Returning OLD makes that retry succeed idempotently while
  -- preserving the authoritative status and marker together.
  if tg_op = 'UPDATE' and new.marked_at <= old.marked_at then
    return old;
  end if;

  new.org_id := actor_org_id;
  new.marked_by := actor_id;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.prepare_attendance_mark() from public, anon, authenticated;

create trigger attendance_prepare_mark
  before insert or update on public.attendance
  for each row
  execute function private.prepare_attendance_mark();

alter table public.attendance enable row level security;
alter table public.attendance force row level security;

create policy attendance_select_org_staff
  on public.attendance
  for select
  to authenticated
  using (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
  );

create policy attendance_insert_org_staff
  on public.attendance
  for insert
  to authenticated
  with check (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
    and marked_by = (select auth.uid())
  );

-- PostgreSQL UPDATE needs a matching SELECT policy. The select policy above is
-- deliberately the same staff-and-tenant boundary as this mutation policy.
create policy attendance_update_org_staff
  on public.attendance
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

revoke all on table public.attendance from anon, authenticated;
grant select on table public.attendance to authenticated;
grant insert (occurrence_id, player_id, status, marked_at)
  on table public.attendance to authenticated;
grant update (status, marked_at)
  on table public.attendance to authenticated;

-- PostgREST's generic upsert assigns every supplied identity column in the
-- conflict branch, which would require granting UPDATE on occurrence_id and
-- player_id. Keep those columns immutable and expose one narrow upsert whose
-- conflict branch updates only the two fields a coach is allowed to change.
create or replace function public.mark_attendance(
  attendance_occurrence_id uuid,
  attendance_player_id uuid,
  attendance_status text,
  attendance_marked_at timestamptz
)
returns public.attendance
language sql
volatile
security invoker
set search_path = ''
as $$
  insert into public.attendance (occurrence_id, player_id, status, marked_at)
  values (
    attendance_occurrence_id,
    attendance_player_id,
    attendance_status,
    attendance_marked_at
  )
  on conflict (occurrence_id, player_id)
  do update set
    status = excluded.status,
    marked_at = excluded.marked_at
  returning attendance.*;
$$;

revoke all on function public.mark_attendance(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.mark_attendance(uuid, uuid, text, timestamptz)
  to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'attendance'
     ) then
    alter publication supabase_realtime add table public.attendance;
  end if;
end;
$$;

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
    ('push_deliveries', 'recipient_id', 'purge',
     'Per-device notification delivery history is participant activity and must be erased.'),
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
    ('attendance', 'player_id', 'purge',
     'Whether she attended, missed, or was excused from an event is participant activity and must be erased.'),
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
    ('push_publications', null, 'not_personal',
     'Organization-content idempotency and aggregate delivery counts contain no participant identity or notification text.'),
    ('organizations', null, 'not_personal',
     'A tenant, not a person. No participant column exists to purge.');
$$;

comment on function public.personal_data_disposition is
  'What happens to each table when a participant is erased. Every table in public must appear; pgTAP fails when one does not, and delete_participant_permanently() sweeps from this list at runtime so the registry and the behaviour cannot drift apart.';
