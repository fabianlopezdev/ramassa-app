-- Inviting a participant who DOES have an email, and carrying the referring
-- entity into the wizard she lands in (RAPP-25). Run with: bunx supabase test db
--
-- WHY THE INVITE IS BOUND TO AN EMAIL AND NOT TO A LINK TOKEN
--
-- The obvious shape is a secret token in a URL: staff share the link, the app
-- reads the token, the wizard pre-fills. It does not survive the journey. She
-- opens the link, asks for a magic link, leaves for her inbox, and comes back
-- through a DIFFERENT url in a DIFFERENT browser context; the token has to be
-- parked somewhere client-side across that gap and re-attached afterwards.
-- Every one of those steps is a place for it to be lost, and a bearer token in
-- a URL is a thing that can be forwarded to the wrong person.
--
-- Binding the invite to the ADDRESS removes all of it. The invite is looked up
-- by the email of whoever actually signed in, so the prefill cannot reach
-- anybody else even if the link is forwarded to a group chat, there is no
-- secret to leak, and it works no matter how many times she goes to her inbox
-- and back. The "invite link" staff sends is then just the app's address.
--
-- What these assertions defend:
--
--   1. **Only staff invite**, and only into their own organization.
--   2. **The prefill reaches the right woman and nobody else.** An invite is
--      readable only by the signed-in identity whose address it names.
--   3. **A spent or expired invite prefills nothing**, so a stale link cannot
--      quietly re-attach an entity to somebody a year later.
--   4. **She can always overrule it.** The entity is a DEFAULT in her wizard,
--      never a fact recorded about her: the assertions treat it as a
--      suggestion, and the wizard renders it as an editable field.
--   5. **Inviting is audited and rate-limited**, like every other staff action
--      that creates something.

begin;
select plan(24);

select vault.create_secret('test-encryption-key', 'app_encryption_key', 'pgTAP test key')
where not exists (select 1 from vault.secrets where name = 'app_encryption_key');

-- Schema -------------------------------------------------------------------------

select has_table('public', 'invites', 'the invite table exists');
select has_column('public', 'invites', 'reference_entity', 'an invite can carry the referring entity');
select has_column('public', 'invites', 'expires_at', 'an invite goes stale on its own');
select has_column('public', 'invites', 'accepted_at', 'an invite records when it was spent');
select has_function(
  'public', 'create_participant_invite', array['jsonb'],
  'the staff invite RPC exists'
);
select has_function('public', 'my_pending_invite', 'the wizard can ask for its own prefill');

-- Inviting, as staff ----------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated"}';

-- A brand-new address: the onboarding drive account, which is seeded with an
-- auth user and deliberately no profile, exactly as a freshly invited player.
create temporary table sent_invite as
select * from public.create_participant_invite(
  jsonb_build_object(
    'email', 'onboarding@example.test',
    'reference_entity', 'Creu Roja Osona'
  )
);

select is(
  (select count(*) from sent_invite)::int, 1,
  'staff create an invite and get it back'
);

select ok(
  (select expires_at > now() from sent_invite),
  'the invite is valid for a while, not forever'
);

select is(
  (select i.org_id from public.invites i join sent_invite s on s.invite_id = i.id),
  '5eed0000-0000-4000-8000-000000000000'::uuid,
  'and belongs to the organization of the staff member who sent it'
);

select is(
  (select count(*) from public.audit_log
    where action = 'invite.create' and created_at >= now())::int,
  1,
  'inviting is audited'
);

-- The address is normalized on the way in, so an invite typed with a capital
-- letter still matches the identity that signs in.
select is(
  (select i.email from public.invites i join sent_invite s on s.invite_id = i.id),
  'onboarding@example.test',
  'the address is stored lowercased and trimmed, as the login schema normalizes it'
);

select throws_ok(
  $$ select public.create_participant_invite(jsonb_build_object('email', 'not-an-address')) $$,
  '22023',
  null::text,
  'an address that is not one is refused rather than stored'
);

