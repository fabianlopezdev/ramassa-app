-- RLS-safe attendance reporting views for staff and participant self-service
-- history (RAPP-39). Excused marks remain visible but are excluded from the
-- attendance-rate denominator.

drop policy attendance_select_org_staff on public.attendance;

create policy attendance_select_self_or_org_staff
  on public.attendance
  for select
  to authenticated
  using (
    player_id = (select auth.uid())
    or (
      (select public.is_staff_or_admin())
      and org_id = (select public.current_org_id())
    )
  );

-- A past event can expire out of the player feed without disappearing from her
-- personal attendance record. The narrow helper filters by auth.uid() and the
-- caller organization internally so it cannot reveal another participant.
create or replace function public.has_own_attendance_for_event(attended_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.attendance
    join public.event_occurrences
      on event_occurrences.id = attendance.occurrence_id
     and event_occurrences.org_id = attendance.org_id
    where event_occurrences.event_id = attended_event_id
      and attendance.player_id = (select auth.uid())
      and attendance.org_id = (select public.current_org_id())
  );
$$;

revoke all on function public.has_own_attendance_for_event(uuid)
  from public, anon, authenticated;
grant execute on function public.has_own_attendance_for_event(uuid)
  to authenticated;

drop policy events_select_org_staff_or_visible_player on public.events;

create policy events_select_org_staff_visible_or_attended_player
  on public.events
  for select
  to authenticated
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
    )
  );

drop policy event_occurrences_select_org_staff_or_visible_player
  on public.event_occurrences;

create policy event_occurrences_select_org_staff_visible_or_attended_player
  on public.event_occurrences
  for select
  to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.is_staff_or_admin())
      or (
        (select public.current_app_role()) = 'player'
        and (
          exists (
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
          or exists (
            select 1
            from public.attendance
            where attendance.occurrence_id = event_occurrences.id
              and attendance.player_id = (select auth.uid())
          )
        )
      )
    )
  );

create view public.attendance_report_rows
with (security_invoker = true)
as
select
  attendance.id as attendance_id,
  attendance.org_id,
  attendance.occurrence_id,
  occurrence.event_id,
  event.category_id,
  attendance.player_id,
  profile.first_name,
  profile.last_name,
  attendance.status,
  attendance.marked_at,
  occurrence.starts_at,
  occurrence.ends_at,
  event.title as event_title,
  event.location as event_location,
  category.name as category_name,
  category.color as category_color
from public.attendance
join public.event_occurrences as occurrence
  on occurrence.id = attendance.occurrence_id
 and occurrence.org_id = attendance.org_id
join public.events as event
  on event.id = occurrence.event_id
 and event.org_id = occurrence.org_id
join public.event_categories as category
  on category.id = event.category_id
 and category.org_id = event.org_id
join public.profiles as profile
  on profile.id = attendance.player_id
 and profile.org_id = attendance.org_id;

comment on view public.attendance_report_rows is
  'One marked participant per occurrence with report labels. SECURITY INVOKER preserves attendance, profile, event, occurrence, and category RLS for staff and player self-history.';

create view public.attendance_participant_stats
with (security_invoker = true)
as
select
  org_id,
  player_id,
  first_name,
  last_name,
  count(*) filter (where status = 'present')::integer as present_count,
  count(*) filter (where status = 'absent')::integer as absent_count,
  count(*) filter (where status = 'excused')::integer as excused_count,
  count(*)::integer as marked_count,
  coalesce(
    round(
      100.0 * count(*) filter (where status = 'present')
      / nullif(count(*) filter (where status in ('present', 'absent')), 0),
      2
    ),
    0.00
  ) as attendance_rate,
  max(starts_at) as latest_occurrence_at
from public.attendance_report_rows
group by org_id, player_id, first_name, last_name;

comment on view public.attendance_participant_stats is
  'Attendance totals and rate per participant. Excused marks are reported but excluded from the rate denominator.';

create view public.attendance_event_stats
with (security_invoker = true)
as
select
  org_id,
  event_id,
  category_id,
  event_title,
  event_location,
  category_name,
  category_color,
  count(distinct occurrence_id)::integer as occurrence_count,
  count(*) filter (where status = 'present')::integer as present_count,
  count(*) filter (where status = 'absent')::integer as absent_count,
  count(*) filter (where status = 'excused')::integer as excused_count,
  count(*)::integer as marked_count,
  coalesce(
    round(
      100.0 * count(*) filter (where status = 'present')
      / nullif(count(*) filter (where status in ('present', 'absent')), 0),
      2
    ),
    0.00
  ) as attendance_rate,
  max(starts_at) as latest_occurrence_at
from public.attendance_report_rows
group by
  org_id, event_id, category_id, event_title, event_location,
  category_name, category_color;

comment on view public.attendance_event_stats is
  'Attendance totals and rate per event series across all marked occurrences.';

create view public.attendance_category_stats
with (security_invoker = true)
as
select
  org_id,
  category_id,
  category_name,
  category_color,
  count(distinct event_id)::integer as event_count,
  count(distinct occurrence_id)::integer as occurrence_count,
  count(*) filter (where status = 'present')::integer as present_count,
  count(*) filter (where status = 'absent')::integer as absent_count,
  count(*) filter (where status = 'excused')::integer as excused_count,
  count(*)::integer as marked_count,
  coalesce(
    round(
      100.0 * count(*) filter (where status = 'present')
      / nullif(count(*) filter (where status in ('present', 'absent')), 0),
      2
    ),
    0.00
  ) as attendance_rate,
  max(starts_at) as latest_occurrence_at
from public.attendance_report_rows
group by org_id, category_id, category_name, category_color;

comment on view public.attendance_category_stats is
  'Attendance totals and rate per event category.';

create view public.attendance_period_stats
with (security_invoker = true)
as
select
  org_id,
  date_trunc('month', starts_at at time zone 'Europe/Madrid')::date as period_start,
  count(distinct event_id)::integer as event_count,
  count(distinct occurrence_id)::integer as occurrence_count,
  count(*) filter (where status = 'present')::integer as present_count,
  count(*) filter (where status = 'absent')::integer as absent_count,
  count(*) filter (where status = 'excused')::integer as excused_count,
  count(*)::integer as marked_count,
  coalesce(
    round(
      100.0 * count(*) filter (where status = 'present')
      / nullif(count(*) filter (where status in ('present', 'absent')), 0),
      2
    ),
    0.00
  ) as attendance_rate
from public.attendance_report_rows
group by org_id, date_trunc('month', starts_at at time zone 'Europe/Madrid')::date;

comment on view public.attendance_period_stats is
  'Monthly attendance totals and rate using the organization Europe/Madrid calendar.';

revoke all on public.attendance_report_rows from public, anon, authenticated;
revoke all on public.attendance_participant_stats from public, anon, authenticated;
revoke all on public.attendance_event_stats from public, anon, authenticated;
revoke all on public.attendance_category_stats from public, anon, authenticated;
revoke all on public.attendance_period_stats from public, anon, authenticated;

grant select on public.attendance_report_rows to authenticated;
grant select on public.attendance_participant_stats to authenticated;
grant select on public.attendance_event_stats to authenticated;
grant select on public.attendance_category_stats to authenticated;
grant select on public.attendance_period_stats to authenticated;
