-- Withdrawing the health data consent erases her health answer (RAPP-614,
-- pending fix 25, GDPR art. 9 and 7(3)).
-- Run with: bunx supabase test db
--
-- What these assertions defend: when she withdraws `health_data` from her
-- profile, her stored health answer is deleted in the same transaction and
-- the erasure is audited with ids only. Withdrawing another consent keeps it.
--
-- Seed: admin ...001, real player ...011, organization ...000, the current
-- season with authorization version 1 (health consent required).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(8);

create temp table run (label text primary key, content jsonb) on commit drop;
grant all on run to authenticated;
-- Version 2: the health question and its consent optional, so she may withdraw it.
insert into run (label, content)
select 'v2', jsonb_set(jsonb_set(content, '{questions,health,required}', 'false'),
                       '{consents,health_data,required}', 'false')
  from public.authorization_versions where version_number = 1
   and org_id = '5eed0000-0000-4000-8000-000000000000';

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok($$ select public.publish_authorization_version((select content from run where label = 'v2')) $$,
  'an admin publishes a version where the health consent is optional');
reset role;

-- Her health answer, an answer to the authorization's field (RAPP-698).
select private.write_custom_answer('5eed0000-0000-4000-8000-000000000011',
  private.authorization_field('5eed0000-0000-4000-8000-000000000000', 'health_info'), '"Asma lleu"', 'player', null);
insert into run (label, content)
select 'health', to_jsonb((private.authorization_field('5eed0000-0000-4000-8000-000000000000', 'health_info')).id);
insert into public.consent_events (org_id, profile_id, consent_key, granted, method)
values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-000000000011', 'health_data', true, 'profile');

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select lives_ok($$ select public.set_optional_consent('newsletter', false, 'ca') $$,
  'she withdraws another consent');
reset role;
select ok(
  exists (select 1 from public.custom_answers
           where profile_id = '5eed0000-0000-4000-8000-000000000011'
             and question_id = (select (content #>> '{}')::uuid from run where label = 'health')),
  'her health answer stays'
);

set local role authenticated;
select lives_ok($$ select public.set_optional_consent('health_data', false, 'ca') $$,
  'she withdraws the health data consent');
reset role;
select ok(
  not exists (select 1 from public.custom_answers
               where profile_id = '5eed0000-0000-4000-8000-000000000011'
                 and question_id = (select (content #>> '{}')::uuid from run where label = 'health')),
  'her health answer is deleted in the same transaction'
);
select is(
  (select changes from public.audit_log
    where action = 'consent.health_answer_erased' and target_id = '5eed0000-0000-4000-8000-000000000011'),
  '{"consent": "health_data"}'::jsonb,
  'the erasure is audited with ids only'
);
select is(
  (select granted from public.consent_events
    where profile_id = '5eed0000-0000-4000-8000-000000000011' and consent_key = 'health_data'
    order by decided_at desc, id desc limit 1),
  false,
  'and her withdrawal is recorded'
);

set local role authenticated;
select lives_ok($$ select public.set_optional_consent('health_data', false, 'ca') $$,
  'withdrawing again with nothing stored still works');

select * from finish();
rollback;
