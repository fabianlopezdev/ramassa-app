begin;
select plan(10);

insert into public.organizations (id, name, slug, primary_color, secondary_color, contact_email)
values
  ('12200000-0000-4000-8000-000000000001', 'Brand one', 'rapp-122-one', '#663399', '#FFE08A', 'private@example.test'),
  ('12200000-0000-4000-8000-000000000002', 'Brand two', 'rapp-122-two', '#005A8C', '#FFD166', 'other@example.test');

set local role anon;
select is(
  (select to_jsonb(branding) from public.get_public_organization_branding('rapp-122-one') branding),
  '{"primary_color":"#663399","secondary_color":"#FFE08A"}'::jsonb,
  'anonymous first launch receives exactly the requested public colors, with no contact or other settings'
);
select is((select count(*)::integer from public.get_public_organization_branding('unknown')), 0, 'unknown slug returns no branding');
select is((select count(*)::integer from public.get_public_organization_branding(null)), 0, 'null slug cannot enumerate organizations');
select is((select count(*)::integer from public.get_public_organization_branding('%')), 0, 'slug is an exact match, not a wildcard');
select is((select count(*)::integer from public.organizations), 0, 'DENIAL: anonymous table reads still reveal no organization settings');
select is((select count(*)::integer from public.profiles), 0, 'DENIAL: profiles remain protected');

reset role;
update public.organizations set primary_color = '#005A8C' where slug = 'rapp-122-one';
set local role anon;
select is((select primary_color from public.get_public_organization_branding('rapp-122-one')), '#005A8C', 'dashboard changes are reflected without rebuilding the app');

set local role authenticated;
select is((select secondary_color from public.get_public_organization_branding('rapp-122-two')), '#FFD166', 'public branding is also callable during session restoration');

reset role;
select is((select prosecdef from pg_proc where oid = 'public.get_public_organization_branding(text)'::regprocedure), false, 'exposed RPC uses invoker security');
select is((select proconfig from pg_proc where oid = 'private.get_public_organization_branding(text)'::regprocedure), array['search_path=""']::text[], 'private elevated read has a locked search path');
select * from finish();
rollback;
