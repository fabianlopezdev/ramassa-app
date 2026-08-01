-- The detail read says how the account signs in (RAPP-25).
--
-- The participant-detail screen owns the password-reset control, and that
-- control is only honest on an account that HAS a password: showing it on a
-- magic-link account offers staff a button whose only outcome is the RPC's
-- refusal, and hiding it everywhere strands the admin-created accounts the
-- reset exists for. The screen tells the two apart from the read it already
-- makes, so `auth_method` joins the columns `get_participant_profile` returns.
--
-- DROP then CREATE, not CREATE OR REPLACE: Postgres refuses to change a
-- function's OUT parameters in place, and the return table is exactly what
-- this migration changes. The body is otherwise 0007's, verbatim; the audit
-- CTE, the SECURITY INVOKER, and the decryption are deliberately untouched,
-- and pgTAP 0010 asserts the read still audits and still decrypts.

drop function public.get_participant_profile(uuid);

create function public.get_participant_profile(participant_id uuid)
returns table (
  id uuid,
  first_name text,
  last_name text,
  date_of_birth date,
  place_of_birth text,
  nationality text,
  preferred_language text,
  document_type text,
  document_number text,
  phone text,
  address text,
  city text,
  postal_code text,
  reference_entity text,
  reference_contact_name text,
  has_dependents boolean,
  num_dependents integer,
  clothing_size text,
  shoe_size text,
  avatar_url text,
  media_consent boolean,
  terms_accepted_at timestamptz,
  is_active boolean,
  is_forum_banned boolean,
  auth_method text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  with subject as (
    select p.*
    from public.profiles p
    where p.id = participant_id
      and (select public.is_staff_or_admin())
  ),
  access_recorded as (
    insert into public.audit_log (org_id, actor_id, action, target_type, target_id)
    select
      (select public.current_org_id()),
      (select auth.uid()),
      'profile.view_sensitive',
      'profile',
      s.id
    from subject s
    returning 1
  )
  select
    s.id,
    s.first_name,
    s.last_name,
    s.date_of_birth,
    s.place_of_birth,
    s.nationality,
    s.preferred_language,
    s.document_type,
    public.decrypt_field(s.document_number),
    public.decrypt_field(s.phone),
    public.decrypt_field(s.address),
    s.city,
    public.decrypt_field(s.postal_code),
    s.reference_entity,
    s.reference_contact_name,
    s.has_dependents,
    s.num_dependents,
    s.clothing_size,
    s.shoe_size,
    s.avatar_url,
    s.media_consent_at is not null,
    s.terms_accepted_at,
    s.is_active,
    s.is_forum_banned,
    s.auth_method,
    s.created_at,
    s.updated_at
  from subject s;
$$;

comment on function public.get_participant_profile is 'A participant record with its encrypted fields decrypted, for staff, WITH the RGPD access-audit row written in the same statement. SECURITY INVOKER, so the profiles RLS policy still does the org scoping. Returns no rows (and audits nothing) for a caller who is not staff. Includes auth_method so the detail screen only offers a password reset on an account that has one (RAPP-25).';
