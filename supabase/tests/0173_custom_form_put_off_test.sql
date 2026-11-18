begin;
select plan(7);

-- "Ara no" puts a form off for later (RAPP-833).

select has_column('public', 'custom_form_responses', 'put_off_at', 'an ask records when she put it off');

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select throws_ok(
  $$ select public.put_off_custom_form('5eed0000-0000-4000-8102-000000000002') $$,
  '42501',
  'a form is put off by the player it asks',
  'another player cannot put her form off'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select is(
  (select public.my_put_off_custom_forms()),
  '{}'::uuid[],
  'she starts with nothing put off'
);
select lives_ok(
  $$ select public.put_off_custom_form('5eed0000-0000-4000-8102-000000000002') $$,
  'she puts her optional form off'
);
select is(
  (select public.my_put_off_custom_forms()),
  array['5eed0000-0000-4000-8102-000000000002']::uuid[],
  'the form is in her later list'
);
select ok(
  exists (select 1 from public.my_custom_forms() f
          where f.response_id = '5eed0000-0000-4000-8102-000000000002'),
  'and it is still open, so she can answer it'
);

select public.dismiss_custom_form('5eed0000-0000-4000-8102-000000000002');
select is(
  (select public.my_put_off_custom_forms()),
  '{}'::uuid[],
  'a deleted form leaves her later list'
);

select * from finish();
rollback;
