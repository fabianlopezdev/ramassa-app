-- A player's profile is created with her account (RAPP-300).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. An invitation with her name creates her profile as 'invited', without
--      consent, and records each answer staff gave. A column default is never
--      an answer. An email-only invitation still creates no profile.
--   2. An invited woman is not a player yet: no player role, so no player
--      action; staff see her in the participant list as not joined.
--   3. Staff complete her record in parts while she has not joined.
--   4. The wizard keeps every stored value she leaves blank, makes her a
--      player, and only then spends the invitation.
--   5. Cancelling the invitation, or letting it expire, removes her profile
--      and her account.
--   6. Answers are written only by the functions, and read by her and staff.

begin;
select plan(32);

-- The unsigned path is closed to clients (RAPP-624); this file checks its merge
-- rules as the participant, so it grants it inside this rolled-back transaction.
grant execute on function public.complete_onboarding(jsonb) to authenticated;

create temp table invited (label text primary key, invite_id uuid, account_id uuid, returned_profile_id uuid);
grant all on invited to authenticated;

-- Her answers travel by field (RAPP-661). Helpers: the app's keys of a payload
-- keyed by their fields (a choice by its option), a field's id, and her stored
-- answer to an app field (decrypted).
create function pg_temp.answers(p jsonb) returns jsonb language sql security definer as $$
  select coalesce(jsonb_object_agg(f.id::text, private.app_answer_value(f, e.value)), '{}'::jsonb)
    from jsonb_each(p) e
    join public.profile_fields f on f.org_id = '5eed0000-0000-4000-8000-000000000000' and f.system_key = e.key;
$$;
create function pg_temp.field(p_key text) returns text language sql security definer as $$
  select id::text from public.profile_fields
   where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = p_key;
$$;
create function pg_temp.stored(p_profile uuid, p_key text) returns jsonb language sql security definer as $$
  select private.system_field_answer(p_profile, p_key);
$$;
grant execute on all functions in schema pg_temp to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

insert into invited (label, invite_id, returned_profile_id)
select 'amina', invite_id, profile_id from public.create_participant_invite(jsonb_build_object(
  'email', 'amina.prefill@example.test',
  'first_name', 'Amina',
  'last_name', 'Diallo',
  'reference_entity', 'CEAR',
  -- Her answers travel by field (RAPP-661).
  'answers', pg_temp.answers(jsonb_build_object(
    'nationality', 'Mali', 'phone', '+34600111222', 'clothing_size', 'M', 'reference_entity', 'CEAR'))
));
insert into invited (label, invite_id, returned_profile_id)
select 'email-only', invite_id, profile_id
from public.create_participant_invite('{"email": "email.only@example.test"}'::jsonb);

reset role;
update invited set account_id = (select id from auth.users where email = 'amina.prefill@example.test')
 where label = 'amina';
update invited set account_id = (select id from auth.users where email = 'email.only@example.test')
 where label = 'email-only';

-- 1. Creation ------------------------------------------------------------------------------------

select is(
  (select role from public.profiles where id = (select account_id from invited where label = 'amina')),
  'invited', 'an invitation with her name creates her profile as invited'
);
select ok(
  (select terms_accepted_at is null from public.profiles
    where id = (select account_id from invited where label = 'amina')),
  'without consent: only she can give it'
);
select is(
  (select value is null and (public.decrypt_field(value_encrypted))::jsonb = '"+34600111222"'::jsonb
     from public.custom_answers
    where profile_id = (select account_id from invited where label = 'amina') and question_id::text = pg_temp.field('phone')),
  true, 'the phone staff gave is stored, encrypted'
);
-- Answers by field (RAPP-661); her names are on her account.
select is(
  (select array_agg(f.system_key order by f.system_key) from public.custom_answers a
     join public.profile_fields f on f.id = a.question_id
    where a.profile_id = (select account_id from invited where label = 'amina')),
  array['clothing_size', 'nationality', 'phone', 'reference_entity'],
  'each answer staff gave is recorded, and nothing else'
);
select is(
  (select count(*)::integer from public.custom_answers
    where profile_id = (select account_id from invited where label = 'amina') and question_id::text = pg_temp.field('has_dependents')),
  0, 'the dependants and language defaults are not answers'
);
select is(
  (select distinct source from public.custom_answers where profile_id = (select account_id from invited where label = 'amina')),
  'staff', 'and they are recorded as given by staff'
);
select is(
  (select count(*)::integer from public.profiles
    where id = (select account_id from invited where label = 'email-only')),
  0, 'an email-only invitation still creates only the login'
);
select ok(
  (select accepted_at is null from public.invites
    where id = (select invite_id from invited where label = 'amina')),
  'creating her profile does not spend her invitation'
);
select is(
  (select returned_profile_id from invited where label = 'amina'),
  (select account_id from invited where label = 'amina'),
  'the invitation returns her profile id, so staff can open her record'
);
select is(
  (select returned_profile_id from invited where label = 'email-only'),
  null, 'and none for an email-only invitation'
);

set local role authenticated;
select throws_ok(
  $$ select public.create_participant_invite(jsonb_build_object(
       'email', 'half.name@example.test', 'first_name', 'Half')) $$,
  '22023', null::text, 'a first name needs a last name'
);

-- 2. Not a player yet --------------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.list_participants()
    where id = (select account_id from invited where label = 'amina') and not joined),
  1, 'staff see her in the participant list as not joined'
);
select is(
  (select count(*)::integer from public.list_participants(p_status => 'invited')
    where id = (select account_id from invited where label = 'amina')),
  1, 'and can filter the list to invited women'
);
select is(
  (select count(*)::integer from public.list_participants(p_status => 'active')
    where id = (select account_id from invited where label = 'amina')),
  0, 'the active filter shows joined players only'
);

