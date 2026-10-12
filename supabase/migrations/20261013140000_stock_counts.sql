-- Stock counts and corrections (RAPP-251, from RAPP-170, part of RAPP-212).
--
-- Stock is the sum of the ledger, and the shelf is the truth. A count records
-- what was on the shelf for one item type, size by size. Where it differs from
-- the ledger, the difference becomes a correction movement with a reason from
-- a fixed list, so stock matches the shelf again and the audit log says who
-- changed it and why. A count also closes that item's open stock alerts.
--
-- Today asks for one small count a month (a cycle count): the item counted
-- longest ago, so over the year every item gets counted.

create table public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  item_type_id uuid not null references public.equipment_item_types (id) on delete restrict,
  counted_by uuid references public.profiles (id) on delete set null,
  counted_at timestamptz not null default now(),
  -- [{"size": text|null, "expected": int, "counted": int}], one per size.
  lines jsonb not null check (jsonb_typeof(lines) = 'array'),
  note text check (note is null or length(btrim(note)) between 1 and 500),
  created_at timestamptz not null default now()
);

comment on table public.stock_counts is 'A count of one item type on the shelf; differences are correction movements (RAPP-251).';

create index stock_counts_org_item_idx on public.stock_counts (org_id, item_type_id, counted_at desc);

alter table public.stock_movements
  add column count_id uuid references public.stock_counts (id) on delete restrict,
  add column correction_reason text check (
    correction_reason is null
    or correction_reason in ('lost', 'damaged', 'found', 'earlier_miscount', 'unrecorded_handover', 'other')
  ),
  add constraint stock_movements_correction_has_reason check (
    kind <> 'correction' or correction_reason is not null
  );

alter table public.stock_counts enable row level security;
alter table public.stock_counts force row level security;

create policy stock_counts_read on public.stock_counts
  for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.has_permission('equipment.count'))
      or (select public.has_permission('equipment.receive'))
      or (select public.has_permission('equipment.items'))
    )
  );

revoke insert, update, delete, truncate on public.stock_counts from anon, authenticated;

-- Recording a count -------------------------------------------------------------------------------

-- p_lines: [{"size": text|null, "counted": int}], every size of the item exactly once.
create or replace function public.record_stock_count(
  p_id uuid,
  p_item_type_id uuid,
  p_lines jsonb,
  p_reason text default null,
  p_note text default null
)
returns table (count_id uuid, corrections integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  item_type public.equipment_item_types%rowtype;
  wanted text[];
  given text[];
  line jsonb;
  clean_size text;
  counted integer;
  expected integer;
  saved_lines jsonb := '[]'::jsonb;
  made integer := 0;
begin
  if not (select public.has_permission('equipment.count')) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  -- Already saved: the same count sent again.
  if exists (select 1 from public.stock_counts where id = p_id and org_id = actor_org) then
    return query
      select p_id, count(*)::integer from public.stock_movements m where m.count_id = p_id;
    return;
  end if;

  select * into item_type from public.equipment_item_types
   where id = p_item_type_id and org_id = actor_org;
  if item_type.id is null then
    raise exception 'STOCK/NO_ITEM_TYPE' using errcode = 'P0002';
  end if;

  -- A count covers the whole item: every size once, or the one sizeless line.
  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'STOCK/COUNT_LINES' using errcode = 'check_violation';
  end if;
  wanted := case when cardinality(item_type.sizes) = 0 then array[''] else item_type.sizes end;
  select coalesce(array_agg(coalesce(nullif(btrim(value ->> 'size'), ''), '') order by 1), '{}')
    into given from jsonb_array_elements(p_lines);
  if (select array_agg(s order by s) from unnest(wanted) s) is distinct from
     (select array_agg(s order by s) from unnest(given) s) then
    raise exception 'STOCK/COUNT_LINES' using errcode = 'check_violation';
  end if;
  if p_reason is not null and p_reason not in
     ('lost', 'damaged', 'found', 'earlier_miscount', 'unrecorded_handover', 'other') then
    raise exception 'STOCK/COUNT_REASON' using errcode = 'check_violation';
  end if;

  insert into public.stock_counts (id, org_id, item_type_id, counted_by, lines, note)
  values (p_id, actor_org, item_type.id, actor, '[]'::jsonb, nullif(btrim(p_note), ''));

  for line in select value from jsonb_array_elements(p_lines) loop
    clean_size := nullif(btrim(line ->> 'size'), '');
    counted := (line ->> 'counted')::integer;
    if counted is null or counted not between 0 and 100000 then
      raise exception 'STOCK/COUNT_LINES' using errcode = 'check_violation';
    end if;

    select coalesce(sum(m.quantity), 0)::integer into expected
      from public.stock_movements m
     where m.org_id = actor_org and m.item_type_id = item_type.id
       and m.size is not distinct from clean_size;

    if counted <> expected then
      if p_reason is null then
        raise exception 'STOCK/COUNT_REASON' using errcode = 'check_violation';
      end if;
      insert into public.stock_movements (
        org_id, item_type_id, size, quantity, kind, count_id, correction_reason,
        recorded_by, reason
      ) values (
        actor_org, item_type.id, clean_size, counted - expected, 'correction', p_id, p_reason,
        actor, nullif(btrim(p_note), '')
      );
      made := made + 1;
    end if;

    saved_lines := saved_lines || jsonb_build_array(
      jsonb_build_object('size', clean_size, 'expected', expected, 'counted', counted)
    );
  end loop;

  update public.stock_counts set lines = saved_lines where id = p_id;

  -- The shelf has been looked at: its alerts are answered.
  update public.stock_alerts
     set resolved_at = now(), resolved_by = actor
   where org_id = actor_org and item_type_id = item_type.id and resolved_at is null;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org, actor, 'stock.count', 'stock_count', p_id,
    jsonb_build_object('item', item_type.key, 'lines', saved_lines, 'reason', p_reason, 'corrections', made)
  );

  return query select p_id, made;
