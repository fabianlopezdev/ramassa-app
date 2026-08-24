-- RAPP-67: deletion request audit fields are database-owned.

-- These internal tables intentionally expose no client row. An explicit deny
-- policy makes that contract visible to policy inventory and regression tests.
create policy mentoring_notification_events_deny_client
  on public.mentoring_notification_events
  for all
  to public
  using (false)
  with check (false);

create policy municipality_catalog_deny_client
  on public.municipality_catalog
  for all
  to public
  using (false)
  with check (false);

create policy push_deliveries_deny_client
  on public.push_deliveries
  for all
  to public
  using (false)
  with check (false);

create policy push_publications_deny_client
  on public.push_publications
  for all
  to public
  using (false)
  with check (false);

drop policy if exists deletion_requests_update_org_staff on public.deletion_requests;
revoke update on table public.deletion_requests from authenticated;

create or replace function public.transition_deletion_request(
  p_request_id uuid,
  p_state text,
  p_resolution_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  previous_state text;
begin
  if actor is null or not public.is_staff_or_admin() then
    raise exception 'staff or admin authentication required' using errcode = '42501';
  end if;

  select request.state
    into previous_state
    from public.deletion_requests request
    join public.profiles subject on subject.id = request.profile_id
   where request.id = p_request_id
     and subject.org_id = public.current_org_id()
   for update of request;

  if not found then
    raise exception 'deletion request not found' using errcode = 'P0002';
  end if;

  if p_state not in ('in_progress', 'done', 'declined')
     or previous_state in ('done', 'declined')
     or (previous_state = 'in_progress' and p_state = 'in_progress') then
    raise exception 'invalid deletion request state transition' using errcode = '23514';
  end if;

  update public.deletion_requests
     set state = p_state,
         resolution_note = nullif(btrim(p_resolution_note), ''),
         resolved_by = case when p_state in ('done', 'declined') then actor else null end,
         resolved_at = case when p_state in ('done', 'declined') then now() else null end
   where id = p_request_id;
end;
$$;

revoke all on function public.transition_deletion_request(uuid, text, text) from public;
revoke all on function public.transition_deletion_request(uuid, text, text) from anon;
revoke all on function public.transition_deletion_request(uuid, text, text) from authenticated;
grant execute on function public.transition_deletion_request(uuid, text, text) to authenticated;

comment on function public.transition_deletion_request(uuid, text, text) is
  'Transitions an RGPD deletion request within the caller tenant and derives terminal audit fields from auth.uid() and now().';
