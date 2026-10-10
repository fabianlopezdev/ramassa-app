-- A player invitation is the only way a new player joins (RAPP-224, RAPP-227).
-- Run with: bunx supabase test db
--
-- Players request their sign-in code with `shouldCreateUser: false`, so the
-- auth server refuses any address without an account. Until RAPP-227 an
-- invitation only wrote a row in `public.invites`, and an invited player was
-- refused with "Signups not allowed for otp". The earlier invite test never saw
-- it because it invited a seeded address that already had an auth user.
--
-- What these assertions defend:
--   1. Inviting a never-seen address creates her (empty) auth account, so her
--      first code request succeeds. Her profile is still created by the wizard,
--      because consent is hers to give.
--   2. Inviting the same address again reuses that account; an address that
--      already belongs to a profile is refused.
--   3. An invitation can carry a pending referral from a partner entity, and
--      the referral is linked to her the moment her profile exists.
--   4. The access-code account path is gone.

begin;
select plan(16);

-- The access-code path is gone ------------------------------------------------

select hasnt_function('public', 'create_participant_account', array['jsonb'],
  'staff can no longer create code accounts');
select hasnt_function('public', 'reset_participant_password', array['uuid'],
  'nor reset an access code');
select hasnt_function('public', 'unambiguous_token', array['integer'],
  'and the code generator went with them');
select has_column('public', 'invites', 'referral_id', 'an invitation can carry a referral');

-- An existing player's address, read before acting as staff (staff cannot read auth.users).
create temporary table existing_player as
select email from auth.users where id = '5eed0000-0000-4000-8000-000000000026';
grant select on existing_player to authenticated;

-- Inviting a never-seen address, as staff ---------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated"}';

create temporary table first_invite as
select * from public.create_participant_invite(
  jsonb_build_object('email', 'Brand.New.Player@Example.test', 'reference_entity', 'Creu Roja')
);

reset role;

select is(
  (select count(*)::int from auth.users where email = 'brand.new.player@example.test'),
  1,
  'inviting a new address creates her auth account'
);
select is(
  (select count(*)::int from auth.identities i
     join auth.users u on u.id = i.user_id
    where u.email = 'brand.new.player@example.test' and i.provider = 'email'),
  1,
  'with an email identity, so the code sign-in can find her'
);
select ok(
  (select email_confirmed_at is not null from auth.users where email = 'brand.new.player@example.test'),
  'the address is confirmed, because staff typed it for her in person'
);
select is(
  (select count(*)::int from public.profiles p
     join auth.users u on u.id = p.id
    where u.email = 'brand.new.player@example.test'),
  0,
  'but no profile yet: the wizard creates it with her own consent'
);

-- Inviting the same address again --------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated"}';

select lives_ok(
  $$ select public.create_participant_invite(jsonb_build_object('email', 'brand.new.player@example.test')) $$,
  'a second invitation for the same address is allowed'
);

reset role;

select is(
  (select count(*)::int from auth.users where email = 'brand.new.player@example.test'),
  1,
  'and reuses her account rather than creating another'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated"}';

select throws_ok(
  $$ select public.create_participant_invite(jsonb_build_object(
       'email', (select email from existing_player)
     )) $$,
  '23505',
  null::text,
  'an address that already belongs to a profile is refused'
);

-- Carrying a referral ------------------------------------------------------------------

select throws_ok(
  $$ select public.create_participant_invite(jsonb_build_object(
       'email', 'referred.player@example.test',
       'referral_id', '5eed0000-0000-4000-8010-000000000002'
     )) $$,
  '22023',
  null::text,
  'only a pending referral can be carried'
);

create temporary table referred_invite as
select * from public.create_participant_invite(
  jsonb_build_object(
    'email', 'referred.player@example.test',
    'referral_id', '5eed0000-0000-4000-8010-000000000001'
  )
);

reset role;

select is(
  (select referral_id from public.invites where id = (select invite_id from referred_invite)),
  '5eed0000-0000-4000-8010-000000000001'::uuid,
  'the invitation records the referral'
);

-- She finishes the wizard: her profile appears.
insert into public.profiles (id, org_id, role, first_name, last_name)
select u.id, '5eed0000-0000-4000-8000-000000000000', 'player', 'Referida', 'Prova'
from auth.users u where u.email = 'referred.player@example.test';

select ok(
  (select accepted_at is not null from public.invites where id = (select invite_id from referred_invite)),
  'her invitation is spent'
);
select is(
  (select referred_profile_id from public.entity_referrals where id = '5eed0000-0000-4000-8010-000000000001'),
  (select id from auth.users where email = 'referred.player@example.test'),
  'and the referral now points at her'
);
select is(
  (select status || '|' || assigned_staff_id::text from public.entity_referrals
    where id = '5eed0000-0000-4000-8010-000000000001'),
  'active|5eed0000-0000-4000-8000-000000000002',
  'active, assigned to the staff member who invited her'
);

select * from finish();
rollback;
