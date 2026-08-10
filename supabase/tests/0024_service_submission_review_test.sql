-- Staff submission review queue, decisions, comments, and entity notifications (RAPP-44).

begin;
select plan(26);

select has_function(
  'public',
  'review_entity_service',
  array['uuid', 'text', 'jsonb', 'text'],
  'staff decisions cross one atomic server-owned review boundary'
);

select has_column(
  'public',
  'service_submission_notifications',
  'previous_service',
  'live-edit notifications preserve the service before the entity edit'
);
select has_column(
  'public',
  'service_submission_notifications',
  'current_service',
  'live-edit notifications preserve the service after the entity edit'
);

set local request.jwt.claims = '{}';
insert into public.services (
  id, org_id, category_id, title, provider_name, cost_type, availability,
  metadata, status, published_at, submitted_by, created_by
)
values (
  '99440000-0000-4000-800a-000000000001',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8009-000000000007',
  '{"ca":"Servei abans","es":"Servicio antes","en":"Service before","ar":"الخدمة من قبل","fa":"خدمات قبلی"}',
  'Entitat abans',
  'free',
  'available',
  '{"activity_type":"sports","family_friendly":true}',
  'published',
  now() - interval '1 day',
  '5eed0000-0000-4000-8000-000000000004',
  '5eed0000-0000-4000-8000-000000000004'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"5eed0000-0000-4000-8000-000000000004","role":"authenticated"}';
select public.save_entity_service(jsonb_build_object(
  'serviceId', '99440000-0000-4000-800a-000000000001',
  'categoryId', '5eed0000-0000-4000-8009-000000000007',
  'title', 'Servei després Àgora <script>alert(1)</script>',
  'description', null,
  'providerName', 'Entitat després',
  'location', 'Vic',
  'zone', 'Osona',
  'costType', 'free',
  'costAmount', null,
  'costDetails', null,
  'contactName', 'Наталія Zoë',
  'contactPhone', null,
  'contactEmail', null,
  'contactRole', null,
  'schedule', null,
  'externalUrl', null,
  'availability', 'available',
  'metadata', '{"activity_type":"cultural","family_friendly":true}'::jsonb,
  'publishedAt', null,
  'expiresAt', null
));
reset role;

set local request.jwt.claims = '{}';
insert into public.services (
  id, org_id, category_id, title, provider_name, cost_type, availability,
  metadata, status, submitted_by, created_by
)
values (
  '99440000-0000-4000-800a-000000000004',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8009-000000000007',
  '{"ca":"Proposta per rebutjar"}',
  'Entitat Àgora',
  'free',
  'available',
  '{"activity_type":"sports","family_friendly":true}',
  'pending',
  '5eed0000-0000-4000-8000-000000000004',
  '5eed0000-0000-4000-8000-000000000004'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select public.review_entity_service(
    '99440000-0000-4000-800a-000000000004',
    'reject',
    null,
    '   '
  ) $$,
  '23514',
  'rejection requires a human comment',
  'staff cannot silently reject an entity submission'
);
select lives_ok(
  $$ select public.review_entity_service(
    '99440000-0000-4000-800a-000000000004',
    'reject',
    null,
    'Cal confirmar el telèfon amb la coordinadora Zoë.'
  ) $$,
  'staff can reject with a human comment in the shared thread'
);
reset role;

select is(
  (select status || '|' || rejection_reason
   from public.services
   where id = '99440000-0000-4000-800a-000000000004'),
  'rejected|Cal confirmar el telèfon amb la coordinadora Zoë.',
  'rejection records the reviewed state and same human reason'
);
select is(
  (select notification.kind || '|' || comment.body
   from public.service_submission_notifications as notification
   join public.service_submission_comments as comment
     on comment.id = notification.decision_comment_id
   where notification.service_id = '99440000-0000-4000-800a-000000000004'),
  'rejected|Cal confirmar el telèfon amb la coordinadora Zoë.',
  'rejection creates the linked decision notification and public thread comment'
);

