-- Entity service submissions, comments, contact reuse, and staff notifications (RAPP-43).
-- Runs with: bunx supabase test db

begin;
select plan(39);

select has_table(
  'public',
  'service_submission_notifications',
  'published entity edits have a durable staff notification queue'
);
select ok(
  (select relrowsecurity
   from pg_class
   where oid = 'public.service_submission_notifications'::regclass),
  'notification RLS is enabled'
);
select has_function(
  'public',
  'save_entity_service',
  array['jsonb'],
  'entity saves cross one server-owned publication boundary'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"5eed0000-0000-4000-8000-000000000004","role":"authenticated"}';

select lives_ok(
  $$ select public.save_entity_service(jsonb_build_object(
       'serviceId', null,
       'categoryId', '5eed0000-0000-4000-8009-000000000007',
       'title', 'Proposta Àgora <script>alert(1)</script>',
       'description', 'Activitat de prova',
       'providerName', 'Creu Roja Osona',
       'location', 'Vic',
       'zone', 'Osona',
       'costType', 'free',
       'costAmount', null,
       'costDetails', null,
       'contactName', 'Наталія Núria',
       'contactPhone', '+34 900 000 000',
       'contactEmail', 'natalia@example.test',
       'contactRole', 'Tècnica',
       'schedule', 'Matins',
       'externalUrl', 'https://example.test/entity-service',
       'availability', 'available',
       'metadata', '{"activity_type":"cultural","family_friendly":true}'::jsonb,
       'publishedAt', (now() + interval '7 days')::text,
       'expiresAt', (now() + interval '30 days')::text
     )) $$,
  'an entity can submit a valid category-driven service'
);
select is(
  (select status
   from public.services
   where title->>'ca' = 'Proposta Àgora <script>alert(1)</script>'),
  'pending',
  'a new entity submission is pending regardless of client intent'
);
select ok(
  (select published_at > now()
   from public.services
   where title->>'ca' = 'Proposta Àgora <script>alert(1)</script>'),
  'a pending submission preserves its requested scheduled publication time'
);
select throws_ok(
  $$ select public.save_entity_service(jsonb_build_object(
       'serviceId', null,
       'status', 'published'
     )) $$,
  '23514',
  null::text,
  'a client-supplied publication status is rejected before any write'
);

reset role;
set local request.jwt.claims = '{}';
insert into public.services (
  id, org_id, category_id, title, description, provider_name, cost_type,
  availability, metadata, status, published_at, submitted_by, created_by
)
values (
  '99000000-0000-4000-800a-000000000043',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8009-000000000007',
  '{"ca":"Publicat de l entitat","es":"Publicado por la entidad","en":"Entity published","ar":"منشور الكيان","fa":"منتشرشده نهاد"}',
  null,
  'Creu Roja Osona',
  'free',
  'available',
  '{"activity_type":"sports","family_friendly":true}',
  'published',
  now() + interval '10 days',
  '5eed0000-0000-4000-8000-000000000004',
  '5eed0000-0000-4000-8000-000000000004'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"5eed0000-0000-4000-8000-000000000004","role":"authenticated"}';
select lives_ok(
  $$ select public.save_entity_service(jsonb_build_object(
       'serviceId', '99000000-0000-4000-800a-000000000043',
       'categoryId', '5eed0000-0000-4000-8009-000000000007',
       'title', 'Edició publicada Àgora',
       'description', null,
       'providerName', 'Creu Roja Osona',
       'location', 'Vic',
       'zone', 'Osona',
       'costType', 'free',
       'costAmount', null,
       'costDetails', null,
       'contactName', 'Наталія Núria',
       'contactPhone', null,
       'contactEmail', 'natalia@example.test',
       'contactRole', null,
       'schedule', null,
       'externalUrl', null,
       'availability', 'available',
       'metadata', '{"activity_type":"cultural","family_friendly":true}'::jsonb,
       'publishedAt', (now() + interval '20 days')::text,
       'expiresAt', null
     )) $$,
  'an entity can edit its own published service'
);
reset role;

select is(
  (select status || '|' || (published_at <= now())::text || '|' ||
          (select count(*) from jsonb_object_keys(title))
   from public.services
   where id = '99000000-0000-4000-800a-000000000043'),
  'published|true|5',
  'a published edit is live immediately while preserving existing translations'
);
select is(
  (select count(*)
   from public.service_submission_notifications
   where service_id = '99000000-0000-4000-800a-000000000043'
     and kind = 'published_edit')::int,
  1,
  'a published entity edit creates exactly one staff notification'
);

set local request.jwt.claims = '{}';
insert into public.services (
  id, org_id, category_id, title, cost_type, availability, metadata,
  status, submitted_by, created_by, contact_name, contact_email
)
values (
  '99000000-0000-4000-800a-000000000044',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8009-000000000007',
  '{"ca":"Proposta aliena"}',
  'free',
  'available',
  '{"activity_type":"sports","family_friendly":true}',
  'draft',
  '5eed0000-0000-4000-8000-000000000005',
  '5eed0000-0000-4000-8000-000000000005',
  'Contacte Aliè',
  'alien@example.test'
);

