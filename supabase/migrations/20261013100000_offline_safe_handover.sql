-- Offline-safe handovers (RAPP-249, part of RAPP-212).
--
-- The phone saves a handover in its offline outbox and sends it when there is
-- signal, so the same handover can arrive twice. The phone now makes the
-- record's id and sends the time of the handover at the pitch; the server
-- returns the saved record when it sees the id again.

drop function public.record_equipment_handover(uuid, uuid, text, text, text, jsonb, text, text, text);

-- Handovers save offline and go out later (design: field tasks work offline),
-- so the phone makes the id and the time at the pitch. Sending the same id
-- again returns the saved record: the outbox may retry a handover that the
-- server already stored.
create or replace function public.record_equipment_handover(
  p_id uuid,
  p_handed_over_at timestamptz,
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
  -- Already saved: the same handover sent again.
  select d.id, d.unit_code into new_delivery, new_code
    from public.equipment_deliveries d
   where d.id = p_id and d.delivered_by = actor;
  if new_delivery is not null then
    select coalesce(sum(m.quantity), 0)::integer into stock
      from public.stock_movements m
      join public.equipment_deliveries d on d.id = p_id
      join public.equipment_item_types t on t.org_id = actor_org and t.key = d.item
     where m.org_id = actor_org and m.item_type_id = t.id
       and m.size is not distinct from d.size;
    return query select new_delivery, new_code, stock;
    return;
  end if;

  -- A device clock can be a little ahead; an offline phone can wait weeks.
  if p_handed_over_at > now() + interval '10 minutes' or p_handed_over_at < now() - interval '60 days' then
    raise exception 'STOCK/HANDOVER_TIME' using errcode = 'check_violation';
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
    id, profile_id, item, size, delivered_on, delivered_by, note,
    mode, unit_code, signature, signature_state, signature_reason, statement_language
  ) values (
    p_id, p_participant_id, item_type.key, clean_size,
    (p_handed_over_at at time zone 'Europe/Madrid')::date, actor, nullif(btrim(p_note), ''),
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

revoke all on function public.record_equipment_handover(uuid, timestamptz, uuid, uuid, text, text, text, jsonb, text, text, text) from public, anon;
grant execute on function public.record_equipment_handover(uuid, timestamptz, uuid, uuid, text, text, text, jsonb, text, text, text) to authenticated;
