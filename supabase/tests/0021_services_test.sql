-- Hybrid services directory schema, metadata validation, RLS, indexes, and deletion.
-- Runs with: bunx supabase test db

begin;
select plan(60);

select has_table('public', 'service_categories', 'service categories exist');
select has_table('public', 'services', 'services exist');
select has_table('public', 'service_images', 'ordered service images exist');
select has_table('public', 'service_interests', 'player service interests exist');

select has_column('public', 'service_categories', 'metadata_schema', 'categories own metadata definitions');
select has_column('public', 'services', 'metadata', 'category-specific data uses JSONB');
select has_column('public', 'services', 'cost_type', 'cost is a shared structured field');
select has_column('public', 'services', 'location', 'location is shared');
select has_column('public', 'services', 'zone', 'zone is shared and filterable');
select has_column('public', 'services', 'contact_email', 'contact data is shared');
select has_column('public', 'services', 'schedule', 'schedule is shared');
select has_column('public', 'services', 'availability', 'availability is shared and filterable');
select has_column('public', 'services', 'status', 'submission and publication state is explicit');
select has_column('public', 'services', 'published_at', 'service publication can be scheduled');
select has_column('public', 'services', 'expires_at', 'service publication can expire');
select has_column('public', 'service_images', 'alt_text', 'service image alt text is multilingual');
select has_column('public', 'service_images', 'position', 'service images have deterministic order');

select ok((select relrowsecurity from pg_class where oid = 'public.service_categories'::regclass), 'category RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.services'::regclass), 'service RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.service_images'::regclass), 'image RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.service_interests'::regclass), 'interest RLS is enabled');

select is(
  (select array_agg(slug order by sort_order) from public.service_categories),
  array['housing','language-courses','job-insertion','legal-aid','health','training','leisure-culture','documentation']::text[],
  'the eight category definitions are seeded in product order'
);

select is_empty(
  $$ select category_id
     from public.services
     group by category_id
     having count(*) not between 2 and 3 $$,
  'every category has two or three realistic service fixtures'
);

select is(
  (select count(*) from public.services where metadata @> '{"housing_type":"shared_flat","for_whom":"women_only"}'::jsonb)::int,
  1,
  'a GIN-compatible containment filter finds the intended housing service'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'services'
      and indexname = 'services_metadata_gin_idx'
      and indexdef like '%USING gin (metadata jsonb_path_ops)%'
  ),
  'metadata has the jsonb_path_ops GIN index used by containment filters'
);

set local enable_seqscan = off;
create function pg_temp.service_filter_plan()
returns jsonb
language plpgsql
as $$
declare
  query_plan json;
begin
  execute $query$
    explain (format json)
    select id from public.services
    where metadata @> '{"housing_type":"shared_flat"}'::jsonb
  $query$ into query_plan;
  return query_plan::jsonb;
end;
$$;
select ok(
  pg_temp.service_filter_plan()::text like '%services_metadata_gin_idx%',
  'the containment query has an executable GIN index path'
);
set local enable_seqscan = on;

select throws_ok(
  $$ insert into public.services
       (category_id, title, status, metadata)
     select id, '{"ca":"Metadades incorrectes"}', 'draft', '{"housing_type":"hotel"}'::jsonb
     from public.service_categories where slug = 'housing' $$,
  '23514',
  null::text,
  'the database rejects metadata outside the selected category definition'
);

select throws_ok(
  $$ insert into public.services
       (category_id, title, status, metadata)
     select id, '{"ca":"Clau desconeguda"}', 'draft',
       '{"housing_type":"room","duration":"temporary","deposit_required":false,"for_whom":"any","unknown":true}'::jsonb
     from public.service_categories where slug = 'housing' $$,
  '23514',
  null::text,
  'the database rejects undeclared metadata keys'
);

insert into public.organizations (id, name, slug)
values ('5eed0000-0000-4000-8000-999999999999', 'Another club', 'services-other-club');

insert into public.service_categories
  (id, org_id, name, slug, icon, color, sort_order, metadata_schema)
values (
  '99000000-0000-4000-8000-000000000001',
  '5eed0000-0000-4000-8000-999999999999',
  '{"ca":"Altra categoria","es":"Otra categoría","en":"Other category","ar":"فئة أخرى","fa":"دسته دیگر"}',
  'other-service-category', 'circle', 'primary', 10,
  '{"fields":[]}'::jsonb
);

insert into public.services
  (id, org_id, category_id, title, status, published_at, metadata)
