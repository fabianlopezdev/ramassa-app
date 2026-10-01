begin;
select plan(11);
insert into public.organizations (id, name, slug, logo_url)
values
  ('12400000-0000-4000-8000-000000000001', 'Logo test', 'rapp-124', '12400000-0000-4000-8000-000000000001/organization-branding/12400000-0000-4000-8000-000000000002/2026/10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png'),
  ('12400000-0000-4000-8000-000000000003', 'Empty test', 'rapp-124-empty', null);
set local role anon;
select is(public.get_public_organization_logo('rapp-124'), '12400000-0000-4000-8000-000000000001/organization-branding/12400000-0000-4000-8000-000000000002/2026/10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png', 'anonymous visitors can resolve the saved logo');
select is(public.get_public_organization_logo('rapp-124-empty'), null, 'absent logo is null');
select is(public.get_public_organization_logo('unknown'), null, 'unknown organization is null');
select is(public.get_public_organization_logo('%'), null, 'no wildcard enumeration');
select is((select count(*)::integer from public.organizations), 0, 'DENIAL: private organization settings remain inaccessible');
select is((select count(*)::integer from public.profiles), 0, 'DENIAL: profiles remain inaccessible');
reset role;
update public.organizations set logo_url = '12400000-0000-4000-8000-000000000003/organization-branding/12400000-0000-4000-8000-000000000002/2026/10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png' where slug = 'rapp-124';
set local role anon;
select is(public.get_public_organization_logo('rapp-124'), null, 'DENIAL: another organization object cannot be published');
reset role;
update public.organizations set logo_url = '12400000-0000-4000-8000-000000000001/documents/12400000-0000-4000-8000-000000000002/2026/10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png' where slug = 'rapp-124';
set local role anon;
select is(public.get_public_organization_logo('rapp-124'), null, 'DENIAL: private folders cannot be published');
reset role;
delete from public.organizations where slug = 'rapp-124';
set local role anon;
select is(public.get_public_organization_logo('rapp-124'), null, 'organization deletion removes public logo access');
reset role;
select is((select prosecdef from pg_proc where oid = 'public.get_public_organization_logo(text)'::regprocedure), false, 'public wrapper uses invoker security');
select is((select proconfig from pg_proc where oid = 'private.get_public_organization_logo(text)'::regprocedure), array['search_path=""']::text[], 'elevated lookup locks the search path');
select * from finish();
rollback;
