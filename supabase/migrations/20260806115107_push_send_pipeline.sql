-- Publish-triggered Expo push pipeline.
--
-- The database owns durable uniqueness and scheduling. One push_publications row is
-- allowed per announcement or event, and one push_deliveries row is allowed per
-- publication and registered device. The Edge Function only claims durable rows
-- and records Expo tickets and receipts. Expo delivery is at-least-once, so an
-- ambiguous response or expired send lease retries the same collapse-aware message.
--
-- Supabase Cron is required here even though player content visibility itself is
-- a WHERE-clause concern. A scheduled publication needs an active moment at
-- which the external Expo service is called. The one-minute job also checks
-- Expo receipts, which Expo recommends fetching after 15 minutes.

create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table public.profiles
  add column push_notifications_enabled boolean not null default true;

comment on column public.profiles.push_notifications_enabled is
  'Simple player push preference. False excludes every device from sends; granular preferences arrive in Phase 8.';

grant update (push_notifications_enabled) on table public.profiles to authenticated;

alter table public.push_tokens
  add constraint push_tokens_user_id_id_unique unique (user_id, id);

create table public.push_publications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  content_type text not null check (content_type in ('announcement', 'event')),
  content_id uuid not null,
  idempotency_key text generated always as (content_type || ':' || content_id::text) stored,
  scheduled_for timestamptz not null,
  state text not null default 'pending'
    check (state in ('pending', 'processing', 'awaiting_receipts', 'retrying', 'complete')),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  delivered_count integer not null default 0 check (delivered_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint push_publications_content_unique unique (content_type, content_id),
  constraint push_publications_idempotency_key_unique unique (idempotency_key),
  constraint push_publications_org_id_id_unique unique (org_id, id)
);

create table public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  publication_id uuid not null,
  push_token_id uuid,
  recipient_id uuid not null,
  language text not null check (language in ('ca', 'es', 'en', 'ar', 'fa')),
  state text not null default 'pending'
    check (state in (
      'pending', 'sending', 'ticketed', 'checking_receipt',
      'retry', 'delivered', 'failed', 'pruned'
    )),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  receipt_attempt_count integer not null default 0 check (receipt_attempt_count >= 0),
  expo_ticket_id text unique,
  ticketed_at timestamptz,
  worker_id uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  receipt_due_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint push_deliveries_publication_token_unique
    unique (publication_id, push_token_id),
  constraint push_deliveries_publication_org_fkey
    foreign key (org_id, publication_id)
    references public.push_publications (org_id, id) on delete cascade,
  constraint push_deliveries_recipient_org_fkey
    foreign key (org_id, recipient_id)
    references public.profiles (org_id, id) on delete cascade,
  constraint push_deliveries_recipient_token_fkey
    foreign key (recipient_id, push_token_id)
    references public.push_tokens (user_id, id) on delete set null (push_token_id)
);

comment on table public.push_publications is
  'One idempotent Expo push broadcast per published announcement or event.';
comment on table public.push_deliveries is
  'Per-device ticket, retry, receipt, and invalid-token state for a push publication.';
comment on column public.push_deliveries.last_error_code is
  'Technical Expo or PUSH code only. Notification content and token values are never logged here.';

create trigger push_publications_set_updated_at
  before update on public.push_publications
  for each row execute function public.set_updated_at();

create trigger push_deliveries_set_updated_at
  before update on public.push_deliveries
  for each row execute function public.set_updated_at();

create index push_publications_org_scheduled_idx
  on public.push_publications (org_id, scheduled_for, id);

create index push_publications_active_idx
  on public.push_publications (state, scheduled_for, id)
  where state <> 'complete';

create index push_deliveries_publication_idx
  on public.push_deliveries (org_id, publication_id, id);

create index push_deliveries_recipient_idx
  on public.push_deliveries (org_id, recipient_id, id);

create index push_deliveries_token_idx
  on public.push_deliveries (push_token_id)
  where push_token_id is not null;

create index push_deliveries_send_queue_idx
  on public.push_deliveries (next_attempt_at, id)
  where state in ('pending', 'retry');

create index push_deliveries_receipt_queue_idx
  on public.push_deliveries (receipt_due_at, id)
  where state = 'ticketed';

alter table public.push_publications enable row level security;
alter table public.push_publications force row level security;
alter table public.push_deliveries enable row level security;
alter table public.push_deliveries force row level security;

