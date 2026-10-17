-- The participation authorization, signed in the app (RAPP-304).
--
-- Every player signs Ramassà's authorization for the season: participation,
-- insurance, data processing, image rights, obligations, the code of conduct
-- and safeguarding. Until now only the paper counted. Now:
--   - staff with settings.organization publish a version per season, in the
--     staff content's multilingual format; a published version is never edited,
--     and a new one makes every player sign again;
--   - she signs in the app with a tick per consent, the medical answer and a
--     drawn signature (strokes, as the material handover stores them), or the
--     ticks alone when she cannot draw, and the record says so;
--   - each consent is its own row with version, language, time, device and
--     method; the optional ones stay revocable, and every change is recorded;
--   - the medical answer is encrypted and readable only with the new
--     participants.view_health, which only the Admin preset holds by default;
--   - staff record "signed on paper" for a season, which satisfies the gate.
--
-- The consents are a fixed vocabulary, so a required one can never be made
-- optional by mistake: participation, data_processing, code_of_conduct and
-- health_data are required; image_rights (it drives the media consent),
-- newsletter and messaging_groups are optional. Staff write their wording.
--
-- Seasons are minimal here (name, start, current). RAPP-306 adds the rest.

-- 1. Seasons -------------------------------------------------------------------------------------------

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 50),
  starts_on date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create unique index seasons_one_current_per_org on public.seasons (org_id) where is_current;

comment on table public.seasons is 'The organization''s seasons (RAPP-304; RAPP-306 extends them). One is current.';

alter table public.seasons enable row level security;
create policy seasons_select_org on public.seasons
  for select to authenticated
  using (org_id = (select public.current_org_id()));
revoke all on table public.seasons from anon, authenticated;
grant select on table public.seasons to authenticated;

-- Every organization starts in 2026/27, the season the paper authorization covers.
insert into public.seasons (org_id, name, starts_on, is_current)
select id, '2026/27', date '2026-09-01', true from public.organizations
on conflict (org_id, name) do nothing;

create or replace function private.current_season_id(p_org_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select s.id from public.seasons s where s.org_id = p_org_id and s.is_current;
$$;

-- 2. Authorization versions --------------------------------------------------------------------------

create or replace function private.authorization_consent_keys(p_required boolean default null)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case
    when p_required is true then
      array['participation', 'data_processing', 'code_of_conduct', 'health_data']
    when p_required is false then
      array['image_rights', 'newsletter', 'messaging_groups']
    else
      array['participation', 'data_processing', 'code_of_conduct', 'health_data',
            'image_rights', 'newsletter', 'messaging_groups']
  end;
$$;

-- {ca?, es?, en?, ar?, fa?}: at least one language, each at most 20000 characters.
create or replace function private.localized_text_valid(p_text jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_text) = 'object'
    and p_text - array['ca', 'es', 'en', 'ar', 'fa'] = '{}'::jsonb
    and exists (
      select 1 from jsonb_each(p_text) entry
       where jsonb_typeof(entry.value) = 'string' and length(btrim(entry.value #>> '{}')) > 0
    )
    and not exists (
      select 1 from jsonb_each(p_text) entry
       where jsonb_typeof(entry.value) <> 'string' or length(entry.value #>> '{}') > 20000
    ),
    false);
$$;

-- The version's content:
--   title: localized text;
--   sections: 1 to 20 of {key, title, body}, key in lowercase letters and underscores;
--   consents: every consent key with {label: localized text, required: true|false}, the
--     flag fixed by the vocabulary above;
--   attachments: up to 10 of {label: localized text, url: https}.
create or replace function private.authorization_content_valid(p_content jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_content) = 'object'
    and private.localized_text_valid(p_content -> 'title')
    and jsonb_typeof(p_content -> 'sections') = 'array'
    and jsonb_array_length(p_content -> 'sections') between 1 and 20
    and not exists (
      select 1 from jsonb_array_elements(p_content -> 'sections') section
       where coalesce(section ->> 'key', '') !~ '^[a-z_]{1,40}$'
          or not private.localized_text_valid(section -> 'title')
          or not private.localized_text_valid(section -> 'body')
    )
    and jsonb_typeof(p_content -> 'consents') = 'object'
    and (select array_agg(key order by key) from jsonb_object_keys(p_content -> 'consents') key)
        = (select array_agg(key order by key) from unnest(private.authorization_consent_keys()) key)
    and not exists (
      select 1 from jsonb_each(p_content -> 'consents') consent
       where not private.localized_text_valid(consent.value -> 'label')
          or (consent.value -> 'required') is distinct from
             to_jsonb(consent.key = any (private.authorization_consent_keys(true)))
    )
    and coalesce(jsonb_typeof(p_content -> 'attachments'), 'array') = 'array'
    and coalesce(jsonb_array_length(p_content -> 'attachments'), 0) <= 10
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_content -> 'attachments', '[]'::jsonb)) attachment
       where not private.localized_text_valid(attachment -> 'label')
          or coalesce(attachment ->> 'url', '') !~ '^https://[^[:space:]]+$'
          or length(attachment ->> 'url') > 2000
    ),
    false);
