-- Players see the team's first name and photo, and nothing more (RAPP-639).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. A player gets the id, first name and photo key of her organization's
--      team members, and only theirs among the ids she asks for.
--   2. A player gets nothing for another organization's staff and nothing for
--      another player.
--   3. The media worker's check lets her read a team member's current photo
--      and her own, and no other player's photo or another organization's.
--   4. Anon cannot call either function.
--
-- Seed: admin ...001, staff ...002, real players ...011 and ...012.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

-- Another organization with one staff member.
insert into public.organizations (id, name, slug)
values ('5eed0000-0000-4000-8000-0000000639a0', 'Altra entitat', 'altra-639');
insert into auth.users (id, email) values ('5eed0000-0000-4000-8000-0000000639a1', 'staff-639@example.test');
insert into public.profiles (id, org_id, role, first_name, last_name)
values ('5eed0000-0000-4000-8000-0000000639a1', '5eed0000-0000-4000-8000-0000000639a0', 'staff', 'Aina', 'Vidal')
on conflict (id) do update set org_id = excluded.org_id, role = excluded.role,
  first_name = excluded.first_name, last_name = excluded.last_name;

-- Current photos: the staff member, another player, and the other org's staff.
update public.profiles
   set avatar_url = '5eed0000-0000-4000-8000-000000000000/profile-photos/5eed0000-0000-4000-8000-000000000002/2026/10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg'
 where id = '5eed0000-0000-4000-8000-000000000002';
update public.profiles
   set avatar_url = '5eed0000-0000-4000-8000-000000000000/profile-photos/5eed0000-0000-4000-8000-000000000012/2026/10/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg'
 where id = '5eed0000-0000-4000-8000-000000000012';
update public.profiles
   set avatar_url = '5eed0000-0000-4000-8000-0000000639a0/profile-photos/5eed0000-0000-4000-8000-0000000639a1/2026/10/cccccccccccccccccccccccccccccccc.jpg'
 where id = '5eed0000-0000-4000-8000-0000000639a1';
update public.profiles
   set avatar_url = '5eed0000-0000-4000-8000-000000000000/profile-photos/5eed0000-0000-4000-8000-000000000002/2026/10/dddddddddddddddddddddddddddddddd.jpg'
 where id = '5eed0000-0000-4000-8000-000000000011';

update public.profiles set avatar_url = null where id = '5eed0000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';

-- 1. Her organization's team -----------------------------------------------------------------------

select results_eq(
  $$ select id, avatar_url is not null from public.get_staff_cards(array[
       '5eed0000-0000-4000-8000-000000000001',
       '5eed0000-0000-4000-8000-000000000002']::uuid[]) order by id $$,
  $$ values ('5eed0000-0000-4000-8000-000000000001'::uuid, false),
            ('5eed0000-0000-4000-8000-000000000002'::uuid, true) $$,
  'a player gets the cards of her organization''s admin and staff');

select is(
  (select count(*)::integer from public.get_staff_cards(array[
     '5eed0000-0000-4000-8000-000000000002',
     '5eed0000-0000-4000-8000-000000000012']::uuid[])),
  1,
  'only the team member among the ids she asks for');

-- 2. Nothing about anyone else ---------------------------------------------------------------------

select is(
  (select count(*)::integer from public.get_staff_cards(array['5eed0000-0000-4000-8000-0000000639a1']::uuid[])),
  0,
  'a player gets nothing for another organization''s staff');

select is(
  (select count(*)::integer from public.get_staff_cards(array['5eed0000-0000-4000-8000-000000000012']::uuid[])),
  0,
  'a player gets nothing for another player');

-- 3. The media worker's photo check ---------------------------------------------------------------

select ok(
  public.can_read_profile_photo_object('5eed0000-0000-4000-8000-000000000000/profile-photos/5eed0000-0000-4000-8000-000000000002/2026/10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg'),
  'a player reads a team member''s current photo');

select ok(
  public.can_read_profile_photo_object('5eed0000-0000-4000-8000-000000000000/profile-photos/5eed0000-0000-4000-8000-000000000002/2026/10/dddddddddddddddddddddddddddddddd.jpg'),
  'a player reads her own current photo, taken by a team member');

select ok(
  not public.can_read_profile_photo_object('5eed0000-0000-4000-8000-000000000000/profile-photos/5eed0000-0000-4000-8000-000000000012/2026/10/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg'),
  'a player does not read another player''s photo');

select ok(
  not public.can_read_profile_photo_object('5eed0000-0000-4000-8000-0000000639a0/profile-photos/5eed0000-0000-4000-8000-0000000639a1/2026/10/cccccccccccccccccccccccccccccccc.jpg'),
  'a player does not read another organization''s staff photo');

-- 4. Anon ------------------------------------------------------------------------------------------

reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select throws_ok(
  $$ select * from public.get_staff_cards(array['5eed0000-0000-4000-8000-000000000002']::uuid[]) $$,
  '42501', null::text,
  'anon cannot ask for staff cards');

select throws_ok(
  $$ select public.can_read_profile_photo_object('5eed0000-0000-4000-8000-000000000000/profile-photos/5eed0000-0000-4000-8000-000000000002/2026/10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg') $$,
  '42501', null::text,
  'anon cannot run the photo check');

select * from finish();
rollback;
