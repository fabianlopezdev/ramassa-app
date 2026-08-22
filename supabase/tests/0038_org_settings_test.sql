-- Organization settings, staff lifecycle, and staff-only internal documents (RAPP-64).

begin;
select plan(30);

select has_function(
  'public',
  'update_organization_settings',
  array['text', 'text', 'text', 'text', 'text', 'text', 'text[]', 'text'],
  'one admin-only function validates and saves organization settings'
);
select has_function(
  'public',
  'invite_staff_member',
  array['text', 'text', 'text', 'text'],
  'staff invitations use one audited admin-only function'
);
select has_function(
  'public',
  'set_staff_member_role',
  array['uuid', 'text'],
  'role changes use one concurrency-safe function'
);
select has_function(
  'public',
  'remove_staff_member',
  array['uuid'],
  'staff removal owns profile deactivation and auth-session revocation'
);
select has_function(
  'public',
  'register_internal_document',
  array['text', 'text', 'text', 'bigint'],
  'internal document metadata is registered through one guarded function'
);
select has_function(
  'public',
  'can_read_internal_document_object',
  array['text'],
  'the media worker has one RLS-aware document authorization function'
);

insert into public.organizations (id, name, slug, locked_default_language) values
  ('64000000-0000-4000-8000-000000000001', 'RAPP-64 Ramassa', 'rapp-64-ramassa', 'ca'),
  ('64000000-0000-4000-8000-000000000002', 'RAPP-64 Other', 'rapp-64-other', null);

insert into auth.users (id, email) values
  ('64000000-0000-4000-8100-000000000001', 'rapp64.admin.one@example.test'),
  ('64000000-0000-4000-8100-000000000002', 'rapp64.admin.two@example.test'),
  ('64000000-0000-4000-8100-000000000003', 'rapp64.staff@example.test'),
  ('64000000-0000-4000-8100-000000000004', 'rapp64.player@example.test'),
  ('64000000-0000-4000-8100-000000000005', 'rapp64.entity@example.test'),
  ('64000000-0000-4000-8100-000000000006', 'rapp64.other.admin@example.test');

insert into public.collaborating_entities (id, org_id, name) values
  ('64000000-0000-4000-8300-000000000001', '64000000-0000-4000-8000-000000000001', 'RAPP-64 Entity');

insert into public.profiles (
  id, org_id, role, first_name, last_name, preferred_language, document_type,
  is_active, terms_accepted_at, collaborating_entity_id
) values
  ('64000000-0000-4000-8100-000000000001', '64000000-0000-4000-8000-000000000001', 'admin', 'Admin', 'One', 'ca', 'none', true, now(), null),
  ('64000000-0000-4000-8100-000000000002', '64000000-0000-4000-8000-000000000001', 'admin', 'Admin', 'Two', 'ca', 'none', true, now(), null),
  ('64000000-0000-4000-8100-000000000003', '64000000-0000-4000-8000-000000000001', 'staff', 'Núria', 'Serra', 'ca', 'none', true, now(), null),
  ('64000000-0000-4000-8100-000000000004', '64000000-0000-4000-8000-000000000001', 'player', 'أمينة', 'الحسن', 'ar', 'none', true, now(), null),
  ('64000000-0000-4000-8100-000000000005', '64000000-0000-4000-8000-000000000001', 'entity', 'Sílvia', 'Bosch', 'ca', 'none', true, now(), '64000000-0000-4000-8300-000000000001'),
  ('64000000-0000-4000-8100-000000000006', '64000000-0000-4000-8000-000000000002', 'admin', 'Other', 'Admin', 'ca', 'none', true, now(), null);

set local role authenticated;
set local request.jwt.claims = '{"sub":"64000000-0000-4000-8100-000000000001","role":"authenticated"}';

select is(
  (public.update_organization_settings(
    'Associació Ramassà', 'contacte@ramassa.example', '+34 600 000 000', null,
    '#0077B6', '#FFD166', array['ca', 'es', 'ar'], 'ca'
  )).name,
  'Associació Ramassà',
  'an admin can save the organization name, contacts, branding, and languages together'
);
select is(
  (select available_languages from public.organizations where id = '64000000-0000-4000-8000-000000000001'),
  array['ca', 'es', 'ar']::text[],
  'enabled languages persist as an allowlisted organization setting'
);
select throws_ok(
  $$ select public.update_organization_settings(
    'Associació Ramassà', null, null, null, '#F8FAFC', '#FFD166', array['ca', 'es'], 'ca'
  ) $$,
  '23514',
  'primary color does not meet WCAG AA contrast with white text',
  'DENIAL: failing primary contrast is rejected server-side'
);
select throws_ok(
  $$ update public.organizations
     set primary_color = '#F8FAFC'
     where id = '64000000-0000-4000-8000-000000000001' $$,
  '23514',
  'new row for relation "organizations" violates check constraint "organizations_primary_color_wcag_aa"',
  'DENIAL: direct table writes cannot bypass primary contrast validation'
);
select throws_ok(
  $$ update public.organizations
     set secondary_color = '#0F172A'
     where id = '64000000-0000-4000-8000-000000000001' $$,
  '23514',
  'new row for relation "organizations" violates check constraint "organizations_secondary_color_wcag_aa"',
  'DENIAL: direct table writes cannot bypass secondary contrast validation'
);
select throws_ok(
  $$ select public.update_organization_settings(
    'Associació Ramassà', null, null, null, '#0077B6', '#FFD166', array['es', 'en'], 'es'
  ) $$,
  '23514',
  'Catalan must remain enabled and default for the Ramassa organization',
  'DENIAL: the grant-mandated Catalan default is locked for Ramassa'
);

