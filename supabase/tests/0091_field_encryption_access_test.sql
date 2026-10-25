-- Who may reach the field-encryption key and decrypt a field (RAPP-624).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Nobody outside the database calls public.encryption_key(): not PUBLIC,
--      anon, a signed-in user, or the service role.
--   2. Nobody outside the database calls encrypt_field or decrypt_field
--      directly. Every decryption goes through a function that checks the
--      caller's permission for that exact field.
--   3. A signed-in user cannot plant a readable ciphertext in her own profile
--      so that her own profile read decrypts it for her.
--   4. The six functions that decrypted as the signed-in user keep their
--      behaviour for allowed callers and decrypt nothing for anyone else.
--
-- Seed: staff ...002 and ...003 (referrals.manage, participants.view_sensitive,
-- feedback.view), entity contacts ...004 (Creu Roja, sender of referrals
-- ...8010-...001 and ...8010-...002) and ...005 (CEAR), players ...011 and
-- ...012, the design account ...097. Referral update ...8020-...001 is on
-- referral ...8010-...002; feedback ...8017-...001 is by player ...011.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(37);

-- Her answer to an app field in a reader's `answers` (RAPP-662): a choice by its
-- option's key, anything else as text.
create function pg_temp.column_of(p_answers jsonb, p_key text) returns text language sql security definer as $$
  select coalesce(
    (select o.key from public.custom_question_options o
      where o.question_id = f.id and o.id::text = p_answers ->> f.id::text),
    p_answers ->> f.id::text)
    from public.profile_fields f
   where f.org_id = '5eed0000-0000-4000-8000-000000000000' and f.system_key = p_key;
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1 and 2. Function privileges ----------------------------------------------------------------------

-- Denial is checked through the catalog, without calling the function, to
-- avoid the local Supabase error-hint crash on permission errors.
-- https://github.com/supabase/supautils/issues/214
select ok(
  not exists (
    select 1 from pg_proc p, aclexplode(p.proacl) acl
     where p.oid = 'public.encryption_key()'::regprocedure
       and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'),
  'PUBLIC cannot execute encryption_key'
);
select ok(not has_function_privilege('anon', 'public.encryption_key()', 'execute'),
  'anon cannot execute encryption_key');
select ok(not has_function_privilege('authenticated', 'public.encryption_key()', 'execute'),
  'a signed-in user (a player included) cannot execute encryption_key');
select ok(not has_function_privilege('service_role', 'public.encryption_key()', 'execute'),
  'the service role cannot execute encryption_key either: only database functions read the key');

select ok(
  not exists (
    select 1 from pg_proc p, aclexplode(p.proacl) acl
     where p.oid in ('public.encrypt_field(text)'::regprocedure, 'public.decrypt_field(bytea)'::regprocedure)
       and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'),
  'PUBLIC cannot execute encrypt_field or decrypt_field'
);
select ok(not has_function_privilege('anon', 'public.encrypt_field(text)', 'execute'),
  'anon cannot encrypt');
select ok(not has_function_privilege('anon', 'public.decrypt_field(bytea)', 'execute'),
  'anon cannot decrypt');
select ok(not has_function_privilege('authenticated', 'public.encrypt_field(text)', 'execute'),
  'a signed-in user cannot call encrypt_field directly');
select ok(not has_function_privilege('authenticated', 'public.decrypt_field(bytea)', 'execute'),
  'a signed-in user (player, entity contact, staff, design role) cannot call decrypt_field directly');
select ok(not has_function_privilege('service_role', 'public.decrypt_field(bytea)', 'execute'),
  'the service role cannot call decrypt_field directly');

-- The narrow helpers live in the private schema, which the API does not
-- expose, and anon cannot run them at all.
select ok(not has_function_privilege('anon', 'private.referral_private_fields(uuid)', 'execute'),
  'anon cannot run the referral field helper');
select ok(not has_function_privilege('anon', 'private.referral_update_content(uuid)', 'execute'),
  'anon cannot run the referral update helper');
select ok(not has_function_privilege('anon', 'private.feedback_content(uuid)', 'execute'),
  'anon cannot run the feedback helper');

-- 3. No ciphertext transplant ------------------------------------------------------------------------

-- A player copies a ciphertext she can read into her own health answer: her
-- own profile read would decrypt it. The guard refuses the direct write.
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  $$ update public.profiles
        set health_info = (select content_encrypted from public.feedback_submissions
                      where id = '5eed0000-0000-4000-8017-000000000001')
      where id = '5eed0000-0000-4000-8000-000000000011' $$,
  '42501', 'PROFILES/PRIVILEGED_COLUMN', 'a player cannot write a ciphertext into her own profile'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ update public.profiles
        set health_info = (select intake_answers from public.entity_referrals
                            where id = '5eed0000-0000-4000-8010-000000000001')
      where id = '5eed0000-0000-4000-8000-000000000002' $$,
  '42501', 'PROFILES/PRIVILEGED_COLUMN', 'a staff member cannot write a ciphertext into her own profile'
);
select throws_ok(
  $$ update public.profiles
        set emergency_contact_phone = (select intake_answers from public.entity_referrals
                               where id = '5eed0000-0000-4000-8010-000000000001')
      where id = '5eed0000-0000-4000-8000-000000000012' $$,
  '42501', 'PROFILES/PRIVILEGED_COLUMN', 'a staff member cannot write a ciphertext into a player''s profile'
);

-- 4. The six functions -------------------------------------------------------------------------------

-- Entity contact of Creu Roja (...004): her own referrals, decrypted.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select referred_phone from public.list_entity_referrals() where id = '5eed0000-0000-4000-8010-000000000001'),
  '+34930005401', 'an entity contact reads the phone of the woman she referred'
);
select is(
  (select notes from public.get_entity_referral('5eed0000-0000-4000-8010-000000000001')),
  'Pendent de primera entrevista.', 'an entity contact reads the notes of her own referral'
);
select is(
  (select pg_temp.column_of(answers, 'specific_needs_details') from public.get_entity_referral('5eed0000-0000-4000-8010-000000000001')),
  'Prefereix entrenar a la tarda.', 'the sender reads every answer she sent'
);