set local request.jwt.claims to '';
select set_config('request.jwt.claims',
  json_build_object('sub', (select account_id from invited where label = 'amina'),
                    'role', 'authenticated', 'aal', 'aal1')::text, true);
select is(public.current_app_role(), null, 'an invited woman has no player role yet');
select is(
  (select array_agg(q order by q) from public.my_answered_questions() q),
  array['clothing_size', 'first_name', 'last_name', 'nationality', 'phone', 'reference_entity'],
  'she reads which questions are already answered'
);
select throws_ok(
  $$ insert into public.profile_answers (profile_id, org_id, question, source)
     values ((select auth.uid()), '5eed0000-0000-4000-8000-000000000000', 'avatar', 'player') $$,
  '42501', null::text, 'nobody writes answers directly'
);

-- 3. Staff complete her record in parts ----------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.update_participant_profile(
       (select account_id from invited where label = 'amina'),
       jsonb_build_object('answers', pg_temp.answers('{"date_of_birth": "1998-04-02", "nationality": "Guinea"}'))) $$,
  'staff save part of a not-joined record, without place of birth'
);
reset role;
select is(
  (select pg_temp.stored((select account_id from invited where label = 'amina'), 'nationality') #>> '{}' || ' ' || (pg_temp.stored((select account_id from invited where label = 'amina'), 'date_of_birth') #>> '{}')
          || ' ' || (pg_temp.stored((select account_id from invited where label = 'amina'), 'phone') #>> '{}')),
  'Guinea 1998-04-02 +34600111222', 'only the fields sent change'
);
select ok(
  exists (select 1 from public.custom_answers
           where profile_id = (select account_id from invited where label = 'amina') and question_id::text = pg_temp.field('date_of_birth') and source = 'staff'),
  'and each field sent becomes an answer'
);
set local role authenticated;
select lives_ok(
  $$ select public.update_participant_profile(
       (select account_id from invited where label = 'amina'),
       jsonb_build_object('answers', pg_temp.answers('{"phone": ""}'))) $$,
  'staff can clear a wrong value'
);
reset role;
select ok(
  pg_temp.stored((select account_id from invited where label = 'amina'), 'phone') is null,
  'and a cleared value is no longer an answer'
);

-- 4. The wizard ------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select account_id from invited where label = 'amina'),
                    'role', 'authenticated', 'aal', 'aal1')::text, true);
select lives_ok(
  $$ select public.complete_onboarding(jsonb_build_object(
       'media_consent', false,
       'terms_version', '2026-07-01',
       'locale_shown', 'ca',
       'answers', pg_temp.answers(jsonb_build_object(
         'place_of_birth', 'Bamako', 'document_type', 'none', 'phone', '',
         'has_dependents', 'no', 'shoe_size', '39')))) $$,
  'she finishes the wizard answering only the gaps'
);
reset role;
select is(
  (select p.role || ' ' || p.first_name || ' ' || (pg_temp.stored(p.id, 'nationality') #>> '{}')
          || ' ' || (select o.key from public.custom_question_options o
                      where o.id::text = pg_temp.stored(p.id, 'clothing_size') #>> '{}')
          || ' ' || (select o.key from public.custom_question_options o
                      where o.id::text = pg_temp.stored(p.id, 'shoe_size') #>> '{}')
     from public.profiles p where p.id = (select account_id from invited where label = 'amina')),
  'player Amina Guinea M 39', 'stored values she was not asked are kept, and she is a player'
);
select ok(
  (select terms_accepted_at is not null from public.profiles
    where id = (select account_id from invited where label = 'amina')),
  'her consent is recorded'
);
select ok(
  (select accepted_at is not null from public.invites
    where id = (select invite_id from invited where label = 'amina')),
  'joining spends her invitation'
);
select is(
  (select source from public.custom_answers
    where profile_id = (select account_id from invited where label = 'amina') and question_id::text = pg_temp.field('shoe_size')),
  'player', 'her own answers are recorded as hers'
);
select is(
  (select source from public.custom_answers
    where profile_id = (select account_id from invited where label = 'amina') and question_id::text = pg_temp.field('clothing_size')),
  'staff', 'and the staff answers she kept stay as given by staff'
);

-- 5. Cancelled or expired -----------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into invited (label, invite_id)
select 'cancelled', invite_id from public.create_participant_invite(
  '{"email": "cancelled.prefill@example.test", "first_name": "Sara", "last_name": "Haile"}'::jsonb);
insert into invited (label, invite_id)
select 'expired', invite_id from public.create_participant_invite(
  '{"email": "expired.prefill@example.test", "first_name": "Lina", "last_name": "Omar"}'::jsonb);
select public.revoke_participant_invite((select invite_id from invited where label = 'cancelled'));

reset role;
select is(
  (select count(*)::integer from auth.users where email = 'cancelled.prefill@example.test'),
  0, 'cancelling the invitation removes her account'
);
select is(
  (select count(*)::integer from public.profiles where first_name = 'Sara' and last_name = 'Haile'),
  0, 'and her not-joined profile'
);

update public.invites set expires_at = now() - interval '1 day'
 where id = (select invite_id from invited where label = 'expired');
select is(
  private.purge_unjoined_participants(now()), 1,
  'the purge removes a woman whose invitation expired'
);
select is(
  (select count(*)::integer from auth.users where email = 'expired.prefill@example.test'),
  0, 'with her account'
);

select * from finish();
rollback;