create temporary table rapp64_invited_staff (
  profile_id uuid, email text, expires_at timestamptz
) on commit drop;
insert into rapp64_invited_staff
select * from public.invite_staff_member(
  'rapp64.invited@example.test', 'Marta', 'Puig', 'staff'
);
select is(
  (select role from public.profiles where id = (select profile_id from rapp64_invited_staff)),
  'staff',
  'a staff invitation provisions the requested staff role for magic-link access'
);
select is(
  (select auth_method from public.profiles where id = (select profile_id from rapp64_invited_staff)),
  'magic_link',
  'staff invitation reuses the established magic-link account infrastructure'
);
select is(
  (select count(*)::integer from public.list_staff_members()),
  4,
  'the admin staff list includes active admins, staff, and the newly invited member'
);

select public.set_staff_member_role('64000000-0000-4000-8100-000000000001', 'staff');
select is(
  (select role from public.profiles where id = '64000000-0000-4000-8100-000000000001'),
  'staff',
  'an admin may demote another admin while a second active admin remains'
);

set local request.jwt.claims = '{"sub":"64000000-0000-4000-8100-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select public.set_staff_member_role('64000000-0000-4000-8100-000000000002', 'staff') $$,
  '23514',
  'the organization must always have at least one active admin',
  'DENIAL: the final active admin cannot be demoted'
);
select throws_ok(
  $$ select public.remove_staff_member('64000000-0000-4000-8100-000000000002') $$,
  '23514',
  'the organization must always have at least one active admin',
  'DENIAL: the final active admin cannot be removed'
);

reset role;
insert into auth.sessions (id, user_id) values
  ('64000000-0000-4000-8200-000000000001', '64000000-0000-4000-8100-000000000003');
insert into auth.refresh_tokens (token, user_id, revoked, session_id) values
  ('rapp64-refresh-token', '64000000-0000-4000-8100-000000000003', false, '64000000-0000-4000-8200-000000000001');
set local role authenticated;
set local request.jwt.claims = '{"sub":"64000000-0000-4000-8100-000000000002","role":"authenticated"}';
select public.remove_staff_member('64000000-0000-4000-8100-000000000003');
reset role;
select is(
  (select is_active from public.profiles where id = '64000000-0000-4000-8100-000000000003'),
  false,
  'removing staff deactivates the profile'
);
select is(
  (select count(*)::integer from auth.sessions where user_id = '64000000-0000-4000-8100-000000000003'),
  0,
  'removing staff revokes every active session immediately'
);
select is(
  (select count(*)::integer from auth.refresh_tokens where user_id = '64000000-0000-4000-8100-000000000003'),
  0,
  'removing staff revokes every refresh token'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"64000000-0000-4000-8100-000000000002","role":"authenticated"}';
create temporary table rapp64_document (id uuid) on commit drop;
insert into rapp64_document
select public.register_internal_document(
  '64000000-0000-4000-8000-000000000001/documents/64000000-0000-4000-8100-000000000002/2026/08/0123456789abcdef0123456789abcdef.pdf',
  'Pòlissa assegurança 2026.pdf',
  'application/pdf',
  2048
);
select is(
  (select count(*)::integer from public.search_internal_documents('asseg')), 1,
  'folder-less document search matches a half-typed accented filename'
);
select ok(
  public.can_read_internal_document_object(
    '64000000-0000-4000-8000-000000000001/documents/64000000-0000-4000-8100-000000000002/2026/08/0123456789abcdef0123456789abcdef.pdf'
  ),
  'staff and admins can authorize an internal document object in their organization'
);

set local request.jwt.claims = '{"sub":"64000000-0000-4000-8100-000000000004","role":"authenticated"}';
select is((select count(*)::integer from public.internal_documents), 0, 'DENIAL: players cannot select internal document metadata');
select is((select count(*)::integer from public.search_internal_documents('')), 0, 'DENIAL: player document search returns no rows');
select is(
  public.can_read_internal_document_object(
    '64000000-0000-4000-8000-000000000001/documents/64000000-0000-4000-8100-000000000002/2026/08/0123456789abcdef0123456789abcdef.pdf'
  ),
  false,
  'DENIAL: players cannot authorize internal R2 objects'
);

set local request.jwt.claims = '{"sub":"64000000-0000-4000-8100-000000000005","role":"authenticated"}';
select is((select count(*)::integer from public.internal_documents), 0, 'DENIAL: entity contacts cannot select internal document metadata');
select is(
  public.can_read_internal_document_object(
    '64000000-0000-4000-8000-000000000001/documents/64000000-0000-4000-8100-000000000002/2026/08/0123456789abcdef0123456789abcdef.pdf'
  ),
  false,
  'DENIAL: entity contacts cannot authorize internal R2 objects'
);

set local request.jwt.claims = '{"sub":"64000000-0000-4000-8100-000000000006","role":"authenticated"}';
select is((select count(*)::integer from public.search_internal_documents('')), 0, 'another tenant admin cannot search these documents');

set local request.jwt.claims = '{"sub":"64000000-0000-4000-8100-000000000003","role":"authenticated"}';
select throws_ok(
  $$ select public.invite_staff_member('blocked@example.test', 'Blocked', 'Staff', 'staff') $$,
  '42501',
  'only active admins may invite staff members',
  'DENIAL: deactivated staff cannot invite colleagues'
);

reset role;
select * from finish();
rollback;
