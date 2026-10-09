-- Public brand colors for the first-install language screen (RAPP-122).
-- https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker
create function private.get_public_organization_branding(organization_slug text)
returns table (primary_color text, secondary_color text)
language sql
stable
security definer
set search_path = ''
as $$
  select organization.primary_color, organization.secondary_color
  from public.organizations as organization
  where organization.slug = organization_slug;
$$;

create function public.get_public_organization_branding(organization_slug text)
returns table (primary_color text, secondary_color text)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.get_public_organization_branding(organization_slug);
$$;

revoke all on function private.get_public_organization_branding(text) from public, anon, authenticated;
revoke all on function public.get_public_organization_branding(text) from public, anon, authenticated;
grant usage on schema private to anon, authenticated;
grant execute on function private.get_public_organization_branding(text) to anon, authenticated;
grant execute on function public.get_public_organization_branding(text) to anon, authenticated;

comment on function public.get_public_organization_branding(text) is
  'Public primary and secondary colors for an exact organization slug. No contacts, profiles, or private settings.';
