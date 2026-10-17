-- Signing the authorization on a staff tablet (RAPP-305).
--
-- On the first training day a coach hands a tablet to each player, existing
-- or new, so she signs the season authorization at once. The tablet may be
-- offline, so it makes the signature id and the time itself and sends the
-- signing later through its encrypted outbox; the server accepts each id once
-- and returns the saved record when it arrives again.
--   - consents.collect: the Coach, Staff and Admin presets hold it, so a coach
--     can collect signatures without edit rights on participants;
--   - one set of signing rules for her own app, the tablet and walk-ins;
--   - the record says method staff_device, with the coach as witness;
--   - a walk-in (a new woman with only her name) waits, encrypted, in a
--     review queue. Creating an account needs a recent second factor, which an
--     offline tablet cannot give, so a staff member with participants.invite
--     confirms her with her email (her profile is created with the invitation,
--     RAPP-300) or merges her into an existing player. Until then she is not
--     a participant. Unconfirmed walk-ins are purged after 60 days.

-- 1. The permission ------------------------------------------------------------------------------------

update public.permissions set sort_order = sort_order + 1000;
-- permission-catalog:start
insert into public.permissions (code, area, sort_order) values
  ('participants.view', 'participants', 1),
  ('participants.view_personal', 'participants', 2),
  ('participants.view_sensitive', 'participants', 3),
  ('participants.view_health', 'participants', 4),
  ('consents.collect', 'participants', 5),
  ('participants.notes', 'participants', 6),
  ('participants.invite', 'participants', 7),
  ('participants.deactivate', 'participants', 8),
  ('rgpd.erase', 'participants', 9),
  ('equipment.handover', 'material', 10),
  ('equipment.receive', 'material', 11),
  ('equipment.count', 'material', 12),
  ('equipment.items', 'material', 13),
  ('attendance.mark', 'attendance', 14),
  ('attendance.reports', 'attendance', 15),
  ('announcements.edit', 'content', 16),
  ('announcements.publish', 'content', 17),
  ('events.edit', 'content', 18),
  ('events.publish', 'content', 19),
  ('knowledge.edit', 'content', 20),
  ('knowledge.publish', 'content', 21),
  ('services.edit', 'content', 22),
  ('services.publish', 'content', 23),
  ('services.review', 'content', 24),
  ('forum.moderate', 'community', 25),
  ('gallery.moderate', 'community', 26),
  ('messages.inbox', 'community', 27),
  ('mentoring.manage', 'community', 28),
  ('feedback.view', 'community', 29),
  ('surveys.manage', 'community', 30),
  ('surveys.results', 'community', 31),
  ('notifications.send', 'community', 32),
  ('referrals.manage', 'entities', 33),
  ('entities.manage', 'entities', 34),
  ('impact.view', 'impact', 35),
  ('export.participants', 'impact', 36),
  ('export.participants_sensitive', 'impact', 37),
  ('export.attendance', 'impact', 38),
  ('export.events', 'impact', 39),
  ('audit.view', 'impact', 40),
  ('settings.organization', 'settings', 41),
  ('settings.branding', 'settings', 42),
  ('settings.documents', 'settings', 43),
  ('team.manage', 'settings', 44)
on conflict (code) do update set area = excluded.area, sort_order = excluded.sort_order;
-- permission-catalog:end

-- permission-preset-defaults:start
insert into public.permission_preset_defaults (builtin_key, permission_code) values
  ('coach', 'consents.collect'),
  ('staff', 'consents.collect')
on conflict do nothing;
-- permission-preset-defaults:end
insert into public.permission_preset_defaults (builtin_key, permission_code)
values ('admin', 'consents.collect')
on conflict do nothing;

-- Existing organizations: their built-in presets, and the people on them.
insert into public.permission_preset_permissions (org_id, preset_id, permission_code)
select preset.org_id, preset.id, 'consents.collect'
  from public.permission_presets preset
 where preset.builtin_key in ('coach', 'staff', 'admin')
