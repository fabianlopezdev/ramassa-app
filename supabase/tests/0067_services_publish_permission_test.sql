-- Service publication permissions (RAPP-360).
--
-- services.publish covers publishing, scheduling and unpublishing, so
-- services.edit alone cannot change the publication times either.
-- services.review alone approves an entity submission, and that does not let
-- it publish anything else.

begin;
select plan(11);

insert into auth.users (id, email) values
  ('36000000-0000-4000-8000-000000000001', 'edit.only@rapp360.test'),
  ('36000000-0000-4000-8000-000000000002', 'review.only@rapp360.test');
insert into public.profiles (id, org_id, role, first_name, last_name) values
  ('36000000-0000-4000-8000-000000000001', '5eed0000-0000-4000-8000-000000000000', 'staff', 'Edit', 'Only'),
  ('36000000-0000-4000-8000-000000000002', '5eed0000-0000-4000-8000-000000000000', 'staff', 'Review', 'Only');

create or replace function pg_temp.give_only(p_profile uuid, p_codes text[])
returns void language sql as $$
  delete from public.team_member_permissions where profile_id = p_profile;
  insert into public.team_member_permissions (org_id, profile_id, permission_code)
  select '5eed0000-0000-4000-8000-000000000000', p_profile, unnest(p_codes);
$$;
select pg_temp.give_only('36000000-0000-4000-8000-000000000001', array['services.edit']);
select pg_temp.give_only('36000000-0000-4000-8000-000000000002', array['services.review']);

-- A full admin payload for the test services.
create or replace function pg_temp.payload(
  p_id uuid, p_status text, p_published_at timestamptz, p_expires_at timestamptz
)
returns jsonb language sql as $$
  select jsonb_build_object(
    'serviceId', p_id,
    'categoryId', '5eed0000-0000-4000-8009-000000000007',
    'title', '{"ca":"Servei","es":"Servicio","en":"Service","ar":"خدمة","fa":"خدمات"}'::jsonb,
    'description', null,
    'providerName', 'Entitat',
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
    'externalUrl', null,
    'availability', 'available',
    'metadata', '{"activity_type":"sports","family_friendly":true}'::jsonb,
    'status', p_status,
    'publishedAt', p_published_at,
    'expiresAt', p_expires_at,
    'images', '[]'::jsonb
  );
$$;
grant execute on function pg_temp.payload(uuid, text, timestamptz, timestamptz) to authenticated;

set local request.jwt.claims = '{}';
insert into public.services (
  id, org_id, category_id, title, provider_name, cost_type, availability,
  metadata, status, published_at, submitted_by, created_by
) values
  ('36000000-0000-4000-800a-000000000001', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8009-000000000007', '{"ca":"Esborrany","es":"Borrador","en":"Draft","ar":"مسودة","fa":"پیش‌نویس"}', 'Entitat', 'free',
   'available', '{"activity_type":"sports","family_friendly":true}', 'draft', null,
   null, '5eed0000-0000-4000-8000-000000000002'),
  ('36000000-0000-4000-800a-000000000002', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8009-000000000007', '{"ca":"Publicat","es":"Publicado","en":"Published","ar":"منشور","fa":"منتشر شده"}', 'Entitat', 'free',
   'available', '{"activity_type":"sports","family_friendly":true}', 'published',
   '2026-10-01 10:00:00+00', null, '5eed0000-0000-4000-8000-000000000002'),
  ('36000000-0000-4000-800a-000000000003', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8009-000000000007', '{"ca":"Proposta","es":"Propuesta","en":"Proposal","ar":"اقتراح","fa":"پیشنهاد"}', 'Entitat', 'free',
   'available', '{"activity_type":"sports","family_friendly":true}', 'pending', null,
   '5eed0000-0000-4000-8000-000000000004', '5eed0000-0000-4000-8000-000000000004');

set local role authenticated;
set local request.jwt.claims = '{"sub": "36000000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select throws_ok(
  $$ select public.save_admin_service(pg_temp.payload(null, 'published', now(), null)) $$,
  '42501', null::text, 'services.edit alone cannot create a published service'
);
select throws_ok(
  $$ select public.save_admin_service(pg_temp.payload(
       '36000000-0000-4000-800a-000000000001', 'published', now(), null)) $$,
  '42501', null::text, 'services.edit alone cannot publish a draft'
);
select throws_ok(
  $$ select public.save_admin_service(pg_temp.payload(
       '36000000-0000-4000-800a-000000000002', 'published',
       '2026-10-01 10:00:00+00', '2026-10-20 10:00:00+00')) $$,
  '42501', null::text, 'services.edit alone cannot set an expiry on a published service'
);
select throws_ok(
  $$ select public.save_admin_service(pg_temp.payload(
       '36000000-0000-4000-800a-000000000002', 'published',
       '2027-01-01 10:00:00+00', null)) $$,
  '42501', null::text, 'services.edit alone cannot move a published service to a later publish time'
);
select lives_ok(
  $$ select public.save_admin_service(pg_temp.payload(
       '36000000-0000-4000-800a-000000000002', 'published',
       '2026-10-01 10:00:00+00', null)) $$,
  'services.edit alone still edits a published service that keeps its times'
);
select throws_ok(
  $$ select public.save_admin_service(pg_temp.payload(
       '36000000-0000-4000-800a-000000000002', 'draft', null, null)) $$,
  '42501', null::text, 'services.edit alone cannot unpublish a service'
);

set local request.jwt.claims = '{"sub": "36000000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.save_admin_service(pg_temp.payload(
       '36000000-0000-4000-800a-000000000001', 'published', now(), null)) $$,
  '42501', null::text, 'services.review alone cannot publish a service outside a review'
);
select lives_ok(
  $$ select public.review_entity_service(
       '36000000-0000-4000-800a-000000000003', 'approve',
       pg_temp.payload('36000000-0000-4000-800a-000000000003', 'published', now(), null),
       null) $$,
  'services.review alone approves an entity submission'
);
select is(
  (select status from public.services where id = '36000000-0000-4000-800a-000000000003'),
  'published',
  'the approved submission is published'
);
select is(
  coalesce(current_setting('ramassa.service_review_approval', true), ''),
  '',
  'the approval mark is cleared after the approval'
);
select throws_ok(
  $$ select public.save_admin_service(pg_temp.payload(
       '36000000-0000-4000-800a-000000000003', 'draft', null, null)) $$,
  '42501', null::text, 'services.review alone cannot unpublish the service it approved'
);

reset role;
select * from finish();
rollback;
