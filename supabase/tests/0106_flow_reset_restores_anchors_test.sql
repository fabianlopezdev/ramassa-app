-- "Back to the app's order" restores each staff screen where staff put it (RAPP-612).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. A saved flow order moves a staff screen's anchor, and the reset (an
--      empty order) puts it back at the anchor and position staff chose in
--      the question builder.
--   2. Moving a screen in the question builder moves its home, so a later
--      reset keeps that move.
--
-- Seed: design role ...097, organization ...000, staff screens ...8044...001,
-- ...002 and ...003, all after logistics at positions 0, 1 and 2.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(8);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select lives_ok(
  $$ select public.save_intake_flow_order(array[
       'custom:5eed0000-0000-4000-8044-000000000002', 'identity', 'background',
       'custom:5eed0000-0000-4000-8044-000000000001', 'documentation', 'logistics', 'equipment',
       'custom:5eed0000-0000-4000-8044-000000000003', 'season', 'supporting-entities',
       'participation-support', 'specific-needs']) $$,
  'the design role moves two staff screens'
);
select is(
  (select after_screen from public.intake_screens where id = '5eed0000-0000-4000-8044-000000000001'),
  'background',
  'a moved screen is anchored where it now shows'
);

select lives_ok(
  $$ select public.save_intake_flow_order(array[]::text[]) $$,
  'back to the app order'
);
select results_eq(
  $$ select after_screen, sort_order from public.intake_screens
      where id in ('5eed0000-0000-4000-8044-000000000001', '5eed0000-0000-4000-8044-000000000002',
                   '5eed0000-0000-4000-8044-000000000003')
      order by id $$,
  $$ values ('logistics'::text, 0), ('logistics'::text, 1), ('logistics'::text, 2) $$,
  'every staff screen is back after logistics, in the order staff built'
);

-- The question builder moves a screen: that move survives a later reset.
select lives_ok(
  $$ select public.save_intake_screen('5eed0000-0000-4000-8044-000000000003',
       '{"ca": "Participació"}'::jsonb, null, 'season') $$,
  'the question builder moves a screen after the season step'
);
select lives_ok(
  $$ select public.save_intake_flow_order(array['custom:5eed0000-0000-4000-8044-000000000003', 'identity']) $$,
  'then a flow order moves it first'
);
select lives_ok($$ select public.save_intake_flow_order(array[]::text[]) $$, 'and staff reset');
reset role;
select is(
  (select after_screen from public.intake_screens where id = '5eed0000-0000-4000-8044-000000000003'),
  'season',
  'the reset keeps the move made in the question builder'
);

select * from finish();
rollback;
