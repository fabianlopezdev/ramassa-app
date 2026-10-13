-- Stock counts and corrections (RAPP-251).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. A count that matches the ledger changes nothing but is still recorded.
--   2. A difference becomes a correction movement with its reason, so stock
--      matches the shelf, and the audit log names who counted.
--   3. A difference without a reason, or a count missing a size, is refused.
--   4. A count answers the item's open stock alerts.
--   5. Today asks for one count a month, the item counted longest ago.
--   6. Only equipment.count records a count.

begin;
select plan(13);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

-- 5 (before any count this month). Balls were counted last month; boots never.
select is(
  (select item_key from public.monthly_stock_count()),
  'boots', 'this month asks for an item never counted'
);

-- 3. Refusals ----------------------------------------------------------------------------------------

select throws_ok(
  $$ select * from public.record_stock_count(gen_random_uuid(),
       (select id from public.equipment_item_types where key = 'shorts'),
       '[{"size": "S", "counted": 6}]'::jsonb) $$,
  '23514', 'STOCK/COUNT_LINES', 'a count must cover every size of the item'
);
select throws_ok(
  $$ select * from public.record_stock_count(gen_random_uuid(),
       (select id from public.equipment_item_types where key = 'shorts'),
       '[{"size": "XS", "counted": 0}, {"size": "S", "counted": 6}, {"size": "M", "counted": 6},
         {"size": "L", "counted": 6}, {"size": "XL", "counted": 2}, {"size": "XXL", "counted": 0}]'::jsonb) $$,
  '23514', 'STOCK/COUNT_REASON', 'a difference needs a reason'
);

-- 1, 2, 4. Shorts: the seed left XL at -1 with an open alert; two are on the shelf.

select is(
  (select corrections from public.record_stock_count('57000000-0000-4000-8000-000000000001',
     (select id from public.equipment_item_types where key = 'shorts'),
     '[{"size": "XS", "counted": 0}, {"size": "S", "counted": 6}, {"size": "M", "counted": 6},
       {"size": "L", "counted": 6}, {"size": "XL", "counted": 2}, {"size": "XXL", "counted": 0}]'::jsonb,
     'found', 'Two pairs were in the kit bag.')),
  1, 'one size differed, so one correction'
);
select is(
  (select quantity from public.stock_levels() where item_key = 'shorts' and size = 'XL'),
  2, 'stock now matches the shelf'
);
select is(
  (select quantity || ' ' || correction_reason from public.stock_movements
    where count_id = '57000000-0000-4000-8000-000000000001'),
  '3 found', 'the correction carries the difference and its reason'
);
select is(
  (select lines -> 4 ->> 'expected' from public.stock_counts where id = '57000000-0000-4000-8000-000000000001'),
  '-1', 'the count keeps what the ledger expected'
);
select is(
  (select count(*)::int from public.stock_alerts a
     join public.equipment_item_types t on t.id = a.item_type_id
    where t.key = 'shorts' and a.resolved_at is null),
  0, 'and answers the open alert'
);

reset role;
select is(
  (select action || ' ' || (changes ->> 'corrections') from public.audit_log
    where target_id = '57000000-0000-4000-8000-000000000001'),
  'stock.count 1', 'the audit log records the count'
);
set local role authenticated;

-- 1. Sent again, and a matching count -------------------------------------------------------------

select is(
  (select corrections from public.record_stock_count('57000000-0000-4000-8000-000000000001',
     (select id from public.equipment_item_types where key = 'shorts'), '[]'::jsonb)),
  1, 'the same count sent again changes nothing more'
);
select is(
  (select corrections from public.record_stock_count(gen_random_uuid(),
     (select id from public.equipment_item_types where key = 'ball'),
     -- Six of the twelve are out with a staff member (the RAPP-252 seed checkout).
     '[{"size": null, "counted": 6}]'::jsonb)),
  0, 'a count that matches makes no correction'
);

-- 5. Counted this month: Today asks for nothing more.
select is(
  (select count(*)::int from public.monthly_stock_count()),
  0, 'after a count this month, nothing more is asked'
);

-- 6. Who ----------------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  $$ select * from public.record_stock_count(gen_random_uuid(),
       (select id from public.equipment_item_types limit 1), '[]'::jsonb) $$,
  '42501', null::text, 'a player records no count'
);

select * from finish();
rollback;