$$;

create table public.authorization_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  season_id uuid not null references public.seasons (id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  content jsonb not null check (private.authorization_content_valid(content)),
  published_at timestamptz not null default now(),
  published_by uuid references public.profiles (id) on delete set null,
  unique (season_id, version_number)
);

comment on table public.authorization_versions is
  'Published participation authorization texts, per season (RAPP-304). Never edited: a change is a new version.';

create or replace function private.authorization_versions_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise object_not_in_prerequisite_state
    using message = 'a published authorization version is never edited; publish a new one';
end;
$$;

create trigger authorization_versions_immutable
  before update on public.authorization_versions
  for each row execute function private.authorization_versions_immutable();

alter table public.authorization_versions enable row level security;
create policy authorization_versions_select_org on public.authorization_versions
  for select to authenticated
  using (org_id = (select public.current_org_id()));
revoke all on table public.authorization_versions from anon, authenticated;
grant select on table public.authorization_versions to authenticated;

-- The latest published version of the current season, or none.
create or replace function private.current_authorization_version(p_org_id uuid)
returns public.authorization_versions
language sql
stable
set search_path = ''
as $$
  select v.* from public.authorization_versions v
   where v.season_id = private.current_season_id(p_org_id)
   order by v.version_number desc
   limit 1;
$$;

-- 3. Signatures and consents --------------------------------------------------------------------------

create table public.authorization_signatures (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  season_id uuid not null references public.seasons (id) on delete cascade,
  -- Null for a paper record: the paper is its own text.
  version_id uuid references public.authorization_versions (id) on delete restrict,
  method text not null check (method in ('app', 'paper', 'staff_device')),
  language text check (language is null or language in ('ca', 'es', 'en', 'ar', 'fa')),
  device text check (device is null or length(device) <= 200),
  signed_at timestamptz not null default now(),
  -- Her drawn signature: [[[x, y], ...], ...] scaled to 0..1000, as the handover.
  signature jsonb check (
    signature is null or (jsonb_typeof(signature) = 'array' and octet_length(signature::text) <= 200000)
  ),
  unable_to_draw boolean not null default false,
  paper_signed_on date,
  recorded_by uuid references public.profiles (id) on delete set null,
  constraint authorization_signatures_shape check (
    (method = 'paper' and paper_signed_on is not null and signature is null)
    or (method <> 'paper' and version_id is not null
        and ((signature is not null) <> unable_to_draw))
  )
);

create index authorization_signatures_profile_season_idx
  on public.authorization_signatures (profile_id, season_id);

comment on table public.authorization_signatures is
  'Her participation authorization per season: signed in the app, on a staff device, or on paper (RAPP-304).';

create table public.authorization_consent_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- Set when the consent was given while signing; null for a later change.
  signature_id uuid references public.authorization_signatures (id) on delete cascade,
  consent_key text not null check (consent_key = any (private.authorization_consent_keys())),
  granted boolean not null,
  method text not null check (method in ('app', 'paper', 'staff_device', 'profile', 'staff')),
  decided_at timestamptz not null default now()
);

create index authorization_consent_events_profile_idx
  on public.authorization_consent_events (profile_id, consent_key, decided_at desc);

comment on table public.authorization_consent_events is
  'Each consent she gave or withdrew, in order (RAPP-304). The latest row per key is the current state.';

alter table public.authorization_signatures enable row level security;
alter table public.authorization_consent_events enable row level security;
create policy authorization_signatures_select_own_or_team on public.authorization_signatures
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (org_id = (select public.current_org_id())
        and (select public.has_permission('participants.view_personal')))
  );
create policy authorization_consent_events_select_own_or_team on public.authorization_consent_events
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (org_id = (select public.current_org_id())
        and (select public.has_permission('participants.view_personal')))
  );