select has_function(
  'public',
  'get_own_service_contacts',
  array[]::text[],
  'contact reuse has a server-scoped no-argument boundary'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"5eed0000-0000-4000-8000-000000000004","role":"authenticated"}';
select ok(
  exists (
    select 1 from public.get_own_service_contacts()
    where contact_name = 'Наталія Núria'
  ),
  'the entity can reuse an accented and Cyrillic contact from its own submission'
);
select ok(
  not exists (
    select 1 from public.get_own_service_contacts()
    where contact_email = 'alien@example.test'
       or contact_name = 'Anna Serra'
  ),
  'autocomplete excludes another entity and contacts from public directory records'
);

set local request.jwt.claims =
  '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select * from public.get_own_service_contacts() $$,
  '42501',
  null::text,
  'staff cannot widen the entity-only contact reuse function'
);

set local request.jwt.claims =
  '{"sub":"5eed0000-0000-4000-8000-000000000004","role":"authenticated"}';
select throws_ok(
  $$ update public.services set provider_name = 'No editable'
     where id = '5eed0000-0000-4000-800a-000000000001' $$,
  '42501',
  null::text,
  'a pending entity submission is read-only during staff review'
);
select throws_ok(
  $$ update public.services set provider_name = 'No editable'
     where id = '5eed0000-0000-4000-800a-000000000011' $$,
  '42501',
  null::text,
  'an approved entity submission stays read-only until staff publication'
);

set local request.jwt.claims =
  '{"sub":"5eed0000-0000-4000-8000-000000000005","role":"authenticated"}';
select lives_ok(
  $$ select public.save_entity_service(jsonb_build_object(
       'serviceId', '5eed0000-0000-4000-800a-000000000002',
       'categoryId', '5eed0000-0000-4000-8009-000000000001',
       'title', 'Pis temporal confirmat',
       'description', 'Disponibilitat confirmada',
       'providerName', 'CEAR Catalunya',
       'location', 'Manlleu',
       'zone', 'Osona',
       'costType', 'subsidized',
       'costAmount', 180,
       'costDetails', null,
       'contactName', 'Jordi Camps',
       'contactPhone', '+34938850001',
       'contactEmail', 'jordi.camps@example.test',
       'contactRole', 'Referent',
       'schedule', 'Matins',
       'externalUrl', 'https://example.test/pis-confirmat',
       'availability', 'available',
       'metadata', '{"housing_type":"apartment","duration":"temporary","deposit_required":true,"deposit_amount":300,"for_whom":"families"}'::jsonb,
       'publishedAt', null,
       'expiresAt', null
     )) $$,
  'a rejected submission can be corrected and resubmitted'
);
select is(
  (select status || '|' || (rejection_reason is null)::text
   from public.services
   where id = '5eed0000-0000-4000-800a-000000000002'),
  'pending|true',
  'resubmission returns to pending and clears the previous rejection reason'
);
reset role;

select has_table(
  'public',
  'service_submission_comments',
  'service submissions have one shared entity and staff comment thread'
);
select has_column(
  'public',
  'service_submission_comments',
  'is_internal',
  'staff notes are explicitly classified at the database boundary'
);
select ok(
  (select relrowsecurity
   from pg_class
   where oid = 'public.service_submission_comments'::regclass),
  'comment RLS is enabled'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"5eed0000-0000-4000-8000-000000000004","role":"authenticated"}';
select lives_ok(
  $$ insert into public.service_submission_comments (service_id, body)
     values (
       '5eed0000-0000-4000-800a-000000000001',
       'Dubte Àgora <script>alert(1)</script> Наталія العربية'
     ) $$,
  'an entity can add a public comment to its own submission'
);
select is(
  (select body from public.service_submission_comments
   where service_id = '5eed0000-0000-4000-800a-000000000001'),
  'Dubte Àgora <script>alert(1)</script> Наталія العربية',
  'hostile and multilingual comment text is preserved as inert data'
);
select throws_ok(
  $$ insert into public.service_submission_comments (service_id, body, is_internal)
     values (
       '5eed0000-0000-4000-800a-000000000001',
       'No ha de sortir',
       true
     ) $$,
  '42501',
  null::text,
  'an entity cannot create an internal note'
);
select throws_ok(
  $$ insert into public.service_submission_comments (service_id, body)
     values ('5eed0000-0000-4000-800a-000000000002', 'Comentari aliè') $$,
  '42501',
  null::text,
  'an entity cannot comment on another entity submission'
);
select is(
  (select count(*) from public.service_submission_notifications)::int,
  0,
  'an entity cannot read the staff notification created by its published edit'
);

