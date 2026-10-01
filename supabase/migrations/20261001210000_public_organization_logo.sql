-- The only anonymously readable media is the current saved organization logo.
-- https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker
create function private.get_public_organization_logo(organization_slug text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select organization.logo_url
  from public.organizations as organization
  where organization.slug = organization_slug
    and organization.logo_url ~ (
      '^' || organization.id::text ||
      '/organization-branding/[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}/[0-9]{4}/(0[1-9]|1[0-2])/[0-9a-f]{32}\.(jpg|png|webp)$'
    );
$$;

create function public.get_public_organization_logo(organization_slug text)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_public_organization_logo(organization_slug);
$$;

revoke all on function private.get_public_organization_logo(text) from public, anon, authenticated;
revoke all on function public.get_public_organization_logo(text) from public, anon, authenticated;
grant usage on schema private to anon, authenticated;
grant execute on function private.get_public_organization_logo(text) to anon, authenticated;
grant execute on function public.get_public_organization_logo(text) to anon, authenticated;

comment on function public.get_public_organization_logo(text) is
  'Current registered branding image for an exact organization slug. Private folders and other organizations are excluded.';