-- Entity contact of CEAR (...005): never another entity's referral.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select count(*)::int from public.list_entity_referrals() where referred_phone = '+34930005401'),
  0, 'another entity contact never lists that phone'
);
select throws_ok(
  $$ select * from public.get_entity_referral('5eed0000-0000-4000-8010-000000000001') $$,
  'P0002', 'referral not found', 'another entity contact cannot open that referral'
);
select is(
  (select private_field.referred_phone
     from private.referral_private_fields('5eed0000-0000-4000-8010-000000000001') private_field),
  null::text, 'the helper decrypts nothing for another entity contact'
);

-- A player: no referral, no referral update, no one else's feedback.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated", "aal": "aal1"}';
select is((select count(*)::int from public.list_staff_referrals()), 0, 'a player lists no referral');
select is((select count(*)::int from public.list_entity_referrals()), 0, 'a player has no entity referrals');
select is(
  (select count(*)::int from public.list_referral_updates('5eed0000-0000-4000-8010-000000000002')),
  0, 'a player reads no referral update'
);
select is(
  (select count(*)::int from public.participant_activity('5eed0000-0000-4000-8000-000000000011')
    where kind in ('feedback', 'referral_update')),
  0, 'a player reads no other player''s feedback or referral updates'
);
select is(
  private.feedback_content('5eed0000-0000-4000-8017-000000000001'),
  null::text, 'the feedback helper decrypts nothing for another player'
);
select is(
  private.referral_update_content('5eed0000-0000-4000-8020-000000000001'),
  null::text, 'the referral update helper decrypts nothing for a player'
);

-- The author reads her own feedback in her activity.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select is(
  (select detail from public.participant_activity('5eed0000-0000-4000-8000-000000000011')
    where id = '5eed0000-0000-4000-8017-000000000001'),
  'M’agradaria una activitat de conversa en català.', 'the author reads her own feedback'
);

-- The design role holds neither referrals.manage nor feedback.view.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is((select count(*)::int from public.list_staff_referrals()), 0, 'the design role lists no referral');
select is(
  (select count(*)::int from public.participant_activity('5eed0000-0000-4000-8000-000000000011')
    where kind in ('feedback', 'referral_update')),
  0, 'the design role reads no feedback or referral update of a real player'
);

-- Staff with referrals.manage and participants.view_sensitive: unchanged.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select referred_email from public.list_staff_referrals() where id = '5eed0000-0000-4000-8010-000000000001'),
  'amina.referral@example.test',
  'staff with referrals.manage read the referred address'
);
select is(
  (select content from public.list_referral_updates('5eed0000-0000-4000-8010-000000000002')),
  'La situació d’habitatge ha canviat.', 'staff read a referral update'
);
select is(
  (select detail from public.participant_activity('5eed0000-0000-4000-8000-000000000011')
    where id = '5eed0000-0000-4000-8017-000000000001'),
  'M’agradaria una activitat de conversa en català.', 'staff with feedback.view read her feedback in her activity'
);
select is(
  (select pg_temp.column_of(answers, 'applicant_status') from public.get_entity_referral('5eed0000-0000-4000-8010-000000000001')),
  'migrant', 'staff with participants.view_sensitive read the sensitive answers'
);

-- Staff without participants.view_sensitive: the sensitive answers stay hidden.
reset role;
delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000003'
   and permission_code = 'participants.view_sensitive';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select pg_temp.column_of(answers, 'applicant_status') is not null or pg_temp.column_of(answers, 'specific_needs') is not null
     from public.get_entity_referral('5eed0000-0000-4000-8010-000000000001')),
  false, 'staff without participants.view_sensitive never receive the sensitive answers'
);
select is(
  (select pg_temp.column_of(answers, 'city') from public.get_entity_referral('5eed0000-0000-4000-8010-000000000001')),
  'Vic', 'staff without participants.view_sensitive still read the other answers'
);

select * from finish();
rollback;