on conflict do nothing;
insert into public.team_member_permissions (org_id, profile_id, permission_code)
select access.org_id, access.profile_id, 'consents.collect'
  from public.team_member_access access
  join public.permission_presets preset on preset.id = access.preset_id
 where preset.builtin_key in ('coach', 'staff', 'admin')
union
select profile.org_id, profile.id, 'consents.collect'
  from public.profiles profile
 where profile.role = 'admin'
on conflict do nothing;

-- 2. One set of signing rules ------------------------------------------------------------------------------

alter table public.authorization_signatures
  add column witnessed_by uuid references public.profiles (id) on delete set null;

comment on column public.authorization_signatures.witnessed_by is
  'The coach whose tablet she signed on (method staff_device, RAPP-305).';

-- Raises check_violation unless the signing has every required consent, the
-- medical answer, a drawing or "could not draw", a supported language and a
-- well-formed emergency contact.
create or replace function private.validate_signing_payload(p_payload jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  consents jsonb := coalesce(p_payload -> 'consents', '{}'::jsonb);
  health text := nullif(btrim(p_payload ->> 'health_info'), '');
  drawing jsonb := p_payload -> 'signature';
  cannot_draw boolean := coalesce((p_payload ->> 'unable_to_draw')::boolean, false);
  shown_language text := nullif(p_payload ->> 'language', '');
  contact jsonb := p_payload -> 'emergency_contact';
begin
  if jsonb_typeof(consents) <> 'object'
    or exists (
      select 1 from unnest(private.authorization_consent_keys(true)) required_key
       where (consents -> required_key) is distinct from 'true'::jsonb
    )
    or exists (
      select 1 from jsonb_each(consents) given
       where not (given.key = any (private.authorization_consent_keys()))
          or jsonb_typeof(given.value) <> 'boolean'
    )
  then
    raise check_violation using message = 'every required consent must be given';
  end if;
  if health is null or length(health) > 4000 then
    raise check_violation using message = 'the medical answer is required: "No" or a description';
  end if;
  if drawing is not null and (jsonb_typeof(drawing) <> 'array' or jsonb_array_length(drawing) = 0) then
    drawing := null;
  end if;
  if drawing is not null and octet_length(drawing::text) > 200000 then
    raise check_violation using message = 'the signature is too large';
  end if;
  if (drawing is null) = (not cannot_draw) then
    raise check_violation using message = 'sign with a drawing, or record that she could not draw';
  end if;
  if shown_language is not null and shown_language not in ('ca', 'es', 'en', 'ar', 'fa') then
    raise check_violation using message = 'unsupported language';
  end if;
  if contact is not null and jsonb_typeof(contact) <> 'null' and (
    jsonb_typeof(contact) <> 'object'
    or length(coalesce(contact ->> 'name', '')) > 200
    or length(coalesce(contact ->> 'relation', '')) > 100
    or length(coalesce(contact ->> 'phone', '')) > 50
  ) then
    raise check_violation using message = 'invalid emergency contact';
  end if;
end;
$$;

-- Records a signing for her: the signature, each consent, her medical answer,
-- emergency contact and image rights. The id is the caller's: the same id
-- again returns it without writing twice. The version must belong to her
-- organization's current season.
create or replace function private.record_signature(
  p_signature_id uuid,
  p_profile_id uuid,
  p_version_id uuid,
  p_payload jsonb,
  p_method text,
  p_witness uuid,
  p_signed_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles;
  version public.authorization_versions;
  consents jsonb := coalesce(p_payload -> 'consents', '{}'::jsonb);
  contact jsonb := case when jsonb_typeof(p_payload -> 'emergency_contact') = 'object'
    then p_payload -> 'emergency_contact' end;
  drawing jsonb := case
    when jsonb_typeof(p_payload -> 'signature') = 'array'
     and jsonb_array_length(p_payload -> 'signature') > 0
    then p_payload -> 'signature' end;
  consent_key text;
begin
  if exists (select 1 from public.authorization_signatures where id = p_signature_id) then
    return p_signature_id;
  end if;

  select * into target from public.profiles where id = p_profile_id;
  select * into version from public.authorization_versions where id = p_version_id;
  if target.id is null or version.id is null or version.org_id <> target.org_id
    or version.season_id is distinct from private.current_season_id(target.org_id)
  then
    raise check_violation using message = 'sign a version of the current season';
  end if;
  perform private.validate_signing_payload(p_payload);

  insert into public.authorization_signatures (
    id, org_id, profile_id, season_id, version_id, method, language, device,
    signed_at, signature, unable_to_draw, witnessed_by
  ) values (
    p_signature_id, target.org_id, target.id, version.season_id, version.id, p_method,
    nullif(p_payload ->> 'language', ''),
    left(nullif(btrim(p_payload ->> 'device'), ''), 200),
    coalesce(p_signed_at, now()), drawing, drawing is null, p_witness
  )
  on conflict (id) do nothing;

  foreach consent_key in array private.authorization_consent_keys() loop
    insert into public.authorization_consent_events
      (org_id, profile_id, signature_id, consent_key, granted, method, decided_at)
    values (target.org_id, target.id, p_signature_id, consent_key,
            coalesce((consents ->> consent_key)::boolean, false), p_method,
            coalesce(p_signed_at, now()));
  end loop;

  perform set_config('ramassa.consent_event_written', 'on', true);
  update public.profiles set
    health_info = public.encrypt_field(nullif(btrim(p_payload ->> 'health_info'), '')),
    emergency_contact_name = case when contact ? 'name'
      then nullif(btrim(contact ->> 'name'), '') else emergency_contact_name end,
    emergency_contact_relation = case when contact ? 'relation'
      then nullif(btrim(contact ->> 'relation'), '') else emergency_contact_relation end,
    emergency_contact_phone = case when contact ? 'phone'
      then public.encrypt_field(nullif(btrim(contact ->> 'phone'), '')) else emergency_contact_phone end,
    media_consent_at = case
      when coalesce((consents ->> 'image_rights')::boolean, false)
        then coalesce(media_consent_at, now())
      else null
    end
  where id = target.id;
  perform set_config('ramassa.consent_event_written', '', true);

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (target.org_id, coalesce(p_witness, target.id), 'authorization.sign', 'authorization_signature',
          p_signature_id,
          jsonb_build_object('version_id', version.id, 'method', p_method,
                             'unable_to_draw', drawing is null, 'witnessed_by', p_witness));
  return p_signature_id;
end;
$$;

-- Her own app (RAPP-304), now on the shared rules. She signs the current version.
create or replace function public.sign_authorization(p_version_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  me public.profiles;
  version public.authorization_versions;
begin
  select * into me from public.profiles where id = caller and role = 'player';
  if me.id is null then
    raise insufficient_privilege using message = 'only a player signs her authorization';
  end if;
  version := private.current_authorization_version(me.org_id);
  if version.id is null or version.id <> p_version_id then
    raise check_violation using message = 'sign the current version';
  end if;
  return private.record_signature(gen_random_uuid(), caller, p_version_id, p_payload, 'app', null, now());
end;
$$;

-- 3. The tablet ---------------------------------------------------------------------------------------------

-- What a coach hands over: the current season's latest version. The tablet
-- keeps it, so it can collect signatures offline.
create or replace function public.current_authorization_for_signing()
returns table (version_id uuid, season_name text, version_number integer, content jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
begin
  if not (select public.has_permission('consents.collect')) then
    raise insufficient_privilege using message = 'collecting signatures needs consents.collect';
  end if;
  return query
    select v.id, s.name, v.version_number, v.content
      from private.current_authorization_version(actor_org) v
      join public.seasons s on s.id = v.season_id
     where v.id is not null;
end;
$$;

-- A signing from the tablet's outbox, for a player who exists. The coach is
-- the witness. The time is the tablet's: within the last 60 days, and not
-- more than 10 minutes ahead of the server.
create or replace function public.record_staff_device_signature(
  p_signature_id uuid,
  p_profile_id uuid,
  p_version_id uuid,
  p_payload jsonb,
  p_signed_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if not (select public.has_permission('consents.collect')) then
    raise insufficient_privilege using message = 'collecting signatures needs consents.collect';
  end if;
  if exists (select 1 from public.authorization_signatures where id = p_signature_id) then
    return p_signature_id;
  end if;
  if not exists (
    select 1 from public.profiles
     where id = p_profile_id and org_id = (select public.current_org_id())
       and role in ('player', 'invited')
  ) then
    raise insufficient_privilege using message = 'no participant of this organization';
  end if;
  if p_signed_at is null or p_signed_at > now() + interval '10 minutes'
    or p_signed_at < now() - interval '60 days'
  then
    raise check_violation using message = 'the signing time is outside the allowed window';
  end if;
  return private.record_signature(p_signature_id, p_profile_id, p_version_id, p_payload,
                                  'staff_device', actor, p_signed_at);
end;
$$;

-- 4. Walk-ins ------------------------------------------------------------------------------------------------

create table public.walk_in_signings (
  id uuid primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  first_name text not null check (length(btrim(first_name)) between 1 and 100),
  last_name text not null check (length(btrim(last_name)) between 1 and 100),
  version_id uuid not null references public.authorization_versions (id) on delete restrict,
  -- Her signing (consents, medical answer, signature...), encrypted. Cleared
  -- once staff confirm, merge or discard her.
  payload bytea,
  signed_at timestamptz not null,
  collected_by uuid references public.profiles (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'merged', 'discarded')),
  resolved_profile_id uuid references public.profiles (id) on delete set null,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint walk_in_signings_payload_while_pending check ((status = 'pending') = (payload is not null))
);

comment on table public.walk_in_signings is
  'A new woman''s tablet signing, waiting for staff to confirm or merge her (RAPP-305). Purged after 60 days.';

alter table public.walk_in_signings enable row level security;
create policy walk_in_signings_select_team on public.walk_in_signings
  for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (select public.has_permission('participants.invite'))
  );
revoke all on table public.walk_in_signings from anon, authenticated;
grant select (id, org_id, first_name, last_name, version_id, signed_at, collected_by, status,
              resolved_profile_id, resolved_at, created_at)
  on table public.walk_in_signings to authenticated;

create or replace function public.submit_walk_in_signing(
  p_id uuid,
  p_first_name text,
  p_last_name text,
  p_version_id uuid,
  p_payload jsonb,
  p_signed_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
begin
  if not (select public.has_permission('consents.collect')) then
    raise insufficient_privilege using message = 'collecting signatures needs consents.collect';
  end if;
  if exists (select 1 from public.walk_in_signings where id = p_id) then
    return p_id;
  end if;
  if not exists (
    select 1 from public.authorization_versions v
     where v.id = p_version_id and v.org_id = actor_org
       and v.season_id = private.current_season_id(actor_org)
  ) then
    raise check_violation using message = 'sign a version of the current season';
  end if;
  if nullif(btrim(p_first_name), '') is null or nullif(btrim(p_last_name), '') is null then
    raise check_violation using message = 'a walk-in needs her first and last name';
  end if;
  if p_signed_at is null or p_signed_at > now() + interval '10 minutes'
    or p_signed_at < now() - interval '60 days'
  then
    raise check_violation using message = 'the signing time is outside the allowed window';
  end if;
  perform private.validate_signing_payload(p_payload);

  insert into public.walk_in_signings
    (id, org_id, first_name, last_name, version_id, payload, signed_at, collected_by)
  values (p_id, actor_org, btrim(p_first_name), btrim(p_last_name), p_version_id,
          public.encrypt_field(p_payload::text), p_signed_at, actor)
  on conflict (id) do nothing;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'walk_in.submit', 'walk_in_signing', p_id, '{}'::jsonb);
  return p_id;
end;
$$;

create or replace function public.list_walk_in_signings()
returns table (
  id uuid, first_name text, last_name text, signed_at timestamptz,
  collected_by_name text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.has_permission('participants.invite')) then
    raise insufficient_privilege using message = 'the walk-in queue needs participants.invite';
  end if;
  return query
    select w.id, w.first_name, w.last_name, w.signed_at,
           nullif(btrim(coalesce(coach.first_name, '') || ' ' || coalesce(coach.last_name, '')), ''),
           w.created_at
      from public.walk_in_signings w
      left join public.profiles coach on coach.id = w.collected_by
     where w.org_id = (select public.current_org_id()) and w.status = 'pending'
     order by w.signed_at;
end;
$$;

-- Attaches the walk-in's signing to her profile and closes the walk-in.
create or replace function private.resolve_walk_in(p_walk_in public.walk_in_signings, p_profile_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.record_signature(
    p_walk_in.id, p_profile_id, p_walk_in.version_id,
    public.decrypt_field(p_walk_in.payload)::jsonb, 'staff_device', p_walk_in.collected_by,
    p_walk_in.signed_at);
  update public.walk_in_signings
     set status = p_status, payload = null, resolved_profile_id = p_profile_id,
         resolved_by = (select auth.uid()), resolved_at = now()
   where id = p_walk_in.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (p_walk_in.org_id, (select auth.uid()), 'walk_in.' || p_status, 'walk_in_signing', p_walk_in.id,
          jsonb_build_object('profile_id', p_profile_id));
end;
$$;

-- Confirms a walk-in with her email: her account and profile are created by
-- the invitation (RAPP-300), and her tablet signing is attached. Needs a
-- recent second factor, like every account creation.
create or replace function public.confirm_walk_in(p_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  walk_in public.walk_in_signings;
  created_profile uuid;
begin
  perform private.require_recent_second_factor();
  if not (select public.has_permission('participants.invite')) then
    raise insufficient_privilege using message = 'confirming a walk-in needs participants.invite';
  end if;
  select * into walk_in from public.walk_in_signings
   where id = p_id and org_id = (select public.current_org_id()) and status = 'pending'
   for update;
  if walk_in.id is null then
    raise insufficient_privilege using message = 'no pending walk-in of this organization';
  end if;

  select invite.profile_id into created_profile
    from public.create_participant_invite(jsonb_build_object(
      'email', p_email, 'first_name', walk_in.first_name, 'last_name', walk_in.last_name)) invite;
  if created_profile is null then
    raise check_violation using message = 'the walk-in''s profile was not created';
  end if;
  perform private.resolve_walk_in(walk_in, created_profile, 'confirmed');
  return created_profile;
end;
$$;

-- Merges a walk-in into a player who already exists (she was referred, or
-- already had the app). She keeps one authorization for the season.
create or replace function public.merge_walk_in(p_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  walk_in public.walk_in_signings;
begin
  if not (select public.has_permission('participants.invite')) then
    raise insufficient_privilege using message = 'merging a walk-in needs participants.invite';
  end if;
  select * into walk_in from public.walk_in_signings
   where id = p_id and org_id = (select public.current_org_id()) and status = 'pending'
   for update;
  if walk_in.id is null then
    raise insufficient_privilege using message = 'no pending walk-in of this organization';
  end if;
  if not exists (
    select 1 from public.profiles
     where id = p_profile_id and org_id = walk_in.org_id and role in ('player', 'invited')
  ) then
    raise insufficient_privilege using message = 'no participant of this organization';
  end if;
  perform private.resolve_walk_in(walk_in, p_profile_id, 'merged');
end;
$$;

create or replace function public.discard_walk_in(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.has_permission('participants.invite')) then
    raise insufficient_privilege using message = 'discarding a walk-in needs participants.invite';
  end if;
  update public.walk_in_signings
     set status = 'discarded', payload = null, resolved_by = (select auth.uid()), resolved_at = now()
   where id = p_id and org_id = (select public.current_org_id()) and status = 'pending';
  if not found then
    raise insufficient_privilege using message = 'no pending walk-in of this organization';
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values ((select public.current_org_id()), (select auth.uid()), 'walk_in.discarded',
          'walk_in_signing', p_id, '{}'::jsonb);
end;
$$;

-- Unconfirmed walk-ins hold health data with no participant behind them:
-- purged after 60 days, every day.
create or replace function private.purge_stale_walk_ins(p_now timestamptz default now())
returns integer
language sql
security definer
set search_path = ''
as $$
  with purged as (
    delete from public.walk_in_signings
     where created_at < p_now - interval '60 days'
    returning 1
  )
  select count(*)::integer from purged;
$$;

select cron.schedule('ramassa-purge-stale-walk-ins', '23 3 * * *',
                     $$select private.purge_stale_walk_ins()$$);


create or replace function public.personal_data_disposition()
 RETURNS TABLE(table_name text, participant_column text, disposition text, reason text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $$
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
    ('municipality_catalog', null, 'not_personal', 'Official geography with no participant data.'),
    ('permissions', null, 'not_personal', 'The product permission catalog.'),
    ('permission_preset_defaults', null, 'not_personal', 'Product default permissions of the built-in presets.'),
    ('permission_presets', null, 'not_personal', 'Organization-owned access presets.'),
    ('permission_preset_permissions', null, 'not_personal', 'Organization-owned access presets.'),
    ('team_member_access', null, 'not_personal', 'Team access administration; players never hold permissions.'),
    ('team_member_permissions', null, 'not_personal', 'Team access administration; players never hold permissions.'),
    ('equipment_item_types', null, 'not_personal', 'The organization''s material catalog.'),
    ('stock_movements', 'participant_id', 'purge', 'Stock movements keep their quantity so stock stays right; her link is cleared by ON DELETE SET NULL.'),
    ('stock_alerts', null, 'not_personal', 'Stock that went below zero, for the team to count.'),
    ('equipment_arrivals', null, 'not_personal', 'Goods received: source, problems and cost. No participant data.'),
    ('equipment_arrival_photos', null, 'not_personal', 'Photos of goods received and their receipts.'),
    ('stock_counts', null, 'not_personal', 'Stock counts: what was expected and what was on the shelf.'),
    ('staff_checkouts', null, 'not_personal', 'Material lent to a staff member for a trip or an event.'),
    ('photo_handoffs', null, 'not_personal', 'A staff member''s request to take a document photo with the phone.'),
    ('profile_answers', 'profile_id', 'purge', 'Which intake questions were answered, and by whom.'),
    ('intake_question_states', 'profile_id', 'purge', 'Which intake questions staff chose to ask or not ask her.'),
    ('seasons', null, 'not_personal', 'The organization''s seasons.'),
    ('authorization_versions', null, 'not_personal', 'The organization''s published authorization texts.'),
    ('authorization_signatures', 'profile_id', 'purge', 'Her signed or paper authorizations, with her drawn signature.'),
    ('authorization_consent_events', 'profile_id', 'purge', 'Each consent she gave or withdrew.'),
    ('season_answers', 'profile_id', 'purge', 'Her registration answers, one row per season.'),
    ('walk_in_signings', null, 'retain_limited', 'A walk-in''s tablet signing until staff confirm it; purged after 60 days.')
  ) as disposition(table_name, participant_column, disposition, reason);
$$;


revoke all on function public.current_authorization_for_signing() from public, anon;
revoke all on function public.record_staff_device_signature(uuid, uuid, uuid, jsonb, timestamptz) from public, anon;
revoke all on function public.submit_walk_in_signing(uuid, text, text, uuid, jsonb, timestamptz) from public, anon;
revoke all on function public.list_walk_in_signings() from public, anon;
revoke all on function public.confirm_walk_in(uuid, text) from public, anon;
revoke all on function public.merge_walk_in(uuid, uuid) from public, anon;
revoke all on function public.discard_walk_in(uuid) from public, anon;
revoke all on function public.sign_authorization(uuid, jsonb) from public, anon;
grant execute on function public.current_authorization_for_signing() to authenticated;
grant execute on function public.record_staff_device_signature(uuid, uuid, uuid, jsonb, timestamptz) to authenticated;
grant execute on function public.submit_walk_in_signing(uuid, text, text, uuid, jsonb, timestamptz) to authenticated;
grant execute on function public.list_walk_in_signings() to authenticated;
grant execute on function public.confirm_walk_in(uuid, text) to authenticated;
grant execute on function public.merge_walk_in(uuid, uuid) to authenticated;
grant execute on function public.discard_walk_in(uuid) to authenticated;
grant execute on function public.sign_authorization(uuid, jsonb) to authenticated;
