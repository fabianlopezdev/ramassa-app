-- Material stock ledger (RAPP-248, from RAPP-170, part of RAPP-212).
--
-- Stock is never a typed count. Every change is a recorded movement (an
-- arrival, a handover, a return, a checkout and check-in, a write-off, a count
-- correction) and the stock of an item in a size is the sum of its movements:
-- the double-entry model of Odoo and the humanitarian stock card.
--
-- This slice adds the ledger, the per-organization item types (seeded with the
-- twelve items the app always had) and the stock read. Every handover recorded
-- in equipment_deliveries becomes a movement through a trigger, and the past
-- ones are backfilled, so stock starts true. Arrivals, the phone handover with
-- signature, counts, checkouts and the item editor come in RAPP-249 to 253.

-- Item types ------------------------------------------------------------------------------------

create table public.equipment_item_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- A stable key. The twelve built-ins keep the keys equipment_deliveries
  -- always used (their names come from translations); later types get one too.
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  -- Names in the five languages for types staff add later (RAPP-253); null
  -- for the built-ins.
  name jsonb,
  -- Player kit goes to a player and gets a unit code at handover; team
  -- equipment (cones, bibs, training balls) is only counted.
  kind text not null check (kind in ('player_kit', 'team_equipment')),
  -- Empty: the item has no sizes.
  sizes text[] not null default '{}',
  -- Pre-filled on a donated arrival (RAPP-170). Cents, so no float rounding.
  default_value_cents integer check (default_value_cents is null or default_value_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key)
);

comment on table public.equipment_item_types is 'Material catalog per organization (RAPP-248).';

create or replace function private.create_builtin_item_types(p_org_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.equipment_item_types (org_id, key, kind, sizes)
  values
    (p_org_id, 'boots', 'player_kit', array['34','35','36','37','38','39','40','41','42','43','44','45','46']),
    (p_org_id, 'shin_pads', 'player_kit', array['S','M','L']),
    (p_org_id, 'socks', 'player_kit', array['S','M','L']),
    (p_org_id, 'shorts', 'player_kit', array['XS','S','M','L','XL','XXL']),
    (p_org_id, 'jersey', 'player_kit', array['XS','S','M','L','XL','XXL']),
    (p_org_id, 'tracksuit', 'player_kit', array['XS','S','M','L','XL','XXL']),
    (p_org_id, 'coat', 'player_kit', array['XS','S','M','L','XL','XXL']),
    (p_org_id, 'gloves', 'player_kit', array['S','M','L']),
    (p_org_id, 'water_bottle', 'player_kit', '{}'),
    (p_org_id, 'rucksack', 'player_kit', '{}'),
    (p_org_id, 'ball', 'team_equipment', '{}'),
    (p_org_id, 'other', 'player_kit', '{}')
  on conflict (org_id, key) do nothing;
$$;

revoke all on function private.create_builtin_item_types(uuid) from public, anon, authenticated;

create or replace function private.seed_item_types_for_new_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.create_builtin_item_types(new.id);
  return new;
end;
$$;

revoke all on function private.seed_item_types_for_new_org() from public, anon, authenticated;

create trigger organizations_seed_item_types
  after insert on public.organizations
  for each row execute function private.seed_item_types_for_new_org();

select private.create_builtin_item_types(id) from public.organizations;

-- Movements ---------------------------------------------------------------------------------------

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  item_type_id uuid not null references public.equipment_item_types (id) on delete restrict,
  size text check (size is null or length(btrim(size)) between 1 and 20),
  -- Signed: what came in is positive, what went out negative.
  quantity integer not null check (quantity <> 0),
  kind text not null check (kind in (
    'arrival', 'handover', 'return', 'checkout', 'checkin', 'write_off', 'correction'
  )),
  -- The participant of a handover or a return. Cleared when her record is
  -- erased, so the movement and the stock stay right without naming her.
  participant_id uuid references public.profiles (id) on delete set null,
  equipment_delivery_id uuid references public.equipment_deliveries (id) on delete set null,
  recorded_by uuid references public.profiles (id) on delete set null,
  occurred_at timestamptz not null default now(),
  reason text check (reason is null or length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default now(),
  constraint stock_movements_sign check (
    (kind in ('arrival', 'return', 'checkin') and quantity > 0)
    or (kind in ('handover', 'checkout', 'write_off') and quantity < 0)
    or kind = 'correction'
  )
);

comment on table public.stock_movements is 'Append-only material ledger; stock is the sum per item and size (RAPP-248).';

create index stock_movements_level_idx on public.stock_movements (org_id, item_type_id, size);
create index stock_movements_participant_idx on public.stock_movements (participant_id)
  where participant_id is not null;

-- Who may read ----------------------------------------------------------------------------------

-- For the security-definer stock read, which runs with the owner's rights.
create or replace function private.holds_any_equipment_permission()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.has_permission('equipment.handover'))
      or (select public.has_permission('equipment.receive'))
      or (select public.has_permission('equipment.count'))
      or (select public.has_permission('equipment.items'));
