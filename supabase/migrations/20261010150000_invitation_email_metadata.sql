-- Staff and entity invitations send an invitation email (RAPP-225).
--
-- WHY
--
-- An invitation creates the account in Postgres (ADR-022) and then the admin
-- asks for a sign-in code for that address. Since RAPP-67 that email holds a
-- six-digit code, and it said "you asked to sign in to the app". The invited
-- person did not ask, nothing said who invited her or to what, and entity
-- collaborators use the web portal, which is not "the app".
--
-- HOW
--
-- The auth server renders one template for every code email, and that template
-- can read the account's user metadata. So an invitation writes what the email
-- needs into `raw_user_meta_data.invitation`: the kind, the organization, the
-- entity, who invited her, and the language. The template shows the invitation
-- wording while that key exists. The key is removed at her first sign-in, so
-- every later code email is the ordinary sign-in email. No service-role key and
-- no second mail sender are needed.
--
-- The language is the organization's default when the staff side supports it
-- (ca, es, en), otherwise Catalan, the grant-mandated default (ADR-006).

create or replace function private.invitation_email_details(
  p_org_id uuid,
  p_invited_by uuid,
  p_kind text,
  p_entity_name text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'kind', p_kind,
    'org_name', organization.name,
    'entity_name', p_entity_name,
    'inviter_name', nullif(btrim(concat_ws(' ', inviter.first_name, inviter.last_name)), ''),
    'language', case
      when organization.default_language in ('ca', 'es', 'en') then organization.default_language
      else 'ca'
    end
  ))
  from public.organizations as organization
  left join public.profiles as inviter on inviter.id = p_invited_by
  where organization.id = p_org_id;
$$;

comment on function private.invitation_email_details is 'What the invitation email shows: kind, organization, entity, inviter and language.';

create or replace function private.mark_staff_invitation_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
           || jsonb_build_object('invitation', private.invitation_email_details(
                new.org_id, new.invited_by, 'staff', null))
   where id = new.profile_id
     and last_sign_in_at is null;
  return new;
end;
$$;

create or replace function private.mark_entity_invitation_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entity_name text;
begin
  select entity.name into entity_name
  from public.collaborating_entities as entity
  where entity.id = new.collaborating_entity_id
    and entity.org_id = new.org_id;

  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
           || jsonb_build_object('invitation', private.invitation_email_details(
                new.org_id, new.invited_by, 'entity', entity_name))
   where id = new.profile_id
     and last_sign_in_at is null;
  return new;
end;
$$;

create trigger staff_invitations_mark_email
  after insert on public.staff_invitations
  for each row execute function private.mark_staff_invitation_email();

create trigger entity_invitations_mark_email
  after insert on public.entity_invitations
  for each row execute function private.mark_entity_invitation_email();

-- Her first sign-in ends the invitation wording.
create or replace function private.clear_invitation_email_on_first_sign_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.last_sign_in_at is null
    and new.last_sign_in_at is not null
    and new.raw_user_meta_data ? 'invitation'
  then
    new.raw_user_meta_data := new.raw_user_meta_data - 'invitation';
  end if;
  return new;
end;
$$;

create trigger clear_invitation_email_on_first_sign_in
  before update of last_sign_in_at on auth.users
  for each row execute function private.clear_invitation_email_on_first_sign_in();

revoke all on function private.invitation_email_details(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function private.mark_staff_invitation_email() from public, anon, authenticated;
revoke all on function private.mark_entity_invitation_email() from public, anon, authenticated;
revoke all on function private.clear_invitation_email_on_first_sign_in() from public, anon, authenticated;