revoke all on table public.authorization_signatures, public.authorization_consent_events
  from anon, authenticated;
-- The drawn signature is read through participant_authorizations(), which
-- needs participants.view_sensitive; the table grant leaves it out.
grant select (id, org_id, profile_id, season_id, version_id, method, language, device, signed_at,
              unable_to_draw, paper_signed_on, recorded_by)
  on table public.authorization_signatures to authenticated;
grant select on table public.authorization_consent_events to authenticated;

-- 4. Her health answer and emergency contact ------------------------------------------------------------

alter table public.profiles
  add column health_info bytea,
  add column emergency_contact_name text
    check (emergency_contact_name is null or length(emergency_contact_name) <= 200),
  add column emergency_contact_relation text
    check (emergency_contact_relation is null or length(emergency_contact_relation) <= 100),
  add column emergency_contact_phone bytea;

comment on column public.profiles.health_info is
  'Encrypted (ADR-004). Her medical answer from the authorization: "No" or a description (RAPP-304). Readable only with participants.view_health.';
comment on column public.profiles.emergency_contact_phone is
  'Encrypted (ADR-004). The emergency contact''s phone (RAPP-304).';

-- Every image-rights change is a consent event, whichever path changed the
-- media consent (her profile edit, staff edit, the wizard). The two consent
-- functions below write their own event and switch this off for their write.
create or replace function private.record_media_consent_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('ramassa.consent_event_written', true) = 'on' then
    return new;
  end if;
  if (old.media_consent_at is null) is distinct from (new.media_consent_at is null) then
    insert into public.authorization_consent_events (org_id, profile_id, consent_key, granted, method)
    values (new.org_id, new.id, 'image_rights', new.media_consent_at is not null,
            case when new.id = (select auth.uid()) then 'profile' else 'staff' end);
  end if;
  return new;
end;
$$;

create trigger profiles_record_media_consent_change
  after update of media_consent_at on public.profiles
  for each row execute function private.record_media_consent_change();

-- 5. The new permission -----------------------------------------------------------------------------------

-- The full catalog again, so the parity test reads one block. The old orders
-- move out of the way first: sort_order is unique.
update public.permissions set sort_order = sort_order + 1000;
-- permission-catalog:start
insert into public.permissions (code, area, sort_order) values
  ('participants.view', 'participants', 1),
  ('participants.view_personal', 'participants', 2),
  ('participants.view_sensitive', 'participants', 3),
  ('participants.view_health', 'participants', 4),
  ('participants.notes', 'participants', 5),
  ('participants.invite', 'participants', 6),
  ('participants.deactivate', 'participants', 7),
  ('rgpd.erase', 'participants', 8),
  ('equipment.handover', 'material', 9),
  ('equipment.receive', 'material', 10),
  ('equipment.count', 'material', 11),
  ('equipment.items', 'material', 12),
  ('attendance.mark', 'attendance', 13),
  ('attendance.reports', 'attendance', 14),
  ('announcements.edit', 'content', 15),
  ('announcements.publish', 'content', 16),
  ('events.edit', 'content', 17),
  ('events.publish', 'content', 18),
  ('knowledge.edit', 'content', 19),
  ('knowledge.publish', 'content', 20),
  ('services.edit', 'content', 21),
  ('services.publish', 'content', 22),
  ('services.review', 'content', 23),
  ('forum.moderate', 'community', 24),
  ('gallery.moderate', 'community', 25),
  ('messages.inbox', 'community', 26),
  ('mentoring.manage', 'community', 27),
  ('feedback.view', 'community', 28),
  ('surveys.manage', 'community', 29),
  ('surveys.results', 'community', 30),
  ('notifications.send', 'community', 31),
  ('referrals.manage', 'entities', 32),
  ('entities.manage', 'entities', 33),
  ('impact.view', 'impact', 34),
  ('export.participants', 'impact', 35),
  ('export.participants_sensitive', 'impact', 36),
  ('export.attendance', 'impact', 37),
  ('export.events', 'impact', 38),
  ('audit.view', 'impact', 39),
  ('settings.organization', 'settings', 40),
  ('settings.branding', 'settings', 41),
  ('settings.documents', 'settings', 42),
  ('team.manage', 'settings', 43)
on conflict (code) do update set area = excluded.area, sort_order = excluded.sort_order;
-- permission-catalog:end