end;
$$;

revoke all on function public.record_stock_count(uuid, uuid, jsonb, text, text) from public, anon;
grant execute on function public.record_stock_count(uuid, uuid, jsonb, text, text) to authenticated;

-- The monthly count -------------------------------------------------------------------------------

-- What Today asks of whoever counts: nothing once an item was counted this
-- month (Madrid time); otherwise the item with stock counted longest ago.
create or replace function public.monthly_stock_count()
returns table (item_type_id uuid, item_key text, last_counted_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.key, last.counted_at
  from public.equipment_item_types t
  left join lateral (
    select max(c.counted_at) as counted_at from public.stock_counts c where c.item_type_id = t.id
  ) last on true
  where t.org_id = (select public.current_org_id())
    and t.is_active
    and (select public.has_permission('equipment.count'))
    and exists (select 1 from public.stock_movements m where m.item_type_id = t.id)
    and not exists (
      select 1 from public.stock_counts c
      where c.org_id = t.org_id
        and date_trunc('month', c.counted_at at time zone 'Europe/Madrid')
          = date_trunc('month', now() at time zone 'Europe/Madrid')
    )
  order by last.counted_at asc nulls first, t.key
  limit 1;
$$;

revoke all on function public.monthly_stock_count() from public, anon;
grant execute on function public.monthly_stock_count() to authenticated;

-- The erasure registry learns stock_counts (RAPP-26).

CREATE OR REPLACE FUNCTION public.personal_data_disposition()
 RETURNS TABLE(table_name text, participant_column text, disposition text, reason text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
    ('team_member_permissions', null, 'not_personal', 'Team access administration; players never hold permissions.'),
    ('equipment_item_types', null, 'not_personal', 'The organization''s material catalog.'),
    ('stock_movements', 'participant_id', 'purge', 'Stock movements keep their quantity so stock stays right; her link is cleared by ON DELETE SET NULL.'),
    ('stock_alerts', null, 'not_personal', 'Stock that went below zero, for the team to count.'),
    ('equipment_arrivals', null, 'not_personal', 'Goods received: source, problems and cost. No participant data.'),
    ('equipment_arrival_photos', null, 'not_personal', 'Photos of goods received and their receipts.'),
    ('stock_counts', null, 'not_personal', 'Stock counts: what was expected and what was on the shelf.')
  ) as disposition(table_name, participant_column, disposition, reason);
$function$;
