-- Goods received: arrivals into stock (RAPP-250, from RAPP-170, part of RAPP-212).
--
-- An arrival is a goods received note: the items with sizes and quantities,
-- where they came from (a donation, a purchase or a sponsor, with a name), who
-- received them and when, problems noted, and photos of the goods and of the
-- delivery note or receipt. Each line becomes a +quantity arrival movement, so
-- stock stays the sum of the ledger. A donated line takes the item type's
-- default value unless staff change it; a purchase records the price.
--
-- Arrivals need a connection (only field tasks save offline), but the phone
-- still makes the id, so a retried save after a lost answer saves nothing twice.

create table public.equipment_arrivals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  received_at timestamptz not null,
  received_by uuid references public.profiles (id) on delete set null,
  source text not null check (source in ('donation', 'purchase', 'sponsor')),
  source_name text check (source_name is null or length(btrim(source_name)) between 1 and 200),
  problems text check (problems is null or length(btrim(problems)) between 1 and 1000),
  -- What the whole purchase cost, from the receipt. Only purchases have one.
  total_cost_cents integer check (total_cost_cents is null or total_cost_cents >= 0),
  created_at timestamptz not null default now(),
  constraint equipment_arrivals_cost_is_a_purchase check (total_cost_cents is null or source = 'purchase')
);

comment on table public.equipment_arrivals is 'Goods received notes; their lines are arrival movements (RAPP-250).';

create index equipment_arrivals_org_received_idx on public.equipment_arrivals (org_id, received_at desc);

create table public.equipment_arrival_photos (
  id uuid primary key default gen_random_uuid(),
  arrival_id uuid not null references public.equipment_arrivals (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  object_key text not null unique,
  kind text not null check (kind in ('goods', 'receipt')),
  created_at timestamptz not null default now()
);

create index equipment_arrival_photos_arrival_idx on public.equipment_arrival_photos (arrival_id);

alter table public.stock_movements
  add column arrival_id uuid references public.equipment_arrivals (id) on delete restrict,
  add column unit_value_cents integer check (unit_value_cents is null or unit_value_cents >= 0),
  add constraint stock_movements_arrival_line check (arrival_id is null or kind = 'arrival');

create index stock_movements_arrival_idx on public.stock_movements (arrival_id) where arrival_id is not null;

-- Who reads ------------------------------------------------------------------------------------

alter table public.equipment_arrivals enable row level security;
alter table public.equipment_arrivals force row level security;
alter table public.equipment_arrival_photos enable row level security;
alter table public.equipment_arrival_photos force row level security;

-- Policies call only functions the caller may execute (see the RAPP-248 note).
create policy equipment_arrivals_read on public.equipment_arrivals
  for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.has_permission('equipment.receive'))
      or (select public.has_permission('equipment.count'))
      or (select public.has_permission('equipment.items'))
    )
  );

create policy equipment_arrival_photos_read on public.equipment_arrival_photos
  for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.has_permission('equipment.receive'))
      or (select public.has_permission('equipment.count'))
      or (select public.has_permission('equipment.items'))
    )
  );

revoke insert, update, delete, truncate on public.equipment_arrivals from anon, authenticated;
revoke insert, update, delete, truncate on public.equipment_arrival_photos from anon, authenticated;

-- Recording an arrival -------------------------------------------------------------------------

