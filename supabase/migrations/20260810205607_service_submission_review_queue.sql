-- Staff review queue and atomic entity-submission decisions (RAPP-44).

alter table public.service_submission_notifications
  add column previous_service jsonb,
  add column current_service jsonb,
  add column recipient_id uuid references public.profiles (id) on delete set null
    deferrable initially deferred,
  add column decision_comment_id uuid
    references public.service_submission_comments (id) on delete set null;

alter table public.service_submission_notifications
  drop constraint service_submission_notifications_kind_check,
  add constraint service_submission_notifications_kind_check
    check (kind in ('published_edit', 'service_interest', 'approved', 'rejected'));

create index service_submission_notifications_recipient_idx
  on public.service_submission_notifications (recipient_id, created_at desc, id)
  where recipient_id is not null;
create index service_submission_notifications_decision_comment_idx
  on public.service_submission_notifications (decision_comment_id)
  where decision_comment_id is not null;

create index services_review_pending_idx
  on public.services (org_id, updated_at, id)
  where status = 'pending';

create or replace function private.notify_entity_published_service_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select public.current_app_role()) = 'entity'
    and old.status = 'published'
    and new.status = 'published'
    and (
      to_jsonb(new) - array[
        'updated_at', 'reviewed_by', 'reviewed_at', 'rejection_reason'
      ]::text[]
    ) is distinct from (
      to_jsonb(old) - array[
        'updated_at', 'reviewed_by', 'reviewed_at', 'rejection_reason'
      ]::text[]
    ) then
    insert into public.service_submission_notifications (
      org_id,
      service_id,
      kind,
      created_by,
      previous_service,
      current_service
    ) values (
      new.org_id,
      new.id,
      'published_edit',
      auth.uid(),
      to_jsonb(old),
      to_jsonb(new)
    );
  end if;
  return new;
end;
$$;

create or replace function public.get_service_review_queue(
  p_kind text,
  p_category_id uuid,
  p_query text,
  p_page integer
)
returns table (
  item_kind text,
  item_id uuid,
  service_id uuid,
  category_id uuid,
  title jsonb,
  provider_name text,
  contact_name text,
  status text,
  changed_at timestamptz,
  previous_service jsonb,
  current_service jsonb,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not (select public.is_staff_or_admin()) then
    raise insufficient_privilege using message =
      'only staff may read the service review queue';
  end if;
  if p_kind not in ('all', 'pending', 'published_edit') then
    raise check_violation using message = 'invalid service review queue kind';
  end if;
  if p_page is null or p_page < 1 or p_page > 10000 then
    raise check_violation using message = 'invalid service review queue page';
  end if;

  return query
  with candidates as (
    select
      'pending'::text as item_kind,
      service.id as item_id,
      service.id as service_id,
      service.category_id,
      service.title,
      service.provider_name,
      service.contact_name,
      service.status,
      service.updated_at as changed_at,
      null::jsonb as previous_service,
      null::jsonb as current_service,
      0 as sort_priority
    from public.services as service
    where p_kind in ('all', 'pending')
      and service.org_id = (select public.current_org_id())
      and service.status = 'pending'

    union all

    select
      'published_edit'::text as item_kind,
      notification.id as item_id,
      service.id as service_id,
      service.category_id,
      service.title,
      service.provider_name,
      service.contact_name,
      service.status,
      notification.created_at as changed_at,
      notification.previous_service,
      notification.current_service,
      1 as sort_priority
    from public.service_submission_notifications as notification
    join public.services as service
      on service.org_id = notification.org_id
     and service.id = notification.service_id
    where p_kind in ('all', 'published_edit')
      and notification.org_id = (select public.current_org_id())
      and notification.kind = 'published_edit'
      and notification.read_at is null
  ), filtered as (
    select candidate.*
    from candidates as candidate
    where (p_category_id is null or candidate.category_id = p_category_id)
      and (
        btrim(coalesce(p_query, '')) = ''
        or concat_ws(
          ' ',
          candidate.title->>'ca',
          candidate.title->>'es',
          candidate.title->>'en',
          candidate.title->>'ar',
          candidate.title->>'fa',
          candidate.provider_name,
          candidate.contact_name
        ) ilike '%' || btrim(p_query) || '%'
      )
  )
  select
    filtered.item_kind,
    filtered.item_id,
    filtered.service_id,
    filtered.category_id,
    filtered.title,
    filtered.provider_name,
    filtered.contact_name,
    filtered.status,
    filtered.changed_at,
    filtered.previous_service,
    filtered.current_service,
    count(*) over() as total_count
  from filtered
  order by filtered.sort_priority, filtered.changed_at, filtered.item_id
  limit 25
  offset (p_page - 1) * 25;
end;
$$;

revoke all on function public.get_service_review_queue(text, uuid, text, integer)
  from public, anon;
grant execute on function public.get_service_review_queue(text, uuid, text, integer)
  to authenticated;

create policy service_submission_notifications_insert_staff_decision
  on public.service_submission_notifications for insert to authenticated
  with check (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
    and kind in ('approved', 'rejected')
    and created_by = (select auth.uid())
    and recipient_id is not null
  );

create policy service_submission_notifications_select_entity_decision
  on public.service_submission_notifications for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (select public.current_app_role()) = 'entity'
    and recipient_id = (select auth.uid())
    and kind in ('approved', 'rejected')
  );

