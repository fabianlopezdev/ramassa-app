-- An authorization draft with no published version lists as not current
-- (RAPP-621).
--
-- `list_authorization_versions` computed `is_current` by comparing with the
-- current published version, which is null in an organization that has only
-- a draft: exactly production right after the onboarding setup is imported.
-- The admin's onboarding page then failed to load. `is_current` is now false
-- when nothing is published.
--
-- Docs: https://www.postgresql.org/docs/current/functions-comparison.html
-- (`is not distinct from`, null-safe comparison) and
-- https://www.postgresql.org/docs/current/functions-conditional.html (coalesce).

CREATE OR REPLACE FUNCTION public.list_authorization_versions()
 RETURNS TABLE(id uuid, season_id uuid, season_name text, version_number integer, content jsonb, published_at timestamp with time zone, is_current boolean, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (select private.can_design_onboarding()) then
    raise insufficient_privilege using message = 'the authorization versions need settings.organization or onboarding.design';
  end if;
  return query
    select v.id, v.season_id, s.name, v.version_number, v.content, v.published_at,
           coalesce(v.id = (private.current_authorization_version(v.org_id)).id, false), v.updated_at
      from public.authorization_versions v
      left join public.seasons s on s.id = v.season_id
     where v.org_id = (select public.current_org_id())
     order by v.published_at is not null, s.starts_on desc, v.version_number desc;
end;
$function$;