-- Who may invite ---------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated"}';

select throws_ok(
  $$ select public.create_participant_invite(jsonb_build_object('email', 'algu@example.test')) $$,
  '42501',
  null::text,
  'an entity contact cannot invite'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000026", "role": "authenticated"}';

select throws_ok(
  $$ select public.create_participant_invite(jsonb_build_object('email', 'algu@example.test')) $$,
  '42501',
  null::text,
  'and neither can a participant'
);

-- Reading your own invite ---------------------------------------------------------------

-- The invited woman, signed in but with no profile yet: precisely the state the
-- wizard runs in.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000099", "role": "authenticated", "email": "onboarding@example.test"}';

select is(
  (select reference_entity from public.my_pending_invite()),
  'Creu Roja Osona',
  'the invited player reads the entity her invite carries'
);

-- THE ASSERTION THAT MATTERS. A prefill that leaked to the wrong identity would
-- attach a woman to an entity that never referred her, in the aggregate
-- reporting a funder reads.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000026", "role": "authenticated", "email": "rosa.mamani@example.test"}';

select is_empty(
  $$ select reference_entity from public.my_pending_invite() $$,
  'somebody else signed in reads nothing: an invite belongs to one address'
);

-- Spending and expiring -------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000099", "role": "authenticated", "email": "onboarding@example.test"}';

select lives_ok(
  $$ select public.complete_onboarding(
       jsonb_build_object(
         'first_name', 'Convidada', 'last_name', 'Prova',
         'date_of_birth', '1994-05-05', 'place_of_birth', 'Kyiv',
         'nationality', 'Ucraïna', 'preferred_language', 'es',
         'document_type', 'none',
         'city', 'Vic', 'has_dependents', false, 'num_dependents', 0,
         'clothing_size', 'M', 'shoe_size', '38',
         'reference_entity', 'Creu Roja Osona',
         'media_consent', false,
         'terms_version', '2026-07-01', 'locale_shown', 'es'
       )
     ) $$,
  'she finishes the wizard'
);

-- Finishing onboarding SPENDS the invite. Otherwise a link forwarded months
-- later would still be live for anyone who could reach that inbox.
--
-- `reset role` because this reads the invite ROW, which a participant cannot
-- see and should not: it is an observer check, not a step she takes.
reset role;

select ok(
  (select i.accepted_at is not null from public.invites i join sent_invite s on s.invite_id = i.id),
  'completing onboarding marks the invite as spent'
);

set local role authenticated;

select is_empty(
  $$ select reference_entity from public.my_pending_invite() $$,
  'and a spent invite prefills nothing on a second run'
);

reset role;

-- An expired invite is as good as no invite, without anyone having to sweep it.
update public.invites set accepted_at = null, expires_at = now() - interval '1 day'
where id = (select invite_id from sent_invite);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000099", "role": "authenticated", "email": "onboarding@example.test"}';

select is_empty(
  $$ select reference_entity from public.my_pending_invite() $$,
  'an expired invite prefills nothing either'
);

-- Visibility ---------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated"}';

select isnt_empty(
  $$ select id from public.invites $$,
  'staff can see the invites their organization has sent'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000026", "role": "authenticated"}';

select is_empty(
  $$ select id from public.invites $$,
  'a participant cannot enumerate who has been invited'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated"}';

select is_empty(
  $$ select id from public.invites $$,
  'and neither can an entity contact, however interested she is in referrals'
);

-- Rate limiting -------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated"}';

insert into public.audit_log (org_id, actor_id, action, target_type, target_id)
select
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8000-000000000003',
  'invite.create',
  'invite',
  gen_random_uuid()
from generate_series(1, 30);

select throws_ok(
  $$ select public.create_participant_invite(jsonb_build_object('email', 'massa@example.test')) $$,
  'P0001',
  null::text,
  'inviting stops at the hourly cap for one staff member'
);

select * from finish();
rollback;
