-- Her own notifications switch (RAPP-956).
-- Run with: bunx supabase test db
--
-- What these assertions defend: a signed-in person turns her own notifications
-- on or off, and nobody else's, and an anonymous caller cannot call it. The
-- switch is the column every send already reads; 0018_push_pipeline_test.sql
-- proves a profile with it off gets no deliveries.
--
-- The test builds its own organization, so it needs no seed: a player ...011,
-- another player ...012 and an admin ...001.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

insert into public.organizations (id, name, slug)
values ('95600000-0000-4000-8000-000000000000', 'Proves 956', 'proves-956');
insert into auth.users (id, email) values
  ('95600000-0000-4000-8000-000000000001', 'admin-956@example.test'),
  ('95600000-0000-4000-8000-000000000011', 'player-956@example.test'),
  ('95600000-0000-4000-8000-000000000012', 'other-player-956@example.test');
insert into public.profiles (id, org_id, role, first_name, last_name, terms_accepted_at)
values
  ('95600000-0000-4000-8000-000000000001', '95600000-0000-4000-8000-000000000000', 'admin', 'Admin', 'Prova', now()),
  ('95600000-0000-4000-8000-000000000011', '95600000-0000-4000-8000-000000000000', 'player', 'Jugadora', 'Una', now()),
  ('95600000-0000-4000-8000-000000000012', '95600000-0000-4000-8000-000000000000', 'player', 'Jugadora', 'Dues', now())
on conflict (id) do update set org_id = excluded.org_id, role = excluded.role;

select has_function('public', 'set_own_push_notifications', array['boolean'],
  'a person has a function to turn her own notifications on or off');
select is(
  has_function_privilege('anon', 'public.set_own_push_notifications(boolean)', 'execute'),
  false, 'an anonymous caller cannot call it'
);
select is(
  has_function_privilege('authenticated', 'public.set_own_push_notifications(boolean)', 'execute'),
  true, 'a signed-in caller can'
);

-- She turns them off --------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "95600000-0000-4000-8000-000000000011", "role": "authenticated"}';

select is(public.set_own_push_notifications(false), false, 'she turns her notifications off');
select is(
  (select push_notifications_enabled from public.profiles where id = '95600000-0000-4000-8000-000000000011'),
  false, 'and her profile says so'
);
select throws_ok(
  $$ select public.set_own_push_notifications(null) $$,
  '22023', null::text, 'the switch is on or off, never empty'
);

reset role;
select is(
  (select push_notifications_enabled from public.profiles where id = '95600000-0000-4000-8000-000000000012'),
  true, 'the other player keeps hers on'
);

-- She turns them back on ------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "95600000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(public.set_own_push_notifications(true), true, 'she turns them back on');

-- Nobody else's row ------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "95600000-0000-4000-8000-000000000001", "role": "authenticated"}';
select is(public.set_own_push_notifications(false), false, 'the admin changes only her own');
reset role;
select is(
  (select push_notifications_enabled from public.profiles where id = '95600000-0000-4000-8000-000000000011'),
  true, 'the player''s switch stays as she left it'
);

select * from finish();
rollback;
