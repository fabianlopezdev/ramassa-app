-- Staff checkout and check-in (RAPP-252).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. A checkout takes the pieces out of stock, to a named staff member.
--   2. At check-in, what came back returns graded; unusable pieces are written
--      off; missing pieces stay out. A checkout is checked in once.
--   3. Bad sizes, people, dates and quantities are refused.
--   4. The person who has the material reads her checkout; a player reads none.

begin;
select plan(15);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select is(
  (select quantity from public.stock_levels() where item_key = 'ball'),
  6, 'the seed checkout has six of the twelve balls out'
);
select ok(
  (select count(*) > 0 from public.checkout_recipients() where first_name = 'Núria'),
  'staff can be chosen as the person who takes material'
);

select is(
  (select quantity || ' ' || staff_first_name || ' ' || is_overdue from public.open_staff_checkouts()),
  '6 Núria true', 'the seed checkout is open, with who has it, and late'
);

-- 1. Checking out ---------------------------------------------------------------------------------

select is(
  public.record_staff_checkout('58000000-0000-4000-8000-000000000001',
    (select id from public.equipment_item_types where key = 'jersey'), 'M', 4,
    '5eed0000-0000-4000-8000-000000000003', current_date + 3, 'Trip to Andorra'),
  '58000000-0000-4000-8000-000000000001'::uuid, 'a checkout is saved under the id the phone made'
);
select is(
  (select quantity from public.stock_levels() where item_key = 'jersey' and size = 'M'),
  1, 'four of the five jerseys M left stock'
);
select public.record_staff_checkout('58000000-0000-4000-8000-000000000001',
  (select id from public.equipment_item_types where key = 'jersey'), 'M', 4,
  '5eed0000-0000-4000-8000-000000000003', current_date + 3);
select is(
  (select quantity from public.stock_levels() where item_key = 'jersey' and size = 'M'),
  1, 'and sending it again takes nothing more'
);

-- 3. Refusals --------------------------------------------------------------------------------------

select throws_ok(
  $$ select public.record_staff_checkout(gen_random_uuid(),
       (select id from public.equipment_item_types where key = 'jersey'), 'M', 1,
       '5eed0000-0000-4000-8000-000000000011', current_date + 1) $$,
  'P0002', 'STOCK/NO_STAFF', 'material is checked out to staff, never to a player'
);
select throws_ok(
  $$ select public.record_staff_checkout(gen_random_uuid(),
       (select id from public.equipment_item_types where key = 'jersey'), 'M', 1,
       '5eed0000-0000-4000-8000-000000000003', current_date - 1) $$,
  '23514', 'STOCK/RETURN_DATE', 'a return date in the past is refused'
);

-- 2. Checking in -----------------------------------------------------------------------------------

select throws_ok(
  $$ select public.record_staff_checkin('58000000-0000-4000-8000-000000000001', 5, 'good') $$,
  '23514', 'STOCK/CHECKIN_QUANTITY', 'more pieces than went out cannot come back'
);
select public.record_staff_checkin('58000000-0000-4000-8000-000000000001', 3, 'worn');
select is(
  (select quantity from public.stock_levels() where item_key = 'jersey' and size = 'M'),
  4, 'three came back worn; the fourth stays out as lost'
);
select throws_ok(
  $$ select public.record_staff_checkin('58000000-0000-4000-8000-000000000001', 1, 'good') $$,
  '23514', 'STOCK/ALREADY_CHECKED_IN', 'a checkout is checked in once'
);
select public.record_staff_checkin('5eed0000-0000-4000-8000-000000000c01', 6, 'unusable');
select is(
  (select quantity from public.stock_levels() where item_key = 'ball'),
  6, 'unusable balls come back and are written off'
);

-- 4. Who reads -------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select ok(
  (select count(*) >= 1 from public.staff_checkouts where checked_out_to = '5eed0000-0000-4000-8000-000000000003'),
  'the person who has the material reads her checkouts'
);

select is(
  (select count(*)::int from public.open_staff_checkouts()),
  0, 'once checked in, nothing is open'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select is((select count(*)::int from public.staff_checkouts), 0, 'a player reads no checkout');

select * from finish();
rollback;
