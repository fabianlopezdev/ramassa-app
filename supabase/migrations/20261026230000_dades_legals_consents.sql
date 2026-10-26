-- Dades legals: consents defined once, placed like fields, kept with their history (RAPP-699).
--
-- WHY
--
-- Step 3 of the forms design. A consent lived inside each authorization
-- version (`content.consents`), so its text was typed again per version and
-- only the authorization could ask it. Legal data needs proof, so it gets its
-- own catalogue next to Dades de les jugadores: each consent defined once, in
-- five languages, asked on any form, every decision kept with the exact text
-- shown.
--
-- WHAT THIS MIGRATION DOES
--
--   1. `public.consents`: the catalogue. One row per consent per
--      organization: a stable key, a name and a text in five languages
--      (Catalan required), archived or not. The seven keys the app knew become
--      system consents (`system_key`, like a system field): staff rename,
--      reword and archive them, and their key stays, because features read
--      them by key (`image_rights` drives the photo consent, `health_data` the
--      health answer). Staff add their own; a staff consent never takes a
--      system key. Every organization gets the system consents.
--   2. `public.consent_placements`: where a consent is asked, the sibling of
--      `field_placements`. The authorization's consents screen
--      (`authorization`) and any Onboarding screen (`onboarding`, with its
--      screen). Required or not, in the order shared with the fields and the
--      blocks of the screen (`reorder_placements` orders all three).
--      `place_consent`, `save_consent_placement`, `remove_consent_placement`.
--      Image rights are never required; the health data consent stays on the
--      authorization while it asks her health; the authorization keeps one
--      consent at least.
--   3. The authorization versions still carry their consents (`content ->
--      'consents'`): that is the snapshot of the texts a version showed, which
--      every signature, the phone and older builds read. Saving the draft and
--      publishing it now write that snapshot from the catalogue and the
--      placements, so a text edited in the catalogue reaches players with the
--      form's next Desa. A version written another way (the legacy publish,
--      the seeds) brings its consents into the catalogue (a system consent
--      still holding its placeholder takes the version's text), and places
--      them when the organization has none placed yet. Today's versions and
--      drafts are migrated that way, the draft first.
--   4. `authorization_consent_events` becomes `public.consent_events`, for
--      every form. Each event names the consent, the profile, granted or not,
--      the exact text and its language, the form (`authorization`,
--      `onboarding`, or none for a change on her profile or by staff) and its
--      version or screen, the method (`app`, `staff_device` for the tablet,
--      `paper`, `profile`, `staff`), the time, and the staff member present or
--      recording it (`recorded_by`, from the signature's witness or recorder),
--      with a reason for a staff withdrawal. Existing events are migrated.
--      Append only: no update and no delete, except erasure (deleting her
--      account, her signature or a test player's draft signing cascades;
--      anonymizing clears a staff reason) and test player resets. Her current
--      state of a consent is its latest event.
--   5. Withdrawal: she changes an optional consent and withdraws any on her
--      profile (`set_optional_consent`, now also for an optional Onboarding
--      consent); staff record a decision on her page, on paper or as staff,
--      a withdrawal with its reason (`record_participant_consent`, needs
--      consents.collect and participants.view_personal). Withdrawing
--      `health_data` still deletes her health answer (RAPP-698).
--   6. Onboarding: `complete_onboarding_signed` and
--      `complete_onboarding_review` take `consents` by key and record each
--      placed consent she was shown. A payload without `consents` (an older
--      build) is accepted as before.
--   7. Reading: `intake_catalog` returns `consents` and `consent_placements`.
--      `my_consents` and `participant_consents` read the new table and add the
--      consent's id and name; `participant_consent_history` returns every
--      event of hers. Staff with participants.view_personal read them, as
--      today.
--   8. The erasure registry: `consent_events` purges with her account and is
--      kept, without her name, when she is anonymized (legal proof, as
--      `authorization_consent_events` was); the catalogue and the placements
--      are not personal.

-- 1. The catalogue ------------------------------------------------------------------------------------------

create or replace function private.system_consent_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['participation', 'data_processing', 'code_of_conduct', 'health_data',
               'image_rights', 'newsletter', 'messaging_groups']::text[];
$$;
revoke all on function private.system_consent_keys() from public, anon, authenticated;

-- A system consent's name until staff rename it, in five languages.
create or replace function private.system_consent_name(p_key text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_key
    when 'participation' then '{"ca": "Participació i veracitat de les dades", "es": "Participación y veracidad de los datos", "en": "Participation and true information", "ar": "المشاركة وصحة البيانات", "fa": "مشارکت و درستی اطلاعات"}'::jsonb
    when 'data_processing' then '{"ca": "Tractament de dades", "es": "Tratamiento de datos", "en": "Data processing", "ar": "معالجة البيانات", "fa": "پردازش داده‌ها"}'::jsonb
    when 'code_of_conduct' then '{"ca": "Guia de temporada, protecció i codi de conducta", "es": "Guía de temporada, protección y código de conducta", "en": "Season guide, safeguarding and code of conduct", "ar": "دليل الموسم والحماية ومدونة السلوك", "fa": "راهنمای فصل، حفاظت و آیین‌نامه رفتاری"}'::jsonb
    when 'health_data' then '{"ca": "Dades de salut", "es": "Datos de salud", "en": "Health data", "ar": "البيانات الصحية", "fa": "داده‌های سلامت"}'::jsonb
    when 'image_rights' then '{"ca": "Drets d''imatge", "es": "Derechos de imagen", "en": "Image rights", "ar": "حقوق الصورة", "fa": "حق تصویر"}'::jsonb
    when 'newsletter' then '{"ca": "Butlletí i comunicacions", "es": "Boletín y comunicaciones", "en": "Newsletter and communications", "ar": "النشرة والمراسلات", "fa": "خبرنامه و ارتباطات"}'::jsonb
    when 'messaging_groups' then '{"ca": "Grups de missatgeria de l''equip", "es": "Grupos de mensajería del equipo", "en": "Team messaging groups", "ar": "مجموعات رسائل الفريق", "fa": "گروه‌های پیام‌رسان تیم"}'::jsonb
  end;
$$;
revoke all on function private.system_consent_name(text) from public, anon, authenticated;

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- Stable: her events, the versions' snapshots and the features name it.
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  -- A consent the app reads by key (RAPP-699), like a system field.
  system_key text check (system_key is null or (system_key = key and system_key = any (private.system_consent_keys()))),
  name jsonb not null check (private.catalan_text_valid(name)),
  -- The text she ticks.
  body jsonb not null check (private.catalan_text_valid(body)),
  is_archived boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consents_key_per_org unique (org_id, key)
);
create index consents_created_by_idx on public.consents (created_by);
comment on table public.consents is
  'The consents of an organization (RAPP-699): defined once, asked on any form. A system consent keeps its key.';

alter table public.consents enable row level security;
alter table public.consents force row level security;
-- Reads go through intake_catalog(); writes through save_consent and archive_consent.
create policy consents_read on public.consents for select to authenticated
  using (org_id = (select public.current_org_id()));
revoke all on public.consents from anon, authenticated;
grant select on public.consents to authenticated;

create table public.consent_placements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  consent_id uuid not null references public.consents (id) on delete cascade,
  -- The authorization's consents screen, or an Onboarding screen.
  surface text not null check (surface in ('authorization', 'onboarding')),
  screen_key text check (screen_key is null or private.is_uuid_text(screen_key) or screen_key = any (array[
    'identity', 'background', 'documentation', 'logistics', 'equipment', 'season',
    'supporting-entities', 'participation-support', 'specific-needs']::text[])),
  -- One order with the fields and the blocks of the same screen.
  sort_order integer not null default 0,
  required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consent_placements_screen_on_onboarding check ((surface = 'onboarding') = (screen_key is not null)),
  constraint consent_placements_one_per_surface unique (consent_id, surface)
);
create index consent_placements_surface_idx on public.consent_placements (org_id, surface, screen_key, sort_order);
comment on table public.consent_placements is
  'Where a consent is asked (RAPP-699): the authorization''s consents screen or an Onboarding screen.';

alter table public.consent_placements enable row level security;
alter table public.consent_placements force row level security;
create policy consent_placements_read on public.consent_placements for select to authenticated
  using (org_id = (select public.current_org_id()));
revoke all on public.consent_placements from anon, authenticated;
grant select on public.consent_placements to authenticated;

-- The system consents of an organization, each with its name as its text
-- until a version or staff give it one.
create or replace function private.seed_system_consents(p_org_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.consents (org_id, key, system_key, name, body)
  select p_org_id, k.key, k.key, private.system_consent_name(k.key), private.system_consent_name(k.key)
    from unnest(private.system_consent_keys()) k(key)
  on conflict (org_id, key) do nothing;
$$;
revoke all on function private.seed_system_consents(uuid) from public, anon, authenticated;

create or replace function private.seed_system_consents_for_new_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_system_consents(new.id);
  return new;
end;
$$;
revoke all on function private.seed_system_consents_for_new_org() from public, anon, authenticated;

create trigger organizations_seed_system_consents
after insert on public.organizations
for each row execute function private.seed_system_consents_for_new_org();

-- A consent by key, made when a record names one the catalogue does not hold.
create or replace function private.consent_for_key(p_org_id uuid, p_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_id uuid;
  name jsonb := coalesce(private.system_consent_name(p_key), jsonb_build_object('ca', p_key));
begin
  select id into found_id from public.consents where org_id = p_org_id and key = p_key;
  if found_id is null then
    insert into public.consents (org_id, key, system_key, name, body)
    values (p_org_id, p_key, case when p_key = any (private.system_consent_keys()) then p_key end, name, name)
    on conflict (org_id, key) do nothing
    returning id into found_id;
    if found_id is null then
      select id into found_id from public.consents where org_id = p_org_id and key = p_key;
    end if;
  end if;
  return found_id;
end;
$$;
revoke all on function private.consent_for_key(uuid, text) from public, anon, authenticated;

-- A version's consents into the catalogue. A system consent still holding its
-- placeholder (its name as its text, never edited) takes the version's text.
-- The version places them when the organization has none placed on the
-- authorization yet.
create or replace function private.consents_from_authorization(p_org_id uuid, p_content jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_placements boolean;
begin
  if jsonb_typeof(p_content -> 'consents') is distinct from 'object' then
    return;
  end if;
  insert into public.consents (org_id, key, system_key, name, body)
  select p_org_id, c.key, case when c.key = any (private.system_consent_keys()) then c.key end,
         coalesce(private.system_consent_name(c.key),
                  jsonb_build_object('ca', left(private.localized_text_in(c.value -> 'label', 'ca'), 120))),
         -- The text, Catalan filled from another language when it had none.
         (c.value -> 'label') || jsonb_build_object('ca', private.localized_text_in(c.value -> 'label', 'ca'))
    from jsonb_each(p_content -> 'consents') c
   where private.localized_text_valid(c.value -> 'label')
  on conflict (org_id, key) do update
    set body = excluded.body, updated_at = now()
    where consents.body = consents.name and consents.created_by is null
      and consents.updated_at = consents.created_at;

  select exists (select 1 from public.consent_placements p
                  where p.org_id = p_org_id and p.surface = 'authorization')
    into has_placements;
  if not has_placements then
    insert into public.consent_placements (org_id, consent_id, surface, sort_order, required)
    select p_org_id, k.id, 'authorization', coalesce((c.value ->> 'position')::integer, 0),
           coalesce((c.value ->> 'required')::boolean, false)
      from jsonb_each(p_content -> 'consents') c
      join public.consents k on k.org_id = p_org_id and k.key = c.key
    on conflict (consent_id, surface) do nothing;
  end if;
end;
$$;
revoke all on function private.consents_from_authorization(uuid, jsonb) from public, anon, authenticated;

create or replace function private.authorization_version_consents_to_catalogue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.consents_from_authorization(new.org_id, new.content);
  return new;
end;
$$;
revoke all on function private.authorization_version_consents_to_catalogue() from public, anon, authenticated;

-- Today's definitions: every organization's system consents, then its
-- versions' consents, the draft first and then the newest published.
select private.seed_system_consents(o.id) from public.organizations o;

do $$
declare
  version record;
begin
  for version in
    select v.org_id, v.content from public.authorization_versions v
     order by v.org_id, (v.published_at is null) desc, v.published_at desc nulls last, v.version_number desc
  loop
    perform private.consents_from_authorization(version.org_id, version.content);
  end loop;
end $$;

create trigger authorization_versions_consents_to_catalogue
after insert or update of content on public.authorization_versions
for each row execute function private.authorization_version_consents_to_catalogue();

-- The authorization's consents as a version holds them: each consent placed
-- on its consents screen, with its text, required flag and place.
create or replace function private.authorization_consents_snapshot(p_org_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(
           ordered.key,
           jsonb_build_object('label', ordered.body, 'required', ordered.required,
                              'position', ordered.position)), '{}'::jsonb)
    from (
      select c.key, c.body, p.required,
             (row_number() over (order by p.sort_order, p.created_at, c.key) - 1)::integer as position
        from public.consent_placements p
        join public.consents c on c.id = p.consent_id and not c.is_archived
       where p.org_id = p_org_id and p.surface = 'authorization'
    ) ordered;
$$;
revoke all on function private.authorization_consents_snapshot(uuid) from public, anon, authenticated;

-- A key for a consent staff add: its Catalan name, written plain, never a
-- system key or one the organization uses.
create or replace function private.consent_key_from_name(p_org_id uuid, p_name text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base text := btrim(regexp_replace(
    lower(translate(coalesce(p_name, ''),
                    'àáâäèéêëìíîïòóôöùúûüçñÀÁÂÄÈÉÊËÌÍÎÏÒÓÔÖÙÚÛÜÇÑ',
                    'aaaaeeeeiiiioooouuuucnaaaaeeeeiiiioooouuuucn')),
    '[^a-z0-9]+', '_', 'g'), '_');
  candidate text;
  number integer := 2;
begin
  if base !~ '^[a-z]' then
    base := 'consent_' || base;
  end if;
  base := rtrim(left(base, 34), '_');
  candidate := base;
  while candidate = any (private.system_consent_keys())
        or exists (select 1 from public.consents c where c.org_id = p_org_id and c.key = candidate) loop
    candidate := base || '_' || number;
    number := number + 1;
  end loop;
  return candidate;
end;
$$;
revoke all on function private.consent_key_from_name(uuid, text) from public, anon, authenticated;

-- Whether the authorization asks her health: its consent must stay there.
create or replace function private.authorization_asks_health(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.field_placements pl
     where pl.org_id = p_org_id and pl.surface = 'authorization'
       and pl.field_id = (private.authorization_field(p_org_id, 'health_info')).id);
$$;
revoke all on function private.authorization_asks_health(uuid) from public, anon, authenticated;

-- Adds a consent, or renames and rewords one (`p_id` set).
create or replace function public.save_consent(p_id uuid, p_name jsonb, p_body jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  saved public.consents;
begin
  if p_name is null or not private.catalan_text_valid(p_name)
     or exists (select 1 from jsonb_each_text(p_name) n where length(n.value) > 120) then
    raise check_violation using message = 'a consent needs its name in Catalan';
  end if;
  if p_body is null or not private.catalan_text_valid(p_body)
     or exists (select 1 from jsonb_each_text(p_body) b where length(b.value) > 4000) then
    raise check_violation using message = 'a consent needs its text in Catalan';
  end if;
  if p_id is null then
    insert into public.consents (org_id, key, name, body, created_by)
    values (actor_org, private.consent_key_from_name(actor_org, p_name ->> 'ca'), p_name, p_body,
            (select auth.uid()))
    returning * into saved;
  else
    update public.consents set name = p_name, body = p_body, updated_at = now()
     where id = p_id and org_id = actor_org
    returning * into saved;
    if saved.id is null then
      raise no_data_found using message = 'no such consent';
    end if;
  end if;
  -- The words as saved, every time: the audit log keeps the history of the text.
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'consent.save', 'consent', saved.id,
          jsonb_build_object('created', p_id is null, 'key', saved.key, 'name', p_name, 'body', p_body));
  return saved.id;
end;
$$;
revoke all on function public.save_consent(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_consent(uuid, jsonb, jsonb) to authenticated;

-- Archives a consent (it leaves every form) or brings it back (placed nowhere).
create or replace function public.archive_consent(p_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  consent public.consents;
begin
  select * into consent from public.consents where id = p_id and org_id = actor_org for update;
  if consent.id is null then
    raise no_data_found using message = 'no such consent';
  end if;
  if p_archived is null then
    raise invalid_parameter_value using message = 'say whether the consent is archived';
  end if;
  if p_archived then
    if consent.key = 'health_data' and private.authorization_asks_health(actor_org)
       and exists (select 1 from public.consent_placements p
                    where p.consent_id = consent.id and p.surface = 'authorization') then
      raise check_violation using message = 'the authorization asks her health: its consent stays';
    end if;
    if exists (select 1 from public.consent_placements p
                where p.consent_id = consent.id and p.surface = 'authorization')
       and not exists (select 1 from public.consent_placements p
                        where p.org_id = actor_org and p.surface = 'authorization'
                          and p.consent_id <> consent.id) then
      raise check_violation using message = 'the authorization keeps one consent at least';
    end if;
    delete from public.consent_placements where consent_id = consent.id;
  end if;
  update public.consents set is_archived = p_archived, updated_at = now() where id = consent.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'consent.archive', 'consent', consent.id,
          jsonb_build_object('key', consent.key, 'archived', p_archived));
end;
$$;
revoke all on function public.archive_consent(uuid, boolean) from public, anon;
grant execute on function public.archive_consent(uuid, boolean) to authenticated;

-- 2. Placing consents ---------------------------------------------------------------------------------------

-- The next place on a screen or form: after its fields, its blocks and its consents.
create or replace function private.next_form_position(p_org_id uuid, p_surface text, p_screen_key text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(greatest(
    (select max(p.sort_order) from public.field_placements p
      where p.org_id = p_org_id and p.surface = p_surface and p.screen_key is not distinct from p_screen_key),
    (select max(b.sort_order) from public.form_blocks b
      where b.org_id = p_org_id and b.surface = p_surface and b.screen_key is not distinct from p_screen_key),
    (select max(c.sort_order) from public.consent_placements c
      where c.org_id = p_org_id and c.surface = p_surface and c.screen_key is not distinct from p_screen_key)
  ) + 1, 0);
$$;

create or replace function public.place_consent(
  p_consent_id uuid, p_surface text, p_screen_key text default null, p_required boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  consent public.consents;
  saved_id uuid;
begin
  select * into consent from public.consents where id = p_consent_id and org_id = actor_org and not is_archived;
  if consent.id is null then
    raise no_data_found using message = 'no such consent';
  end if;
  if p_surface is null or p_surface not in ('authorization', 'onboarding') then
    raise check_violation using message = 'a consent is asked on the authorization or an onboarding screen';
  end if;
  if p_surface = 'onboarding' then
    if p_screen_key is null or not (
         exists (select 1 from private.system_profile_fields() s where s.screen = p_screen_key)
         or (private.is_uuid_text(p_screen_key)
             and exists (select 1 from public.intake_screens s
                          where s.id = p_screen_key::uuid and s.org_id = actor_org
                            and not s.is_archived))) then
      raise no_data_found using message = 'no such screen';
    end if;
  elsif p_screen_key is not null then
    raise check_violation using message = 'only an onboarding placement names a screen';
  end if;
  -- Image rights drive the photo consent, which she can always refuse.
  if consent.key = 'image_rights' and coalesce(p_required, false) then
    raise check_violation using message = 'image rights are never required';
  end if;
  if exists (select 1 from public.consent_placements where consent_id = consent.id and surface = p_surface) then
    raise unique_violation using message = 'the consent is already asked there';
  end if;
  insert into public.consent_placements (org_id, consent_id, surface, screen_key, sort_order, required)
  values (actor_org, consent.id, p_surface, p_screen_key,
          private.next_form_position(actor_org, p_surface, p_screen_key), coalesce(p_required, false))
  returning id into saved_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'consent.place', 'consent', consent.id,
          jsonb_build_object('placement_id', saved_id, 'surface', p_surface, 'screen', p_screen_key,
                             'required', coalesce(p_required, false)));
  return saved_id;
end;
$$;
revoke all on function public.place_consent(uuid, text, text, boolean) from public, anon;
grant execute on function public.place_consent(uuid, text, text, boolean) to authenticated;

create or replace function public.save_consent_placement(p_placement_id uuid, p_required boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  placement public.consent_placements;
  consent public.consents;
begin
  select * into placement from public.consent_placements where id = p_placement_id and org_id = actor_org;
  if placement.id is null then
    raise no_data_found using message = 'no such placement';
  end if;
  select * into consent from public.consents where id = placement.consent_id;
  if p_required is null then
    raise invalid_parameter_value using message = 'say whether the consent is required';
  end if;
  if consent.key = 'image_rights' and p_required then
    raise check_violation using message = 'image rights are never required';
  end if;
  update public.consent_placements set required = p_required, updated_at = now() where id = placement.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'consent.placement_save', 'consent', consent.id,
          jsonb_build_object('placement_id', placement.id, 'surface', placement.surface,
                             'screen', placement.screen_key, 'required', p_required));
end;
$$;
revoke all on function public.save_consent_placement(uuid, boolean) from public, anon;
grant execute on function public.save_consent_placement(uuid, boolean) to authenticated;

create or replace function public.remove_consent_placement(p_placement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  placement public.consent_placements;
  consent public.consents;
begin
  select * into placement from public.consent_placements where id = p_placement_id and org_id = actor_org;
  if placement.id is null then
    raise no_data_found using message = 'no such placement';
  end if;
  select * into consent from public.consents where id = placement.consent_id;
  if placement.surface = 'authorization' then
    -- Asking her health needs its explicit consent (RAPP-698).
    if consent.key = 'health_data' and private.authorization_asks_health(actor_org) then
      raise check_violation using message = 'the authorization asks her health: its consent stays';
    end if;
    if not exists (select 1 from public.consent_placements p
                    where p.org_id = actor_org and p.surface = 'authorization' and p.id <> placement.id) then
      raise check_violation using message = 'the authorization keeps one consent at least';
    end if;
  end if;
  delete from public.consent_placements where id = placement.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'consent.placement_remove', 'consent', consent.id,
          jsonb_build_object('surface', placement.surface, 'screen', placement.screen_key));
end;
$$;
revoke all on function public.remove_consent_placement(uuid) from public, anon;
grant execute on function public.remove_consent_placement(uuid) to authenticated;

-- One order for the fields, the blocks and the consents of a screen.
create or replace function public.reorder_placements(p_surface text, p_screen_key text, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
begin
  update public.field_placements p
     set sort_order = array_position(p_ids, p.id) - 1, updated_at = now()
   where p.org_id = actor_org and p.surface = p_surface
     and p.screen_key is not distinct from p_screen_key and p.id = any (p_ids);
  update public.form_blocks b
     set sort_order = array_position(p_ids, b.id) - 1, updated_at = now()
   where b.org_id = actor_org and b.surface = p_surface
     and b.screen_key is not distinct from p_screen_key and b.id = any (p_ids);
  update public.consent_placements c
     set sort_order = array_position(p_ids, c.id) - 1, updated_at = now()
   where c.org_id = actor_org and c.surface = p_surface
     and c.screen_key is not distinct from p_screen_key and c.id = any (p_ids);
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.placements_reorder', 'organization', actor_org,
          jsonb_build_object('surface', p_surface, 'screen', p_screen_key, 'order', to_jsonb(p_ids)));
end;
$$;

-- 3. The versions snapshot the catalogue --------------------------------------------------------------------

create or replace function public.save_authorization_draft(p_content jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  saved uuid;
  consents jsonb;
begin
  if not (select private.can_design_onboarding()) then
    raise insufficient_privilege using message = 'the authorization draft needs settings.organization or onboarding.design';
  end if;
  -- Its consents are the ones placed on its consents screen, with the
  -- catalogue's texts as they read now (RAPP-699). An organization with none
  -- placed yet (a new one, an imported setup) takes the content's.
  perform private.consents_from_authorization(actor_org, p_content);
  consents := private.authorization_consents_snapshot(actor_org);
  if consents = '{}'::jsonb then
    raise check_violation using message = 'the authorization needs a consent';
  end if;
  p_content := coalesce(p_content, '{}'::jsonb) || jsonb_build_object('consents', consents);
  if not private.authorization_content_valid(p_content) then
    raise check_violation using message = 'the authorization needs its title, sections, consents and questions';
  end if;
  update public.authorization_versions
     set content = p_content, updated_at = now(), updated_by = actor
   where org_id = actor_org and published_at is null
  returning id into saved;
  if saved is null then
    insert into public.authorization_versions (org_id, content, updated_by)
    values (actor_org, p_content, actor)
    returning id into saved;
  end if;
  -- The shape only: the text is in the draft itself.
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'authorization.draft_saved', 'authorization_version', saved,
          jsonb_build_object(
            'consents', (select jsonb_agg(c.consent_key order by c.sort_position)
                           from private.authorization_consents(p_content) c),
            'required', (select coalesce(jsonb_agg(c.consent_key order by c.sort_position), '[]'::jsonb)
                           from private.authorization_consents(p_content) c where c.required)));
  return saved;
end;
$$;

-- 4. Consent events, for every form ---------------------------------------------------------------------------

alter table public.authorization_consent_events rename to consent_events;
alter table public.consent_events rename constraint authorization_consent_events_pkey to consent_events_pkey;
alter table public.consent_events rename constraint authorization_consent_events_consent_key_check to consent_events_consent_key_check;
alter table public.consent_events rename constraint authorization_consent_events_language_check to consent_events_language_check;
alter table public.consent_events rename constraint authorization_consent_events_method_check to consent_events_method_check;
alter table public.consent_events rename constraint authorization_consent_events_wording_check to consent_events_wording_check;
alter table public.consent_events rename constraint authorization_consent_events_org_id_fkey to consent_events_org_id_fkey;
alter table public.consent_events rename constraint authorization_consent_events_profile_id_fkey to consent_events_profile_id_fkey;
alter table public.consent_events rename constraint authorization_consent_events_signature_id_fkey to consent_events_signature_id_fkey;
alter table public.consent_events rename constraint authorization_consent_events_version_id_fkey to consent_events_version_id_fkey;
alter index public.authorization_consent_events_profile_idx rename to consent_events_profile_idx;
alter sequence if exists public.authorization_consent_events_id_seq rename to consent_events_id_seq;
alter policy authorization_consent_events_select_own_or_team on public.consent_events
  rename to consent_events_select_own_or_team;
drop trigger authorization_consent_events_wording on public.consent_events;
drop function private.authorization_consent_event_wording();

alter table public.consent_events
  add column consent_id uuid references public.consents (id) on delete cascade,
  -- The form she was shown it in; none for a change on her profile or by staff.
  add column form text check (form is null or form in ('authorization', 'onboarding')),
  -- The Onboarding screen it was asked on.
  add column screen_key text,
  -- The staff member present (the tablet's witness) or recording it (paper, staff).
  add column recorded_by uuid references public.profiles (id) on delete set null,
  -- Why staff recorded a withdrawal.
  add column reason text check (reason is null or length(btrim(reason)) between 1 and 1000);

update public.consent_events e
   set consent_id = private.consent_for_key(e.org_id, e.consent_key);
update public.consent_events e
   set form = 'authorization'
 where e.signature_id is not null or e.version_id is not null;
update public.consent_events e
   set recorded_by = coalesce(s.witnessed_by, s.recorded_by)
  from public.authorization_signatures s
 where s.id = e.signature_id;
alter table public.consent_events alter column consent_id set not null;
create index consent_events_consent_idx on public.consent_events (profile_id, consent_id, decided_at desc);
create index consent_events_consent_id_idx on public.consent_events (consent_id);
create index consent_events_recorded_by_idx on public.consent_events (recorded_by);
comment on table public.consent_events is
  'Every consent decision (RAPP-699): append only, with the text shown, the form and version, the method, the time and who was present. Her current state of a consent is its latest event.';
comment on column public.consent_events.method is
  'app (her phone), staff_device (the tablet), paper, profile (her profile), staff (on her page).';

-- What an event fills in by itself: the signature's version, language and
-- witness, the version's words and flag (RAPP-614), the consent by key.
create or replace function private.consent_event_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  signature public.authorization_signatures;
  version public.authorization_versions;
  consent public.consents;
begin
  if new.signature_id is not null then
    select * into signature from public.authorization_signatures where id = new.signature_id;
    new.version_id := coalesce(new.version_id, signature.version_id);
    new.language := coalesce(new.language, signature.language);
    new.recorded_by := coalesce(new.recorded_by, signature.witnessed_by, signature.recorded_by);
  end if;
  if new.version_id is not null then
    new.form := coalesce(new.form, 'authorization');
    if new.wording is null or new.required is null then
      select * into version from public.authorization_versions where id = new.version_id;
      new.wording := coalesce(new.wording, private.localized_text_in(
        version.content -> 'consents' -> new.consent_key -> 'label', coalesce(new.language, 'ca')));
      new.required := coalesce(new.required,
        (version.content -> 'consents' -> new.consent_key ->> 'required')::boolean);
      new.language := coalesce(new.language, case when new.wording is not null then 'ca' end);
    end if;
  end if;
  if new.consent_id is not null then
    select * into consent from public.consents where id = new.consent_id;
    if consent.id is null or consent.org_id <> new.org_id then
      raise check_violation using message = 'a consent event names a consent of her organization';
    end if;
    new.consent_key := consent.key;
  else
    new.consent_id := private.consent_for_key(new.org_id, new.consent_key);
  end if;
  return new;
end;
$$;
revoke all on function private.consent_event_defaults() from public, anon, authenticated;

create trigger consent_events_defaults
before insert on public.consent_events
for each row execute function private.consent_event_defaults();

-- Append only. A delete passes only as erasure: a cascade (her account, her
-- signature, a test player's draft signing) or a function that marks it.
-- An update passes only when a deleted version or staff member empties its link.
create or replace function private.consent_events_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 or current_setting('ramassa.consent_event_erasure', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - array['version_id', 'recorded_by']) = (to_jsonb(old) - array['version_id', 'recorded_by'])
     and (new.version_id is null or new.version_id = old.version_id)
     and (new.recorded_by is null or new.recorded_by = old.recorded_by) then
    return new;
  end if;
  raise exception 'CONSENT_EVENTS/APPEND_ONLY: a consent decision is kept as it was made'
    using errcode = 'insufficient_privilege';
end;
$$;
revoke all on function private.consent_events_append_only() from public, anon, authenticated;

create trigger consent_events_append_only
before update or delete on public.consent_events
for each row execute function private.consent_events_append_only();

-- What a decision does in the app, by key: image rights drive the photo
-- consent, and her health answer is not kept without its consent.
create or replace function private.apply_consent_effects(
  p_profile_id uuid, p_key text, p_granted boolean, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  her public.profiles;
begin
  select * into her from public.profiles where id = p_profile_id;
  if p_key = 'image_rights' then
    perform set_config('ramassa.consent_event_written', 'on', true);
    update public.profiles
       set media_consent_at = case when p_granted then coalesce(media_consent_at, now()) end
     where id = p_profile_id;
    perform set_config('ramassa.consent_event_written', '', true);
  end if;
  -- Without her consent her health answer is not kept (pending fix 25).
  if p_key = 'health_data' and not p_granted then
    delete from public.custom_answers a
     where a.profile_id = p_profile_id
       and a.question_id = (private.authorization_field(her.org_id, 'health_info')).id;
    if found then
      insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
      values (her.org_id, p_actor, 'consent.health_answer_erased', 'profile', p_profile_id,
              jsonb_build_object('consent', 'health_data'));
    end if;
  end if;
end;
$$;
revoke all on function private.apply_consent_effects(uuid, text, boolean, uuid) from public, anon, authenticated;

-- She changes an optional consent, or withdraws any she gave, on her profile.
-- Optional where it is asked: the current authorization version, or an
-- Onboarding screen (RAPP-699).
create or replace function public.set_optional_consent(p_key text, p_granted boolean, p_language text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  me public.profiles;
  version public.authorization_versions;
  shown_language text;
  consent public.consents;
  last_event public.consent_events;
  onboarding public.consent_placements;
  in_version boolean;
begin
  select * into me from public.profiles where id = caller and role = 'player';
  if me.id is null then
    raise insufficient_privilege using message = 'only a player changes her consents';
  end if;
  version := private.current_authorization_version(me.org_id);
  shown_language := coalesce(nullif(p_language, ''), me.preferred_language, 'ca');
  if shown_language not in ('ca', 'es', 'en', 'ar', 'fa') then
    raise check_violation using message = 'unsupported language';
  end if;
  select * into consent from public.consents where org_id = me.org_id and key = p_key;
  select * into last_event from public.consent_events e
   where e.profile_id = caller and e.consent_id = consent.id
   order by e.decided_at desc, e.id desc limit 1;
  select * into onboarding from public.consent_placements p
   where p.consent_id = consent.id and p.surface = 'onboarding';
  in_version := coalesce(version.content -> 'consents' ? p_key, false);
  if consent.id is null or p_granted is null
    or (version.content -> 'consents' -> p_key ->> 'required')::boolean is true
    or not (
      (version.content -> 'consents' -> p_key ->> 'required')::boolean is false
      or (not in_version and onboarding.id is not null and not onboarding.required and not consent.is_archived)
      or (not p_granted and last_event.granted is true)
    )
  then
    raise invalid_parameter_value using message = 'only an optional consent changes here';
  end if;

  insert into public.consent_events
    (org_id, profile_id, consent_id, consent_key, granted, method, version_id, language, wording, required, form)
  values (
    me.org_id, caller, consent.id, consent.key, p_granted, 'profile',
    case when in_version then version.id else last_event.version_id end,
    case when in_version or last_event.wording is null then shown_language else last_event.language end,
    case when in_version
      then private.localized_text_in(version.content -> 'consents' -> p_key -> 'label', shown_language)
      else coalesce(last_event.wording, private.localized_text_in(consent.body, shown_language)) end,
    false,
    case when in_version then 'authorization' else last_event.form end);

  perform private.apply_consent_effects(caller, consent.key, p_granted, caller);

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (me.org_id, caller, 'consent.change', 'profile', caller,
          jsonb_build_object('consent', p_key, 'granted', p_granted));
end;
$$;

-- Staff record her decision on her page: given or withdrawn on paper, or as
-- staff (a withdrawal she asked for), a withdrawal with its reason.
create or replace function public.record_participant_consent(
  p_profile_id uuid, p_consent_id uuid, p_granted boolean, p_method text,
  p_reason text default null, p_language text default null, p_decided_on date default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  her public.profiles;
  consent public.consents;
  shown_language text;
  saved bigint;
begin
  if not (select public.has_permission('consents.collect'))
     or not (select private.participant_permission(p_profile_id, 'participants.view_personal')) then
    raise insufficient_privilege using message = 'recording her consent needs consents.collect';
  end if;
  select * into her from public.profiles
   where id = p_profile_id and org_id = actor_org and role = 'player' and anonymized_at is null;
  if her.id is null then
    raise no_data_found using message = 'no such player';
  end if;
  select * into consent from public.consents where id = p_consent_id and org_id = actor_org;
  if consent.id is null then
    raise no_data_found using message = 'no such consent';
  end if;
  if p_granted is null or p_method is null or p_method not in ('paper', 'staff') then
    raise invalid_parameter_value using message = 'staff record a consent on paper or as staff';
  end if;
  if not p_granted and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise check_violation using message = 'a withdrawal needs its reason';
  end if;
  if p_decided_on > current_date then
    raise check_violation using message = 'a decision is not in the future';
  end if;
  shown_language := coalesce(nullif(p_language, ''), her.preferred_language, 'ca');
  if shown_language not in ('ca', 'es', 'en', 'ar', 'fa') then
    raise check_violation using message = 'unsupported language';
  end if;

  insert into public.consent_events
    (org_id, profile_id, consent_id, consent_key, granted, method, decided_at, language, wording,
     recorded_by, reason)
  values (actor_org, her.id, consent.id, consent.key, p_granted, p_method,
          coalesce(p_decided_on::timestamptz, now()), shown_language,
          private.localized_text_in(consent.body, shown_language), actor,
          nullif(btrim(coalesce(p_reason, '')), ''))
  returning id into saved;

  perform private.apply_consent_effects(her.id, consent.key, p_granted, actor);

  -- Which consent and how, never the reason: it is prose about her.
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'consent.staff_record', 'profile', her.id,
          jsonb_build_object('consent', consent.key, 'granted', p_granted, 'method', p_method));
  return saved;
end;
$$;
revoke all on function public.record_participant_consent(uuid, uuid, boolean, text, text, text, date) from public, anon;
grant execute on function public.record_participant_consent(uuid, uuid, boolean, text, text, text, date) to authenticated;

-- Her decisions on the consents placed on her Onboarding screens: each one she
-- was shown, with its text in her language. `p_screens` limits them to the
-- screens she was asked again (the review). A payload without `consents` (an
-- older build) records nothing and checks nothing.
create or replace function private.record_onboarding_consents(
  p_profile_id uuid, p_consents jsonb, p_language text, p_screens text[] default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  her public.profiles;
  shown_language text;
  asked record;
begin
  if p_consents is null or p_consents = 'null'::jsonb then
    return;
  end if;
  select * into her from public.profiles where id = p_profile_id;
  shown_language := coalesce(nullif(p_language, ''), her.preferred_language, 'ca');
  if shown_language not in ('ca', 'es', 'en', 'ar', 'fa') then
    shown_language := 'ca';
  end if;
  if jsonb_typeof(p_consents) <> 'object'
     or exists (select 1 from jsonb_each(p_consents) given where jsonb_typeof(given.value) <> 'boolean')
     or exists (
       select 1 from jsonb_object_keys(p_consents) given(key)
        where not exists (
          select 1 from public.consent_placements p
            join public.consents c on c.id = p.consent_id and not c.is_archived
           where p.org_id = her.org_id and p.surface = 'onboarding' and c.key = given.key))
  then
    raise check_violation using message = 'her Onboarding consents are ticks of the consents it asks';
  end if;
  for asked in
    select c.id, c.key, c.body, p.required, p.screen_key
      from public.consent_placements p
      join public.consents c on c.id = p.consent_id and not c.is_archived
     where p.org_id = her.org_id and p.surface = 'onboarding'
       and (p_screens is null or p.screen_key = any (p_screens))
     order by p.screen_key, p.sort_order
  loop
    if asked.required and (p_consents -> asked.key) is distinct from 'true'::jsonb then
      raise check_violation using message = 'every required consent must be given';
    end if;
    insert into public.consent_events
      (org_id, profile_id, consent_id, consent_key, granted, method, language, wording, required,
       form, screen_key)
    values (her.org_id, her.id, asked.id, asked.key, coalesce((p_consents ->> asked.key)::boolean, false), 'app',
            shown_language, private.localized_text_in(asked.body, shown_language), asked.required,
            'onboarding', asked.screen_key);
    perform private.apply_consent_effects(her.id, asked.key,
                                          coalesce((p_consents ->> asked.key)::boolean, false), her.id);
  end loop;
end;
$$;
revoke all on function private.record_onboarding_consents(uuid, jsonb, text, text[]) from public, anon, authenticated;

-- 5. Reading -----------------------------------------------------------------------------------------------

drop function public.my_consents();
create function public.my_consents()
returns table (consent_key text, granted boolean, decided_at timestamptz, wording text, language text,
               consent_id uuid, name jsonb, form text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (e.consent_id) e.consent_key, e.granted, e.decided_at, e.wording, e.language,
         e.consent_id, c.name, e.form
    from public.consent_events e
    join public.consents c on c.id = e.consent_id
   where e.profile_id = (select auth.uid())
   order by e.consent_id, e.decided_at desc, e.id desc;
$$;
revoke all on function public.my_consents() from public, anon;
grant execute on function public.my_consents() to authenticated;

-- Every decision of hers, the newest first, for staff who read her consents.
create or replace function public.participant_consent_history(p_profile_id uuid)
returns table (event_id bigint, consent_id uuid, consent_key text, name jsonb, granted boolean,
               decided_at timestamptz, method text, form text, wording text, language text,
               required boolean, season_name text, version_number integer, recorded_by_name text,
               reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view_personal')) then
    raise insufficient_privilege using message = 'her consents need participants.view_personal';
  end if;
  return query
    select e.id, e.consent_id, e.consent_key, c.name, e.granted, e.decided_at, e.method, e.form,
           e.wording, e.language, e.required, s.name, v.version_number,
           nullif(btrim(concat_ws(' ', r.first_name, r.last_name)), ''), e.reason
      from public.consent_events e
      join public.consents c on c.id = e.consent_id
      left join public.authorization_versions v on v.id = e.version_id
      left join public.seasons s on s.id = v.season_id
      left join public.profiles r on r.id = e.recorded_by
     where e.profile_id = p_profile_id
       and e.org_id = (select public.current_org_id())
     order by e.decided_at desc, e.id desc;
end;
$$;
revoke all on function public.participant_consent_history(uuid) from public, anon;
grant execute on function public.participant_consent_history(uuid) to authenticated;

-- Her consents as they stand: the latest event of each.
drop function public.participant_consents(uuid);
create function public.participant_consents(p_profile_id uuid)
returns table (consent_key text, granted boolean, decided_at timestamptz, method text, wording text,
               language text, required boolean, season_name text, version_number integer,
               consent_id uuid, name jsonb, form text, recorded_by_name text, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view_personal')) then
    raise insufficient_privilege using message = 'her consents need participants.view_personal';
  end if;
  return query
    select latest.consent_key, latest.granted, latest.decided_at, latest.method, latest.wording,
           latest.language, latest.required, latest.season_name, latest.version_number,
           latest.consent_id, latest.name, latest.form, latest.recorded_by_name, latest.reason
      from (
        select distinct on (h.consent_id) h.*
          from public.participant_consent_history(p_profile_id) h
         order by h.consent_id, h.decided_at desc, h.event_id desc
      ) latest
      left join public.consent_placements p
        on p.consent_id = latest.consent_id and p.surface = 'authorization'
     order by coalesce(p.sort_order, 1000), latest.consent_key;
end;
$$;
revoke all on function public.participant_consents(uuid) from public, anon;
grant execute on function public.participant_consents(uuid) to authenticated;

-- 6. The renamed table in the functions that write or read it; test resets and
--    draft signings erase as before (RAPP-699) ------------------------------------------------------------

create or replace function private.record_media_consent_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
begin
  if current_setting('ramassa.consent_event_written', true) = 'on' then
    return new;
  end if;
  if (old.media_consent_at is null) is distinct from (new.media_consent_at is null) then
    insert into public.consent_events (org_id, profile_id, consent_key, granted, method)
    values (new.org_id, new.id, 'image_rights', new.media_consent_at is not null,
            case when new.id = (select auth.uid()) then 'profile' else 'staff' end);
  end if;
  return new;
end;
$$
;

create or replace function private.record_signature(p_signature_id uuid, p_profile_id uuid, p_version_id uuid, p_payload jsonb, p_method text, p_witness uuid, p_signed_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  target public.profiles;
  version public.authorization_versions;
  consents jsonb := coalesce(p_payload -> 'consents', '{}'::jsonb);
  drawing jsonb := case
    when jsonb_typeof(p_payload -> 'signature') = 'array'
     and jsonb_array_length(p_payload -> 'signature') > 0
    then p_payload -> 'signature' end;
  shown_language text := nullif(p_payload ->> 'language', '');
  on_draft boolean;
begin
  if exists (select 1 from public.authorization_signatures where id = p_signature_id) then
    return p_signature_id;
  end if;

  select * into target from public.profiles where id = p_profile_id;
  -- "Is it a draft" is decided on the locked row (pending fix 29): FOR SHARE
  -- waits for a publish or a discard holding the row and then reads the row
  -- it committed, so a draft signature never lands on a published version.
  select * into version from public.authorization_versions where id = p_version_id for share;
  on_draft := version.id is not null and version.published_at is null;
  if on_draft then
    if not private.sees_onboarding_drafts(target.id) then
      raise check_violation using message = 'only a test player signs a draft';
    end if;
    version.season_id := private.current_season_id(target.org_id);
  end if;
  if target.id is null or version.id is null or version.org_id <> target.org_id
    or version.season_id is null
    or version.season_id is distinct from private.current_season_id(target.org_id)
  then
    raise check_violation using message = 'sign a version of the current season';
  end if;
  perform private.validate_signing_payload(p_payload, version.content);
  perform private.check_signing_answers(target.org_id, target.id, version.content, p_payload);

  insert into public.authorization_signatures (
    id, org_id, profile_id, season_id, version_id, method, language, device,
    signed_at, signature, unable_to_draw, witnessed_by, is_test_fixture
  ) values (
    p_signature_id, target.org_id, target.id, version.season_id, version.id, p_method,
    shown_language,
    left(nullif(btrim(p_payload ->> 'device'), ''), 200),
    coalesce(p_signed_at, now()), drawing, drawing is null, p_witness, on_draft
  )
  on conflict (id) do nothing;

  -- Every consent of the version she signed, with the words she was shown.
  insert into public.consent_events
    (org_id, profile_id, signature_id, consent_key, granted, method, decided_at,
     version_id, language, wording, required)
  select target.org_id, target.id, p_signature_id, consent.consent_key,
         coalesce((consents ->> consent.consent_key)::boolean, false), p_method,
         coalesce(p_signed_at, now()), version.id, coalesce(shown_language, 'ca'),
         private.localized_text_in(consent.label, coalesce(shown_language, 'ca')), consent.required
    from private.authorization_consents(version.content) consent;

  perform set_config('ramassa.consent_event_written', 'on', true);
  update public.profiles set
    -- Image rights drive the photo consent, when the version asks them.
    media_consent_at = case
      when not (version.content -> 'consents' ? 'image_rights') then media_consent_at
      when coalesce((consents ->> 'image_rights')::boolean, false)
        then coalesce(media_consent_at, now())
      else null
    end
  where id = target.id;
  perform set_config('ramassa.consent_event_written', '', true);
  -- Her answers on the Health screen, through the one answer writer (RAPP-698).
  perform private.write_field_answers(
    target.id, private.signing_answers(target.org_id, p_payload), 'player', null, true);

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (target.org_id, coalesce(p_witness, target.id), 'authorization.sign', 'authorization_signature',
          p_signature_id,
          jsonb_build_object('version_id', version.id, 'method', p_method,
                             'unable_to_draw', drawing is null, 'witnessed_by', p_witness,
                             'draft', on_draft));
  return p_signature_id;
end;
$$
;

create or replace function private.scenario_reset(p_target profiles)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
begin
  -- Not joined, with an open invitation.
  perform private.scenario_terms(p_target, '{"accepted": false}'::jsonb);
  -- No signature and no consent, this season or any other.
  delete from public.authorization_signatures where profile_id = p_target.id;
  -- A test player's reset is erasure of her test record (RAPP-699).
  perform set_config('ramassa.consent_event_erasure', 'on', true);
  delete from public.consent_events where profile_id = p_target.id;
  perform set_config('ramassa.consent_event_erasure', '', true);
  delete from public.custom_answers where profile_id = p_target.id;
  delete from public.form_signatures where profile_id = p_target.id;
  update public.profiles p set
    avatar_url = null, media_consent_at = null, season_number = null, prior_seasons = 0,
    updated_at = now()
  where p.id = p_target.id;
  return '{}'::jsonb;
end;
$$
;

create or replace function private.scenario_season_signature(p_target profiles, p_change jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  signed boolean := (p_change ->> 'signed')::boolean;
  current_season uuid := private.current_season_id(p_target.org_id);
  -- The version her phone shows: the draft when there is one (RAPP-619).
  version public.authorization_versions := private.authorization_version_for(p_target.org_id, p_target.id);
  on_draft boolean;
  shown_language text := coalesce(p_target.preferred_language, 'ca');
  signed_signature uuid;
begin
  if signed is null then
    raise invalid_parameter_value using message = 'the season signature takes signed: true or false';
  end if;
  if current_season is null then
    raise object_not_in_prerequisite_state using message = 'the organization has no current season';
  end if;
  on_draft := version.id is not null and version.published_at is null;
  if signed then
    if not exists (
      select 1 from public.authorization_signatures s
       where s.profile_id = p_target.id and s.season_id = current_season
         and (not on_draft or s.version_id = version.id)
    ) then
      if version.id is null then
        insert into public.authorization_signatures (
          org_id, profile_id, season_id, method, language, paper_signed_on, recorded_by, is_test_fixture)
        values (p_target.org_id, p_target.id, current_season, 'paper', shown_language,
                current_date, (select auth.uid()), true);
      else
        insert into public.authorization_signatures (
          org_id, profile_id, season_id, version_id, method, language, device, unable_to_draw,
          recorded_by, is_test_fixture)
        values (p_target.org_id, p_target.id, current_season, version.id, 'app', shown_language,
                'test scenario', true, (select auth.uid()), true)
        returning id into signed_signature;
        insert into public.consent_events
          (org_id, profile_id, signature_id, consent_key, granted, method, version_id, language,
           wording, required)
        select p_target.org_id, p_target.id, signed_signature, consent.consent_key, consent.required, 'app',
               version.id, shown_language, private.localized_text_in(consent.label, shown_language),
               consent.required
          from private.authorization_consents(version.content) consent;
      end if;
    end if;
  else
    -- Her consents given while signing go with the signature (cascade).
    delete from public.authorization_signatures s
     where s.profile_id = p_target.id and s.season_id = current_season;
  end if;
  return jsonb_build_object('signed', signed);
end;
$$
;

create or replace function public.create_data_export(p_dataset text, p_scope text, p_format text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_reason text DEFAULT NULL::text, p_confirmed boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  export_id uuid := gen_random_uuid();
  export_columns jsonb;
  field_columns jsonb;
  export_rows jsonb;
  start_instant timestamptz;
  end_instant timestamptz;
begin
  perform private.require_recent_second_factor();
  if actor is null or actor_org is null or not (
    -- Custom answers (RAPP-307) need what the participants export needs.
    case (case when p_dataset in ('custom_answers', 'consents') then 'participants' else p_dataset end)
      when 'participants' then case
        when p_scope = 'full' then (select public.has_permission('export.participants_sensitive'))
          and (select public.has_permission('participants.view_sensitive'))
        else (select public.has_permission('export.participants'))
      end
      when 'attendance' then (select public.has_permission('export.attendance'))
      when 'events' then (select public.has_permission('export.events'))
      -- An unknown dataset falls through to the validation below for anyone
      -- who may export something, so the error names the real problem.
      else (select public.has_permission('export.participants'))
        or (select public.has_permission('export.attendance'))
        or (select public.has_permission('export.events'))
    end
  ) then
    raise insufficient_privilege using message = 'data exports require admin access';
  end if;
  if p_dataset not in ('participants', 'custom_answers', 'consents', 'attendance', 'events') then
    raise invalid_parameter_value using message = 'unsupported export dataset';
  end if;
  if p_scope not in ('default', 'full') then
    raise invalid_parameter_value using message = 'unsupported export scope';
  end if;
  if p_format not in ('csv', 'xlsx') then
    raise invalid_parameter_value using message = 'unsupported export format';
  end if;
  if p_start_date is not null and p_end_date is not null and p_start_date > p_end_date then
    raise invalid_datetime_format using message = 'invalid export period';
  end if;
  if p_scope = 'full' and not p_confirmed then
    raise invalid_parameter_value using message = 'full export requires explicit confirmation';
  end if;
  if p_scope = 'full' and length(btrim(coalesce(p_reason, ''))) < 10 then
    raise invalid_parameter_value using message = 'full export requires a reason of at least 10 characters';
  end if;
  if length(coalesce(p_reason, '')) > 500 then
    raise invalid_parameter_value using message = 'export reason is too long';
  end if;
  if (
    select count(*)
    from public.audit_log log
    where log.actor_id = actor
      and log.action like 'data_export.%'
      and log.created_at >= now() - interval '1 minute'
  ) >= 5 then
    raise sqlstate '42901' using message = 'export rate limit exceeded';
  end if;

  start_instant := case
    when p_start_date is null then null
    else p_start_date::timestamp at time zone 'Europe/Madrid'
  end;
  end_instant := case
    when p_end_date is null then null
    else (p_end_date + 1)::timestamp at time zone 'Europe/Madrid'
  end;

  if p_dataset = 'participants' then
    -- One column per field (RAPP-662, D9): her names and account, then every
    -- field of Dades de les jugadores in its order, by its system key or its
    -- Catalan name. The level decides: the default scope holds Normal and
    -- Personal fields, the full scope Sensitive ones too. Each value is her
    -- current answer (this season's for a seasonal field) as text, the way
    -- the custom answers export writes it.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', named.id, 'column_name', named.column_name, 'season_key', named.season_key)
             order by named.section_order, named.sort_order, named.id), '[]'::jsonb)
      into field_columns
      from (
        select f.id, s.sort_order as section_order, f.sort_order,
               case when private.field_is_seasonal(f.id)
                    then private.current_season_id(f.org_id)
                    else '00000000-0000-0000-0000-000000000000'::uuid end as season_key,
               -- Two fields with one name, or a name a fixed column has, get
               -- the start of their id so no column hides another.
               case when count(*) over (partition by coalesce(f.system_key, f.label ->> 'ca')) > 1
                      or coalesce(f.system_key, f.label ->> 'ca')
                         in ('id', 'first_name', 'last_name', 'preferred_language', 'is_active', 'created_at')
                    then coalesce(f.system_key, f.label ->> 'ca') || ' (' || left(f.id::text, 8) || ')'
                    else coalesce(f.system_key, f.label ->> 'ca') end as column_name
          from public.profile_fields f
          join public.profile_sections s on s.id = f.section_id
         where f.org_id = actor_org
           -- Her names are columns of their own (D2).
           and f.system_key is distinct from 'first_name'
           and f.system_key is distinct from 'last_name'
           and (p_scope = 'full' or f.privacy <> 'sensitive')
           -- Her health only for someone with the health permission (RAPP-698).
           and (f.read_permission is null or (select public.has_permission(f.read_permission)))
      ) named;
    export_columns := '["id","first_name","last_name","preferred_language"]'::jsonb
      || coalesce((select jsonb_agg(c -> 'column_name' order by ordinality)
                     from jsonb_array_elements(field_columns) with ordinality as listed(c, ordinality)), '[]'::jsonb)
      || '["is_active","created_at"]'::jsonb;
    select coalesce(jsonb_agg(
             jsonb_build_object(
               'id', profile.id,
               'first_name', private.shown_name(profile.id, 'first_name'),
               'last_name', private.shown_name(profile.id, 'last_name'),
               'preferred_language', profile.preferred_language,
               'is_active', profile.is_active,
               'created_at', profile.created_at)
             || coalesce((
               select jsonb_object_agg(
                        c.column_name,
                        private.custom_answer_text(
                          field, coalesce(answer.value, (public.decrypt_field(answer.value_encrypted))::jsonb)))
                 from jsonb_to_recordset(field_columns) as c(id uuid, column_name text, season_key uuid)
                 join public.profile_fields field on field.id = c.id
                 join public.custom_answers answer
                   on answer.profile_id = profile.id and answer.question_id = c.id
                  and answer.season_key = c.season_key), '{}'::jsonb)
             order by private.shown_name(profile.id, 'last_name'), private.shown_name(profile.id, 'first_name'), profile.id), '[]'::jsonb)
    into export_rows
    from public.profiles profile
    where profile.org_id = actor_org
      and profile.role = 'player'
      and not profile.is_test_account;
  elsif p_dataset = 'custom_answers' then
    -- Answers to every field (RAPP-307, RAPP-662), one row per answer. The
    -- default scope holds Normal and Personal answers; Sensitive answers only
    -- the full scope, which needs participants.view_sensitive above.
    export_columns := '["participant_id","first_name","last_name","section","question","privacy","season","answer","answered_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'participant_id', profile.id,
      'first_name', private.shown_name(profile.id, 'first_name'),
      'last_name', private.shown_name(profile.id, 'last_name'),
      'section', section.title ->> 'ca',
      'question', field.label ->> 'ca',
      'privacy', field.privacy,
      'season', season.name,
      'answer', private.custom_answer_text(
        field, coalesce(answer.value, (public.decrypt_field(answer.value_encrypted))::jsonb)),
      'answered_at', answer.answered_at
    ) order by private.shown_name(profile.id, 'last_name'), private.shown_name(profile.id, 'first_name'), profile.id, section.sort_order, field.sort_order,
             season.starts_on), '[]'::jsonb)
    into export_rows
    from public.custom_answers answer
    -- Her Fitxa: every field, in the section the team reads it (RAPP-656).
    join public.profile_fields field on field.id = answer.question_id
    join public.profile_sections section on section.id = field.section_id
    join public.profiles profile on profile.id = answer.profile_id
    left join public.seasons season on season.id = answer.season_id
    where answer.org_id = actor_org
      and profile.role = 'player'
      and not profile.is_test_account
      and (p_scope = 'full' or field.privacy <> 'sensitive')
      and (field.read_permission is null or (select public.has_permission(field.read_permission)));
  elsif p_dataset = 'consents' then
    -- Every consent decision with the words she was shown (RAPP-614): one row
    -- per decision, signing and later changes alike. No health answer, no
    -- signature: a consent's wording is the organization's own text.
    export_columns := '["participant_id","first_name","last_name","season","version","consent_key","consent","language","required","granted","method","decided_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'participant_id', profile.id,
      'first_name', private.shown_name(profile.id, 'first_name'),
      'last_name', private.shown_name(profile.id, 'last_name'),
      'season', season.name,
      'version', version.version_number,
      'consent_key', event.consent_key,
      'consent', event.wording,
      'language', event.language,
      'required', event.required,
      'granted', event.granted,
      'method', event.method,
      'decided_at', event.decided_at
    ) order by private.shown_name(profile.id, 'last_name'), private.shown_name(profile.id, 'first_name'), profile.id, event.decided_at, event.id), '[]'::jsonb)
    into export_rows
    from public.consent_events event
    join public.profiles profile on profile.id = event.profile_id
    left join public.authorization_versions version on version.id = event.version_id
    left join public.seasons season on season.id = version.season_id
    where event.org_id = actor_org
      and profile.role = 'player'
      and not profile.is_test_account
      and (start_instant is null or event.decided_at >= start_instant)
      and (end_instant is null or event.decided_at < end_instant);
  elsif p_dataset = 'attendance' then
    export_columns := '["attendance_id","occurrence_id","event_id","category_id","player_id","first_name","last_name","status","marked_at","starts_at","ends_at","event_title_ca","event_title_es","event_title_en","event_title_ar","event_title_fa","event_location","category_name_ca","category_name_es","category_name_en","category_name_ar","category_name_fa"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'attendance_id', report.attendance_id,
      'occurrence_id', report.occurrence_id,
      'event_id', report.event_id,
      'category_id', report.category_id,
      'player_id', report.player_id,
      'first_name', report.first_name,
      'last_name', report.last_name,
      'status', report.status,
      'marked_at', report.marked_at,
      'starts_at', report.starts_at,
      'ends_at', report.ends_at,
      'event_title_ca', report.event_title ->> 'ca',
      'event_title_es', report.event_title ->> 'es',
      'event_title_en', report.event_title ->> 'en',
      'event_title_ar', report.event_title ->> 'ar',
      'event_title_fa', report.event_title ->> 'fa',
      'event_location', report.event_location,
      'category_name_ca', report.category_name ->> 'ca',
      'category_name_es', report.category_name ->> 'es',
      'category_name_en', report.category_name ->> 'en',
      'category_name_ar', report.category_name ->> 'ar',
      'category_name_fa', report.category_name ->> 'fa'
    ) order by report.starts_at, report.last_name, report.first_name, report.attendance_id), '[]'::jsonb)
    into export_rows
    from public.attendance_report_rows report
    where report.org_id = actor_org
      and not report.is_test_account
      and (start_instant is null or report.starts_at >= start_instant)
      and (end_instant is null or report.starts_at < end_instant);
  else
    export_columns := '["id","category_id","title_ca","title_es","title_en","title_ar","title_fa","location","starts_at","ends_at","time_zone","status","signup_mode","max_participants","created_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', event.id,
      'category_id', event.category_id,
      'title_ca', event.title ->> 'ca',
      'title_es', event.title ->> 'es',
      'title_en', event.title ->> 'en',
      'title_ar', event.title ->> 'ar',
      'title_fa', event.title ->> 'fa',
      'location', event.location,
      'starts_at', event.starts_at,
      'ends_at', event.ends_at,
      'time_zone', event.time_zone,
      'status', event.status,
      'signup_mode', event.signup_mode,
      'max_participants', event.max_participants,
      'created_at', event.created_at
    ) order by event.starts_at, event.id), '[]'::jsonb)
    into export_rows
    from public.events event
    where event.org_id = actor_org
      and (start_instant is null or event.starts_at >= start_instant)
      and (end_instant is null or event.starts_at < end_instant);
  end if;

  insert into public.audit_log (id, org_id, actor_id, action, target_type, target_id, changes)
  values (
    gen_random_uuid(), actor_org, actor, 'data_export.' || p_scope, 'data_export', export_id,
    jsonb_strip_nulls(jsonb_build_object(
      'dataset', p_dataset,
      'format', p_format,
      'scope', p_scope,
      'start_date', p_start_date,
      'end_date', p_end_date,
      'reason', case when p_scope = 'full' then btrim(p_reason) else null end,
      'row_count', jsonb_array_length(export_rows)
    ))
  );

  return jsonb_build_object(
    'version', 1,
    'export_id', export_id,
    'dataset', p_dataset,
    'scope', p_scope,
    'format', p_format,
    'generated_at', now(),
    'columns', export_columns,
    'rows', export_rows
  );
end;
$$
;

create or replace function public.discard_authorization_draft()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor_org uuid := (select public.current_org_id());
  draft uuid;
  draft_signatures integer;
  draft_consent_events integer;
begin
  if not (select private.can_design_onboarding()) then
    raise insufficient_privilege using message = 'the authorization draft needs settings.organization or onboarding.design';
  end if;
  select id into draft from public.authorization_versions
   where org_id = actor_org and published_at is null
   for update;
  if draft is null then
    return;
  end if;
  -- Test players' signatures of the draft go with it (their consents follow
  -- by cascade).
  delete from public.authorization_signatures where version_id = draft;
  get diagnostics draft_signatures = row_count;
  -- Her profile decisions on the draft's consents go too (pending fix 30):
  -- no signature owns them, and the version's foreign key would only empty
  -- their version.
  perform set_config('ramassa.consent_event_erasure', 'on', true);
  delete from public.consent_events where version_id = draft;
  perform set_config('ramassa.consent_event_erasure', '', true);
  get diagnostics draft_consent_events = row_count;
  delete from public.authorization_versions where id = draft;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'authorization.draft_discarded', 'authorization_version',
          draft, jsonb_build_object('test_signatures_dropped', draft_signatures,
                             'test_consent_events_dropped', draft_consent_events));
end;
$$
;

create or replace function public.publish_authorization_draft(p_season_id uuid DEFAULT NULL::uuid, p_is_correction boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  draft public.authorization_versions;
  current_season public.seasons;
  target public.seasons;
  next_number integer;
  draft_signatures integer;
  draft_consent_events integer;
begin
  if not (select public.has_permission('settings.organization')) then
    raise insufficient_privilege using message = 'publishing the authorization needs settings.organization';
  end if;
  if p_is_correction is null then
    raise invalid_parameter_value using message = 'say whether this is a correction';
  end if;
  select * into current_season from public.seasons
   where id = private.current_season_id(actor_org);
  if p_season_id is null then
    if current_season.id is null then
      raise object_not_in_prerequisite_state using message = 'the organization has no current season';
    end if;
    target := current_season;
  else
    select * into target from public.seasons where id = p_season_id and org_id = actor_org;
    if target.id is null then
      raise no_data_found using message = 'that season is not one of the organization''s';
    end if;
    if target.id is distinct from current_season.id
       and target.starts_on <= coalesce(current_season.starts_on, current_date - 1) then
      raise invalid_parameter_value using message = 'a past season takes no new authorization';
    end if;
  end if;
  select * into draft from public.authorization_versions
   where org_id = actor_org and published_at is null
   for update;
  if draft.id is null then
    raise object_not_in_prerequisite_state using message = 'there is no draft to publish';
  end if;
  perform 1 from public.seasons where id = target.id for update;
  -- Its consents as the catalogue and the consents screen hold them now (RAPP-699).
  draft.content := draft.content
    || jsonb_build_object('consents', private.authorization_consents_snapshot(actor_org));
  if not private.authorization_content_valid(draft.content) then
    raise check_violation using message = 'the authorization needs its title, sections, consents and questions';
  end if;
  -- A correction fixes a version of that season (RAPP-696).
  if p_is_correction and not exists (
    select 1 from public.authorization_versions v
     where v.season_id = target.id and v.published_at is not null
  ) then
    raise object_not_in_prerequisite_state
      using message = 'a correction needs a published version of that season to correct';
  end if;
  -- Test players' signatures of the draft go: a published version never
  -- carries one (RAPP-619).
  delete from public.authorization_signatures where version_id = draft.id;
  get diagnostics draft_signatures = row_count;
  -- Her profile decisions on the draft's consents go too (pending fix 30):
  -- no signature owns them, so the cascade above misses them.
  perform set_config('ramassa.consent_event_erasure', 'on', true);
  delete from public.consent_events where version_id = draft.id;
  perform set_config('ramassa.consent_event_erasure', '', true);
  get diagnostics draft_consent_events = row_count;
  select coalesce(max(v.version_number), 0) + 1 into next_number
    from public.authorization_versions v where v.season_id = target.id;
  update public.authorization_versions
     set season_id = target.id, version_number = next_number, published_at = now(),
         content = draft.content,
         published_by = actor, is_correction = p_is_correction
   where id = draft.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'authorization.publish', 'authorization_version', draft.id,
          jsonb_build_object('season_id', target.id, 'version_number', next_number, 'from_draft', true,
                             'is_correction', p_is_correction,
                             'test_signatures_dropped', draft_signatures,
                             'test_consent_events_dropped', draft_consent_events,
                             'for_current_season', target.id is not distinct from current_season.id));
  return next_number;
end;
$$
;


-- 7. The catalogue in intake_catalog, Onboarding consents, erasure and the registry -----------------------

create or replace function private.complete_onboarding_signed(payload jsonb, p_signing jsonb)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  caller uuid := (select auth.uid());
  saved public.profiles;
  previous_ids uuid[];
  acceptance uuid;
  drawing jsonb := nullif(p_signing->'signature','null'::jsonb);
  cannot_draw boolean;
  -- Her signatures of the Onboarding blocks (RAPP-690), by block id.
  signatures jsonb := payload -> 'signatures';
  unsigned uuid[];
begin
  if caller is null then raise insufficient_privilege using message='authenticated signing required'; end if;
  if jsonb_typeof(p_signing) is distinct from 'object'
    or (p_signing->'terms_accepted') is distinct from 'true'::jsonb
    or jsonb_typeof(p_signing->'media_consent') is distinct from 'boolean'
    or jsonb_typeof(p_signing->'unable_to_draw') is distinct from 'boolean'
    or (payload->'media_consent') is distinct from (p_signing->'media_consent')
    or length(coalesce(p_signing->>'device',''))>200
  then raise check_violation using message='explicit terms acceptance and matching media choice required'; end if;
  cannot_draw := (p_signing->>'unable_to_draw')::boolean;
  if (cannot_draw and drawing is not null) or
    (not cannot_draw and not private.app_signature_valid(drawing))
  then raise check_violation using message='draw a valid signature or use the cannot-draw alternative'; end if;

  -- Serialize calls for an existing account and identify this acceptance exactly,
  -- including two acceptances made in one transaction with the same timestamp.
  perform 1 from public.profiles where id=caller for update;
  select coalesce(array_agg(id),'{}'::uuid[]) into previous_ids
    from public.terms_acceptances where profile_id=caller;
  -- Every answer, the staff fields' included, travels in `answers` (RAPP-661)
  -- and is saved and checked in the same transaction as her account.
  saved := public.complete_onboarding(payload - 'signatures' - 'consents');
  select id into strict acceptance from public.terms_acceptances
    where profile_id=caller and not (id=any(previous_ids));
  insert into public.app_terms_signatures
    (acceptance_id,profile_id,org_id,signature,unable_to_draw,media_consent,device)
  values (acceptance,caller,saved.org_id,drawing,cannot_draw,(p_signing->>'media_consent')::boolean,nullif(p_signing->>'device',''));
  -- Every signature block of her Onboarding is signed by her (RAPP-690), in
  -- the same transaction as her account.
  perform private.save_form_signatures(
    saved.org_id, 'wizard', caller, null, caller,
    -- The name she signs with is her answer, whatever its level (RAPP-693).
    concat_ws(' ', private.name_answer_text(caller, 'first_name'), private.name_answer_text(caller, 'last_name')),
    signatures);
  -- Her ticks of the consents her Onboarding asks (RAPP-699), in her language.
  perform private.record_onboarding_consents(
    caller, payload -> 'consents', coalesce(payload ->> 'preferred_language', payload ->> 'locale_shown'));
  unsigned := private.unsigned_form_blocks(saved.org_id, 'wizard', caller, null);
  if cardinality(unsigned) > 0 then
    raise not_null_violation using message = 'complete_onboarding requires her signature on every signature block';
  end if;
  return saved;
end $$
;

create or replace function public.anonymize_participant(participant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid;
  subject_role text;
  subject_anonymized_at timestamptz;
  birth_field public.profile_fields;
  birth_date date;
begin
  perform private.require_recent_second_factor();
  -- SECURITY DEFINER means RLS is not doing this check, so it runs before any
  -- work, right after the step-up check, and pgTAP asserts it from three roles.
  if not (select public.has_permission('rgpd.erase')) then
    raise exception 'anonymizing a participant is a staff action'
      using errcode = 'insufficient_privilege';
  end if;

  actor_org := (select public.current_org_id());

  -- The tenant scope RLS would normally provide. Without it, SECURITY DEFINER
  -- would let a staff member of one organization anonymize another's roster.
  select p.role, p.anonymized_at into subject_role, subject_anonymized_at
  from public.profiles p
  where p.id = participant_id and p.org_id = actor_org;

  if subject_role is null then
    raise exception 'ANONYMIZE_NO_SUBJECT: no such participant in this organization'
      using errcode = 'raise_exception';
  end if;

  -- Anonymizing a colleague would strip the name off an account that still signs
  -- in and still acts, which is a different and much worse thing than what this
  -- function is for.
  if subject_role <> 'player' then
    raise exception 'ANONYMIZE_NOT_A_PARTICIPANT: only a participant record can be anonymized'
      using errcode = 'raise_exception';
  end if;

  -- Already done. Silently re-running would rewrite `anonymized_at` and lose the
  -- date the person actually left the record.
  if subject_anonymized_at is not null then
    raise exception 'ANONYMIZE_ALREADY_DONE: this record was already anonymized'
      using errcode = 'raise_exception';
  end if;

  -- The one answer that survives, read before anything goes: her birth year,
  -- from the field the registry names, only while it is still a date (D7, D11).
  birth_field := private.feature_field(actor_org, 'erasure.birth_year');
  if birth_field.id is not null then
    birth_date := (private.field_answer_now(participant_id, birth_field) #>> '{}')::date;
  end if;

  update public.profiles set
    -- Emptied rather than filled with a placeholder word: the screens read
    -- `anonymized_at` and show a translated label, so no invented name has to
    -- exist in five languages or leak out of a CSV export as though it were one.
    first_name = '',
    last_name = '',
    avatar_url = null,
    media_consent_at = null,
    is_active = false,
    anonymized_at = now(),
    updated_at = now()
  where id = participant_id;

  -- Every answer of hers (D11): the app's fields and the team's, every season.
  delete from public.custom_answers where profile_id = participant_id;
  delete from public.referral_custom_answers r
   using public.entity_referrals referral
   where r.referral_id = referral.id and referral.referred_profile_id = participant_id;
  -- What a field change set aside (RAPP-665) is hers too: it leaves with her.
  delete from public.audit_log a
   where a.action = 'intake.answer_set_aside'
     and ((a.target_type = 'profile' and a.target_id = participant_id)
          or (a.target_type = 'entity_referral'
              and a.target_id in (select referral.id from public.entity_referrals referral
                                   where referral.referred_profile_id = participant_id)));

  -- Her signatures of the form blocks (RAPP-690), hers and the entity's for her.
  delete from public.form_signatures g
   where g.profile_id = participant_id
      or g.referral_id in (select referral.id from public.entity_referrals referral
                            where referral.referred_profile_id = participant_id);

  -- Her birth year alone still answers every age band a funder report asks.
  if birth_date is not null then
    begin
      perform private.write_custom_answer(
        participant_id, birth_field,
        to_jsonb(make_date(extract(year from birth_date)::int, 1, 1)::text), 'staff', actor);
    exception when check_violation then
      -- A seasonal date field with no current season keeps nothing.
      null;
    end;
  end if;

  -- Prose about her life, which no column-level anonymization can reach. Deleted
  -- through this function and only through this function: the table has no
  -- DELETE policy precisely so that no staff member can quietly revise the
  -- record, and the right to erasure is a different thing from revising it.
  delete from public.participant_notes where profile_id = participant_id;
  -- Her consent decisions stay as proof of what she agreed to, without her
  -- name (RAPP-699). A staff member's reason for a withdrawal is prose about
  -- her, so it goes.
  perform set_config('ramassa.consent_event_erasure', 'on', true);
  update public.consent_events set reason = null where profile_id = participant_id and reason is not null;
  perform set_config('ramassa.consent_event_erasure', '', true);

  -- A retained device token would keep a channel open to a real phone belonging
  -- to a person this row no longer claims to know.
  delete from public.push_tokens where user_id = participant_id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org,
    actor,
    'profile.anonymize',
    'profile',
    participant_id,
    -- WHICH things were cleared, never what was in them (ADR-021). The audit row
    -- must not become the last surviving copy of the data it describes.
    jsonb_build_object('fields_cleared', true, 'answers_deleted', true, 'notes_deleted', true,
                       'signatures_deleted', true,
                       'birth_year_kept', birth_date is not null)
  );
end;
$$
;

create or replace function public.complete_onboarding_review(payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  caller uuid := (select auth.uid());
  her public.profiles;
  pending text[];
  answers jsonb := coalesce(nullif(payload -> 'answers', 'null'::jsonb), '{}'::jsonb);
  first_name_value text := nullif(private.name_trim(payload ->> 'first_name'), '');
  last_name_value text := nullif(private.name_trim(payload ->> 'last_name'), '');
  missing uuid[];
begin
  select * into her from public.profiles where id = caller for update;
  if her.id is null or her.role <> 'player' then
    raise insufficient_privilege using message = 'reviewing the onboarding is for a player who joined';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object'
     or payload - array['first_name', 'last_name', 'answers', 'signatures', 'consents'] <> '{}'::jsonb then
    raise invalid_parameter_value
      using message = 'complete_onboarding_review takes her names, her answers by field and her signatures';
  end if;
  pending := private.onboarding_review_screens(caller);

  -- Her names, when the review asked them; one left empty keeps what is stored.
  if first_name_value is not null or last_name_value is not null then
    update public.profiles
       set first_name = coalesce(first_name_value, first_name),
           last_name = coalesce(last_name_value, last_name),
           updated_at = now()
     where id = caller;
  end if;
  -- Her answers by field, through the Onboarding writer.
  perform private.write_field_answers(caller, answers, 'player', null, true);
  perform private.apply_document_rule(caller, true, true);
  perform private.save_form_signatures(
    her.org_id, 'wizard', caller, null, caller,
    concat_ws(' ', private.name_answer_text(caller, 'first_name'), private.name_answer_text(caller, 'last_name')),
    payload -> 'signatures');

  -- Her ticks of the consents on the screens she reviews (RAPP-699).
  perform private.record_onboarding_consents(caller, payload -> 'consents', her.preferred_language, pending);

  -- Every required field on a screen she reviews has an answer.
  select coalesce(array_agg(m.id), array[]::uuid[]) into missing
    from unnest(private.missing_required_custom_answers(caller, 'wizard')) m(id)
   where exists (select 1 from public.field_placements pl
                  where pl.field_id = m.id and pl.surface = 'onboarding'
                    and pl.screen_key = any (pending));
  if cardinality(missing) > 0 then
    raise not_null_violation using message = 'complete_onboarding_review requires an answer to a required question';
  end if;
  -- Every signature block on a screen she reviews is signed as it reads now.
  if exists (
    select 1 from public.form_blocks b
     where b.org_id = her.org_id and b.surface = 'onboarding'
       and b.screen_key = any (pending)
       and not exists (
         select 1 from public.form_signatures g
          where g.block_id = b.id and g.profile_id = caller
            and g.body = b.body ->> g.language)
  ) then
    raise not_null_violation using message = 'complete_onboarding_review requires her signature on every signature block';
  end if;

  update public.profiles set onboarding_current_at = now(), updated_at = now() where id = caller;
end;
$$
;

create or replace function public.intake_catalog()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  -- A woman who started on her own has no profile until she completes the
  -- wizard: she reads the default organization's questions.
  actor_org uuid := coalesce((select public.current_org_id()), (select public.default_organization_id()));
  with_archived boolean := (select private.can_design_onboarding());
begin
  if (select auth.uid()) is null or actor_org is null then
    raise insufficient_privilege using message = 'the question catalog needs an account';
  end if;
  return jsonb_build_object(
    -- Ramassà screens. The fields each one asks are its placements, below.
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'intro', s.intro, 'after_screen', s.after_screen,
        'sort_order', s.sort_order, 'is_archived', s.is_archived)
        order by array_position(private.intake_builtin_screens(), s.after_screen), s.sort_order, s.created_at)
        from public.intake_screens s
       where s.org_id = actor_org and (with_archived or not s.is_archived)), '[]'::jsonb),
    -- The app's questions as staff worded or hid them (RAPP-666): the wording
    -- of the question's first field on her onboarding, and hidden when that
    -- field is placed nowhere on it.
    'overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question', q.question, 'label', p.label_override, 'help', p.help_override,
        'is_hidden', p.id is null) order by q.question)
        from unnest(private.wizard_intake_questions()) q(question)
        join public.profile_fields f
          on f.org_id = actor_org and f.system_key = private.question_system_key(q.question)
        left join public.field_placements p on p.field_id = f.id and p.surface = 'onboarding'
       where p.id is null or p.label_override is not null or p.help_override is not null), '[]'::jsonb),
    'presets', case when ((select public.has_permission('participants.view_personal')) or (select public.has_permission('onboarding.design'))) then coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'states', p.states)
        order by p.name, p.id)
        from public.intake_state_presets p where p.org_id = actor_org), '[]'::jsonb)
      else '[]'::jsonb end,
    -- Staff wording of the built-in screens and their hide switch (RAPP-612).
    -- A hide counts only while none of the screen's questions is required.
    'builtin_screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'screen', b.screen, 'texts', b.texts,
        'is_hidden', b.is_hidden and private.builtin_screen_hideable(b.screen))
        order by b.screen)
        from public.intake_builtin_screens b where b.org_id = actor_org), '[]'::jsonb),
    -- The wizard steps as staff arranged them (RAPP-612); null is the app's order.
    'flow_order', (
      select to_jsonb(f.step_order) from public.intake_flow_orders f where f.org_id = actor_org),
    -- The built-in questions that need an answer (RAPP-611): the one list her
    -- phone, her summary and the staff preview read.
    'required_questions', to_jsonb(private.required_intake_questions(actor_org)),
    -- The app terms she accepts (RAPP-613): the current published version,
    -- or the draft for a test player when there is one (RAPP-619).
    'terms', (
      select jsonb_build_object('id', v.id, 'version_number', v.version_number, 'content', v.content,
                                'is_draft', v.published_at is null)
        from private.app_terms_version_for(actor_org, (select auth.uid())) v
       where v.id is not null),
    -- The profile layout (RAPP-649): sections, fields and where each is asked.
    -- Who created a field, and whether it has answers (which fixes its
    -- privacy level), only for the people who design it.
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'key', s.key, 'title', s.title, 'sort_order', s.sort_order, 'is_builtin', s.is_builtin)
        order by s.sort_order, s.created_at)
        from public.profile_sections s where s.org_id = actor_org), '[]'::jsonb),
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'section_id', f.section_id, 'kind', f.kind, 'system_key', f.system_key,
        'question_type', f.question_type, 'label', f.label, 'help', f.help, 'privacy', f.privacy,
        'read_permission', f.read_permission,
        'default_required', f.default_required, 'settings', f.settings,
        'show_when_field_id', f.show_when_field_id, 'show_when_option_id', f.show_when_option_id,
        'sort_order', f.sort_order, 'is_archived', f.is_archived, 'created_at', f.created_at,
        'created_by', case when with_archived then f.created_by end,
        'created_by_name', case when with_archived then (
          select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
            from public.profiles p where p.id = f.created_by) end,
        'has_answers', case when with_archived then private.field_has_answers(f.id) end,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'key', o.key, 'label', o.label, 'sort_order', o.sort_order, 'is_archived', o.is_archived)
            order by o.sort_order, o.id)
            from public.custom_question_options o where o.question_id = f.id), '[]'::jsonb))
        order by f.sort_order, f.created_at)
        from public.profile_fields f
       where f.org_id = actor_org and (with_archived or not f.is_archived)), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'field_id', p.field_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'sort_order', p.sort_order, 'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.surface, p.screen_key, p.sort_order, p.created_at)
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id
       where p.org_id = actor_org and (with_archived or not f.is_archived)), '[]'::jsonb),
    -- The blocks of each screen and of the entity form (RAPP-690), in the
    -- order they share with the placements.
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'surface', b.surface, 'screen_key', b.screen_key, 'kind', b.kind,
        'body', b.body, 'sort_order', b.sort_order)
        order by b.surface, b.screen_key, b.sort_order, b.created_at)
        from public.form_blocks b where b.org_id = actor_org), '[]'::jsonb),
    -- Dades legals (RAPP-699): the consents and where each is asked.
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'key', c.key, 'system_key', c.system_key, 'name', c.name, 'body', c.body,
        'is_archived', c.is_archived)
        order by c.created_at, c.key)
        from public.consents c
       where c.org_id = actor_org and (with_archived or not c.is_archived)), '[]'::jsonb),
    'consent_placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'consent_id', p.consent_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'sort_order', p.sort_order, 'required', p.required)
        order by p.surface, p.screen_key, p.sort_order, p.created_at)
        from public.consent_placements p
        join public.consents c on c.id = p.consent_id and not c.is_archived
       where p.org_id = actor_org), '[]'::jsonb)
  );