-- Only the Admin preset holds it by default. Admins grant it to the coaches
-- who need it for safety at training.
insert into public.permission_preset_defaults (builtin_key, permission_code)
values ('admin', 'participants.view_health')
on conflict do nothing;
insert into public.permission_preset_permissions (org_id, preset_id, permission_code)
select preset.org_id, preset.id, 'participants.view_health'
  from public.permission_presets preset
 where preset.builtin_key = 'admin'
on conflict do nothing;
insert into public.team_member_permissions (org_id, profile_id, permission_code)
select profile.org_id, profile.id, 'participants.view_health'
  from public.profiles profile
 where profile.role = 'admin'
on conflict do nothing;

-- 6. Staff publish a version ---------------------------------------------------------------------------------

create or replace function public.publish_authorization_version(p_content jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  season uuid;
  next_number integer;
  saved uuid;
begin
  if not (select public.has_permission('settings.organization')) then
    raise insufficient_privilege using message = 'publishing the authorization needs settings.organization';
  end if;
  season := private.current_season_id(actor_org);
  if season is null then
    raise object_not_in_prerequisite_state using message = 'the organization has no current season';
  end if;
  if not private.authorization_content_valid(p_content) then
    raise check_violation using message = 'the authorization needs its title, sections and every consent';
  end if;

  perform 1 from public.seasons where id = season for update;
  select coalesce(max(v.version_number), 0) + 1 into next_number
    from public.authorization_versions v where v.season_id = season;

  insert into public.authorization_versions (org_id, season_id, version_number, content, published_by)
  values (actor_org, season, next_number, p_content, actor)
  returning id into saved;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'authorization.publish', 'authorization_version', saved,
          jsonb_build_object('season_id', season, 'version_number', next_number));
  return saved;
end;
$$;

create or replace function public.list_authorization_versions()
returns table (
  id uuid, season_id uuid, season_name text, version_number integer,
  content jsonb, published_at timestamptz, is_current boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.has_permission('settings.organization')) then
    raise insufficient_privilege using message = 'the authorization versions need settings.organization';
  end if;
  return query
    select v.id, v.season_id, s.name, v.version_number, v.content, v.published_at,
           v.id = (private.current_authorization_version(v.org_id)).id
      from public.authorization_versions v
      join public.seasons s on s.id = v.season_id
     where v.org_id = (select public.current_org_id())
     order by s.starts_on desc, v.version_number desc;
end;
$$;

-- 7. Her side: the gate, signing, optional consents ---------------------------------------------------------------

-- Whether she must sign before using the app, and the version to sign. Valid
-- means: signed the latest version of the current season, or a paper record for
-- that season. Only a player is gated; staff and entities never are.
create or replace function public.my_authorization_status()
returns table (
  required boolean, version_id uuid, season_id uuid, season_name text,
  version_number integer, content jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select p.id, p.org_id from public.profiles p
     where p.id = (select auth.uid()) and p.role = 'player'
  ),
  current_version as (
    select v.* from me, private.current_authorization_version(me.org_id) v where v.id is not null
  )
  select
    not exists (
      select 1 from public.authorization_signatures sig, me
       where sig.profile_id = me.id
         and sig.season_id = cv.season_id
         and (sig.method = 'paper' or sig.version_id = cv.id)
    ),
    cv.id, cv.season_id, s.name, cv.version_number, cv.content
  from current_version cv
  join public.seasons s on s.id = cv.season_id;
$$;

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
  consents jsonb := coalesce(p_payload -> 'consents', '{}'::jsonb);
  health text := nullif(btrim(p_payload ->> 'health_info'), '');
  drawing jsonb := p_payload -> 'signature';
  cannot_draw boolean := coalesce((p_payload ->> 'unable_to_draw')::boolean, false);
  shown_language text := nullif(p_payload ->> 'language', '');
  contact jsonb := p_payload -> 'emergency_contact';
  saved uuid;
  consent_key text;