set local request.jwt.claims = '{}';
insert into public.services (
  id, org_id, category_id, title, provider_name, contact_name, cost_type,
  availability, metadata, status, submitted_by, created_by
)
values (
  '99440000-0000-4000-800a-000000000003',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8009-000000000007',
  '{"ca":"Proposta pendent per aprovar"}',
  'Versió de l’entitat',
  'Zoë',
  'free',
  'available',
  '{"activity_type":"social","family_friendly":true}',
  'pending',
  '5eed0000-0000-4000-8000-000000000004',
  '5eed0000-0000-4000-8000-000000000004'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok(
  $$ select public.review_entity_service(
    '99440000-0000-4000-800a-000000000003',
    'approve',
    jsonb_build_object(
      'serviceId', '99440000-0000-4000-800a-000000000003',
      'categoryId', '5eed0000-0000-4000-8009-000000000007',
      'title', '{"ca":"Proposta Àgora revisada","es":"Propuesta Àgora revisada","en":"Reviewed Àgora proposal","ar":"اقتراح أغورا المنقح","fa":"پیشنهاد بازبینی شده آگورا"}'::jsonb,
      'description', null,
      'providerName', 'Edició final de l’equip',
      'location', 'Vic',
      'zone', 'Osona',
      'costType', 'free',
      'costAmount', null,
      'costDetails', null,
      'contactName', 'Наталія Zoë',
      'contactPhone', null,
      'contactEmail', null,
      'contactRole', null,
      'schedule', null,
      'externalUrl', null,
      'availability', 'available',
      'metadata', '{"activity_type":"social","family_friendly":true}'::jsonb,
      'status', 'published',
      'publishedAt', now()::text,
      'expiresAt', null,
      'images', '[]'::jsonb
    ),
    'Aprovat després de la revisió humana.'
  ) $$,
  'staff can approve and publish a pending entity submission atomically'
);
reset role;

select is(
  (select
     status || '|' || provider_name || '|' ||
     (select count(*) from jsonb_object_keys(title))::text || '|' ||
     reviewed_by::text
   from public.services
   where id = '99440000-0000-4000-800a-000000000003'),
  'published|Edició final de l’equip|5|5eed0000-0000-4000-8000-000000000002',
  'approval publishes the complete translation review and preserves staff edits'
);
select is(
  (select kind || '|' || recipient_id::text
   from public.service_submission_notifications
   where service_id = '99440000-0000-4000-800a-000000000003'
     and kind = 'approved'),
  'approved|5eed0000-0000-4000-8000-000000000004',
  'approval creates one decision notification for the submitting entity'
);
select is(
  (select comment.body
   from public.service_submission_notifications as notification
   join public.service_submission_comments as comment
     on comment.id = notification.decision_comment_id
   where notification.service_id = '99440000-0000-4000-800a-000000000003'
     and notification.kind = 'approved'),
  'Aprovat després de la revisió humana.',
  'the optional approval comment is recorded in the shared entity-visible thread'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok(
  $$ insert into public.service_submission_comments (service_id, body, is_internal)
     values (
       '99440000-0000-4000-800a-000000000004',
       'Nota interna: trucar a la coordinadora abans de reobrir.',
       true
     ) $$,
  'staff can add an internal note from the review thread'
);
reset role;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"5eed0000-0000-4000-8000-000000000004","role":"authenticated"}';
select is(
  (select count(*)::integer
   from public.service_submission_notifications
   where kind in ('approved', 'rejected')),
  2,
  'the submitting entity can read its approval and rejection decision records'
);
select is(
  (select count(*)::integer
   from public.service_submission_comments
   where service_id = '99440000-0000-4000-800a-000000000004'),
  1,
  'the entity sees the rejection comment but not the internal staff note'
);
select is(
  (select body
   from public.service_submission_comments
   where service_id = '99440000-0000-4000-800a-000000000004'),
  'Cal confirmar el telèfon amb la coordinadora Zoë.',
  'the entity-visible decision comment preserves the human explanation'
);
select ok(
  not exists (
    select 1
    from public.service_submission_comments
    where is_internal
  ),
  'DENIAL: internal notes are not enumerable in the entity session'
);
reset role;

select has_column(
  'public',
  'service_submission_notifications',
  'recipient_id',
  'a review decision records its entity recipient'
);
select has_column(
  'public',
  'service_submission_notifications',
  'decision_comment_id',
  'a review decision links to the entity-visible thread comment'
);

select is(
  (select
     (previous_service->>'provider_name') || '|' ||
     (current_service->>'provider_name') || '|' ||
     (previous_service->'title'->>'ca') || '|' ||
     (current_service->'title'->>'ca')
   from public.service_submission_notifications
   where service_id = '99440000-0000-4000-800a-000000000001'
     and kind = 'published_edit'),
  'Entitat abans|Entitat després|Servei abans|Servei després Àgora <script>alert(1)</script>',
  'a live-edit notification stores the exact before and after values for the staff diff'
);

select has_function(
  'public',
  'get_service_review_queue',
  array['text', 'uuid', 'text', 'integer'],
  'the review queue has one server-owned ordering and filter boundary'
);

set local request.jwt.claims = '{}';
insert into public.services (
  id, org_id, category_id, title, provider_name, contact_name, cost_type,
  availability, metadata, status, submitted_by, created_by, created_at, updated_at
)
values (
  '99440000-0000-4000-800a-000000000002',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8009-000000000007',
  '{"ca":"Proposta Àgora <script>alert(1)</script>"}',
  'Associació Àgora',
  'Наталія Zoë',
  'free',
  'available',
  '{"activity_type":"social","family_friendly":true}',
  'pending',
  '5eed0000-0000-4000-8000-000000000004',
  '5eed0000-0000-4000-8000-000000000004',
  now() - interval '4 days',
  now() - interval '4 days'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select item_kind
   from public.get_service_review_queue('all', null, '', 1)
   limit 1),
  'pending',
  'pending submissions sort before published live-edit notifications'
);
select is(
  (select service_id
   from public.get_service_review_queue(
     'pending',
     '5eed0000-0000-4000-8009-000000000007',
     'Proposta Àgo',
     1
   )),
  '99440000-0000-4000-800a-000000000002'::uuid,
  'category and half-typed accented text filters reach the product query'
);
select is(
  (select count(*)::integer
   from public.get_service_review_queue(
     'all',
     null,
     $$%') OR true; -- <script>alert(1)</script>$$,
     1
   )),
  0,
  'hostile queue text remains inert and produces an empty result'
);
select is(
  (select service_id
   from public.get_service_review_queue('published_edit', null, 'després', 1)
   where service_id = '99440000-0000-4000-800a-000000000001'),
  '99440000-0000-4000-800a-000000000001'::uuid,
  'the live-edit filter surfaces the durable staff notification'
);
reset role;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"5eed0000-0000-4000-8000-000000000004","role":"authenticated"}';
select throws_ok(
  $$ select public.review_entity_service(
    '99440000-0000-4000-800a-000000000002',
    'approve',
    null,
    null
  ) $$,
  '42501',
  'only staff may review entity service submissions',
  'DENIAL: an entity cannot approve any submission, including its own'
);
select throws_ok(
  $$ select * from public.get_service_review_queue('all', null, '', 1) $$,
  '42501',
  'only staff may read the service review queue',
  'DENIAL: an entity cannot call the staff review queue boundary'
);
reset role;

select * from finish();
rollback;