revoke all on table public.push_publications
  from public, anon, authenticated, service_role;
revoke all on table public.push_deliveries
  from public, anon, authenticated, service_role;

create or replace function private.enqueue_due_push_publications(
  due_at timestamptz default now()
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  with due_content as (
    select
      announcements.org_id,
      'announcement'::text as content_type,
      announcements.id as content_id,
      announcements.published_at as scheduled_for
    from public.announcements
    where announcements.status = 'published'
      and announcements.published_at <= due_at
      and (announcements.expires_at is null or announcements.expires_at > due_at)

    union all

    select
      events.org_id,
      'event'::text as content_type,
      events.id as content_id,
      events.published_at as scheduled_for
    from public.events
    where events.status = 'published'
      and events.published_at <= due_at
      and (events.expires_at is null or events.expires_at > due_at)
  ), inserted as (
    insert into public.push_publications (
      org_id, content_type, content_id, scheduled_for
    )
    select
      due_content.org_id,
      due_content.content_type,
      due_content.content_id,
      due_content.scheduled_for
    from due_content
    on conflict (content_type, content_id) do nothing
    returning 1
  )
  select count(*)::integer into inserted_count from inserted;

  return inserted_count;
end;
$$;

comment on function private.enqueue_due_push_publications is
  'Idempotently adds every due, unexpired published announcement and event to the push outbox.';

revoke all on function private.enqueue_due_push_publications(timestamptz)
  from public, anon, authenticated, service_role;

create or replace function private.refresh_push_publication_states(
  refreshed_at timestamptz default now()
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.push_publications as publication
  set
    recipient_count = summary.recipient_count,
    sent_count = summary.sent_count,
    delivered_count = summary.delivered_count,
    failed_count = summary.failed_count,
    state = case
      when summary.active_send_count > 0 then 'processing'
      when summary.retry_count > 0 then 'retrying'
      when summary.receipt_count > 0 then 'awaiting_receipts'
      else 'complete'
    end,
    completed_at = case
      when summary.active_send_count = 0
        and summary.retry_count = 0
        and summary.receipt_count = 0
      then coalesce(publication.completed_at, refreshed_at)
      else null
    end
  from (
    select
      source_publication.id as publication_id,
      count(delivery.id)::integer as recipient_count,
      count(delivery.expo_ticket_id)::integer as sent_count,
      count(*) filter (where delivery.state = 'delivered')::integer as delivered_count,
      count(*) filter (where delivery.state in ('failed', 'pruned'))::integer as failed_count,
      count(*) filter (where delivery.state in ('pending', 'sending'))::integer as active_send_count,
      count(*) filter (where delivery.state = 'retry')::integer as retry_count,
      count(*) filter (where delivery.state in ('ticketed', 'checking_receipt'))::integer as receipt_count
    from public.push_publications as source_publication
    left join public.push_deliveries as delivery
      on delivery.org_id = source_publication.org_id
     and delivery.publication_id = source_publication.id
    group by source_publication.id, source_publication.org_id
  ) as summary
  where publication.id = summary.publication_id
    and (
      publication.state <> 'complete'
      or summary.active_send_count > 0
      or summary.retry_count > 0
      or summary.receipt_count > 0
    );
$$;

revoke all on function private.refresh_push_publication_states(timestamptz)
  from public, anon, authenticated, service_role;

create or replace function private.push_dispatch_secret_matches(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select candidate is not null
    and length(candidate) >= 32
    and length(candidate) <= 256
    and exists (
      select 1
      from vault.decrypted_secrets as secret
      where secret.name = 'push_dispatch_secret'
        and extensions.digest(candidate, 'sha256') =
          extensions.digest(secret.decrypted_secret, 'sha256')
    );
$$;

comment on function private.push_dispatch_secret_matches(text) is
  'Validates the invocation-only push secret. It grants no table or RLS-bypass authority.';

create or replace function private.claim_push_deliveries(
  dispatch_secret text,
  claiming_worker_id uuid,
  claimed_at timestamptz default now(),
  claim_limit integer default 500
)
returns table (
  delivery_id uuid,
  publication_id uuid,
  push_token_id uuid,
  recipient_id uuid,
  token text,
  language text,
  content_type text,
  content_id uuid,
  title jsonb,
  body jsonb,
  expires_at timestamptz,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.push_dispatch_secret_matches(dispatch_secret) then
    raise exception 'PUSH-1' using errcode = '28000';
  end if;

  if claim_limit < 1 or claim_limit > 1000 then
    raise exception 'claim_limit must be between 1 and 1000'
      using errcode = 'invalid_parameter_value';
  end if;

  perform private.enqueue_due_push_publications(claimed_at);

  update public.push_deliveries as stale
  set
    state = case when stale.expo_ticket_id is null then 'retry' else 'ticketed' end,
    worker_id = null,
    lease_expires_at = null,
    next_attempt_at = claimed_at,
    receipt_due_at = case
      when stale.expo_ticket_id is null then null
      else claimed_at
    end,
    last_error_code = 'PUSH-8'
  where stale.state in ('sending', 'checking_receipt')
    and stale.lease_expires_at <= claimed_at;

  with pending_publications as (
    select publication.id, publication.org_id
    from public.push_publications as publication
    where publication.state = 'pending'
      and publication.scheduled_for <= claimed_at
    order by publication.scheduled_for, publication.id
    for update skip locked
  )
  insert into public.push_deliveries (
    org_id, publication_id, push_token_id, recipient_id, language, next_attempt_at
  )
  select
    publication.org_id,
    publication.id,
    push_token.id,
    profile.id,
    case
      when profile.preferred_language in ('ca', 'es', 'en', 'ar', 'fa')
        then profile.preferred_language
      else 'ca'
    end,
    claimed_at
  from pending_publications as publication
  join public.profiles as profile
    on profile.org_id = publication.org_id
   and profile.role = 'player'
   and profile.is_active
   and profile.push_notifications_enabled
  join public.push_tokens as push_token on push_token.user_id = profile.id
  on conflict on constraint push_deliveries_publication_token_unique do nothing;

  perform private.refresh_push_publication_states(claimed_at);

  return query
  with candidates as (
    select delivery.id
    from public.push_deliveries as delivery
    join public.push_publications as publication
      on publication.org_id = delivery.org_id
     and publication.id = delivery.publication_id
    where delivery.state in ('pending', 'retry')
      and delivery.next_attempt_at <= claimed_at
      and delivery.push_token_id is not null
      and publication.scheduled_for <= claimed_at
    order by delivery.next_attempt_at, delivery.id
    limit claim_limit
    for update of delivery skip locked
  ), claimed as (
    update public.push_deliveries as delivery
    set
      state = 'sending',
      worker_id = claiming_worker_id,
      lease_expires_at = claimed_at + interval '5 minutes',
      attempt_count = delivery.attempt_count + 1
    from candidates
    where delivery.id = candidates.id
    returning delivery.*
  ), marked_publications as (
    update public.push_publications as publication
    set state = 'processing', completed_at = null
    where (publication.org_id, publication.id) in (
      select distinct claimed.org_id, claimed.publication_id from claimed
    )
    returning publication.id
  )
  select
    claimed.id,
    claimed.publication_id,
    claimed.push_token_id,
    claimed.recipient_id,
    push_token.token,
    claimed.language,
    publication.content_type,
    publication.content_id,
    case
      when publication.content_type = 'announcement' then announcement.title
      else event.title
    end,
    case
      when publication.content_type = 'announcement' then announcement.body
      else event.description
    end,
    case
      when publication.content_type = 'announcement' then announcement.expires_at
      else event.expires_at
    end,
    claimed.attempt_count
  from claimed
  join marked_publications on marked_publications.id = claimed.publication_id
  join public.push_publications as publication
    on publication.org_id = claimed.org_id
   and publication.id = claimed.publication_id
  join public.push_tokens as push_token
    on push_token.user_id = claimed.recipient_id
   and push_token.id = claimed.push_token_id
  left join public.announcements as announcement
    on publication.content_type = 'announcement'
   and announcement.org_id = publication.org_id
   and announcement.id = publication.content_id
  left join public.events as event
    on publication.content_type = 'event'
   and event.org_id = publication.org_id
   and event.id = publication.content_id
  order by claimed.id;
end;
$$;

comment on function private.claim_push_deliveries is
  'Secret-checked narrow authority that creates eligible deliveries and claims retryable rows.';

create or replace function private.record_push_delivery_results(
  dispatch_secret text,
  recording_worker_id uuid,
  results jsonb,
  recorded_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
  pruned_token_ids uuid[];
begin
  if not private.push_dispatch_secret_matches(dispatch_secret) then
    raise exception 'PUSH-1' using errcode = '28000';
  end if;

  if jsonb_typeof(results) <> 'array' then
    raise exception 'results must be a JSON array'
      using errcode = 'invalid_parameter_value';
  end if;

  with parsed as (
    select *
    from jsonb_to_recordset(results) as result(
      delivery_id uuid,
      state text,
      ticket_id text,
      error_code text,
      next_attempt_at timestamptz
    )
    where result.state in ('ticketed', 'retry', 'failed', 'pruned')
  ), updated as (
    update public.push_deliveries as delivery
    set
      state = parsed.state,
      expo_ticket_id = case when parsed.state = 'ticketed' then parsed.ticket_id else null end,
      ticketed_at = case when parsed.state = 'ticketed' then recorded_at else null end,
      worker_id = null,
      lease_expires_at = null,
      next_attempt_at = case
        when parsed.state = 'retry'
          then coalesce(parsed.next_attempt_at, recorded_at + interval '1 minute')
        else delivery.next_attempt_at
      end,
      receipt_due_at = case
        when parsed.state = 'ticketed' then recorded_at + interval '15 minutes'
        else null
      end,
      last_error_code = parsed.error_code,
      completed_at = case
        when parsed.state in ('failed', 'pruned') then recorded_at
        else null
      end
    from parsed
    where delivery.id = parsed.delivery_id
      and delivery.worker_id = recording_worker_id
      and delivery.state = 'sending'
      and (parsed.state <> 'ticketed' or parsed.ticket_id is not null)
    returning delivery.push_token_id, delivery.state
  )
  select
    count(*)::integer,
    coalesce(
      array_agg(updated.push_token_id) filter (
        where updated.state = 'pruned' and updated.push_token_id is not null
      ),
      '{}'::uuid[]
    )
  into updated_count, pruned_token_ids
  from updated;

  update public.push_deliveries as invalid_token_delivery
  set
    state = 'pruned',
    worker_id = null,
    lease_expires_at = null,
    receipt_due_at = null,
    last_error_code = 'PUSH-4',
    completed_at = recorded_at
  where invalid_token_delivery.push_token_id = any(pruned_token_ids)
    and invalid_token_delivery.state in (
      'pending', 'sending', 'ticketed', 'checking_receipt', 'retry'
    );

  delete from public.push_tokens as push_token
  where push_token.id = any(pruned_token_ids);

  perform private.refresh_push_publication_states(recorded_at);
  return updated_count;
end;
$$;

create or replace function private.claim_push_receipts(
  dispatch_secret text,
  claiming_worker_id uuid,
  claimed_at timestamptz default now(),
  claim_limit integer default 1000
)
returns table (
  delivery_id uuid,
  push_token_id uuid,
  ticket_id text,
  receipt_attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.push_dispatch_secret_matches(dispatch_secret) then
    raise exception 'PUSH-1' using errcode = '28000';
  end if;

  if claim_limit < 1 or claim_limit > 1000 then
    raise exception 'claim_limit must be between 1 and 1000'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.push_deliveries as stale
  set
    state = 'ticketed',
    worker_id = null,
    lease_expires_at = null,
    receipt_due_at = claimed_at,
    last_error_code = 'PUSH-5'
  where stale.state = 'checking_receipt'
    and stale.lease_expires_at <= claimed_at;

  update public.push_deliveries as expired
  set
    state = 'failed',
    last_error_code = 'PUSH-6',
    completed_at = claimed_at,
    worker_id = null,
    lease_expires_at = null
  where expired.state = 'ticketed'
    and expired.ticketed_at <= claimed_at - interval '24 hours';

  return query
  with candidates as (
    select delivery.id
    from public.push_deliveries as delivery
    where delivery.state = 'ticketed'
      and delivery.receipt_due_at <= claimed_at
      and delivery.expo_ticket_id is not null
    order by delivery.receipt_due_at, delivery.id
    limit claim_limit
    for update skip locked
  ), claimed as (
    update public.push_deliveries as delivery
    set
      state = 'checking_receipt',
      worker_id = claiming_worker_id,
      lease_expires_at = claimed_at + interval '5 minutes',
      receipt_attempt_count = delivery.receipt_attempt_count + 1
    from candidates
    where delivery.id = candidates.id
    returning delivery.*
  )
  select
    claimed.id,
    claimed.push_token_id,
    claimed.expo_ticket_id,
    claimed.receipt_attempt_count
  from claimed
  order by claimed.id;
end;
$$;

create or replace function private.record_push_receipt_results(
  dispatch_secret text,
  recording_worker_id uuid,
  results jsonb,
  recorded_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
  pruned_token_ids uuid[];
begin
  if not private.push_dispatch_secret_matches(dispatch_secret) then
    raise exception 'PUSH-1' using errcode = '28000';
  end if;

  if jsonb_typeof(results) <> 'array' then
    raise exception 'results must be a JSON array'
      using errcode = 'invalid_parameter_value';
  end if;

  with parsed as (
    select *
    from jsonb_to_recordset(results) as result(
      delivery_id uuid,
      state text,
      error_code text,
      next_attempt_at timestamptz
    )
    where result.state in ('delivered', 'retry', 'failed', 'pruned', 'pending_receipt')
  ), updated as (
    update public.push_deliveries as delivery
    set
      state = case when parsed.state = 'pending_receipt' then 'ticketed' else parsed.state end,
      expo_ticket_id = case when parsed.state = 'retry' then null else delivery.expo_ticket_id end,
      ticketed_at = case when parsed.state = 'retry' then null else delivery.ticketed_at end,
      worker_id = null,
      lease_expires_at = null,
      next_attempt_at = case
        when parsed.state = 'retry'
          then coalesce(parsed.next_attempt_at, recorded_at + interval '1 minute')
        else delivery.next_attempt_at
      end,
      receipt_due_at = case
        when parsed.state = 'pending_receipt' then recorded_at + interval '5 minutes'
        else null
      end,
      last_error_code = parsed.error_code,
      completed_at = case
        when parsed.state in ('delivered', 'failed', 'pruned') then recorded_at
        else null
      end
    from parsed
    where delivery.id = parsed.delivery_id
      and delivery.worker_id = recording_worker_id
      and delivery.state = 'checking_receipt'
    returning delivery.push_token_id, delivery.state
  )
  select
    count(*)::integer,
    coalesce(
      array_agg(updated.push_token_id) filter (
        where updated.state = 'pruned' and updated.push_token_id is not null
      ),
      '{}'::uuid[]
    )
  into updated_count, pruned_token_ids
  from updated;

  update public.push_deliveries as invalid_token_delivery
  set
    state = 'pruned',
    worker_id = null,
    lease_expires_at = null,
    receipt_due_at = null,
    last_error_code = 'PUSH-4',
    completed_at = recorded_at
  where invalid_token_delivery.push_token_id = any(pruned_token_ids)
    and invalid_token_delivery.state in (
      'pending', 'sending', 'ticketed', 'checking_receipt', 'retry'
    );

  delete from public.push_tokens as push_token
  where push_token.id = any(pruned_token_ids);

  perform private.refresh_push_publication_states(recorded_at);
  return updated_count;
end;
$$;

create or replace function public.authorize_push_dispatch(dispatch_secret text)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.push_dispatch_secret_matches(dispatch_secret);
$$;

create or replace function public.claim_push_deliveries(
  dispatch_secret text,
  claiming_worker_id uuid,
  claimed_at timestamptz default now(),
  claim_limit integer default 500
)
returns table (
  delivery_id uuid,
  publication_id uuid,
  push_token_id uuid,
  recipient_id uuid,
  token text,
  language text,
  content_type text,
  content_id uuid,
  title jsonb,
  body jsonb,
  expires_at timestamptz,
  attempt_count integer
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.claim_push_deliveries(
    dispatch_secret,
    claiming_worker_id,
    claimed_at,
    claim_limit
  );
$$;

create or replace function public.record_push_delivery_results(
  dispatch_secret text,
  recording_worker_id uuid,
  results jsonb,
  recorded_at timestamptz default now()
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.record_push_delivery_results(
    dispatch_secret,
    recording_worker_id,
    results,
    recorded_at
  );
$$;

create or replace function public.claim_push_receipts(
  dispatch_secret text,
  claiming_worker_id uuid,
  claimed_at timestamptz default now(),
  claim_limit integer default 1000
)
returns table (
  delivery_id uuid,
  push_token_id uuid,
  ticket_id text,
  receipt_attempt_count integer
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.claim_push_receipts(
    dispatch_secret,
    claiming_worker_id,
    claimed_at,
    claim_limit
  );
$$;

create or replace function public.record_push_receipt_results(
  dispatch_secret text,
  recording_worker_id uuid,
  results jsonb,
  recorded_at timestamptz default now()
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.record_push_receipt_results(
    dispatch_secret,
    recording_worker_id,
    results,
    recorded_at
  );
$$;

revoke all on function private.push_dispatch_secret_matches(text)
  from public, anon, authenticated, service_role;
revoke all on function private.claim_push_deliveries(text, uuid, timestamptz, integer)
  from public, anon, authenticated, service_role;
revoke all on function private.record_push_delivery_results(text, uuid, jsonb, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.claim_push_receipts(text, uuid, timestamptz, integer)
  from public, anon, authenticated, service_role;
revoke all on function private.record_push_receipt_results(text, uuid, jsonb, timestamptz)
  from public, anon, authenticated, service_role;

grant usage on schema private to anon;
grant execute on function private.push_dispatch_secret_matches(text) to anon;
grant execute on function private.claim_push_deliveries(text, uuid, timestamptz, integer) to anon;
grant execute on function private.record_push_delivery_results(text, uuid, jsonb, timestamptz)
  to anon;
grant execute on function private.claim_push_receipts(text, uuid, timestamptz, integer) to anon;
grant execute on function private.record_push_receipt_results(text, uuid, jsonb, timestamptz)
  to anon;

revoke all on function public.authorize_push_dispatch(text)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_push_deliveries(text, uuid, timestamptz, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.record_push_delivery_results(text, uuid, jsonb, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_push_receipts(text, uuid, timestamptz, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.record_push_receipt_results(text, uuid, jsonb, timestamptz)
  from public, anon, authenticated, service_role;

grant execute on function public.authorize_push_dispatch(text) to anon;
grant execute on function public.claim_push_deliveries(text, uuid, timestamptz, integer) to anon;
grant execute on function public.record_push_delivery_results(text, uuid, jsonb, timestamptz)
  to anon;
grant execute on function public.claim_push_receipts(text, uuid, timestamptz, integer) to anon;
grant execute on function public.record_push_receipt_results(text, uuid, jsonb, timestamptz)
  to anon;

create or replace function private.invoke_push_dispatch(reason text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_url text;
  dispatch_secret text;
  request_id bigint;
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name = 'push_project_url'
  limit 1;

  select decrypted_secret into dispatch_secret
  from vault.decrypted_secrets
  where name = 'push_dispatch_secret'
  limit 1;

  if project_url is null or dispatch_secret is null then
    return null;
  end if;

  select net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-push-dispatch-secret', dispatch_secret
    ),
    body := jsonb_build_object('reason', reason)
  ) into request_id;

  return request_id;
end;
$$;

create or replace function private.enqueue_push_on_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published'
    and new.published_at <= now()
    and (new.expires_at is null or new.expires_at > now()) then
    insert into public.push_publications (
      org_id, content_type, content_id, scheduled_for
    ) values (
      new.org_id,
      case tg_table_name when 'announcements' then 'announcement' else 'event' end,
      new.id,
      new.published_at
    )
    on conflict (content_type, content_id) do nothing;

    perform private.invoke_push_dispatch('immediate');
  end if;

  return new;
end;
$$;

create trigger announcements_enqueue_push_on_publish
  after insert or update of status, published_at on public.announcements
  for each row execute function private.enqueue_push_on_publish();

create trigger events_enqueue_push_on_publish
  after insert or update of status, published_at on public.events
  for each row execute function private.enqueue_push_on_publish();

create or replace function private.run_push_scheduler()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.enqueue_due_push_publications(now());
  perform private.invoke_push_dispatch('scheduled');
end;
$$;

revoke all on function private.invoke_push_dispatch(text)
  from public, anon, authenticated, service_role;
revoke all on function private.enqueue_push_on_publish()
  from public, anon, authenticated, service_role;
revoke all on function private.run_push_scheduler()
  from public, anon, authenticated, service_role;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'ramassa-push-dispatch';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'ramassa-push-dispatch',
    '* * * * *',
    'select private.run_push_scheduler();'
  );
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
