-- Item types management (RAPP-253).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. A custom item needs a name in Catalan, and gets a key of its own.
--   2. It can be handed over, which the old fixed item list refused.
--   3. A size that still has stock cannot be removed.
--   4. Built-in items keep their kind and code letters; sizes and value change.
--   5. Two items cannot share code letters.
--   6. Switching an item off keeps its history; every save is audited.
--   7. Only equipment.items edits the catalog.

begin;
select plan(12);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

-- 1. A custom item ----------------------------------------------------------------------------------

select throws_ok(
  $$ select public.save_item_type(null, '{"en": "Cones"}'::jsonb, 'team_equipment', '{}', null, null, true) $$,
  '23514', 'STOCK/ITEM_NAME', 'a new item needs its Catalan name'
);

create temp table saved (id uuid);
grant all on saved to authenticated;
insert into saved
select public.save_item_type(null, '{"ca": " Armilla ", "es": "Chaleco", "xx": "ignored"}'::jsonb,
  'player_kit', array['S', 'M', 'M', ' L '], 1500, 'av', true);

select is(
  (select key ~ '^custom_[0-9a-f]{32}$' and name = '{"ca": "Armilla", "es": "Chaleco"}'::jsonb
     and sizes = array['S', 'M', 'L'] and code_prefix = 'AV' and not is_builtin
     from public.equipment_item_types where id = (select id from saved)),
  true, 'it gets its own key, a clean name and sizes, and upper-case code letters'
);

-- 2. Handed over ------------------------------------------------------------------------------------

select is(
  (select unit_code from public.record_equipment_handover(gen_random_uuid(), now(),
     '5eed0000-0000-4000-8000-000000000012', (select id from saved), 'M', 'given', 'signed',
     '[[[1, 1]]]'::jsonb)),
  'AV-0001', 'a custom item is handed over with its own unit codes'
);

-- 3. Sizes with stock ------------------------------------------------------------------------------

select throws_ok(
  $$ select public.save_item_type((select id from saved), '{"ca": "Armilla"}'::jsonb, 'player_kit',
       array['S', 'L'], 1500, 'AV', true) $$,
  '23514', null::text, 'a size with stock on it cannot be removed'
);
select lives_ok(
  $$ select public.save_item_type((select id from saved), '{"ca": "Armilla"}'::jsonb, 'player_kit',
       array['S', 'M', 'L', 'XL'], 1500, 'AV', true) $$,
  'a size can be added'
);

-- 4. Built-ins ------------------------------------------------------------------------------------------

select public.save_item_type(
  (select id from public.equipment_item_types where key = 'boots'),
  '{"ca": "Renamed"}'::jsonb, 'team_equipment',
  array['34','35','36','37','38','39','40','41','42','43','44','45','46','47'], 3000, 'ZZ', true
);
select is(
  (select kind || ' ' || code_prefix || ' ' || default_value_cents || ' ' || cardinality(sizes) || ' ' || coalesce(name::text, 'none')
     from public.equipment_item_types where key = 'boots'),
  'player_kit B 3000 14 none', 'a built-in keeps its name, kind and letters, and takes new sizes and value'
);

-- 5. Code letters --------------------------------------------------------------------------------------

select throws_ok(
  $$ select public.save_item_type(null, '{"ca": "Bufanda"}'::jsonb, 'player_kit', '{}', null, 'B', true) $$,
  '23505', null::text, 'two items cannot share code letters'
);
select throws_ok(
  $$ select public.save_item_type(null, '{"ca": "Bufanda"}'::jsonb, 'player_kit', '{}', null, 'B1', true) $$,
  '23514', 'STOCK/ITEM_CODE', 'code letters are one to three letters'
);

-- 6. Switching off -------------------------------------------------------------------------------------

select public.save_item_type((select id from saved), '{"ca": "Armilla"}'::jsonb, 'player_kit',
  array['S', 'M', 'L', 'XL'], 1500, 'AV', false);
select is(
  (select is_active from public.equipment_item_types where id = (select id from saved)),
  false, 'an item can be switched off'
);
select is(
  (select count(*)::int from public.equipment_deliveries
    where item = (select key from public.equipment_item_types where id = (select id from saved))),
  1, 'and keeps its history'
);

reset role;
select ok(
  (select count(*) >= 4 from public.audit_log where action = 'stock.item_save'),
  'every save is in the audit log'
);
set local role authenticated;

-- 7. Who --------------------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  $$ select public.save_item_type(null, '{"ca": "X"}'::jsonb, 'team_equipment', '{}', null, null, true) $$,
  '42501', null::text, 'a player edits no item'
);

select * from finish();
rollback;