end;
$$
;

create or replace function public.personal_data_disposition()
 RETURNS TABLE(table_name text, participant_column text, disposition text, reason text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $$
  select * from (values
    ('app_terms_signatures', 'profile_id', 'purge', 'The app terms signature and photo/video choice.'),
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
    ('seasons', null, 'not_personal', 'The organization''s seasons.'),
    ('authorization_versions', null, 'not_personal', 'The organization''s published authorization texts.'),
    ('app_terms_versions', null, 'not_personal', 'The organization''s app terms texts, draft and published.'),
    ('authorization_signatures', 'profile_id', 'purge', 'Her signed or paper authorizations, with her drawn signature.'),
    ('consent_events', 'profile_id', 'purge', 'Each consent she gave or withdrew, with the text she was shown. Anonymizing keeps them as proof without her name and clears a staff reason; deleting her account deletes them.'),
    ('consents', null, 'not_personal', 'The consents of the organization, defined once (Dades legals).'),
    ('consent_placements', null, 'not_personal', 'Where each consent is asked.'),
    ('walk_in_signings', null, 'retain_limited', 'A walk-in''s tablet signing until staff confirm it; purged after 60 days.'),
    ('intake_screens', null, 'not_personal', 'Registration screens staff built.'),
    ('profile_sections', null, 'not_personal', 'Sections of the player profile layout.'),
    ('profile_fields', null, 'not_personal', 'The pieces of information the profile holds, and who created each.'),
    ('field_placements', null, 'not_personal', 'Where each piece of information is asked.'),
    ('form_blocks', null, 'not_personal', 'The signature blocks of the forms and the text each asks to accept.'),
    ('form_signatures', 'profile_id', 'purge', 'Her signatures of the form blocks, and the entity''s for her on a referral, with the strokes.'),
    ('walk_in_form_signatures', null, 'retain_limited', 'A walk-in''s signatures of the Onboarding blocks until staff confirm her; moved to her profile then, or purged with the walk-in.'),
    ('custom_question_options', null, 'not_personal', 'Options of those questions.'),
    ('intake_builtin_screens', null, 'not_personal', 'Staff wording of the built-in onboarding screens and which are hidden.'),
    ('intake_flow_orders', null, 'not_personal', 'The order of the onboarding screens staff arranged.'),
    ('intake_state_presets', null, 'not_personal', 'Organization presets for which questions are asked.'),
    ('custom_answers', 'profile_id', 'purge', 'Every answer of her record, the app''s fields and the team''s. Anonymizing deletes them all and keeps only her birth year.'),
    ('referral_custom_answers', null, 'retain_limited', 'Extra answers sent with a referral; moved to her profile when she is invited, or purged with the referral.'),
    ('custom_question_states', 'profile_id', 'purge', 'Which fields staff chose to ask or not ask her, the app''s and the team''s.'),
    ('participant_search_documents', 'profile_id', 'purge', 'Her names and her Normal and Personal text answers, indexed for the participants search.'),
    ('staff_notifications', null, 'not_personal', 'The team''s bell: one row per team member; names render live from the source row and params hold no personal value.'),
    ('onboarding_screen_versions', null, 'not_personal', 'Which Onboarding screens were saved as a new version, and when.')
  ) as disposition(table_name, participant_column, disposition, reason);
$$
;

