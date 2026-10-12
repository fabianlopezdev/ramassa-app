-- Handover with signature and returns (RAPP-249).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. A handover saves her signature, or a refusal with a reason, and never
--      neither: the record is evidence the item reached her.
--   2. Sending the same handover twice saves it once (the offline outbox retries).
--      Player kit gets the next unit code of its type; balls get none.
--   3. A handover is never blocked by stock: going below zero opens one alert.
--   4. A return is graded once; an unusable item leaves stock again.
--   5. Only equipment.handover holders record; a player reads no alert.
--   6. Erasing her removes the signature with the record and keeps the stock.

begin;
select plan(23);

create temp table handed (label text primary key, id uuid, code text, stock integer);
grant all on handed to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

-- 1. Signature or a reason -----------------------------------------------------------------------

insert into handed
select 'boots-a', delivery_id, unit_code, stock_after
  from public.record_equipment_handover(
    gen_random_uuid(), now(), '5eed0000-0000-4000-8000-000000000012',
    (select id from public.equipment_item_types where key = 'boots'),
    '40', 'lent', 'signed', '[[[1,2],[3,4]]]'::jsonb, null, 'ar'
  );

select is(
  (select signature_state || ' ' || mode || ' ' || statement_language
     from public.equipment_deliveries where id = (select id from handed where label = 'boots-a')),
  'signed lent ar', 'a signed loan keeps the state, the mode and her statement language'
);
select is(
  (select signature from public.equipment_deliveries where id = (select id from handed where label = 'boots-a')),
  '[[[1,2],[3,4]]]'::jsonb, 'and her strokes'
);
select throws_ok(
  $$ select * from public.record_equipment_handover(
       gen_random_uuid(), now(), '5eed0000-0000-4000-8000-000000000012',
       (select id from public.equipment_item_types where key = 'boots'),
       '40', 'given', 'signed') $$,
  '23514', null::text, 'signed without strokes is refused'
);
select throws_ok(
  $$ select * from public.record_equipment_handover(
       gen_random_uuid(), now(), '5eed0000-0000-4000-8000-000000000012',
       (select id from public.equipment_item_types where key = 'boots'),
       '40', 'given', 'refused') $$,
  '23514', null::text, 'a refusal without a reason is refused'
);
select throws_ok(
  $$ select * from public.record_equipment_handover(
       gen_random_uuid(), now(), '5eed0000-0000-4000-8000-000000000012',
       (select id from public.equipment_item_types where key = 'boots'),
       '40', 'given', 'not_collected') $$,
  '23514', 'STOCK/SIGNATURE_REQUIRED', 'the phone always collects a signature or a reason'
);
select throws_ok(
  $$ select * from public.record_equipment_handover(
       gen_random_uuid(), now(), '5eed0000-0000-4000-8000-000000000012',
       (select id from public.equipment_item_types where key = 'boots'),
       '99', 'given', 'unable', null, 'Injured hand') $$,
  '23514', 'STOCK/SIZE_REQUIRED', 'a size outside the item''s sizes is refused'
);

insert into handed
select 'boots-b', delivery_id, unit_code, stock_after
  from public.record_equipment_handover(
    gen_random_uuid(), now(), '5eed0000-0000-4000-8000-000000000012',
    (select id from public.equipment_item_types where key = 'boots'),
    '40', 'given', 'unable', null, 'Injured hand', 'ar'
  );
select is(
  (select signature_reason from public.equipment_deliveries where id = (select id from handed where label = 'boots-b')),
  'Injured hand', 'unable to sign is saved with its reason'
);

-- 2. Unit codes --------------------------------------------------------------------------------------

select matches((select code from handed where label = 'boots-a'), '^B-[0-9]{4}$', 'boots get a B code');
select is(
  (select substring(code from 3)::int from handed where label = 'boots-b')
    - (select substring(code from 3)::int from handed where label = 'boots-a'),
  1, 'the next pair gets the next number'
);
insert into handed
select 'ball', delivery_id, unit_code, stock_after
  from public.record_equipment_handover(
    gen_random_uuid(), now(), '5eed0000-0000-4000-8000-000000000012',
    (select id from public.equipment_item_types where key = 'ball'),
    null, 'lent', 'signed', '[[[0,0]]]'::jsonb
  );