-- p_lines: [{"item_type_id": uuid, "size": text|null, "quantity": int, "unit_value_cents": int|null}]
-- p_photos: [{"object_key": text, "kind": "goods"|"receipt"}]
create or replace function public.record_equipment_arrival(
  p_id uuid,
  p_received_at timestamptz,
  p_source text,
  p_lines jsonb,
  p_source_name text default null,
  p_problems text default null,
  p_total_cost_cents integer default null,
  p_photos jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  line jsonb;
  photo jsonb;
  item_type public.equipment_item_types%rowtype;
  clean_size text;
  quantity integer;
  unit_value integer;
begin
  if not (select public.has_permission('equipment.receive')) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  -- Already saved: the same arrival sent again.
  if exists (select 1 from public.equipment_arrivals where id = p_id and org_id = actor_org) then
    return p_id;
  end if;

  if p_received_at > now() + interval '10 minutes' or p_received_at < now() - interval '1 year' then
    raise exception 'STOCK/ARRIVAL_TIME' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array'
     or jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'STOCK/ARRIVAL_LINES' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_photos) is distinct from 'array' or jsonb_array_length(p_photos) > 10 then
    raise exception 'STOCK/ARRIVAL_PHOTOS' using errcode = 'check_violation';
  end if;

  insert into public.equipment_arrivals (
    id, org_id, received_at, received_by, source, source_name, problems, total_cost_cents
  ) values (
    p_id, actor_org, p_received_at, actor, p_source, nullif(btrim(p_source_name), ''),
    nullif(btrim(p_problems), ''), p_total_cost_cents
  );

  for line in select value from jsonb_array_elements(p_lines) loop
    select * into item_type from public.equipment_item_types
     where id = (line ->> 'item_type_id')::uuid and org_id = actor_org;
    if item_type.id is null then
      raise exception 'STOCK/NO_ITEM_TYPE' using errcode = 'P0002';
    end if;

    clean_size := nullif(btrim(line ->> 'size'), '');
    if cardinality(item_type.sizes) > 0 then
      if clean_size is null or not clean_size = any (item_type.sizes) then
        raise exception 'STOCK/SIZE_REQUIRED' using errcode = 'check_violation';
      end if;
    else
      clean_size := null;
    end if;

    quantity := (line ->> 'quantity')::integer;
    if quantity is null or quantity not between 1 and 10000 then
      raise exception 'STOCK/QUANTITY' using errcode = 'check_violation';
    end if;

    -- A donation is valued at the item type's default unless staff typed one.
    unit_value := coalesce(
      (line ->> 'unit_value_cents')::integer,
      case when p_source = 'donation' then item_type.default_value_cents end
    );

    insert into public.stock_movements (
      org_id, item_type_id, size, quantity, kind, arrival_id, unit_value_cents,
      recorded_by, occurred_at, reason
    ) values (
      actor_org, item_type.id, clean_size, quantity, 'arrival', p_id, unit_value,
      actor, p_received_at, null
    );
  end loop;

  -- Photos: only objects this person uploaded to this organization's stock folder.
  for photo in select value from jsonb_array_elements(p_photos) loop
    if (photo ->> 'object_key') is null
       or (photo ->> 'object_key') not like actor_org::text || '/stock/' || actor::text || '/%' then
      raise exception 'STOCK/ARRIVAL_PHOTOS' using errcode = 'check_violation';
    end if;
    insert into public.equipment_arrival_photos (arrival_id, org_id, object_key, kind)
    values (p_id, actor_org, photo ->> 'object_key', photo ->> 'kind');
  end loop;

  return p_id;
end;
$$;

revoke all on function public.record_equipment_arrival(uuid, timestamptz, text, jsonb, text, text, integer, jsonb) from public, anon;
grant execute on function public.record_equipment_arrival(uuid, timestamptz, text, jsonb, text, text, integer, jsonb) to authenticated;

-- Serving a photo ---------------------------------------------------------------------------------

-- The media worker asks before it serves an object from the stock folder.
create or replace function public.can_read_stock_object(p_object_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
    (select public.has_permission('equipment.receive'))
    or (select public.has_permission('equipment.count'))
    or (select public.has_permission('equipment.items'))
  ) and exists (
    select 1 from public.equipment_arrival_photos
    where object_key = p_object_key and org_id = (select public.current_org_id())
  );
$$;

revoke all on function public.can_read_stock_object(text) from public, anon;
grant execute on function public.can_read_stock_object(text) to authenticated;

-- The erasure registry learns the two arrival tables (RAPP-26).

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
    ('equipment_arrival_photos', null, 'not_personal', 'Photos of goods received and their receipts.')
  ) as disposition(table_name, participant_column, disposition, reason);
$function$;