set local request.jwt.claims =
  '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok(
  $$ insert into public.service_submission_comments (service_id, body, is_internal)
     values (
       '5eed0000-0000-4000-800a-000000000001',
       'Nota interna de revisió',
       true
     ) $$,
  'staff can add an internal note to an entity submission'
);
select is(
  (select count(*) from public.service_submission_comments
   where service_id = '5eed0000-0000-4000-800a-000000000001')::int,
  2,
  'staff sees the public comment and the internal note'
);

set local request.jwt.claims =
  '{"sub":"5eed0000-0000-4000-8000-000000000004","role":"authenticated"}';
select is(
  (select count(*) from public.service_submission_comments
   where service_id = '5eed0000-0000-4000-800a-000000000001')::int,
  1,
  'DENIAL: the entity thread excludes the internal note'
);
select ok(
  not exists (
    select 1 from public.service_submission_comments where is_internal
  ),
  'DENIAL: no internal note is enumerable anywhere in the entity session'
);

set local request.jwt.claims =
  '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated"}';
select is(
  (select count(*) from public.service_submission_comments)::int,
  0,
  'a player cannot read entity and staff submission conversations'
);
reset role;
set local request.jwt.claims = '{}';

insert into public.services (
  id, org_id, category_id, title, cost_type, availability, metadata,
  status, submitted_by, created_by
)
values (
  '99000000-0000-4000-800a-000000000045',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8009-000000000007',
  '{"ca":"Esborrany eliminable"}',
  'free',
  'available',
  '{"activity_type":"sports","family_friendly":true}',
  'draft',
  '5eed0000-0000-4000-8000-000000000004',
  '5eed0000-0000-4000-8000-000000000004'
);
insert into public.service_submission_comments (
  id, org_id, service_id, author_id, author_role, body
)
values (
  '99000000-0000-4000-800d-000000000045',
  '5eed0000-0000-4000-8000-000000000000',
  '99000000-0000-4000-800a-000000000045',
  '5eed0000-0000-4000-8000-000000000004',
  'entity',
  'Elimina el fil'
);
insert into public.service_submission_notifications (
  id, org_id, service_id, kind, created_by
)
values (
  '99000000-0000-4000-800e-000000000045',
  '5eed0000-0000-4000-8000-000000000000',
  '99000000-0000-4000-800a-000000000045',
  'published_edit',
  '5eed0000-0000-4000-8000-000000000004'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"5eed0000-0000-4000-8000-000000000004","role":"authenticated"}';
select lives_ok(
  $$ delete from public.services
     where id = '99000000-0000-4000-800a-000000000045' $$,
  'an entity can delete its own draft submission'
);
reset role;
select is(
  (select count(*) from public.service_submission_comments
   where service_id = '99000000-0000-4000-800a-000000000045')::int,
  0,
  'deleting a submission cascades to its comment thread'
);
select is(
  (select count(*) from public.service_submission_notifications
   where service_id = '99000000-0000-4000-800a-000000000045')::int,
  0,
  'deleting a submission cascades to its staff notifications'
);

select is(
  (select disposition from public.personal_data_disposition()
   where table_name = 'service_submission_comments'),
  'not_personal',
  'entity and staff service comments are classified in the erasure registry'
);
select is(
  (select disposition from public.personal_data_disposition()
   where table_name = 'service_submission_notifications'),
  'not_personal',
  'staff service notifications are classified in the erasure registry'
);

set local request.jwt.claims = '{}';
insert into public.services (
  id, org_id, category_id, title, cost_type, availability, metadata,
  status, submitted_by, created_by, reviewed_by, reviewed_at, rejection_reason
)
values (
  '99000000-0000-4000-800a-000000000046',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8009-000000000007',
  '{"ca":"Rebutjat per reenviar"}',
  'free',
  'available',
  '{"activity_type":"social","family_friendly":true}',
  'rejected',
  '5eed0000-0000-4000-8000-000000000004',
  '5eed0000-0000-4000-8000-000000000004',
  '5eed0000-0000-4000-8000-000000000002',
  now(),
  'Confirma la data'
);
select has_function(
  'public',
  'resubmit_entity_service',
  array['uuid'],
  'rejected submissions have a dedicated server-owned resubmit action'
);
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"5eed0000-0000-4000-8000-000000000004","role":"authenticated"}';
select lives_ok(
  $$ select public.resubmit_entity_service(
       '99000000-0000-4000-800a-000000000046'
     ) $$,
  'the entity can resubmit its rejected service without client-owned status'
);
select is(
  (select status || '|' || (rejection_reason is null)::text
   from public.services
   where id = '99000000-0000-4000-800a-000000000046'),
  'pending|true',
  'the dedicated resubmit action returns to pending and clears review fields'
);
reset role;

select * from finish();
rollback;
