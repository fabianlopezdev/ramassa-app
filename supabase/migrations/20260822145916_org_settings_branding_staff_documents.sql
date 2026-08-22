-- Organization settings, staff lifecycle, and staff-only internal documents
-- (RAPP-64). The database is the final boundary for role and contrast rules;
-- the apps repeat the same checks to give immediate, helpful feedback.

alter table public.organizations
  add column locked_default_language text
  check (locked_default_language is null or locked_default_language in ('ca', 'es', 'en', 'ar', 'fa'));

update public.organizations
set locked_default_language = 'ca'
where slug = 'ramassa';

alter table public.organizations
  add constraint organizations_primary_color_hex
  check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint organizations_secondary_color_hex
  check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint organizations_default_language_supported
  check (default_language in ('ca', 'es', 'en', 'ar', 'fa')),
  add constraint organizations_available_languages_supported
  check (
    cardinality(available_languages) > 0
    and available_languages <@ array['ca', 'es', 'en', 'ar', 'fa']::text[]
    and default_language = any(available_languages)
    and (
      locked_default_language is null
      or (
        default_language = locked_default_language
        and locked_default_language = any(available_languages)
      )
    )
  );

comment on column public.organizations.locked_default_language is
  'Optional contractual default-language lock. Ramassa is locked to Catalan by its Generalitat grant; white-label tenants normally leave this NULL.';

create or replace function private.hex_relative_luminance(p_color text)
returns double precision
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  r double precision := ('x' || substr(p_color, 2, 2))::bit(8)::integer / 255.0;
  g double precision := ('x' || substr(p_color, 4, 2))::bit(8)::integer / 255.0;
  b double precision := ('x' || substr(p_color, 6, 2))::bit(8)::integer / 255.0;
begin
  r := case when r <= 0.04045 then r / 12.92 else power((r + 0.055) / 1.055, 2.4) end;
  g := case when g <= 0.04045 then g / 12.92 else power((g + 0.055) / 1.055, 2.4) end;
  b := case when b <= 0.04045 then b / 12.92 else power((b + 0.055) / 1.055, 2.4) end;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
end;
$$;

create or replace function private.hex_contrast_ratio(p_first text, p_second text)
returns double precision
language sql
immutable
strict
set search_path = ''
as $$
  select
    (greatest(private.hex_relative_luminance(p_first), private.hex_relative_luminance(p_second)) + 0.05)
    /
    (least(private.hex_relative_luminance(p_first), private.hex_relative_luminance(p_second)) + 0.05);
$$;

alter table public.organizations
  add constraint organizations_primary_color_wcag_aa
  check (private.hex_contrast_ratio(primary_color, '#FFFFFF') >= 4.5),
  add constraint organizations_secondary_color_wcag_aa
  check (private.hex_contrast_ratio(secondary_color, '#0F172A') >= 4.5);

create or replace function public.update_organization_settings(
  p_name text,
  p_contact_email text,
  p_contact_phone text,
  p_logo_url text,
  p_primary_color text,
  p_secondary_color text,
  p_available_languages text[],
  p_default_language text
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
  saved public.organizations;
  clean_name text := nullif(btrim(p_name), '');
  clean_primary text := upper(btrim(p_primary_color));
  clean_secondary text := upper(btrim(p_secondary_color));
  locked_language text;
begin
  if not (select public.is_admin()) then
    raise insufficient_privilege using message = 'only active admins may update organization settings';
  end if;
  if clean_name is null or length(clean_name) > 200 then
    raise check_violation using message = 'organization name is required';
  end if;
  if clean_primary !~ '^#[0-9A-F]{6}$' or clean_secondary !~ '^#[0-9A-F]{6}$' then
    raise check_violation using message = 'brand colors must use six-digit hex values';
  end if;
  if private.hex_contrast_ratio(clean_primary, '#FFFFFF') < 4.5 then
    raise check_violation using message = 'primary color does not meet WCAG AA contrast with white text';
  end if;
  if private.hex_contrast_ratio(clean_secondary, '#0F172A') < 4.5 then
    raise check_violation using message = 'secondary color does not meet WCAG AA contrast with dark text';
  end if;
  if cardinality(p_available_languages) = 0
    or not (p_available_languages <@ array['ca', 'es', 'en', 'ar', 'fa']::text[])
    or not (p_default_language = any(p_available_languages))
  then
    raise check_violation using message = 'default language must be enabled and all languages must be supported';
  end if;

  select organization.locked_default_language into locked_language
  from public.organizations as organization
  where organization.id = actor_org
  for update;

  if locked_language is not null
    and (p_default_language <> locked_language or not (locked_language = any(p_available_languages)))
  then
    raise check_violation using message = 'Catalan must remain enabled and default for the Ramassa organization';
  end if;

  update public.organizations
  set
    name = clean_name,
    contact_email = nullif(btrim(p_contact_email), ''),
    contact_phone = nullif(btrim(p_contact_phone), ''),
    logo_url = nullif(btrim(p_logo_url), ''),
    primary_color = clean_primary,
    secondary_color = clean_secondary,
    available_languages = array(
      select entry.language
      from unnest(p_available_languages) with ordinality as entry(language, position)
      group by entry.language
      order by min(entry.position)
    ),
    default_language = p_default_language
  where id = actor_org
  returning * into saved;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org,
    (select auth.uid()),
    'organization.settings_update',
    'organization',
    actor_org,
    jsonb_build_object(
      'primary_color', clean_primary,
      'secondary_color', clean_secondary,
      'available_languages', p_available_languages,
      'default_language', p_default_language,
      'has_logo', p_logo_url is not null
    )
  );

  return saved;
