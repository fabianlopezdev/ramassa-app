-- Handover with signature and returns (RAPP-249, from RAPP-170, part of RAPP-212).
--
-- At the pitch a staff member hands material to a player on her phone: the item
-- and size, given to keep or lent, and the player's signature with her finger
-- on the staff device under a statement in her language. "Refused to sign" and
-- "unable to sign" are recorded with a reason. The record is final once saved.
--
-- A handover is never blocked by stock. If it takes an item below zero, the
-- handover is saved and a stock alert opens, which Today shows to whoever
-- counts stock. Player kit gets a unit code at handover (B-0042); a lent item
-- comes back graded New, Good, Worn or Unusable, and Unusable is written off.

-- The handover record ---------------------------------------------------------------------------

alter table public.equipment_deliveries
  add column mode text not null default 'given' check (mode in ('given', 'lent')),
  add column unit_code text check (unit_code is null or unit_code ~ '^[A-Z]{1,3}-[0-9]{4,}$'),
  -- The strokes of her signature: [[[x, y], ...], ...] in the pad's own units.
  add column signature jsonb check (
    signature is null or (jsonb_typeof(signature) = 'array' and octet_length(signature::text) <= 200000)
  ),
  -- not_collected: handovers recorded before RAPP-249, or on the web admin.
  add column signature_state text not null default 'not_collected'
    check (signature_state in ('signed', 'refused', 'unable', 'not_collected')),
  add column signature_reason text
    check (signature_reason is null or length(btrim(signature_reason)) between 1 and 500),
  add column statement_language text
    check (statement_language is null or statement_language in ('ca', 'es', 'en', 'ar', 'fa')),
  add constraint equipment_deliveries_signature_consistent check (
    (signature_state = 'signed' and signature is not null)
    or (signature_state in ('refused', 'unable') and signature is null and signature_reason is not null)
    or (signature_state = 'not_collected' and signature is null)
  );

-- Unit codes --------------------------------------------------------------------------------------

alter table public.equipment_item_types
  add column code_prefix text check (code_prefix is null or code_prefix ~ '^[A-Z]{1,3}$');

update public.equipment_item_types set code_prefix = case key
  when 'boots' then 'B'
  when 'shin_pads' then 'SP'
  when 'socks' then 'SO'
  when 'shorts' then 'SH'
  when 'jersey' then 'J'
  when 'tracksuit' then 'T'
  when 'coat' then 'C'
  when 'gloves' then 'G'
  when 'water_bottle' then 'WB'
  when 'rucksack' then 'R'
  when 'other' then 'O'
  else null
end
where kind = 'player_kit';

-- New organizations get the prefixes too.
create or replace function private.create_builtin_item_types(p_org_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.equipment_item_types (org_id, key, kind, sizes, code_prefix)
  values
    (p_org_id, 'boots', 'player_kit', array['34','35','36','37','38','39','40','41','42','43','44','45','46'], 'B'),
    (p_org_id, 'shin_pads', 'player_kit', array['S','M','L'], 'SP'),
    (p_org_id, 'socks', 'player_kit', array['S','M','L'], 'SO'),
    (p_org_id, 'shorts', 'player_kit', array['XS','S','M','L','XL','XXL'], 'SH'),
    (p_org_id, 'jersey', 'player_kit', array['XS','S','M','L','XL','XXL'], 'J'),
    (p_org_id, 'tracksuit', 'player_kit', array['XS','S','M','L','XL','XXL'], 'T'),
    (p_org_id, 'coat', 'player_kit', array['XS','S','M','L','XL','XXL'], 'C'),
    (p_org_id, 'gloves', 'player_kit', array['S','M','L'], 'G'),
    (p_org_id, 'water_bottle', 'player_kit', '{}', 'WB'),
    (p_org_id, 'rucksack', 'player_kit', '{}', 'R'),
    (p_org_id, 'ball', 'team_equipment', '{}', null),
    (p_org_id, 'other', 'player_kit', '{}', 'O')
  on conflict (org_id, key) do nothing;
$$;

-- Return condition ----------------------------------------------------------------------------------

alter table public.stock_movements
  add column condition text check (condition is null or condition in ('new', 'good', 'worn', 'unusable'));

-- Stock alerts ----------------------------------------------------------------------------------------

create table public.stock_alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  item_type_id uuid not null references public.equipment_item_types (id) on delete cascade,
  size text,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);

comment on table public.stock_alerts is 'An item that went below zero; Today asks for a count (RAPP-249).';

-- One open alert per item and size.
create unique index stock_alerts_open_idx
  on public.stock_alerts (org_id, item_type_id, coalesce(size, ''))
  where resolved_at is null;

alter table public.stock_alerts enable row level security;
alter table public.stock_alerts force row level security;

create policy stock_alerts_read on public.stock_alerts
  for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.has_permission('equipment.count'))
      or (select public.has_permission('equipment.handover'))
    )
  );

revoke insert, update, delete, truncate on public.stock_alerts from anon, authenticated;

-- Recording a handover -----------------------------------------------------------------------------