values (
  '99000000-0000-4000-8000-000000000002',
  '5eed0000-0000-4000-8000-999999999999',
  '99000000-0000-4000-8000-000000000001',
  '{"ca":"Servei aliè","es":"Servicio ajeno","en":"Other service","ar":"خدمة أخرى","fa":"خدمات دیگر"}',
  'published', now() - interval '1 day', '{}'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated"}';

select throws_ok(
  $$ select public.save_admin_service('{}'::jsonb) $$,
  '42501',
  null::text,
  'a player is denied by the product write RPC before payload handling'
);

select is(
  (select count(*) from public.services where status <> 'published')::int,
  0,
  'a player reads no draft, pending, approved, or rejected service'
);
select is(
  (select count(*) from public.services where published_at > now() or expires_at <= now())::int,
  0,
  'a player reads no scheduled or expired service'
);
select is(
  (select count(*) from public.services where org_id <> '5eed0000-0000-4000-8000-000000000000')::int,
  0,
  'a player cannot cross the tenant boundary'
);
select is(
  (select count(*) from public.service_images image
   join public.services service on service.id = image.service_id
   where not public.is_content_visible(service.status, service.published_at, service.expires_at))::int,
  0,
  'a player sees images only for visible services'
);

select lives_ok(
  $$ insert into public.service_interests (service_id)
     select id from public.services
     where title->>'ca' = 'Habitació compartida per a dones' $$,
  'a player can mark interest in a visible service'
);
select is(
  (select count(*) from public.service_interests where user_id = '5eed0000-0000-4000-8000-000000000011')::int,
  1,
  'a player reads her own interest only'
);
select throws_ok(
  $$ insert into public.services (category_id, title, status, metadata)
     select id, '{"ca":"No"}', 'draft',
       '{"housing_type":"room","duration":"temporary","deposit_required":false,"for_whom":"women_only"}'::jsonb
     from public.service_categories where slug = 'housing' $$,
  '42501',
  null::text,
  'a player cannot create a service submission'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000004","role":"authenticated"}';

select ok(
  exists (select 1 from public.services where id = '5eed0000-0000-4000-800a-000000000001'),
  'an entity reads her own non-published submission'
);
select ok(
  not exists (select 1 from public.services where id = '5eed0000-0000-4000-800a-000000000002'),
  'an entity cannot read another entity submission'
);
select ok(
  exists (select 1 from public.services where title->>'ca' = 'Habitació compartida per a dones'),
  'an entity also reads the published directory'
);
select lives_ok(
  $$ insert into public.services
       (category_id, title, status, submitted_by, created_by, metadata)
     select id, '{"ca":"Proposta pròpia"}', 'draft', auth.uid(), auth.uid(),
       '{"housing_type":"room","duration":"temporary","deposit_required":false,"for_whom":"women_only"}'::jsonb
     from public.service_categories where slug = 'housing' $$,
  'an entity can create her own draft submission'
);
select throws_ok(
  $$ update public.services set status = 'published', published_at = now()
     where title->>'ca' = 'Proposta pròpia' $$,
  '42501',
  null::text,
  'an entity cannot publish a new submission without staff review'
);
select throws_ok(
  $$ insert into public.service_interests (service_id)
     select id from public.services where title->>'ca' = 'Habitació compartida per a dones' $$,
  '42501',
  null::text,
  'an entity cannot create a player interest'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';

select throws_ok(
  $$ update public.service_categories
     set metadata_schema = '{"fields":[{"key":"housing_type","label":{"ca":"Tipus","es":"Tipo","en":"Type","ar":"النوع","fa":"نوع"},"type":"select","required":true,"filterable":true,"options":["room"]}]}'::jsonb
     where slug = 'housing' $$,
  '23514',
  null::text,
  'an incompatible category schema edit is rejected before existing metadata is invalidated'
);

select ok(
  public.count_services_incompatible_with_category_schema(
    (select id from public.service_categories where slug = 'housing'),
    '{"fields":[{"key":"housing_type","label":{"ca":"Tipus","es":"Tipo","en":"Type","ar":"النوع","fa":"نوع"},"type":"select","required":true,"filterable":true,"options":["room"]}]}'::jsonb
  ) > 0,
  'staff can preview the number of services an incompatible schema edit would affect'
);

select lives_ok(
  $$ select public.reorder_service_categories(
       array(select id from public.service_categories order by sort_order desc)
     ) $$,
  'staff can reorder the full service category catalog atomically'
);
select is(
  (select slug from public.service_categories order by sort_order, id limit 1),
  'documentation',
  'category order round trips through the reorder RPC'
);

select throws_ok(
  $$ select public.save_admin_service(jsonb_build_object(
       'serviceId', null,
       'categoryId', (select id from public.service_categories where slug = 'housing'),
       'title', '{"ca":"Metadades hostils"}'::jsonb,
       'description', null,
       'providerName', null,
       'location', null,
       'zone', null,
       'costType', 'free',
       'costAmount', null,
       'costDetails', null,
       'contactName', null,
       'contactPhone', null,
       'contactEmail', null,
       'contactRole', null,
       'schedule', null,
       'externalUrl', null,
       'availability', 'available',
       'metadata', '{"housing_type":"hotel"}'::jsonb,
       'status', 'draft',
       'publishedAt', null,
       'expiresAt', null,
       'images', '[]'::jsonb
     )) $$,
  '23514',
  null::text,
  'the staff write RPC still reaches category metadata validation on the server'
);

select lives_ok(
  $$ select public.save_admin_service(jsonb_build_object(
       'serviceId', null,
       'categoryId', (select id from public.service_categories where slug = 'leisure-culture'),
       'title', '{"ca":"Servei <script>hostil</script> Àgora","es":"Servicio Ágora","en":"Agora service","ar":"خدمة أغورا","fa":"خدمات آگورا"}'::jsonb,
       'description', null,
       'providerName', 'Наталія',
       'location', 'Vic',
       'zone', 'Osona',
       'costType', 'free',
       'costAmount', null,
       'costDetails', null,
       'contactName', null,
       'contactPhone', null,
       'contactEmail', null,
       'contactRole', null,
       'schedule', null,
       'externalUrl', 'https://example.test/agora',
       'availability', 'available',
       'metadata', '{"activity_type":"cultural","family_friendly":true}'::jsonb,
       'status', 'published',
       'publishedAt', now()::text,
       'expiresAt', null,
       'images', jsonb_build_array(
         jsonb_build_object('url', 'org/services/first.webp', 'altText', '{"ca":"Primera","es":"Primera","en":"First","ar":"الأولى","fa":"اول"}'::jsonb),
         jsonb_build_object('url', 'org/services/second.webp', 'altText', '{"ca":"Segona","es":"Segunda","en":"Second","ar":"الثانية","fa":"دوم"}'::jsonb)
       )
     )) $$,
  'staff can save a published multilingual service and ordered images atomically'
);
select is(
  (select string_agg(image.url || ':' || image.position, ',' order by image.position)
   from public.service_images image
   join public.services service on service.id = image.service_id
   where service.title->>'ca' = 'Servei <script>hostil</script> Àgora'),
  'org/services/first.webp:0,org/services/second.webp:1',
  'the service write RPC preserves image order and hostile text remains inert data'
);

select ok(
  exists (select 1 from public.services where id = '5eed0000-0000-4000-800a-000000000001')
  and exists (select 1 from public.services where id = '5eed0000-0000-4000-800a-000000000002'),
  'staff read every entity submission in their organization'
);
select ok(
  exists (select 1 from public.services where status = 'draft')
  and exists (select 1 from public.services where status = 'pending')
  and exists (select 1 from public.services where status = 'approved')
  and exists (select 1 from public.services where status = 'rejected')
  and exists (select 1 from public.services where status = 'published'),
  'all five lifecycle states are represented and queryable'
);
select throws_ok(
  $$ update public.services set status = 'published', published_at = now()
     where id = '5eed0000-0000-4000-800a-000000000001' $$,
  '23514',
  null::text,
  'staff cannot skip pending review and publish directly'
);
select lives_ok(
  $$ update public.services
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
     where id = '5eed0000-0000-4000-800a-000000000001' $$,
  'staff can approve a pending submission'
);
select lives_ok(
  $$ update public.services
     set status = 'published', published_at = now(),
       title = '{"ca":"Mediació per trobar una habitació","es":"Mediación para encontrar una habitación","en":"Room-finding mediation","ar":"وساطة للعثور على غرفة","fa":"میانجی‌گری برای یافتن اتاق"}'::jsonb
     where id = '5eed0000-0000-4000-800a-000000000001' $$,
  'an approved submission can become published'
);

reset role;
insert into public.services
  (id, category_id, title, status, published_at, created_by, metadata)
select
  '99000000-0000-4000-8000-000000000010', id,
  '{"ca":"Servei eliminable","es":"Servicio eliminable","en":"Deletable service","ar":"خدمة قابلة للحذف","fa":"خدمات قابل حذف"}',
  'published', now() - interval '1 day', '5eed0000-0000-4000-8000-000000000002',
  '{"activity_type":"sports","family_friendly":true}'::jsonb
from public.service_categories where slug = 'leisure-culture';

insert into public.service_images (id, service_id, url, alt_text, position)
values (
  '99000000-0000-4000-8000-000000000011',
  '99000000-0000-4000-8000-000000000010',
  'org/services/deletable.webp', '{"ca":"Activitat al camp"}', 0
);

insert into public.service_interests (id, service_id, user_id)
values (
  '99000000-0000-4000-8000-000000000012',
  '99000000-0000-4000-8000-000000000010',
  '5eed0000-0000-4000-8000-000000000012'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';
delete from public.services where id = '99000000-0000-4000-8000-000000000010';
reset role;

select is(
  (select count(*) from public.service_images where id = '99000000-0000-4000-8000-000000000011')::int,
  0,
  'deleting a service cascades to its images'
);
select is(
  (select count(*) from public.service_interests where id = '99000000-0000-4000-8000-000000000012')::int,
  0,
  'deleting a service cascades to its interests'
);
select throws_ok(
  $$ delete from public.service_categories where slug = 'housing' $$,
  '23503',
  null::text,
  'a category in use cannot be deleted'
);
select is(
  (select disposition from public.personal_data_disposition() where table_name = 'service_interests'),
  'purge',
  'service interest is registered as participant data for erasure'
);
select is(
  (select delete_rule from information_schema.referential_constraints
   where constraint_name = 'service_interests_user_id_fkey'),
  'CASCADE',
  'participant deletion removes service interests'
);
select is(
  (select delete_rule from information_schema.referential_constraints
   where constraint_name = 'services_submitted_by_fkey'),
  'SET NULL',
  'organization services survive removal of an entity author without retaining the reference'
);

select * from finish();
rollback;