end;
$$;

drop policy if exists organizations_update_staff on public.organizations;
create policy organizations_update_admin
  on public.organizations
  for update
  to authenticated
  using (id = (select public.current_org_id()) and (select public.is_admin()))
  with check (id = (select public.current_org_id()) and (select public.is_admin()));

create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  email text not null,
  role text not null check (role in ('staff', 'admin')),
  invited_by uuid not null references public.profiles (id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index staff_invitations_org_created_idx
  on public.staff_invitations (org_id, created_at desc);

alter table public.staff_invitations enable row level security;
alter table public.staff_invitations force row level security;

create policy staff_invitations_select_org_admin
  on public.staff_invitations
  for select
  to authenticated
  using (org_id = (select public.current_org_id()) and (select public.is_admin()));

create or replace function public.list_staff_members()
returns table (
  profile_id uuid,
  first_name text,
  last_name text,
  email text,
  role text,
  is_active boolean,
  invited_at timestamptz
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not (select public.is_admin()) then
    raise insufficient_privilege using message = 'only active admins may list staff members';
  end if;
  return query
  select
    profile.id,
    profile.first_name,
    profile.last_name,
    account.email::text,
    profile.role,
    profile.is_active,
    invitation.created_at
  from public.profiles as profile
  join auth.users as account on account.id = profile.id
  left join public.staff_invitations as invitation on invitation.profile_id = profile.id
  where profile.org_id = (select public.current_org_id())
    and profile.role in ('staff', 'admin')
  order by profile.is_active desc, profile.last_name, profile.first_name, profile.id;
end;
$$;

create or replace function public.invite_staff_member(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_role text
)
returns table (profile_id uuid, email text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  clean_email text := lower(btrim(p_email));
  clean_first_name text := nullif(btrim(p_first_name), '');
  clean_last_name text := nullif(btrim(p_last_name), '');
  new_profile_id uuid := extensions.gen_random_uuid();
  invitation_expires_at timestamptz := now() + interval '30 days';
  org_language text;
begin
  if not (select public.is_admin()) then
    raise insufficient_privilege using message = 'only active admins may invite staff members';
  end if;
  if clean_email is null
    or length(clean_email) > 254
    or clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or clean_first_name is null
    or length(clean_first_name) > 100
    or clean_last_name is null
    or length(clean_last_name) > 100
    or p_role not in ('staff', 'admin')
  then
    raise check_violation using message = 'invalid staff invitation';
  end if;
  if exists (select 1 from auth.users as account where lower(account.email) = clean_email) then
    raise unique_violation using message = 'an auth identity already uses this email';
  end if;

  perform public.assert_within_hourly_limit('staff.invite', 30);
  select default_language into org_language from public.organizations where id = actor_org;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', new_profile_id,
    'authenticated', 'authenticated', clean_email, '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), '', '', '', '', '', ''
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    new_profile_id::text,
    new_profile_id,
    jsonb_build_object('sub', new_profile_id::text, 'email', clean_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  insert into public.profiles (
    id, org_id, role, first_name, last_name, preferred_language,
    document_type, auth_method, terms_accepted_at
  ) values (
    new_profile_id, actor_org, p_role, clean_first_name, clean_last_name,
    org_language, 'none', 'magic_link', now()
  );

  insert into public.staff_invitations (
    org_id, profile_id, email, role, invited_by, expires_at
  ) values (
    actor_org, new_profile_id, clean_email, p_role, actor, invitation_expires_at
  );

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org, actor, 'staff.invite', 'profile', new_profile_id,
    jsonb_build_object('role', p_role)
  );

  return query select new_profile_id, clean_email, invitation_expires_at;
end;
$$;

create or replace function private.lock_staff_admin_count(p_org_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended(p_org_id::text, 64064));
$$;

create or replace function private.assert_another_active_admin(p_org_id uuid, p_excluded_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where org_id = p_org_id
      and role = 'admin'
      and is_active
      and id <> p_excluded_id
  ) then
    raise check_violation using message = 'the organization must always have at least one active admin';
  end if;
end;
$$;

create or replace function public.set_staff_member_role(p_profile_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  old_role text;
begin
  if not (select public.is_admin()) then
    raise insufficient_privilege using message = 'only active admins may change staff roles';
  end if;
  if p_role not in ('staff', 'admin') then
    raise check_violation using message = 'staff role must be staff or admin';
  end if;
  perform private.lock_staff_admin_count(actor_org);
  select role into old_role
  from public.profiles
  where id = p_profile_id and org_id = actor_org and role in ('staff', 'admin') and is_active
  for update;
  if old_role is null then
    raise no_data_found using message = 'active staff member not found';
  end if;
  if old_role = 'admin' and p_role = 'staff' then
    perform private.assert_another_active_admin(actor_org, p_profile_id);
  end if;
  update public.profiles set role = p_role where id = p_profile_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org, actor, 'staff.role_change', 'profile', p_profile_id,
    jsonb_build_object('from', old_role, 'to', p_role)
  );
end;
$$;

create or replace function public.remove_staff_member(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  subject_role text;
begin
  if not (select public.is_admin()) then
    raise insufficient_privilege using message = 'only active admins may remove staff members';
  end if;
  perform private.lock_staff_admin_count(actor_org);
  select role into subject_role
  from public.profiles
  where id = p_profile_id and org_id = actor_org and role in ('staff', 'admin') and is_active
  for update;
  if subject_role is null then
    raise no_data_found using message = 'active staff member not found';
  end if;
  if subject_role = 'admin' then
    perform private.assert_another_active_admin(actor_org, p_profile_id);
  end if;

  update public.profiles set is_active = false where id = p_profile_id;
  update auth.users
  set banned_until = now() + interval '100 years', updated_at = now()
  where id = p_profile_id;
  delete from auth.refresh_tokens where user_id = p_profile_id::text;
  delete from auth.sessions where user_id = p_profile_id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org, actor, 'staff.remove', 'profile', p_profile_id,
    jsonb_build_object('role', subject_role, 'sessions_revoked', true)
  );
end;
$$;

create table public.internal_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id),
  object_key text not null unique,
  name text not null check (length(btrim(name)) between 1 and 255),
  content_type text not null check (
    content_type in (
      'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  ),
  file_size bigint not null check (file_size between 1 and 10485760),
  created_at timestamptz not null default now()
);

create index internal_documents_org_created_idx
  on public.internal_documents (org_id, created_at desc);

alter table public.internal_documents enable row level security;
alter table public.internal_documents force row level security;

create policy internal_documents_select_org_staff
  on public.internal_documents
  for select
  to authenticated
  using (
    org_id = (select public.current_org_id())
    and (select public.is_staff_or_admin())
  );

create or replace function public.register_internal_document(
  p_object_key text,
  p_name text,
  p_content_type text,
  p_file_size bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  document_id uuid;
begin
  if not (select public.is_staff_or_admin()) then
    raise insufficient_privilege using message = 'internal documents require staff access';
  end if;
  if not p_object_key like actor_org::text || '/documents/%'
    or nullif(btrim(p_name), '') is null
    or length(btrim(p_name)) > 255
    or p_content_type not in (
      'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
    or p_file_size not between 1 and 10485760
  then
    raise check_violation using message = 'invalid internal document metadata';
  end if;
  insert into public.internal_documents (
    org_id, uploaded_by, object_key, name, content_type, file_size
  ) values (
    actor_org, actor, p_object_key, btrim(p_name), p_content_type, p_file_size
  ) returning id into document_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org, actor, 'internal_document.create', 'internal_document', document_id,
    jsonb_build_object('content_type', p_content_type, 'file_size', p_file_size)
  );
  return document_id;
end;
$$;

create or replace function public.search_internal_documents(p_query text default '')
returns table (
  id uuid,
  name text,
  object_key text,
  content_type text,
  file_size bigint,
  uploaded_by uuid,
  uploader_name text,
  created_at timestamptz
)
language sql
security invoker
set search_path = ''
stable
as $$
  select
    document.id,
    document.name,
    document.object_key,
    document.content_type,
    document.file_size,
    document.uploaded_by,
    concat_ws(' ', uploader.first_name, uploader.last_name),
    document.created_at
  from public.internal_documents as document
  join public.profiles as uploader on uploader.id = document.uploaded_by
  where public.immutable_unaccent(document.name)
    ilike '%' || public.immutable_unaccent(coalesce(btrim(p_query), '')) || '%'
  order by document.created_at desc, document.id desc;
$$;

create or replace function public.can_read_internal_document_object(p_object_key text)
returns boolean
language sql
security invoker
set search_path = ''
stable
as $$
  select (select public.is_staff_or_admin()) and exists (
    select 1
    from public.internal_documents
    where object_key = p_object_key
      and org_id = (select public.current_org_id())
  );
$$;

-- Keep the repository-wide erasure registry exhaustive. These are organization
-- operations, not participant records: a participant erasure must neither
-- remove staff access history nor organization-owned internal files.
create or replace function public.personal_data_disposition()
returns table (table_name text, participant_column text, disposition text, reason text)
language sql
immutable
security invoker
set search_path = ''
as $$
  select * from (values
    ('profiles', 'id', 'purge', 'The participant profile and its encrypted fields.'),
    ('participant_notes', 'profile_id', 'purge', 'Staff prose about the participant.'),
    ('push_tokens', 'user_id', 'purge', 'Registered participant devices.'),
    ('push_deliveries', 'recipient_id', 'purge', 'Per-device notification delivery history.'),
    ('custom_notification_group_members', 'participant_id', 'purge', 'Curated notification membership.'),
    ('terms_acceptances', 'profile_id', 'purge', 'Participant consent records.'),
    ('deletion_requests', 'profile_id', 'purge', 'Participant erasure requests.'),
    ('invites', 'accepted_by', 'purge', 'The invitation that admitted the participant.'),
    ('entity_invitations', 'profile_id', 'purge', 'The invitation that admitted an entity collaborator.'),
    ('equipment_deliveries', 'profile_id', 'purge', 'Participant equipment history.'),
    ('event_signups', 'player_id', 'purge', 'Participant event activity.'),
    ('attendance', 'player_id', 'purge', 'Participant attendance history.'),
    ('service_interests', 'user_id', 'purge', 'Participant service interests.'),
    ('conversations', 'user_id', 'purge', 'Participant direct correspondence.'),
    ('messages', 'sender_id', 'purge', 'Participant-authored messages.'),
    ('conversation_read_states', 'user_id', 'purge', 'Participant message read history.'),
    ('conversation_assignment_history', 'user_id', 'purge', 'Participant conversation handling history.'),
    ('forum_posts', 'author_id', 'purge', 'Participant-authored forum posts.'),
    ('forum_replies', 'author_id', 'purge', 'Participant-authored forum replies.'),
    ('forum_flags', 'flagger_id', 'purge', 'Participant safety reports and optional comments.'),
    ('media_items', 'uploaded_by', 'purge', 'Participant gallery media and its consent record.'),
    ('entity_referrals', 'referred_profile_id', 'purge', 'Referral intake cascades with the linked participant.'),
    ('referral_updates', 'author_id', 'purge', 'Referral updates authored by the participant.'),
    ('mentoring_requests', 'player_id', 'purge', 'Private support requests belonging to the player.'),
    ('mentoring_notification_events', 'recipient_id', 'purge', 'Technical mentoring schedule notifications.'),
    ('feedback_submissions', 'author_id', 'purge', 'Encrypted feedback and its private attachment key.'),
    ('survey_responses', 'player_id', 'purge', 'Attributed encrypted survey responses.'),
    ('audit_log', 'actor_id', 'purge', 'Rows where the participant acted.'),
    ('audit_log', 'target_id', 'retain', 'Opaque lawful-access and erasure record.'),
    ('entity_referrals', null, 'retain_limited', 'Unlinked referral intake is purged after 24 months.'),
    ('entity_invitations', null, 'retain_limited', 'Expired entity invitations are purged after 24 months.'),
    ('notification_templates', null, 'not_personal', 'Organization-owned notification copy.'),
    ('custom_notification_groups', null, 'not_personal', 'Organization-owned audience definitions.'),
    ('targeted_notification_sends', null, 'not_personal', 'Aggregate organization send history.'),
    ('surveys', null, 'not_personal', 'Organization-owned survey definitions.'),
    ('survey_questions', null, 'not_personal', 'Organization-owned survey questions.'),
    ('staff_invitations', null, 'not_personal', 'Organization staff access administration history.'),
    ('internal_documents', null, 'not_personal', 'Organization-owned private operational documents.'),
    ('announcements', null, 'not_personal', 'Organization-owned operational content.'),
    ('event_categories', null, 'not_personal', 'Organization-owned event vocabulary.'),
    ('events', null, 'not_personal', 'Organization-owned schedules.'),
    ('event_occurrences', null, 'not_personal', 'Materialized organization schedules.'),
    ('knowledge_categories', null, 'not_personal', 'Organization-owned knowledge vocabulary.'),
    ('knowledge_articles', 'author_id', 'purge', 'Participant-authored knowledge stories.'),
    ('push_publications', 'recipient_id', 'purge', 'Recipient-specific push publications.'),
    ('service_categories', null, 'not_personal', 'Organization-owned service vocabulary.'),
    ('services', null, 'not_personal', 'Organization-owned directory content.'),
    ('service_images', null, 'not_personal', 'Organization-owned service media.'),
    ('service_submission_comments', null, 'not_personal', 'Organization review correspondence.'),
    ('service_submission_notifications', null, 'not_personal', 'Organization staff queue.'),
    ('forum_categories', null, 'not_personal', 'Organization-owned forum vocabulary.'),
    ('collaborating_entities', null, 'not_personal', 'A tenant-owned partner organization.'),
    ('organizations', null, 'not_personal', 'A tenant, not a person.'),
    ('municipality_catalog', null, 'not_personal', 'Official geography with no participant data.')
  ) as disposition(table_name, participant_column, disposition, reason);
$$;

revoke all on table public.staff_invitations, public.internal_documents
  from public, anon, authenticated;
grant select on table public.staff_invitations, public.internal_documents to authenticated;

revoke all on function private.hex_relative_luminance(text) from public, anon, authenticated;
revoke all on function private.hex_contrast_ratio(text, text) from public, anon, authenticated;
revoke all on function private.lock_staff_admin_count(uuid) from public, anon, authenticated;
revoke all on function private.assert_another_active_admin(uuid, uuid) from public, anon, authenticated;

revoke all on function public.update_organization_settings(text, text, text, text, text, text, text[], text)
  from public, anon;
revoke all on function public.list_staff_members() from public, anon;
revoke all on function public.invite_staff_member(text, text, text, text) from public, anon;
revoke all on function public.set_staff_member_role(uuid, text) from public, anon;
revoke all on function public.remove_staff_member(uuid) from public, anon;
revoke all on function public.register_internal_document(text, text, text, bigint) from public, anon;
revoke all on function public.search_internal_documents(text) from public, anon;
revoke all on function public.can_read_internal_document_object(text) from public, anon;

-- The organization CHECK constraints execute these pure immutable helpers as
-- the caller, so authenticated table updates need EXECUTE even though the
-- functions expose no rows or tenant data.
grant execute on function private.hex_relative_luminance(text) to authenticated;
grant execute on function private.hex_contrast_ratio(text, text) to authenticated;
grant execute on function public.update_organization_settings(text, text, text, text, text, text, text[], text)
  to authenticated;
grant execute on function public.list_staff_members() to authenticated;
grant execute on function public.invite_staff_member(text, text, text, text) to authenticated;
grant execute on function public.set_staff_member_role(uuid, text) to authenticated;
grant execute on function public.remove_staff_member(uuid) to authenticated;
grant execute on function public.register_internal_document(text, text, text, bigint) to authenticated;
grant execute on function public.search_internal_documents(text) to authenticated;
grant execute on function public.can_read_internal_document_object(text) to authenticated;
