-- Item types management (RAPP-253, from RAPP-170, part of RAPP-212).
--
-- Holders of equipment.items keep the material catalog: the twelve built-in
-- items and any the team adds (cones, bibs, a new kind of jacket). A custom
-- item has a name in Catalan and, when given, the other four languages; the
-- app falls back to Catalan. Every item has its sizes, player kit or team
-- equipment, the usual value of one donated piece, and, for player kit, the
-- letters of its unit codes. An item that is no longer used is switched off:
-- it leaves the pickers and keeps its history.
--
-- A size that still has stock cannot be removed, so stock never ends up on a
-- size nobody can count. Built-in items keep their kind and code letters,
-- because handovers and unit codes already rest on them.

alter table public.equipment_item_types
  add column is_builtin boolean not null default false,
  add constraint equipment_item_types_custom_has_name check (
    is_builtin or (name ? 'ca' and length(btrim(name ->> 'ca')) > 0)
  );

update public.equipment_item_types set is_builtin = true
where key in ('boots', 'shin_pads', 'socks', 'shorts', 'jersey', 'tracksuit', 'coat',
              'gloves', 'water_bottle', 'rucksack', 'ball', 'other');

create or replace function private.create_builtin_item_types(p_org_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.equipment_item_types (org_id, key, kind, sizes, code_prefix, is_builtin)
  values
    (p_org_id, 'boots', 'player_kit', array['34','35','36','37','38','39','40','41','42','43','44','45','46'], 'B', true),
    (p_org_id, 'shin_pads', 'player_kit', array['S','M','L'], 'SP', true),
    (p_org_id, 'socks', 'player_kit', array['S','M','L'], 'SO', true),
    (p_org_id, 'shorts', 'player_kit', array['XS','S','M','L','XL','XXL'], 'SH', true),
    (p_org_id, 'jersey', 'player_kit', array['XS','S','M','L','XL','XXL'], 'J', true),
    (p_org_id, 'tracksuit', 'player_kit', array['XS','S','M','L','XL','XXL'], 'T', true),
    (p_org_id, 'coat', 'player_kit', array['XS','S','M','L','XL','XXL'], 'C', true),
    (p_org_id, 'gloves', 'player_kit', array['S','M','L'], 'G', true),
    (p_org_id, 'water_bottle', 'player_kit', '{}', 'WB', true),
    (p_org_id, 'rucksack', 'player_kit', '{}', 'R', true),
    (p_org_id, 'ball', 'team_equipment', '{}', null, true),
    (p_org_id, 'other', 'player_kit', '{}', 'O', true)
  on conflict (org_id, key) do nothing;
$$;

-- Unit codes are numbered per letters, so two items never share them.
create unique index equipment_item_types_code_prefix_idx
  on public.equipment_item_types (org_id, code_prefix) where code_prefix is not null;

-- A handover may now be of any item in the catalog. The ledger trigger
-- (RAPP-248) already refuses an item the organization does not have.
alter table public.equipment_deliveries drop constraint equipment_deliveries_item_check;

-- Saving an item ----------------------------------------------------------------------------------

-- p_id null creates a custom item; otherwise it updates that item.
create or replace function public.save_item_type(
  p_id uuid,
  p_name jsonb,
  p_kind text,
  p_sizes text[],
  p_default_value_cents integer,
  p_code_prefix text,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  current_type public.equipment_item_types%rowtype;
  clean_sizes text[];
  clean_name jsonb;
  clean_prefix text := nullif(upper(btrim(p_code_prefix)), '');
  stranded text;
  saved_id uuid;
begin
  if not (select public.has_permission('equipment.items')) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_kind not in ('player_kit', 'team_equipment') then
    raise exception 'STOCK/ITEM_KIND' using errcode = 'check_violation';
  end if;

  select coalesce(array_agg(s order by ordinality), '{}') into clean_sizes
    from (
      select distinct on (btrim(size)) btrim(size) as s, ordinality
      from unnest(coalesce(p_sizes, '{}')) with ordinality as given(size, ordinality)
      where btrim(size) <> ''
      order by btrim(size), ordinality
    ) sizes;
  if cardinality(clean_sizes) > 30
     or exists (select 1 from unnest(clean_sizes) s where length(s) > 20) then
    raise exception 'STOCK/ITEM_SIZES' using errcode = 'check_violation';
  end if;
  if p_default_value_cents is not null and p_default_value_cents < 0 then
    raise exception 'STOCK/ITEM_VALUE' using errcode = 'check_violation';
  end if;
  if clean_prefix is not null and clean_prefix !~ '^[A-Z]{1,3}$' then
    raise exception 'STOCK/ITEM_CODE' using errcode = 'check_violation';
  end if;

  -- Only the languages the app knows, each a non-empty text.
  select coalesce(jsonb_object_agg(key, btrim(value)), '{}'::jsonb) into clean_name
    from jsonb_each_text(coalesce(p_name, '{}'::jsonb))
   where key in ('ca', 'es', 'en', 'ar', 'fa') and btrim(value) <> '';

  if p_id is null then
    if not clean_name ? 'ca' then
      raise exception 'STOCK/ITEM_NAME' using errcode = 'check_violation';
    end if;
    insert into public.equipment_item_types (
      org_id, key, name, kind, sizes, default_value_cents, code_prefix, is_active, is_builtin
    ) values (
      actor_org, 'custom_' || replace(gen_random_uuid()::text, '-', ''), clean_name, p_kind,
      clean_sizes, p_default_value_cents,
      case when p_kind = 'player_kit' then clean_prefix end, coalesce(p_is_active, true), false
    )
    returning id into saved_id;
  else
    select * into current_type from public.equipment_item_types
     where id = p_id and org_id = actor_org
     for update;
    if current_type.id is null then
      raise exception 'STOCK/NO_ITEM_TYPE' using errcode = 'P0002';
    end if;

    -- A size can go only once nothing is in stock on it.
    select coalesce(m.size, '') into stranded
      from public.stock_movements m
     where m.item_type_id = current_type.id
       and not (
         (cardinality(clean_sizes) = 0 and m.size is null)
         or m.size = any (clean_sizes)
       )
     group by m.size
    having sum(m.quantity) <> 0
     limit 1;
    if stranded is not null then
      raise exception 'STOCK/SIZE_IN_STOCK: %', stranded using errcode = 'check_violation';
    end if;

    if current_type.is_builtin then
      -- The name comes from the app's translations; kind and code letters stay.
      update public.equipment_item_types
         set sizes = clean_sizes, default_value_cents = p_default_value_cents,
             is_active = coalesce(p_is_active, is_active)
       where id = current_type.id;
    else
      if not clean_name ? 'ca' then
        raise exception 'STOCK/ITEM_NAME' using errcode = 'check_violation';
      end if;
      update public.equipment_item_types
         set name = clean_name, kind = p_kind, sizes = clean_sizes,
             default_value_cents = p_default_value_cents,
             code_prefix = case when p_kind = 'player_kit' then clean_prefix end,
             is_active = coalesce(p_is_active, is_active)
       where id = current_type.id;
    end if;
    saved_id := current_type.id;
  end if;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org, actor, 'stock.item_save', 'equipment_item_type', saved_id,
    jsonb_build_object(
      'name', clean_name, 'kind', p_kind, 'sizes', to_jsonb(clean_sizes),
      'default_value_cents', p_default_value_cents, 'code_prefix', clean_prefix,
      'is_active', p_is_active
    )
  );
  return saved_id;
end;
$$;

revoke all on function public.save_item_type(uuid, jsonb, text, text[], integer, text, boolean) from public, anon;
grant execute on function public.save_item_type(uuid, jsonb, text, text[], integer, text, boolean) to authenticated;