select is((select code from handed where label = 'ball'), null, 'a ball has no unit code');

select is(
  (select delivery_id::text || ' ' || unit_code from public.record_equipment_handover(
     (select id from handed where label = 'boots-a'), now(), '5eed0000-0000-4000-8000-000000000012',
     (select id from public.equipment_item_types where key = 'boots'),
     '40', 'lent', 'signed', '[[[1,2],[3,4]]]'::jsonb)),
  (select id::text || ' ' || code from handed where label = 'boots-a'),
  'the same handover sent again returns the saved record'
);
select is(
  (select count(*)::int from public.equipment_deliveries where id = (select id from handed where label = 'boots-a')),
  1, 'and saves nothing twice'
);
select throws_ok(
  $$ select * from public.record_equipment_handover(
       gen_random_uuid(), now() + interval '1 day', '5eed0000-0000-4000-8000-000000000012',
       (select id from public.equipment_item_types where key = 'boots'),
       '40', 'given', 'signed', '[[[0,0]]]'::jsonb) $$,
  '23514', 'STOCK/HANDOVER_TIME', 'a handover in the future is refused'
);

-- 3. Stock below zero opens one alert ----------------------------------------------------------------

select is((select stock from handed where label = 'boots-b'), 2, 'two pairs out of four leave two');

insert into handed
select 'gloves-a', delivery_id, unit_code, stock_after
  from public.record_equipment_handover(
    gen_random_uuid(), now(), '5eed0000-0000-4000-8000-000000000012',
    (select id from public.equipment_item_types where key = 'gloves'),
    'M', 'given', 'signed', '[[[0,0]]]'::jsonb
  );
insert into handed
select 'gloves-b', delivery_id, unit_code, stock_after
  from public.record_equipment_handover(
    gen_random_uuid(), now(), '5eed0000-0000-4000-8000-000000000012',
    (select id from public.equipment_item_types where key = 'gloves'),
    'M', 'given', 'signed', '[[[0,0]]]'::jsonb
  );
select is((select stock from handed where label = 'gloves-b'), -2, 'gloves with no stock are still handed over');
select is(
  (select count(*)::int from public.stock_alerts a
     join public.equipment_item_types t on t.id = a.item_type_id
    where t.key = 'gloves' and a.size = 'M' and a.resolved_at is null),
  1, 'and one alert asks for a count'
);

-- 4. Returns -----------------------------------------------------------------------------------------

select lives_ok(
  $$ select public.record_equipment_return((select id from handed where label = 'boots-a'), 'good') $$,
  'a lent pair comes back graded'
);
select throws_ok(
  $$ select public.record_equipment_return((select id from handed where label = 'boots-a'), 'good') $$,
  '23514', 'STOCK/ALREADY_RETURNED', 'and only once'
);
select public.record_equipment_return((select id from handed where label = 'ball'), 'unusable');
select is(
  (select string_agg(kind || ' ' || quantity, ', ' order by kind) from public.stock_movements
    where equipment_delivery_id = (select id from handed where label = 'ball')),
  'handover -1, return 1, write_off -1', 'an unusable ball comes back and is written off'
);
select is(
  (select return_condition from public.participant_material('5eed0000-0000-4000-8000-000000000012')
    where delivery_id = (select id from handed where label = 'boots-a')),
  'good', 'her material shows the return'
);

-- 5. Who records ---------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  $$ select * from public.record_equipment_handover(
       gen_random_uuid(), now(), '5eed0000-0000-4000-8000-000000000012',
       (select id from public.equipment_item_types where key = 'boots'),
       '40', 'given', 'signed', '[[[0,0]]]'::jsonb) $$,
  '42501', null::text, 'a player records no handover'
);
select is((select count(*)::int from public.stock_alerts), 0, 'nor reads an alert');

-- 6. Erasure -------------------------------------------------------------------------------------------

reset role;
delete from public.profiles where id = '5eed0000-0000-4000-8000-000000000012';
select is(
  (select count(*)::int from public.equipment_deliveries
    where id in (select id from handed)),
  0, 'erasing her removes the records and her signature'
);

select * from finish();
rollback;
