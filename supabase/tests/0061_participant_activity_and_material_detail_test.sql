-- Participant activity and material history (RAPP-283).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Her timeline carries her attendance and her event sign-ups, with the
--      stored status code as the detail the screens translate.
--   2. One handover's detail names who handed it over and keeps her strokes.
--   3. A player reads no handover detail, not even her own.

begin;
select plan(7);

create temp table handed (id uuid);
grant all on handed to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

-- 1. Attendance and sign-ups ----------------------------------------------------------------------

select is(
  (select count(*)::integer from public.participant_activity('5eed0000-0000-4000-8000-000000000012')
    where kind = 'attendance'),
  (select count(*)::integer from public.attendance where player_id = '5eed0000-0000-4000-8000-000000000012'),
  'every attendance mark of hers is on her timeline'
);
select is(
  (select count(*)::integer from public.participant_activity('5eed0000-0000-4000-8000-000000000012')
    where kind = 'event_signup'),
  (select count(*)::integer from public.event_signups where player_id = '5eed0000-0000-4000-8000-000000000012'),
  'and every event sign-up'
);
select ok(
  (select bool_and(detail in ('present', 'absent', 'excused'))
     from public.participant_activity('5eed0000-0000-4000-8000-000000000012') where kind = 'attendance'),
  'an attendance entry carries the status code'
);
select ok(
  (select bool_and(title <> '')
     from public.participant_activity('5eed0000-0000-4000-8000-000000000012')
    where kind in ('attendance', 'event_signup')),
  'and the event title'
);

-- 2. One handover's detail ------------------------------------------------------------------------

insert into handed
select delivery_id
  from public.record_equipment_handover(
    gen_random_uuid(), now(), '5eed0000-0000-4000-8000-000000000012',
    (select id from public.equipment_item_types where key = 'boots'),
    '40', 'lent', 'signed', '[[[1,2],[3,4]]]'::jsonb, null, 'ar'
  );

select is(
  (select delivered_by_name || ' ' || statement_language || ' ' || signature_state
     from public.participant_material_detail((select id from handed))),
  'Marta Puig ar signed', 'the detail names who handed it over, the language and the state'
);
select is(
  (select signature from public.participant_material_detail((select id from handed))),
  '[[[1,2],[3,4]]]'::jsonb, 'and keeps her strokes'
);

-- 3. A player reads none ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated"}';
select is(
  (select count(*)::integer from public.participant_material_detail((select id from handed))),
  0, 'a player reads no handover detail, not even her own'
);

select * from finish();
rollback;
