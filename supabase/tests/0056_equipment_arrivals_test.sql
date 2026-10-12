-- Goods received: arrivals into stock (RAPP-250).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. An arrival puts each line into stock as an arrival movement.
--   2. A donated line takes the item type's default value unless one is typed.
--   3. The same arrival sent again saves nothing twice.
--   4. Bad lines, sizes and photo keys are refused, and nothing is half saved.
--   5. Only equipment.receive records; a player reads no arrival and no photo.

begin;
select plan(14);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select is(
  (select quantity from public.stock_levels() where item_key = 'boots' and size = '43'),
  null, 'boots 43 start with no stock'
);

-- 1 and 2. A donation with two lines and a photo -----------------------------------------------

select is(
  public.record_equipment_arrival(
    '56000000-0000-4000-8000-000000000001', now(), 'donation',
    jsonb_build_array(
      jsonb_build_object('item_type_id', (select id from public.equipment_item_types where key = 'boots'), 'size', '43', 'quantity', 5),
      jsonb_build_object('item_type_id', (select id from public.equipment_item_types where key = 'ball'), 'quantity', 2, 'unit_value_cents', 2000)
    ),
    'Escola Esportiva', null, null,
    jsonb_build_array(jsonb_build_object(
      'object_key', '5eed0000-0000-4000-8000-000000000000/stock/5eed0000-0000-4000-8000-000000000002/2026/10/0123456789abcdef0123456789abcdef.jpg',
      'kind', 'receipt'))
  ),
  '56000000-0000-4000-8000-000000000001'::uuid, 'an arrival is saved under the id the phone made'
);
select is(
  (select quantity from public.stock_levels() where item_key = 'boots' and size = '43'),
  5, 'its boots are in stock'
);
select is(
  (select unit_value_cents from public.stock_movements
    where arrival_id = '56000000-0000-4000-8000-000000000001'
      and item_type_id = (select id from public.equipment_item_types where key = 'boots')),
  2500, 'a donated line takes the default value'
);
select is(
  (select unit_value_cents from public.stock_movements
    where arrival_id = '56000000-0000-4000-8000-000000000001'
      and item_type_id = (select id from public.equipment_item_types where key = 'ball')),
  2000, 'unless staff typed one'
);
select is(
  (select received_by::text || ' ' || source_name from public.equipment_arrivals
    where id = '56000000-0000-4000-8000-000000000001'),
  '5eed0000-0000-4000-8000-000000000002 Escola Esportiva', 'the arrival records who received it and the source'
);
select is(
  (select kind from public.equipment_arrival_photos where arrival_id = '56000000-0000-4000-8000-000000000001'),
  'receipt', 'and its photo'
);
select ok(
  public.can_read_stock_object('5eed0000-0000-4000-8000-000000000000/stock/5eed0000-0000-4000-8000-000000000002/2026/10/0123456789abcdef0123456789abcdef.jpg'),
  'the media worker may serve that photo to her'
);

-- 3. Sent again ---------------------------------------------------------------------------------

select public.record_equipment_arrival(
  '56000000-0000-4000-8000-000000000001', now(), 'donation',
  jsonb_build_array(jsonb_build_object('item_type_id', (select id from public.equipment_item_types where key = 'boots'), 'size', '43', 'quantity', 5))
);
select is(
  (select quantity from public.stock_levels() where item_key = 'boots' and size = '43'),
  5, 'the same arrival sent again adds nothing'
);

-- 4. Refusals ------------------------------------------------------------------------------------

select throws_ok(
  $$ select public.record_equipment_arrival(gen_random_uuid(), now(), 'donation',
       jsonb_build_array(jsonb_build_object('item_type_id', (select id from public.equipment_item_types where key = 'boots'), 'size', '99', 'quantity', 1))) $$,
  '23514', 'STOCK/SIZE_REQUIRED', 'a size the item does not come in is refused'
);
select throws_ok(
  $$ select public.record_equipment_arrival(gen_random_uuid(), now(), 'purchase',
       jsonb_build_array(jsonb_build_object('item_type_id', (select id from public.equipment_item_types where key = 'ball'), 'quantity', 1)),
       null, null, 1000,
       jsonb_build_array(jsonb_build_object('object_key', 'someone-else/stock/x.jpg', 'kind', 'receipt'))) $$,
  '23514', 'STOCK/ARRIVAL_PHOTOS', 'a photo from outside her own stock folder is refused'
);
select is(
  (select count(*)::int from public.equipment_arrivals where source = 'purchase'),
  0, 'and the refused arrival left nothing behind'
);

-- 5. Who ----------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  $$ select public.record_equipment_arrival(gen_random_uuid(), now(), 'donation',
       jsonb_build_array(jsonb_build_object('item_type_id', (select id from public.equipment_item_types limit 1), 'quantity', 1))) $$,
  '42501', null::text, 'a player records no arrival'
);
select is(
  (select count(*)::int from public.equipment_arrivals) + (select count(*)::int from public.equipment_arrival_photos),
  0, 'nor reads one or its photos'
);

select * from finish();
rollback;