grant insert (
  org_id,
  service_id,
  kind,
  created_by,
  recipient_id,
  decision_comment_id
) on public.service_submission_notifications to authenticated;

create or replace function public.review_entity_service(
  p_service_id uuid,
  p_decision text,
  p_payload jsonb,
  p_comment text
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  reviewed_service public.services%rowtype;
  public_comment text := nullif(btrim(p_comment), '');
  public_comment_id uuid;
begin
  if not (select public.is_staff_or_admin()) then
    raise insufficient_privilege using message =
      'only staff may review entity service submissions';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise check_violation using message = 'invalid entity service review decision';
  end if;
  if public_comment is not null and length(public_comment) > 4000 then
    raise check_violation using message = 'review comments accept at most 4000 characters';
  end if;
  if p_decision = 'reject' and public_comment is null then
    raise check_violation using message = 'rejection requires a human comment';
  end if;

  select service.*
  into reviewed_service
  from public.services as service
  where service.id = p_service_id
    and service.org_id = (select public.current_org_id())
    and service.submitted_by is not null
    and service.status = 'pending'
  for update;

  if not found then
    raise insufficient_privilege using message =
      'only a pending entity submission can be reviewed';
  end if;

  if p_decision = 'approve' then
    if jsonb_typeof(p_payload) <> 'object'
      or p_payload ->> 'serviceId' is distinct from p_service_id::text
      or p_payload ->> 'status' is distinct from 'published' then
      raise check_violation using message =
        'approval requires the reviewed service publication payload';
    end if;

    update public.services as service
    set status = 'approved',
        reviewed_by = (select auth.uid()),
        reviewed_at = now(),
        rejection_reason = null
    where service.id = reviewed_service.id;

    perform public.save_admin_service(p_payload);

    if public_comment is not null then
      insert into public.service_submission_comments (
        service_id,
        body,
        is_internal
      ) values (
        reviewed_service.id,
        public_comment,
        false
      ) returning id into public_comment_id;
    end if;

    insert into public.service_submission_notifications (
      org_id,
      service_id,
      kind,
      created_by,
      recipient_id,
      decision_comment_id
    ) values (
      reviewed_service.org_id,
      reviewed_service.id,
      'approved',
      (select auth.uid()),
      reviewed_service.submitted_by,
      public_comment_id
    );

    return reviewed_service.id;
  end if;

  if p_payload is not null then
    raise check_violation using message = 'rejection does not accept a service payload';
  end if;

  update public.services as service
  set status = 'rejected',
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      rejection_reason = public_comment
  where service.id = reviewed_service.id;

  insert into public.service_submission_comments (
    service_id,
    body,
    is_internal
  ) values (
    reviewed_service.id,
    public_comment,
    false
  ) returning id into public_comment_id;

  insert into public.service_submission_notifications (
    org_id,
    service_id,
    kind,
    created_by,
    recipient_id,
    decision_comment_id
  ) values (
    reviewed_service.org_id,
    reviewed_service.id,
    'rejected',
    (select auth.uid()),
    reviewed_service.submitted_by,
    public_comment_id
  );

  return reviewed_service.id;
end;
$$;

revoke all on function public.review_entity_service(uuid, text, jsonb, text)
  from public, anon;
grant execute on function public.review_entity_service(uuid, text, jsonb, text)
  to authenticated;
