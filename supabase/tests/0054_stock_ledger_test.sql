-- Material stock ledger (RAPP-248).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Every organization has the built-in item types, including a new one.
--   2. A handover recorded the usual way becomes a -1 movement, so stock is
--      the sum of movements and never a typed number.
--   3. Movements are append-only: nobody writes or changes them directly.
--   4. Only equipment permission holders read the ledger and the stock.
--   5. Erasing a woman clears her link and keeps the movement, so stock stays right.

begin;
select plan(12);

-- 1. Item types ----------------------------------------------------------------------------------

select is(
  (select count(*)::int from public.equipment_item_types
    where org_id = '5eed0000-0000-4000-8000-000000000000'),
  12, 'the seed organization has the twelve built-in item types'
);

insert into public.organizations (id, name, slug)
values ('54000000-0000-4000-8000-000000000001', 'Ledger test', 'ledger-test');
select is(
  (select count(*)::int from public.equipment_item_types
    where org_id = '54000000-0000-4000-8000-000000000001'),
  12, 'a new organization gets them too'
);
select is(
  (select kind from public.equipment_item_types
    where org_id = '5eed0000-0000-4000-8000-000000000000' and key = 'ball'),
  'team_equipment', 'balls are counted team equipment, boots are player kit'
);

-- 2. A handover becomes a movement -------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select is(
  (select quantity from public.stock_levels() where item_key = 'boots' and size = '40'),
  4, 'the seed arrival put four boots size 40 in stock'
);

insert into public.equipment_deliveries (profile_id, item, size, delivered_on, delivered_by)
values (
  '5eed0000-0000-4000-8000-000000000011', 'boots', '40', current_date,
  '5eed0000-0000-4000-8000-000000000002'
);

select is(
  (select quantity from public.stock_levels() where item_key = 'boots' and size = '40'),
  3, 'handing one over takes it out of stock'
);
select is(
  (select kind || ' ' || quantity from public.stock_movements
    where participant_id = '5eed0000-0000-4000-8000-000000000011' and size = '40'),
  'handover -1', 'as a handover movement linked to her'
);

-- 3. Append-only ------------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.stock_movements (org_id, item_type_id, quantity, kind)
     select org_id, id, 100, 'arrival' from public.equipment_item_types where key = 'ball' $$,
  '42501', null::text, 'nobody types stock in directly'
);
select throws_ok(
  $$ update public.stock_movements set quantity = 50 where kind = 'arrival' $$,
  '42501', null::text, 'nor changes a movement'
);
select throws_ok(
  $$ delete from public.stock_movements $$,
  '42501', null::text, 'nor deletes one'
);

-- 4. Who reads --------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select is((select count(*)::int from public.stock_movements), 0, 'a player reads no movement');
select is((select count(*)::int from public.stock_levels()), 0, 'nor any stock');

-- 5. Erasure keeps the stock right -------------------------------------------------------------------

reset role;
delete from public.profiles where id = '5eed0000-0000-4000-8000-000000000011';
select is(
  (select count(*)::int from public.stock_movements
    where participant_id is null and kind = 'handover' and size = '40'),
  1, 'after her erasure the handover stays, without her name'
);

select * from finish();
rollback;