$$;

revoke all on function private.holds_any_equipment_permission() from public, anon, authenticated;

alter table public.equipment_item_types enable row level security;
alter table public.equipment_item_types force row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_movements force row level security;

create policy equipment_item_types_read on public.equipment_item_types
  for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.has_permission('equipment.handover'))
      or (select public.has_permission('equipment.receive'))
      or (select public.has_permission('equipment.count'))
      or (select public.has_permission('equipment.items'))
      or (select public.has_permission('participants.view'))
    )
  );

-- The checks are written out here rather than through the private helper: a
-- policy runs with the caller's rights, and the caller may not execute a
-- private function (in a local pgTAP session that even crashed Postgres).
create policy stock_movements_read on public.stock_movements
  for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.has_permission('equipment.handover'))
      or (select public.has_permission('equipment.receive'))
      or (select public.has_permission('equipment.count'))
      or (select public.has_permission('equipment.items'))
    )
  );

-- No insert, update or delete policy: movements are written only by the
-- database's own functions and triggers, and never changed afterwards.
revoke insert, update, delete, truncate on public.equipment_item_types, public.stock_movements
  from anon, authenticated;

-- Handovers become movements ----------------------------------------------------------------

create or replace function private.record_handover_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject_org uuid;
  type_id uuid;
begin
  select org_id into subject_org from public.profiles where id = new.profile_id;
  select id into type_id
    from public.equipment_item_types
   where org_id = subject_org and key = new.item;
  if type_id is null then
    -- Every organization has the built-ins (trigger and backfill above); a
    -- missing one would be a broken catalog, never a reason to lose the record.
    raise exception 'STOCK/ITEM_TYPE_MISSING: %', new.item using errcode = 'raise_exception';
  end if;
  insert into public.stock_movements (
    org_id, item_type_id, size, quantity, kind, participant_id,
    equipment_delivery_id, recorded_by, occurred_at
  ) values (
    subject_org, type_id, nullif(btrim(new.size), ''), -1, 'handover', new.profile_id,
    new.id, new.delivered_by, new.delivered_on::timestamptz
  );
  return new;
end;
$$;

revoke all on function private.record_handover_movement() from public, anon, authenticated;

create trigger equipment_deliveries_record_movement
  after insert on public.equipment_deliveries
  for each row execute function private.record_handover_movement();

-- The handovers recorded before the ledger existed.
insert into public.stock_movements (
  org_id, item_type_id, size, quantity, kind, participant_id,
  equipment_delivery_id, recorded_by, occurred_at
)
select
  subject.org_id, item_type.id, nullif(btrim(delivery.size), ''), -1, 'handover',
  delivery.profile_id, delivery.id, delivery.delivered_by, delivery.delivered_on::timestamptz
from public.equipment_deliveries delivery
join public.profiles subject on subject.id = delivery.profile_id
join public.equipment_item_types item_type
  on item_type.org_id = subject.org_id and item_type.key = delivery.item;

-- The stock read --------------------------------------------------------------------------------

create or replace function public.stock_levels()
returns table (
  item_type_id uuid,
  item_key text,
  kind text,
  size text,
  quantity integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    item_type.id,
    item_type.key,
    item_type.kind,
    movement.size,
    sum(movement.quantity)::integer
  from public.stock_movements movement
  join public.equipment_item_types item_type on item_type.id = movement.item_type_id
  where movement.org_id = (select public.current_org_id())
    and (select private.holds_any_equipment_permission())
  group by item_type.id, item_type.key, item_type.kind, movement.size
  order by item_type.key, movement.size nulls first;
$$;

revoke all on function public.stock_levels() from public, anon;
grant execute on function public.stock_levels() to authenticated;

-- The erasure registry learns the two tables (RAPP-26).

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
    ('stock_movements', 'participant_id', 'purge', 'Stock movements keep their quantity so stock stays right; her link is cleared by ON DELETE SET NULL.')
  ) as disposition(table_name, participant_column, disposition, reason);
$function$;
