-- Renewing and cancelling a participant invite (RAPP-284).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. A renewal gives an open invite, even an expired one, 30 more days.
--   2. A cancellation removes the invite and the empty account it made, so the
--      address can no longer sign in; an account another open invite needs stays.
--   3. A used invite can be neither renewed nor cancelled.
--   4. Only participants.invite holders do either, and both are audited
--      without the address.

begin;
select plan(11);

create temp table invited (label text primary key, id uuid);
grant all on invited to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

insert into invited
select 'one', invite_id from public.create_participant_invite('{"email": "renew.one@example.test"}'::jsonb);
insert into invited
select 'two-a', invite_id from public.create_participant_invite('{"email": "shared.two@example.test"}'::jsonb);
insert into invited
select 'two-b', invite_id from public.create_participant_invite('{"email": "shared.two@example.test"}'::jsonb);

-- 1. Renewal -----------------------------------------------------------------------------------------

reset role;
update public.invites set expires_at = now() - interval '1 day'
 where id = (select id from invited where label = 'one');
set local role authenticated;

select ok(
  public.renew_participant_invite((select id from invited where label = 'one')) > now() + interval '29 days',
  'an expired invite gets 30 more days'
);
select ok(
  (select expires_at > now() + interval '29 days' from public.invites
    where id = (select id from invited where label = 'one')),
  'and the invite keeps the new date'
);

-- 2. Cancellation ----------------------------------------------------------------------------------

select lives_ok(
  $$ select public.revoke_participant_invite((select id from invited where label = 'one')) $$,
  'an open invite can be cancelled'
);
reset role;
select is(
  (select count(*)::integer from public.invites where id = (select id from invited where label = 'one')),
  0, 'the invite is gone'
);
select is(
  (select count(*)::integer from auth.users where email = 'renew.one@example.test'),
  0, 'and so is the empty account, so the address cannot sign in'
);
set local role authenticated;

select public.revoke_participant_invite((select id from invited where label = 'two-a'));
reset role;
select is(
  (select count(*)::integer from auth.users where email = 'shared.two@example.test'),
  1, 'an account another open invite needs stays'
);

-- 3. A used invite ----------------------------------------------------------------------------------

update public.invites set accepted_at = now() where id = (select id from invited where label = 'two-b');
set local role authenticated;
select throws_ok(
  $$ select public.renew_participant_invite((select id from invited where label = 'two-b')) $$,
  'P0002', null::text, 'a used invite cannot be renewed'
);
select throws_ok(
  $$ select public.revoke_participant_invite((select id from invited where label = 'two-b')) $$,
  'P0002', null::text, 'or cancelled'
);

-- 4. Permission and audit ------------------------------------------------------------------------

reset role;
select is(
  (select count(*)::integer from public.audit_log
    where action in ('invite.renew', 'invite.revoke')
      and actor_id = '5eed0000-0000-4000-8000-000000000002'
      and target_id in (select id from invited)),
  3, 'one renewal and two cancellations are audited'
);
select ok(
  not exists (
    select 1 from public.audit_log
     where action in ('invite.renew', 'invite.revoke')
       and changes::text like '%@example.test%'
  ),
  'without the address'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated"}';
select throws_ok(
  $$ select public.renew_participant_invite((select id from invited where label = 'two-b')) $$,
  '42501', null::text, 'a player cannot renew an invite'
);

select * from finish();
rollback;