begin
  select * into me from public.profiles where id = caller and role = 'player';
  if me.id is null then
    raise insufficient_privilege using message = 'only a player signs her authorization';
  end if;
  version := private.current_authorization_version(me.org_id);
  if version.id is null or version.id <> p_version_id then
    raise check_violation using message = 'sign the current version';
  end if;

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
  if (drawing is null) = (not cannot_draw) then
    raise check_violation using message = 'sign with a drawing, or record that she could not draw';
  end if;
  if shown_language is not null and shown_language not in ('ca', 'es', 'en', 'ar', 'fa') then
    raise check_violation using message = 'unsupported language';
  end if;
  if contact is not null and (
    jsonb_typeof(contact) <> 'object'
    or length(coalesce(contact ->> 'name', '')) > 200
    or length(coalesce(contact ->> 'relation', '')) > 100
    or length(coalesce(contact ->> 'phone', '')) > 50
  ) then
    raise check_violation using message = 'invalid emergency contact';
  end if;

  insert into public.authorization_signatures (
    org_id, profile_id, season_id, version_id, method, language, device,
    signature, unable_to_draw
  ) values (
    me.org_id, caller, version.season_id, version.id, 'app', shown_language,
    left(nullif(btrim(p_payload ->> 'device'), ''), 200), drawing, cannot_draw
  )
  returning id into saved;

  foreach consent_key in array private.authorization_consent_keys() loop
    insert into public.authorization_consent_events
      (org_id, profile_id, signature_id, consent_key, granted, method)
    values (me.org_id, caller, saved, consent_key,
            coalesce((consents ->> consent_key)::boolean, false), 'app');
  end loop;

  perform set_config('ramassa.consent_event_written', 'on', true);
  update public.profiles set
    health_info = public.encrypt_field(health),
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
  where id = caller;
  perform set_config('ramassa.consent_event_written', '', true);

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (me.org_id, caller, 'authorization.sign', 'authorization_signature', saved,
          jsonb_build_object('version_id', version.id, 'method', 'app', 'unable_to_draw', cannot_draw));
  return saved;
end;
$$;

