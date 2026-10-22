-- A woman who signed up on her own uploads a file answer before her profile exists (RAPP-610).
--
-- WHY
--
-- A woman who starts on her own has no profile until the wizard ends, so the
-- media Worker, which reads the caller's profile for her organization,
-- refused her upload on a staff file question while the button showed.
--
-- WHAT THIS MIGRATION DOES
--
-- `my_intake_upload_org()` tells the Worker, for the signed-in caller only,
-- the organization her registration uses when she has no profile at all: the
-- default one, the organization `intake_catalog()` already reads for her
-- (commit ab9bbbb). For anyone with a profile, in any state, it returns null,
-- so a deactivated player cannot use it. The Worker then lets her write only
-- the `intake-answers` folder, keyed to her own account id; every other
-- folder still needs a profile. When the wizard creates her profile in that
-- organization with that id, the key is already in her own folder, which
-- `write_custom_answer` and `can_read_custom_answer_object` require.
--
-- Docs: https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker

create or replace function public.my_intake_upload_org()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null or exists (select 1 from public.profiles where id = caller) then
    return null;
  end if;
  return (select public.default_organization_id());
end;
$$;

revoke all on function public.my_intake_upload_org() from public, anon;
grant execute on function public.my_intake_upload_org() to authenticated;
