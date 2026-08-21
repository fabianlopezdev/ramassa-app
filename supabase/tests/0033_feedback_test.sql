-- Typed feedback, player privacy, staff transitions, private images, and chat handoff (RAPP-58).
begin;
select plan(19);

select has_table('public', 'feedback_submissions', 'feedback submissions exist');
select is(
  (select disposition || ':' || participant_column
   from public.personal_data_disposition()
   where table_name = 'feedback_submissions'),
  'purge:author_id',
  'feedback is registered for participant erasure'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000012","role":"authenticated"}';

select lives_ok(
  $$ select public.create_feedback_submission(
    'activity_proposal',
    'Organitzeu una activitat de conversa.',
    null
  ) $$,
  'a player can submit typed feedback'
);

select throws_ok(
  $$ select public.create_feedback_submission('complaint', 'Missatge', null) $$,
  '23514',
  'invalid feedback submission',
  'DENIAL: unknown feedback types are rejected'
);

select throws_ok(
  $$ insert into public.feedback_submissions (org_id, author_id, type, content_encrypted)
     values (
       '5eed0000-0000-4000-8000-000000000001',
       '5eed0000-0000-4000-8000-000000000012',
       'general',
       decode('00', 'hex')
     ) $$,
  '42501',
  null,
  'DENIAL: players cannot bypass the validated creation RPC'
);

select is(
  (select count(*) from public.list_own_feedback_submissions())::integer,
  1,
  'the player can list only her own feedback'
);

select is(
  (select content from public.list_own_feedback_submissions() limit 1),
  'Organitzeu una activitat de conversa.',
  'the player receives her decrypted feedback content'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000013","role":"authenticated"}';
select is(
  (select count(*) from public.feedback_submissions)::integer,
  0,
  'DENIAL: another player cannot see the submission'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000004","role":"authenticated"}';
select is(
  (select count(*) from public.feedback_submissions)::integer,
  0,
  'DENIAL: entity users cannot see player feedback'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select count(*) from public.list_staff_feedback_submissions(null, null)
   where author_id = '5eed0000-0000-4000-8000-000000000012')::integer,
  1,
  'staff can list the organization feedback inbox'
);

select is(
  (select count(*) from public.list_staff_feedback_submissions('activity_proposal', 'new'))::integer,
  1,
  'staff can filter the inbox by type and state'
);

select is(
  (select count(*) from public.participant_activity('5eed0000-0000-4000-8000-000000000012')
   where kind = 'feedback')::integer,
  1,
  'staff see feedback in the participant timeline'
);

select lives_ok(
  $$ select public.transition_feedback_submission(
    (select id from public.feedback_submissions where author_id = '5eed0000-0000-4000-8000-000000000012'),
    'read'
  ) $$,
  'staff can mark feedback read'
);

select lives_ok(
  $$ select public.transition_feedback_submission(
    (select id from public.feedback_submissions where author_id = '5eed0000-0000-4000-8000-000000000012'),
    'in_progress'
  ) $$,
  'staff can move feedback into progress'
);

select lives_ok(
  $$ select public.transition_feedback_submission(
    (select id from public.feedback_submissions where author_id = '5eed0000-0000-4000-8000-000000000012'),
    'resolved'
  ) $$,
  'staff can resolve feedback'
);

select throws_ok(
  $$ select public.transition_feedback_submission(
    (select id from public.feedback_submissions where author_id = '5eed0000-0000-4000-8000-000000000012'),
    'read'
  ) $$,
  '23514',
  'invalid feedback state transition',
  'DENIAL: resolved feedback cannot move backward'
);

select is(
  (select (conversation_id is not null)::text
   from public.list_staff_feedback_submissions(null, null)
   where author_id = '5eed0000-0000-4000-8000-000000000012'),
  'true',
  'the staff inbox deep-links to the existing participant conversation'
);

select is(
  (select count from public.feedback_monthly_counts()
   where type = 'activity_proposal' and month = date_trunc('month', now())::date),
  2::bigint,
  'staff receive simple monthly counts by type'
);

select is(
  public.can_read_feedback_object(
    '5eed0000-0000-4000-8000-000000000001/feedback/5eed0000-0000-4000-8000-000000000012/2026/08/0123456789abcdef0123456789abcdef.jpg'
  ),
  false,
  'an unattached object key is not readable'
);

select * from finish();
rollback;