-- An optional consent, from her profile. Required ones are part of signing.
create or replace function public.set_optional_consent(p_key text, p_granted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  me public.profiles;
begin
  select * into me from public.profiles where id = caller and role = 'player';
  if me.id is null then
    raise insufficient_privilege using message = 'only a player changes her consents';
  end if;
  if p_granted is null or not (p_key = any (private.authorization_consent_keys(false))) then
    raise invalid_parameter_value using message = 'only an optional consent changes here';
  end if;

  insert into public.authorization_consent_events (org_id, profile_id, consent_key, granted, method)
  values (me.org_id, caller, p_key, p_granted, 'profile');

  if p_key = 'image_rights' then
    perform set_config('ramassa.consent_event_written', 'on', true);
    update public.profiles
       set media_consent_at = case when p_granted then coalesce(media_consent_at, now()) end
     where id = caller;
    perform set_config('ramassa.consent_event_written', '', true);
  end if;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (me.org_id, caller, 'consent.change', 'profile', caller,
          jsonb_build_object('consent', p_key, 'granted', p_granted));
end;
$$;

-- Her optional consents as they stand.
create or replace function public.my_consents()
returns table (consent_key text, granted boolean, decided_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (e.consent_key) e.consent_key, e.granted, e.decided_at
    from public.authorization_consent_events e
   where e.profile_id = (select auth.uid())
   order by e.consent_key, e.decided_at desc, e.id desc;
$$;

-- 8. Staff: paper records and the participant view -----------------------------------------------------------------

create or replace function public.record_paper_authorization(p_profile_id uuid, p_signed_on date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  target public.profiles;
  season uuid;
  saved uuid;
begin
  if not (select public.has_permission('participants.view_personal')) then
    raise insufficient_privilege using message = 'recording a paper authorization needs participants.view_personal';
  end if;
  select * into target from public.profiles
   where id = p_profile_id and org_id = actor_org and role in ('player', 'invited');
  if target.id is null then
    raise insufficient_privilege using message = 'no participant of this organization';
  end if;
  season := private.current_season_id(actor_org);
  if season is null then
    raise object_not_in_prerequisite_state using message = 'the organization has no current season';
  end if;
  if p_signed_on is null or p_signed_on > current_date then
    raise check_violation using message = 'the paper date is required and not in the future';
  end if;

  select id into saved from public.authorization_signatures
   where profile_id = p_profile_id and season_id = season and method = 'paper';
  if saved is null then
    insert into public.authorization_signatures
      (org_id, profile_id, season_id, method, paper_signed_on, recorded_by)
    values (actor_org, p_profile_id, season, 'paper', p_signed_on, actor)
    returning id into saved;
  else
    update public.authorization_signatures
       set paper_signed_on = p_signed_on, recorded_by = actor
     where id = saved;
  end if;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'authorization.paper', 'profile', p_profile_id,
          jsonb_build_object('season_id', season, 'signed_on', p_signed_on));
  return saved;
end;
$$;

-- Her authorizations as staff see them. The drawn signature needs
-- participants.view_sensitive.
create or replace function public.participant_authorizations(p_profile_id uuid)
returns table (
  id uuid, season_name text, version_number integer, method text, language text,
  signed_at timestamptz, paper_signed_on date, unable_to_draw boolean, signature jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.has_permission('participants.view_personal')) then
    raise insufficient_privilege using message = 'her authorizations need participants.view_personal';
  end if;
  return query
    select sig.id, s.name, v.version_number, sig.method, sig.language, sig.signed_at,
           sig.paper_signed_on, sig.unable_to_draw,
           case when (select public.has_permission('participants.view_sensitive')) then sig.signature end
      from public.authorization_signatures sig
      join public.seasons s on s.id = sig.season_id
      left join public.authorization_versions v on v.id = sig.version_id
     where sig.profile_id = p_profile_id
       and sig.org_id = (select public.current_org_id())
     order by sig.signed_at desc;
end;
$$;

create or replace function public.participant_consents(p_profile_id uuid)
returns table (consent_key text, granted boolean, decided_at timestamptz, method text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.has_permission('participants.view_personal')) then
    raise insufficient_privilege using message = 'her consents need participants.view_personal';
  end if;
  return query
    select distinct on (e.consent_key) e.consent_key, e.granted, e.decided_at, e.method
      from public.authorization_consent_events e
     where e.profile_id = p_profile_id
       and e.org_id = (select public.current_org_id())
     order by e.consent_key, e.decided_at desc, e.id desc;
end;
$$;


drop function public.get_participant_profile(uuid);

create or replace function public.get_participant_profile(participant_id uuid)
 RETURNS TABLE(id uuid, first_name text, last_name text, date_of_birth date, place_of_birth text, nationality text, preferred_language text, document_type text, document_number text, phone text, address text, city text, postal_code text, reference_entity text, reference_contact_name text, has_dependents boolean, num_dependents integer, clothing_size text, shoe_size text, avatar_url text, media_consent boolean, terms_accepted_at timestamp with time zone, is_active boolean, is_forum_banned boolean, anonymized_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, applicant_status text, supporting_entities text[], season_number smallint, childcare_need text, specific_needs text, health_info text, emergency_contact_name text, emergency_contact_relation text, emergency_contact_phone text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
  with subject as (
    select p.*
    from public.profiles p
    where p.id = participant_id
      and p.org_id = (select public.current_org_id())
      and (select public.has_permission('participants.view'))
  ),
  access_recorded as (
    insert into public.audit_log (org_id, actor_id, action, target_type, target_id)
    select
      (select public.current_org_id()),
      (select auth.uid()),
      case when (select public.has_permission('participants.view_sensitive')) then 'profile.view_sensitive' else 'profile.view' end,
      'profile',
      s.id
    from subject s
    returning 1
  )
  select
    s.id,
    s.first_name,
    s.last_name,
    case when (select public.has_permission('participants.view_personal')) then s.date_of_birth end,
    case when (select public.has_permission('participants.view_personal')) then s.place_of_birth end,
    case when (select public.has_permission('participants.view_personal')) then s.nationality end,
    s.preferred_language,
    case when (select public.has_permission('participants.view_personal')) then s.document_type end,
    case when (select public.has_permission('participants.view_sensitive')) then public.decrypt_field(s.document_number) end,
    case when (select public.has_permission('participants.view_sensitive')) then public.decrypt_field(s.phone) end,
    case when (select public.has_permission('participants.view_sensitive')) then public.decrypt_field(s.address) end,
    case when (select public.has_permission('participants.view_personal')) then s.city end,
    case when (select public.has_permission('participants.view_sensitive')) then public.decrypt_field(s.postal_code) end,
    s.reference_entity,
    case when (select public.has_permission('participants.view_personal')) then s.reference_contact_name end,
    case when (select public.has_permission('participants.view_personal')) then s.has_dependents end,
    case when (select public.has_permission('participants.view_personal')) then s.num_dependents end,
    s.clothing_size,
    s.shoe_size,
    s.avatar_url,
    s.media_consent_at is not null,
    s.terms_accepted_at,
    s.is_active,
    s.is_forum_banned,
    s.anonymized_at,
    s.created_at,
    s.updated_at,
    -- The season registration answers (RAPP-303). Applicant status and
    -- specific needs are sensitive, like the document number.
    case when (select public.has_permission('participants.view_sensitive')) then public.decrypt_field(s.applicant_status) end,
    case when (select public.has_permission('participants.view_personal')) then s.supporting_entities end,
    s.season_number,
    case when (select public.has_permission('participants.view_personal')) then s.childcare_need end,
    case when (select public.has_permission('participants.view_sensitive')) then public.decrypt_field(s.specific_needs) end,
    -- The medical answer needs its own permission (RAPP-304); the emergency
    -- contact follows the personal and sensitive levels.
    case when (select public.has_permission('participants.view_health')) then public.decrypt_field(s.health_info) end,
    case when (select public.has_permission('participants.view_personal')) then s.emergency_contact_name end,
    case when (select public.has_permission('participants.view_personal')) then s.emergency_contact_relation end,
    case when (select public.has_permission('participants.view_sensitive')) then public.decrypt_field(s.emergency_contact_phone) end
  from subject s;
$$;

drop function public.get_own_profile();

create or replace function public.get_own_profile()
 RETURNS TABLE(id uuid, first_name text, last_name text, date_of_birth date, place_of_birth text, nationality text, preferred_language text, document_type text, document_number text, phone text, address text, city text, postal_code text, reference_entity text, reference_contact_name text, has_dependents boolean, num_dependents integer, clothing_size text, shoe_size text, avatar_url text, media_consent boolean, terms_accepted_at timestamp with time zone, applicant_status text, supporting_entities text[], season_number smallint, childcare_need text, specific_needs text, health_info text, emergency_contact_name text, emergency_contact_relation text, emergency_contact_phone text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
  select
    p.id,
    p.first_name,
    p.last_name,
    p.date_of_birth,
    p.place_of_birth,
    p.nationality,
    p.preferred_language,
    p.document_type,
    public.decrypt_field(p.document_number),
    public.decrypt_field(p.phone),
    public.decrypt_field(p.address),
    p.city,
    public.decrypt_field(p.postal_code),
    p.reference_entity,
    p.reference_contact_name,
    p.has_dependents,
    p.num_dependents,
    p.clothing_size,
    p.shoe_size,
    p.avatar_url,
    p.media_consent_at is not null,
    p.terms_accepted_at,
    public.decrypt_field(p.applicant_status),
    p.supporting_entities,
    p.season_number,
    p.childcare_need,
    public.decrypt_field(p.specific_needs),
    public.decrypt_field(p.health_info),
    p.emergency_contact_name,
    p.emergency_contact_relation,
    public.decrypt_field(p.emergency_contact_phone)
  from public.profiles p
  where p.id = (select auth.uid());
$$;

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
    ('authorization_consent_events', 'profile_id', 'purge', 'Each consent she gave or withdrew.')
  ) as disposition(table_name, participant_column, disposition, reason);
$$;


revoke all on function public.publish_authorization_version(jsonb) from public, anon;
revoke all on function public.list_authorization_versions() from public, anon;
revoke all on function public.my_authorization_status() from public, anon;
revoke all on function public.sign_authorization(uuid, jsonb) from public, anon;
revoke all on function public.set_optional_consent(text, boolean) from public, anon;
revoke all on function public.my_consents() from public, anon;
revoke all on function public.record_paper_authorization(uuid, date) from public, anon;
revoke all on function public.participant_authorizations(uuid) from public, anon;
revoke all on function public.participant_consents(uuid) from public, anon;
revoke all on function public.get_participant_profile(uuid) from public, anon;
revoke all on function public.get_own_profile() from public, anon;
grant execute on function public.publish_authorization_version(jsonb) to authenticated;
grant execute on function public.list_authorization_versions() to authenticated;
grant execute on function public.my_authorization_status() to authenticated;
grant execute on function public.sign_authorization(uuid, jsonb) to authenticated;
grant execute on function public.set_optional_consent(text, boolean) to authenticated;
grant execute on function public.my_consents() to authenticated;
grant execute on function public.record_paper_authorization(uuid, date) to authenticated;
grant execute on function public.participant_authorizations(uuid) to authenticated;
grant execute on function public.participant_consents(uuid) to authenticated;
grant execute on function public.get_participant_profile(uuid) to authenticated;
grant execute on function public.get_own_profile() to authenticated;