create or replace function public.record_equipment_handover(
  p_participant_id uuid,
  p_item_type_id uuid,
  p_size text,
  p_mode text,
  p_signature_state text,
  p_signature jsonb default null,
  p_signature_reason text default null,
  p_statement_language text default null,
  p_note text default null
)
returns table (delivery_id uuid, unit_code text, stock_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  item_type public.equipment_item_types%rowtype;
  clean_size text := nullif(btrim(p_size), '');
  new_code text;
  next_number integer;
  new_delivery uuid;
  stock integer;
begin
  if not (select public.has_permission('equipment.handover')) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_signature_state not in ('signed', 'refused', 'unable') then
    raise exception 'STOCK/SIGNATURE_REQUIRED' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_participant_id and org_id = actor_org and role = 'player' and anonymized_at is null
  ) then
    raise exception 'STOCK/NO_PARTICIPANT' using errcode = 'P0002';
  end if;

  select * into item_type from public.equipment_item_types
   where id = p_item_type_id and org_id = actor_org and is_active;
  if item_type.id is null then
    raise exception 'STOCK/NO_ITEM_TYPE' using errcode = 'P0002';
  end if;
  if cardinality(item_type.sizes) > 0 and (clean_size is null or not clean_size = any (item_type.sizes)) then
    raise exception 'STOCK/SIZE_REQUIRED' using errcode = 'check_violation';
  end if;
  if cardinality(item_type.sizes) = 0 then
    clean_size := null;
  end if;

  -- Player kit gets the next unit code of its type, one at a time per type.
  if item_type.kind = 'player_kit' and item_type.code_prefix is not null then
    perform pg_advisory_xact_lock(hashtext(item_type.id::text));
    select coalesce(max(substring(d.unit_code from '-([0-9]+)$')::integer), 0) + 1
      into next_number
      from public.equipment_deliveries d
     where d.unit_code like item_type.code_prefix || '-%'
       and exists (select 1 from public.profiles p where p.id = d.profile_id and p.org_id = actor_org);
    new_code := item_type.code_prefix || '-' || lpad(next_number::text, 4, '0');
  end if;

  -- The insert trigger on equipment_deliveries records the -1 movement.
  insert into public.equipment_deliveries (
    profile_id, item, size, delivered_on, delivered_by, note,
    mode, unit_code, signature, signature_state, signature_reason, statement_language
  ) values (
    p_participant_id, item_type.key, clean_size, current_date, actor, nullif(btrim(p_note), ''),
    p_mode, new_code, p_signature, p_signature_state, nullif(btrim(p_signature_reason), ''),
    p_statement_language
  )
  returning id into new_delivery;

  select coalesce(sum(m.quantity), 0)::integer into stock
    from public.stock_movements m
   where m.org_id = actor_org and m.item_type_id = item_type.id
     and m.size is not distinct from clean_size;

  if stock < 0 then
    insert into public.stock_alerts (org_id, item_type_id, size)
    values (actor_org, item_type.id, clean_size)
    on conflict do nothing;
  end if;

  return query select new_delivery, new_code, stock;
end;
$$;

revoke all on function public.record_equipment_handover(uuid, uuid, text, text, text, jsonb, text, text, text) from public, anon;
grant execute on function public.record_equipment_handover(uuid, uuid, text, text, text, jsonb, text, text, text) to authenticated;

-- Recording a return -----------------------------------------------------------------------------------

create or replace function public.record_equipment_return(p_delivery_id uuid, p_condition text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  delivery public.equipment_deliveries%rowtype;
  type_id uuid;
begin
  if not (select public.has_permission('equipment.handover')) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_condition not in ('new', 'good', 'worn', 'unusable') then
    raise exception 'STOCK/CONDITION_REQUIRED' using errcode = 'check_violation';
  end if;

  select d.* into delivery
    from public.equipment_deliveries d
    join public.profiles p on p.id = d.profile_id
   where d.id = p_delivery_id and p.org_id = actor_org;
  if delivery.id is null then
    raise exception 'STOCK/NO_HANDOVER' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.stock_movements
    where equipment_delivery_id = delivery.id and kind = 'return'
  ) then
    raise exception 'STOCK/ALREADY_RETURNED' using errcode = 'check_violation';
  end if;

  select id into type_id from public.equipment_item_types
   where org_id = actor_org and key = delivery.item;

  insert into public.stock_movements (
    org_id, item_type_id, size, quantity, kind, condition,
    participant_id, equipment_delivery_id, recorded_by
  ) values (
    actor_org, type_id, delivery.size, 1, 'return', p_condition,
    delivery.profile_id, delivery.id, actor
  );

  -- An unusable item comes back only to leave stock again.
  if p_condition = 'unusable' then
    insert into public.stock_movements (
      org_id, item_type_id, size, quantity, kind, condition,
      equipment_delivery_id, recorded_by, reason
    ) values (
      actor_org, type_id, delivery.size, -1, 'write_off', 'unusable',
      delivery.id, actor, 'Returned unusable'
    );
  end if;
end;
$$;

revoke all on function public.record_equipment_return(uuid, text) from public, anon;
grant execute on function public.record_equipment_return(uuid, text) to authenticated;

-- Her material --------------------------------------------------------------------------------------------

-- What a participant received, with whether a lent item came back. For the
-- card and the return screen.
create or replace function public.participant_material(p_participant_id uuid)
returns table (
  delivery_id uuid,
  item_key text,
  size text,
  mode text,
  unit_code text,
  delivered_on date,
  signature_state text,
  returned_at timestamptz,
  return_condition text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    d.id, d.item, d.size, d.mode, d.unit_code, d.delivered_on, d.signature_state,
    r.occurred_at, r.condition
  from public.equipment_deliveries d
  join public.profiles p on p.id = d.profile_id
  left join public.stock_movements r on r.equipment_delivery_id = d.id and r.kind = 'return'
  where d.profile_id = p_participant_id
    and p.org_id = (select public.current_org_id())
    and (
      (select public.has_permission('equipment.handover'))
      or (select public.has_permission('participants.view'))
    )
  order by d.delivered_on desc, d.created_at desc;
$$;

revoke all on function public.participant_material(uuid) from public, anon;
grant execute on function public.participant_material(uuid) to authenticated;

-- The erasure registry learns stock_alerts (RAPP-26).

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
    ('stock_alerts', null, 'not_personal', 'Stock that went below zero, for the team to count.')
  ) as disposition(table_name, participant_column, disposition, reason);
$function$;
