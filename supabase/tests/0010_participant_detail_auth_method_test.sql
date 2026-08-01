-- The detail RPC tells staff HOW an account signs in (RAPP-25). Run with:
-- bunx supabase test db
--
-- Why this column had to reach the RPC at all: the participant-detail screen
-- owns the password-reset control, and that control is only honest on an
-- account that HAS a password. Showing it on a magic-link account would offer
-- staff a button whose only outcome is the RPC's refusal; hiding it everywhere
-- would strand the admin-created accounts the reset exists for. The screen can
-- only tell the two apart if the read it already makes says which is which.
--
-- The read stays SECURITY INVOKER and the addition is one column, so nothing
-- here re-tests the audit, the decryption or the role gate (0007 owns those).
-- What this file pins is the column's presence, its value for both kinds of
-- account, and that the function is still the audited single door it was.

begin;
select plan(5);

select vault.create_secret('test-encryption-key', 'app_encryption_key', 'pgTAP test key')
where not exists (select 1 from vault.secrets where name = 'app_encryption_key');

-- Marta Puig (ordinal 2) is staff; Blanca Ribes (ordinal 30) is the seeded
-- admin-created participant; Rosa Mamani (ordinal 26) signs in by magic link.

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated"}';

select is(
  (select auth_method from public.get_participant_profile('5eed0000-0000-4000-8000-000000000030')),
  'admin_created',
  'the detail read says an admin-created account is one'
);

select is(
  (select auth_method from public.get_participant_profile('5eed0000-0000-4000-8000-000000000026')),
  'magic_link',
  'the detail read says a magic-link account is one'
);

-- The addition did not quietly cost the read its other columns: the decrypted
-- fields still arrive in the same row as the new one.
select is(
  (select document_number from public.get_participant_profile('5eed0000-0000-4000-8000-000000000026')),
  'Y0000026Z',
  'the decrypted document still arrives alongside auth_method'
);

-- And it did not open a second, unaudited door: the same call still writes the
-- access-audit row (scoped to this transaction via now(), as 0007 does).
select is(
  (select count(*)::integer from public.audit_log
    where action = 'profile.view_sensitive'
      and target_id = '5eed0000-0000-4000-8000-000000000026'
      and created_at >= now()),
  2,
  'each detail read this transaction made left its audit row'
);

-- A participant still reads nobody through the staff RPC, auth_method included.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000026", "role": "authenticated"}';
select is_empty(
  $$ select auth_method from public.get_participant_profile('5eed0000-0000-4000-8000-000000000030') $$,
  'a participant reads no auth_method through the staff RPC'
);

select * from finish();
rollback;
