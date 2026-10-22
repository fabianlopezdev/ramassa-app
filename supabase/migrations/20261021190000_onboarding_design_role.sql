-- The onboarding design role and test players (RAPP-615).
--
-- WHY
--
-- Ramassà designs the onboarding a player sees before launch, on staging. The
-- person who does it (Marc) must reach only the onboarding part of the admin
-- and must never see a real participant. He creates TEST players, signs in as
-- them on a phone, goes through the onboarding, deletes them and starts again
-- (RAPP-616, RAPP-617).
--
-- WHAT THIS MIGRATION DOES
--
--   1. `profiles.is_test_account`: a privileged column. Only staff set it, and
--      only through their own actions: a test player gets it when she is
--      created, a team account when an admin marks it. A real player can never
--      be turned into a test player.
--   2. Two permissions in the catalog (RAPP-229): `onboarding.design` (the
--      question builder and built-in overrides, intake presets, the document
--      step note, seasons and season authorization versions) and
--      `test_players.manage` (create, view, edit and delete test players
--      only). A built-in preset "Onboarding design" holds exactly those two.
--   3. Every onboarding function that needed `settings.organization` also
--      accepts `onboarding.design`, through one helper,
--      `private.can_design_onboarding()`. Nothing else in Settings does.
--   4. A caller with `test_players.manage` reads and edits test players
--      through the usual participant functions, through one helper,
--      `private.participant_permission()`. A team member whose only access is
--      the design pair no longer reads real participants' profile rows.
--   5. Every change keeps its audit row.

-- 1. The test account flag ---------------------------------------------------------------------------

alter table public.profiles
  add column is_test_account boolean not null default false;

comment on column public.profiles.is_test_account is
  'A test account (RAPP-615): a test player created as one, or a team account an admin marked. Test accounts sign in with the staging-only fixed code (RAPP-616) and test players can be deleted outright (RAPP-617).';

-- The column joins the privileged ones (RAPP-239): a direct client write
-- cannot change it.
create or replace function private.guard_profile_privileged_columns()
 returns trigger
 language plpgsql
 set search_path to ''
as $$
begin
  -- A SECURITY DEFINER function runs as its owner. The five SECURITY INVOKER
  -- functions that write profiles mark their one write as trusted (below).
  if current_user not in ('authenticated', 'anon')
    or current_setting('ramassa.trusted_profile_write', true) = 'on'
  then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Profiles are created by onboarding or an invitation, never by a direct insert.
    raise exception 'PROFILES/DIRECT_INSERT' using errcode = '42501';
  end if;

  if new.id is distinct from old.id
    or new.org_id is distinct from old.org_id
    or new.role is distinct from old.role
    or new.is_active is distinct from old.is_active
    or new.is_forum_banned is distinct from old.is_forum_banned
    or new.anonymized_at is distinct from old.anonymized_at
    or new.terms_accepted_at is distinct from old.terms_accepted_at
    or new.media_consent_at is distinct from old.media_consent_at
    or new.collaborating_entity_id is distinct from old.collaborating_entity_id
    or new.created_at is distinct from old.created_at
    or new.sessions_valid_after is distinct from old.sessions_valid_after
    or new.is_test_account is distinct from old.is_test_account
  then
    -- These columns change only through their own action (an RPC).
    raise exception 'PROFILES/PRIVILEGED_COLUMN' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- 2. The permissions and the preset --------------------------------------------------------------------

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
  ('test_players.manage', 'participants', 10),
  ('equipment.handover', 'material', 11),
  ('equipment.receive', 'material', 12),
  ('equipment.count', 'material', 13),
  ('equipment.items', 'material', 14),
  ('attendance.mark', 'attendance', 15),
  ('attendance.reports', 'attendance', 16),
  ('announcements.edit', 'content', 17),
  ('announcements.publish', 'content', 18),
  ('events.edit', 'content', 19),
  ('events.publish', 'content', 20),
  ('knowledge.edit', 'content', 21),
  ('knowledge.publish', 'content', 22),
  ('services.edit', 'content', 23),
  ('services.publish', 'content', 24),
  ('services.review', 'content', 25),
  ('forum.moderate', 'community', 26),
  ('gallery.moderate', 'community', 27),
  ('messages.inbox', 'community', 28),
  ('mentoring.manage', 'community', 29),
  ('feedback.view', 'community', 30),
  ('surveys.manage', 'community', 31),
  ('surveys.results', 'community', 32),
  ('notifications.send', 'community', 33),
  ('referrals.manage', 'entities', 34),
  ('entities.manage', 'entities', 35),
  ('impact.view', 'impact', 36),
  ('export.participants', 'impact', 37),
  ('export.participants_sensitive', 'impact', 38),
  ('export.attendance', 'impact', 39),
  ('export.events', 'impact', 40),
  ('audit.view', 'impact', 41),
  ('settings.organization', 'settings', 42),
  ('onboarding.design', 'settings', 43),
  ('settings.branding', 'settings', 44),
  ('settings.documents', 'settings', 45),
  ('team.manage', 'settings', 46)
on conflict (code) do update set area = excluded.area, sort_order = excluded.sort_order;
-- permission-catalog:end

-- The fourth built-in preset.
alter table public.permission_preset_defaults
  drop constraint permission_preset_defaults_builtin_key_check;
alter table public.permission_preset_defaults
  add constraint permission_preset_defaults_builtin_key_check
  check (builtin_key in ('coach', 'staff', 'admin', 'onboarding_design'));
alter table public.permission_presets
  drop constraint permission_presets_builtin_key_check;
alter table public.permission_presets
  add constraint permission_presets_builtin_key_check
  check (builtin_key in ('coach', 'staff', 'admin', 'onboarding_design'));

-- permission-preset-defaults:start
insert into public.permission_preset_defaults (builtin_key, permission_code) values
  ('onboarding_design', 'test_players.manage'),
  ('onboarding_design', 'onboarding.design')
on conflict do nothing;
-- permission-preset-defaults:end
-- Admin holds every permission.
insert into public.permission_preset_defaults (builtin_key, permission_code) values
  ('admin', 'test_players.manage'),
  ('admin', 'onboarding.design')
on conflict do nothing;

create or replace function private.create_builtin_permission_presets(p_org_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $$
begin
  insert into public.permission_presets (org_id, builtin_key)
  select p_org_id, key from unnest(array['coach', 'staff', 'admin', 'onboarding_design']) as key
  on conflict (org_id, builtin_key) do nothing;

  insert into public.permission_preset_permissions (org_id, preset_id, permission_code)
  select p_org_id, preset.id, product_default.permission_code
  from public.permission_presets as preset
  join public.permission_preset_defaults as product_default
    on product_default.builtin_key = preset.builtin_key
  where preset.org_id = p_org_id
  on conflict do nothing;
end;
$$;

-- Existing organizations: the new preset, Admin's two new permissions, and
-- the admins themselves.
do $$
declare
  organization record;
begin
  for organization in select id from public.organizations loop
    perform private.create_builtin_permission_presets(organization.id);
  end loop;
end;
$$;
insert into public.team_member_permissions (org_id, profile_id, permission_code)
select access.org_id, access.profile_id, code
  from public.team_member_access access
  join public.permission_presets preset on preset.id = access.preset_id
  cross join unnest(array['test_players.manage', 'onboarding.design']) as code
 where preset.builtin_key = 'admin'
union
select profile.org_id, profile.id, code
  from public.profiles profile
  cross join unnest(array['test_players.manage', 'onboarding.design']) as code
 where profile.role = 'admin'
on conflict do nothing;

-- 3. Onboarding design --------------------------------------------------------------------------------

-- Who may change what a player sees in the onboarding: Settings' own
-- permission, or the design role. Every onboarding function asks this.
create or replace function private.can_design_onboarding()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.has_permission('settings.organization'))
      or (select public.has_permission('onboarding.design'));
$$;

comment on function private.can_design_onboarding is
  'True for settings.organization or onboarding.design (RAPP-615). Every function that edits the onboarding asks this, never settings.organization alone.';

create or replace function private.require_question_builder()
 returns uuid
 language plpgsql
 stable security definer
 set search_path to ''
as $$
begin
  if not (select private.can_design_onboarding()) then
    raise insufficient_privilege using message = 'the question builder needs settings.organization or onboarding.design';
  end if;
  return (select public.current_org_id());
end;
$$;

-- The onboarding functions, unchanged except for who may call them.

CREATE OR REPLACE FUNCTION public.set_document_step_explanation(p_explanation jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := (select public.current_org_id());
  cleaned jsonb;
begin
  if not (select private.can_design_onboarding()) then
    raise insufficient_privilege
      using message = 'the document step explanation needs settings.organization or onboarding.design';
  end if;

  if p_explanation is not null and jsonb_typeof(p_explanation) <> 'object' then
    raise check_violation using message = 'the explanation is an object of languages';
  end if;
  if p_explanation is not null
    and p_explanation - array['ca', 'es', 'en', 'ar', 'fa'] <> '{}'::jsonb
  then
    raise check_violation using message = 'the explanation has an unsupported language';
  end if;

  -- Empty languages are dropped, so they fall back to Catalan when shown.
  select jsonb_object_agg(entry.key, btrim(entry.value))
    into cleaned
    from jsonb_each_text(coalesce(p_explanation, '{}'::jsonb)) as entry
   where btrim(entry.value) <> '';

  if cleaned is not null and cleaned ->> 'ca' is null then
    raise check_violation using message = 'the explanation needs a Catalan text';
  end if;
  if exists (
    select 1 from jsonb_each_text(coalesce(cleaned, '{}'::jsonb)) as entry
     where length(entry.value) > 1000
  ) then
    raise check_violation using message = 'each explanation is at most 1000 characters';
  end if;

  update public.organizations
     set document_step_explanation = cleaned
   where id = actor_org;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org,
    (select auth.uid()),
    'organization.document_explanation_update',
    'organization',
    actor_org,
    jsonb_build_object(
      'languages', coalesce((select jsonb_agg(key order by key) from jsonb_object_keys(cleaned) key), '[]'::jsonb)
    )
  );

  return cleaned;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_season(p_name text, p_starts_on date, p_make_current boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  saved uuid;
begin
  if not (select private.can_design_onboarding()) then
    raise insufficient_privilege using message = 'creating a season needs settings.organization or onboarding.design';
  end if;
  if nullif(btrim(p_name), '') is null or length(btrim(p_name)) > 50 or p_starts_on is null then
    raise check_violation using message = 'a season needs a name and a start date';
  end if;

  if coalesce(p_make_current, false) then
    update public.seasons set is_current = false where org_id = actor_org and is_current;
  end if;
  insert into public.seasons (org_id, name, starts_on, is_current)
  values (actor_org, btrim(p_name), p_starts_on, coalesce(p_make_current, false))
  returning id into saved;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'season.create', 'season', saved,
          jsonb_build_object('name', btrim(p_name), 'starts_on', p_starts_on, 'current', coalesce(p_make_current, false)));
  return saved;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_current_season(p_season_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := (select public.current_org_id());
begin
  if not (select private.can_design_onboarding()) then
    raise insufficient_privilege using message = 'the current season needs settings.organization or onboarding.design';
  end if;
  if not exists (select 1 from public.seasons where id = p_season_id and org_id = actor_org) then
    raise insufficient_privilege using message = 'no season of this organization';
  end if;
  update public.seasons set is_current = false where org_id = actor_org and is_current and id <> p_season_id;
  update public.seasons set is_current = true where id = p_season_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'season.current', 'season', p_season_id, '{}'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.publish_authorization_version(p_content jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  season uuid;
  next_number integer;
  saved uuid;
begin
  if not (select private.can_design_onboarding()) then
    raise insufficient_privilege using message = 'publishing the authorization needs settings.organization or onboarding.design';
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
$function$;

CREATE OR REPLACE FUNCTION public.list_authorization_versions()
 RETURNS TABLE(id uuid, season_id uuid, season_name text, version_number integer, content jsonb, published_at timestamp with time zone, is_current boolean)
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
           v.id = (private.current_authorization_version(v.org_id)).id
      from public.authorization_versions v
      join public.seasons s on s.id = v.season_id
     where v.org_id = (select public.current_org_id())
     order by s.starts_on desc, v.version_number desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.intake_catalog()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'intro', s.intro, 'after_screen', s.after_screen,
        'sort_order', s.sort_order, 'is_archived', s.is_archived,
        'questions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', q.id, 'question_type', q.question_type, 'label', q.label, 'help', q.help,
            'privacy', q.privacy, 'placements', to_jsonb(q.placements), 'sort_order', q.sort_order,
            'is_archived', q.is_archived,
            'show_when_question_id', q.show_when_question_id, 'show_when_option_id', q.show_when_option_id,
            'options', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', o.id, 'label', o.label, 'sort_order', o.sort_order, 'is_archived', o.is_archived)
                order by o.sort_order, o.id)
                from public.custom_question_options o where o.question_id = q.id), '[]'::jsonb))
            order by q.sort_order, q.created_at)
            from public.custom_questions q
           where q.screen_id = s.id and (with_archived or not q.is_archived)), '[]'::jsonb))
        order by array_position(private.intake_builtin_screens(), s.after_screen), s.sort_order, s.created_at)
        from public.intake_screens s
       where s.org_id = actor_org and (with_archived or not s.is_archived)), '[]'::jsonb),
    'overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question', o.question, 'label', o.label, 'help', o.help, 'is_hidden', o.is_hidden,
        'option_overrides', o.option_overrides) order by o.question)
        from public.builtin_question_overrides o where o.org_id = actor_org), '[]'::jsonb),
    'presets', case when ((select public.has_permission('participants.view_personal')) or (select public.has_permission('onboarding.design'))) then coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'states', p.states)
        order by p.name, p.id)
        from public.intake_state_presets p where p.org_id = actor_org), '[]'::jsonb)
      else '[]'::jsonb end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_intake_state_preset(p_id uuid, p_name text, p_states jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := (select public.current_org_id());
  saved_id uuid;
begin
  if not ((select public.has_permission('participants.view_personal')) or (select public.has_permission('onboarding.design'))) then
    raise insufficient_privilege using message = 'presets need participants.view_personal or onboarding.design';
  end if;
  if jsonb_typeof(p_states) <> 'object' or exists (
    select 1 from jsonb_each_text(p_states) entry
     where not (entry.key = any (private.wizard_intake_questions()))
        or entry.value not in ('ask', 'skip')
  ) then
    raise check_violation using message = 'a preset sets ask or skip on wizard questions';
  end if;
  if p_id is null then
    insert into public.intake_state_presets (org_id, name, states, created_by)
    values (actor_org, btrim(p_name), p_states, (select auth.uid()))
    returning id into saved_id;
  else
    update public.intake_state_presets set name = btrim(p_name), states = p_states
     where id = p_id and org_id = actor_org
    returning id into saved_id;
    if saved_id is null then
      raise no_data_found using message = 'no such preset';
    end if;
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.preset_save', 'intake_state_preset', saved_id,
          jsonb_build_object('name', btrim(p_name), 'states', p_states));
  return saved_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_intake_state_preset(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := (select public.current_org_id());
begin
  if not ((select public.has_permission('participants.view_personal')) or (select public.has_permission('onboarding.design'))) then
    raise insufficient_privilege using message = 'presets need participants.view_personal or onboarding.design';
  end if;
  delete from public.intake_state_presets where id = p_id and org_id = actor_org;
  if not found then
    raise no_data_found using message = 'no such preset';
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.preset_delete', 'intake_state_preset', p_id, '{}'::jsonb);
end;
$function$;

-- Presets the design role writes are read back by it.
alter policy intake_state_presets_select_team on public.intake_state_presets
  using (
    org_id = (select public.current_org_id())
    and ((select public.has_permission('participants.view_personal'))
         or (select public.has_permission('onboarding.design')))
  );

-- 4. Test players ----------------------------------------------------------------------------------------

-- A test player of the caller's organization: a player, or a woman invited
-- and not joined yet, created as a test account.
create or replace function private.is_test_player(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles as profile
     where profile.id = p_profile_id
       and profile.is_test_account
       and profile.role in ('player', 'invited')
       and profile.org_id = (select public.current_org_id())
  );
$$;

-- A participant permission for one participant. It is the permission itself,
-- or, on a test player only, test_players.manage: test players are made up,
-- so the person designing the onboarding sees everything a test player
-- answered, and never anything of a real one.
create or replace function private.participant_permission(p_profile_id uuid, p_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.has_permission(p_code))
      or (
        p_code in ('participants.view', 'participants.view_personal',
                   'participants.view_sensitive', 'participants.view_health')
        and (select public.has_permission('test_players.manage'))
        and private.is_test_player(p_profile_id)
      );
$$;

comment on function private.participant_permission is
  'A participant permission for one participant: the permission, or test_players.manage on a test player (RAPP-615).';

-- True for a team member whose only access is the design pair: she reads no
-- real participant, not even through the profile rows every team member
-- otherwise reads.
create or replace function private.limited_to_test_players()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1 from public.my_permissions() as held(code)
            where held.code in ('test_players.manage', 'onboarding.design'))
     and not exists (
           select 1 from public.my_permissions() as held(code)
            where held.code not in ('test_players.manage', 'onboarding.design'));
$$;

alter policy profiles_select_self_or_org_staff on public.profiles
  using (
    id = (select auth.uid())
    or (
      (select public.is_team_member())
      and org_id = (select public.current_org_id())
      and (
        role not in ('player', 'invited')
        or is_test_account
        or not (select private.limited_to_test_players())
      )
    )
  );

-- Her prefilled answers, for the test players the design role edits.
create policy profile_answers_select_test_players on public.profile_answers
  for select to authenticated
  using (
    (select public.has_permission('test_players.manage'))
    and org_id = (select public.current_org_id())
    and private.is_test_player(profile_id)
  );

-- The roster: test players for test_players.manage, everyone for
-- participants.view, and a flag so every list can say which is which. The
-- return type gains a column, so the function is recreated.
drop function public.list_participants(text, text, text, text, text, text, text, integer, integer);

create function public.list_participants(
  p_query text default ''::text,
  p_entity text default null::text,
  p_nationality text default null::text,
  p_status text default 'all'::text,
  p_dependents text default 'all'::text,
  p_sort text default 'last_name'::text,
  p_dir text default 'asc'::text,
  p_page integer default 1,
  p_page_size integer default 25
)
returns table(
  id uuid, first_name text, last_name text, nationality text, city text, reference_entity text,
  has_dependents boolean, num_dependents integer, is_active boolean, preferred_language text,
  created_at timestamp with time zone, joined boolean, is_test_account boolean, total_count bigint
)
language sql
stable
security definer
set search_path to ''
as $$
  with access as (
    select
      (select public.has_permission('participants.view')) as can_view,
      (select public.has_permission('participants.view_personal')) as personal_permission,
      (select public.has_permission('test_players.manage')) as manages_test_players
  ),
  roster as (
    select
      profile.*,
      case
        when p_sort = 'first_name' then profile.first_name
        when p_sort = 'city' and (access.personal_permission or not access.can_view) then profile.city
        when p_sort = 'nationality' and (access.personal_permission or not access.can_view) then profile.nationality
        when p_sort = 'reference_entity' then profile.reference_entity
        when p_sort = 'created_at' then to_char(profile.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
        else profile.last_name
      end as sort_key,
      -- A test player's personal fields are made up: test_players.manage reads them.
      (access.personal_permission or (profile.is_test_account and access.manages_test_players)) as personal
    from public.profiles as profile
    cross join access
    where (access.can_view or (access.manages_test_players and profile.is_test_account))
      and profile.org_id = (select public.current_org_id())
      -- Invited women are listed too, marked as not joined, so staff can
      -- complete their record before the first login (RAPP-300).
      and profile.role in ('player', 'invited')
      and (
        coalesce(p_query, '') = ''
        or (access.personal_permission and profile.search_document @@ to_tsquery('simple', p_query))
        or (not access.personal_permission and to_tsvector('simple',
              public.immutable_unaccent(concat_ws(' ', profile.first_name, profile.last_name, profile.reference_entity))
              || ' ' || concat_ws(' ', profile.first_name, profile.last_name, profile.reference_entity))
            @@ to_tsquery('simple', p_query))
      )
      and (p_entity is null or profile.reference_entity = p_entity)
      and (p_nationality is null or not access.personal_permission or profile.nationality = p_nationality)
      and (
        p_status = 'all'
        or (p_status = 'invited' and profile.role = 'invited')
        or (p_status in ('active', 'inactive') and profile.role = 'player'
            and profile.is_active = (p_status = 'active'))
      )
      and (p_dependents = 'all' or not access.personal_permission or profile.has_dependents = (p_dependents = 'with'))
  )
  select
    roster.id,
    roster.first_name,
    roster.last_name,
    case when roster.personal then roster.nationality end,
    case when roster.personal then roster.city end,
    roster.reference_entity,
    case when roster.personal then roster.has_dependents end,
    case when roster.personal then roster.num_dependents end,
    roster.is_active,
    roster.preferred_language,
    roster.created_at,
    roster.role = 'player',
    roster.is_test_account,
    count(*) over ()
  from roster
  order by
    case when p_dir = 'desc' then null else roster.sort_key end asc nulls last,
    case when p_dir = 'desc' then roster.sort_key end desc nulls first,
    roster.id
  limit least(greatest(coalesce(p_page_size, 25), 1), 100)
  offset (greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_page_size, 25), 1), 100);
$$;

revoke all on function public.list_participants(text, text, text, text, text, text, text, integer, integer) from public, anon;
grant execute on function public.list_participants(text, text, text, text, text, text, text, integer, integer) to authenticated;

-- A team account an admin marks as a test account (Marc's own), so it signs in
-- with the staging code (RAPP-616). Team accounts only: a player is a test
-- player from her creation or never, so no real player can be turned into one.
create or replace function public.set_team_member_test_account(p_profile_id uuid, p_is_test_account boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
  previous boolean;
begin
  if not (select public.has_permission('team.manage')) then
    raise exception 'PERMISSIONS/TEAM_MANAGE_REQUIRED' using errcode = '42501';
  end if;
  if p_is_test_account is null then
    raise exception 'the test account flag is true or false' using errcode = '22023';
  end if;
  select profile.is_test_account into previous
    from public.profiles as profile
   where profile.id = p_profile_id
     and profile.org_id = actor_org
     and profile.role in ('staff', 'admin');
  if previous is null then
    raise exception 'PERMISSIONS/NOT_A_TEAM_MEMBER' using errcode = 'P0002';
  end if;

  update public.profiles
     set is_test_account = p_is_test_account, updated_at = now()
   where id = p_profile_id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org, (select auth.uid()), 'team.test_account_update', 'profile', p_profile_id,
    jsonb_build_object('is_test_account', jsonb_build_object('old', previous, 'new', p_is_test_account))
  );
end;
$$;

comment on function public.set_team_member_test_account is
  'Marks a team account as a test account (RAPP-615). Needs team.manage; team accounts only; audited.';

revoke all on function public.set_team_member_test_account(uuid, boolean) from public, anon;
grant execute on function public.set_team_member_test_account(uuid, boolean) to authenticated;

revoke all on function private.can_design_onboarding() from public, anon, authenticated;
revoke all on function private.participant_permission(uuid, text) from public, anon, authenticated;
-- Two row policies call these as the signed-in person. The private schema is
-- not exposed by the API, so neither becomes a callable endpoint.
revoke all on function private.is_test_player(uuid) from public, anon;
revoke all on function private.limited_to_test_players() from public, anon;
grant execute on function private.is_test_player(uuid) to authenticated;
grant execute on function private.limited_to_test_players() to authenticated;

-- The participant functions read and write a test player for test_players.manage,
-- unchanged otherwise: each participant permission check names its participant.

-- The record also says whether she is a test player; the return type gains a column.
drop function public.get_participant_profile(uuid);

CREATE FUNCTION public.get_participant_profile(participant_id uuid)
 RETURNS TABLE(id uuid, first_name text, last_name text, date_of_birth date, place_of_birth text, nationality text, preferred_language text, document_type text, document_number text, document_name text, phone text, address text, city text, postal_code text, reference_entity text, reference_contact_name text, has_dependents boolean, num_dependents integer, clothing_size text, shoe_size text, avatar_url text, media_consent boolean, terms_accepted_at timestamp with time zone, is_active boolean, is_forum_banned boolean, anonymized_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, applicant_status text, applicant_status_details text, supporting_entities text[], season_number smallint, childcare_need text, specific_needs text, health_info text, emergency_contact_name text, emergency_contact_relation text, emergency_contact_phone text, is_test_account boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with subject as (
    select p.*
    from public.profiles p
    where p.id = participant_id
      and p.org_id = (select public.current_org_id())
      and (select private.participant_permission(participant_id, 'participants.view'))
  ),
  access_recorded as (
    insert into public.audit_log (org_id, actor_id, action, target_type, target_id)
    select
      (select public.current_org_id()),
      (select auth.uid()),
      case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then 'profile.view_sensitive' else 'profile.view' end,
      'profile',
      s.id
    from subject s
    returning 1
  )
  select
    s.id,
    s.first_name,
    s.last_name,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.date_of_birth end,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.place_of_birth end,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.nationality end,
    s.preferred_language,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.document_type end,
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.document_number) end,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.document_name end,
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.phone) end,
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.address) end,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.city end,
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.postal_code) end,
    s.reference_entity,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.reference_contact_name end,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.has_dependents end,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.num_dependents end,
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
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.applicant_status) end,
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.applicant_status_details) end,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.supporting_entities end,
    -- Counted (RAPP-306): earlier seasons plus the seasons she signed.
    private.season_number(s.id),
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.childcare_need end,
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.specific_needs) end,
    -- The medical answer needs its own permission (RAPP-304); the emergency
    -- contact follows the personal and sensitive levels.
    case when (select private.participant_permission(participant_id, 'participants.view_health')) then public.decrypt_field(s.health_info) end,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.emergency_contact_name end,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.emergency_contact_relation end,
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.emergency_contact_phone) end,
    s.is_test_account
  from subject s;
$function$;

revoke all on function public.get_participant_profile(uuid) from public, anon;
grant execute on function public.get_participant_profile(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.update_participant_profile(participant_id uuid, payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  document_type_value text := nullif(payload ->> 'document_type', '');
  document_number_value text := nullif(payload ->> 'document_number', '');
  place_of_birth_value text := nullif(btrim(payload ->> 'place_of_birth'), '');
  -- The columns whose VALUES must never reach the audit log (ADR-004).
  encrypted_fields text[] := array[
    'document_number', 'phone', 'address', 'postal_code', 'applicant_status', 'applicant_status_details', 'specific_needs'];
  before_document jsonb;
  changes_document jsonb;
begin
  if not (select private.participant_permission(participant_id, 'participants.view_personal')) then
    raise exception 'update_participant_profile is the staff path; a participant edits herself through update_own_profile()'
      using errcode = 'insufficient_privilege';
  end if;

  -- A woman who has not joined yet is completed in parts: only the fields
  -- sent change, each one becomes an answer, and her consent stays hers
  -- (RAPP-300). Sensitive fields need their own permission, as below.
  if exists (
    select 1 from public.profiles p
     where p.id = participant_id
       and p.org_id = (select public.current_org_id())
       and p.role = 'invited'
  ) then
    if not (select private.participant_permission(participant_id, 'participants.view_sensitive')) then
      payload := payload - 'document_number' - 'phone' - 'address' - 'postal_code'
        - 'applicant_status' - 'applicant_status_details' - 'specific_needs';
    end if;
    perform private.apply_profile_prefill(participant_id, payload, 'staff');
    insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
    values (
      (select public.current_org_id()), actor, 'profile.update', 'profile', participant_id,
      jsonb_build_object('fields', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb)
                                      from jsonb_object_keys(payload) k))
    );
    return;
  end if;

  if place_of_birth_value is null then
    raise exception 'update_participant_profile requires place_of_birth'
      using errcode = 'not_null_violation';
  end if;

  -- A caller without participants.view_sensitive never sends the document
  -- number; for her the check runs below, on the stored value.
  -- The document is optional (RAPP-302): only a chosen type needs a number.
  if document_type_value in ('nie', 'passport')
    and document_number_value is null
    and (select private.participant_permission(participant_id, 'participants.view_sensitive'))
  then
    raise exception 'update_participant_profile requires document_number for a chosen document_type'
      using errcode = 'not_null_violation';
  end if;

  -- The record as it stands, in the payload's own shape, so the diff below is a
  -- key-by-key comparison rather than nineteen hand-written IF statements that
  -- a twentieth column would silently escape. The encrypted values are decrypted
  -- HERE and never leave this block: they are what makes "did the phone actually
  -- change" answerable at all.
  select jsonb_build_object(
    'first_name', p.first_name,
    'last_name', p.last_name,
    'date_of_birth', p.date_of_birth,
    'place_of_birth', p.place_of_birth,
    'nationality', p.nationality,
    'preferred_language', p.preferred_language,
    'document_type', p.document_type,
    'document_name', p.document_name,
    'document_number', public.decrypt_field(p.document_number),
    'phone', public.decrypt_field(p.phone),
    'address', public.decrypt_field(p.address),
    'city', p.city,
    'postal_code', public.decrypt_field(p.postal_code),
    'reference_entity', p.reference_entity,
    'reference_contact_name', p.reference_contact_name,
    'has_dependents', p.has_dependents,
    'num_dependents', p.num_dependents,
    'clothing_size', p.clothing_size,
    'shoe_size', p.shoe_size,
    'media_consent', p.media_consent_at is not null,
    'applicant_status', public.decrypt_field(p.applicant_status),
    'applicant_status_details', public.decrypt_field(p.applicant_status_details),
    'supporting_entities', p.supporting_entities,
    'season_number', p.season_number,
    'childcare_need', p.childcare_need,
    'specific_needs', public.decrypt_field(p.specific_needs)
  )
  into before_document
  from public.profiles p
  where p.id = participant_id
    and p.org_id = (select public.current_org_id());

  -- No readable row means no row this caller may edit: RLS has already decided,
  -- and there is nothing to audit.
  if before_document is null then
    return;
  end if;

  -- The four encrypted fields change only for a caller who may see them. For
  -- anyone else the stored values are kept, whatever the payload says, so a
  -- screen without them can never wipe them (RAPP-230).
  if not private.season_answers_valid(payload) then
    raise invalid_parameter_value using message = 'a season answer is outside its choices';
  end if;

  if not (select private.participant_permission(participant_id, 'participants.view_sensitive')) then
    payload := payload - 'applicant_status' - 'applicant_status_details' - 'specific_needs';
    payload := payload || jsonb_build_object(
      'document_number', before_document ->> 'document_number',
      'phone', before_document ->> 'phone',
      'address', before_document ->> 'address',
      'postal_code', before_document ->> 'postal_code'
    );
    document_number_value := nullif(payload ->> 'document_number', '');
    if document_type_value in ('nie', 'passport')
      and document_number_value is null
    then
      raise exception 'update_participant_profile requires document_number for a chosen document_type'
        using errcode = 'not_null_violation';
    end if;
  end if;

  -- No type, or "none", means no number: a stored number goes with the type.
  if document_type_value is null or document_type_value = 'none' then
    document_number_value := null;
    payload := payload || jsonb_build_object('document_number', null);
  end if;

  perform set_config('ramassa.trusted_profile_write', 'on', true);
  update public.profiles set
    first_name = payload ->> 'first_name',
    last_name = payload ->> 'last_name',
    date_of_birth = (payload ->> 'date_of_birth')::date,
    place_of_birth = place_of_birth_value,
    nationality = payload ->> 'nationality',
    preferred_language = coalesce(nullif(payload ->> 'preferred_language', ''), preferred_language),
    document_type = document_type_value,
    document_name = case when payload ? 'document_name' then nullif(btrim(payload ->> 'document_name'), '') else document_name end,
    document_number = public.encrypt_field(document_number_value),
    phone = public.encrypt_field(nullif(payload ->> 'phone', '')),
    address = public.encrypt_field(nullif(payload ->> 'address', '')),
    city = nullif(payload ->> 'city', ''),
    postal_code = public.encrypt_field(nullif(payload ->> 'postal_code', '')),
    reference_entity = nullif(payload ->> 'reference_entity', ''),
    reference_contact_name = nullif(payload ->> 'reference_contact_name', ''),
    has_dependents = coalesce((payload ->> 'has_dependents')::boolean, false),
    num_dependents = coalesce((payload ->> 'num_dependents')::integer, 0),
    clothing_size = nullif(payload ->> 'clothing_size', ''),
    shoe_size = nullif(payload ->> 'shoe_size', ''),
    media_consent_at = case
      when (payload ->> 'media_consent')::boolean then coalesce(media_consent_at, now())
      else null
    end,
    applicant_status = case when payload ? 'applicant_status'
      then public.encrypt_field(nullif(btrim(payload ->> 'applicant_status'), '')) else applicant_status end,
    applicant_status_details = case when payload ? 'applicant_status_details'
      then public.encrypt_field(nullif(btrim(payload ->> 'applicant_status_details'), '')) else applicant_status_details end,
    supporting_entities = case when payload ? 'supporting_entities'
      then private.text_array_answer(payload -> 'supporting_entities') else supporting_entities end,
    season_number = case when payload ? 'season_number'
      then nullif(payload ->> 'season_number', '')::smallint else season_number end,
    childcare_need = case when payload ? 'childcare_need'
      then nullif(payload ->> 'childcare_need', '') else childcare_need end,
    specific_needs = case when payload ? 'specific_needs'
      then public.encrypt_field(nullif(btrim(payload ->> 'specific_needs'), '')) else specific_needs end,
    updated_at = now()
  where id = participant_id
    and org_id = (select public.current_org_id());
  perform set_config('ramassa.trusted_profile_write', '', true);

  if not found then
    return;
  end if;

  select coalesce(jsonb_object_agg(submitted.key, entry), '{}'::jsonb)
  into changes_document
  from jsonb_each_text(payload) submitted
  cross join lateral (
    select case
      when submitted.key = any(encrypted_fields) then jsonb_build_object('changed', true)
      else jsonb_build_object(
        'old', to_jsonb(before_document ->> submitted.key),
        'new', to_jsonb(submitted.value)
      )
    end as entry
  ) built
  where before_document ? submitted.key
    and (before_document ->> submitted.key) is distinct from submitted.value;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    (select public.current_org_id()),
    actor,
    'profile.update',
    'profile',
    participant_id,
    changes_document
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.participant_custom_answers(p_profile_id uuid)
 RETURNS TABLE(question_id uuid, season_id uuid, season_name text, value jsonb, source text, answered_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := (select public.current_org_id());
  sees_personal boolean := (select private.participant_permission(p_profile_id, 'participants.view_personal'));
  sees_sensitive boolean := (select private.participant_permission(p_profile_id, 'participants.view_sensitive'));
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view')) then
    raise insufficient_privilege using message = 'her answers need participants.view';
  end if;
  return query
  select a.question_id, a.season_id, s.name,
         coalesce(a.value, (public.decrypt_field(a.value_encrypted))::jsonb),
         a.source, a.answered_at
    from public.custom_answers a
    join public.custom_questions q on q.id = a.question_id
    left join public.seasons s on s.id = a.season_id
   where a.profile_id = p_profile_id
     and a.org_id = actor_org
     and (q.privacy = 'normal'
          or (q.privacy = 'personal' and sees_personal)
          or (q.privacy = 'sensitive' and sees_sensitive))
   order by q.sort_order, s.starts_on desc nulls first;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_participant_custom_answers(p_profile_id uuid, p_answers jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := (select public.current_org_id());
  entry record;
  question public.custom_questions;
  changed text[] := '{}';
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view_personal')) then
    raise insufficient_privilege using message = 'editing her answers needs participants.view_personal';
  end if;
  if not exists (select 1 from public.profiles
                  where id = p_profile_id and org_id = actor_org and role in ('player', 'invited')) then
    raise no_data_found using message = 'no such participant';
  end if;
  if jsonb_typeof(p_answers) <> 'object' then
    raise check_violation using message = 'answers must be an object';
  end if;
  for entry in select key, value from jsonb_each(p_answers) loop
    select * into question from public.custom_questions q
     where q.id::text = entry.key and q.org_id = actor_org and not q.is_archived;
    if question.id is null then
      raise no_data_found using message = 'no such question';
    end if;
    if question.privacy = 'sensitive' and not (select private.participant_permission(p_profile_id, 'participants.view_sensitive')) then
      raise insufficient_privilege using message = 'a Sensitive answer needs participants.view_sensitive';
    end if;
    perform private.write_custom_answer(p_profile_id, question, entry.value, 'staff');
    changed := changed || question.id::text;
  end loop;
  -- The questions only: answers may be Sensitive and never enter the log (ADR-004).
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'profile.custom_answers_update', 'profile', p_profile_id,
          jsonb_build_object('questions', to_jsonb(changed)));
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_participant_invite(payload jsonb)
 RETURNS TABLE(invite_id uuid, email text, expires_at timestamp with time zone, profile_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid;
  email_value text := lower(btrim(payload ->> 'email'));
  reference_entity_value text := nullif(btrim(payload ->> 'reference_entity'), '');
  referral_value uuid := nullif(btrim(payload ->> 'referral_id'), '')::uuid;
  entity_answers jsonb;
  account_id uuid;
  new_invite_id uuid;
  invite_expires_at timestamptz := now() + interval '30 days';
  first_name_value text := nullif(btrim(payload ->> 'first_name'), '');
  last_name_value text := nullif(btrim(payload ->> 'last_name'), '');
  creates_profile boolean;
  -- A test player (RAPP-615): only a team member sets this, here, at creation.
  test_account_value boolean := coalesce((payload ->> 'is_test_account')::boolean, false);
begin
  -- participants.invite creates any player. test_players.manage creates test
  -- players only, so for a caller who holds just that the option is forced on.
  if not (select public.has_permission('participants.invite'))
    and not (test_account_value and (select public.has_permission('test_players.manage')))
  then
    raise exception 'inviting a participant is a staff action'
      using errcode = 'insufficient_privilege';
  end if;

  -- The same shape the CHECK constraint enforces, raised here as a clean error
  -- rather than as a constraint violation, because this one is shown to a staff
  -- member who mistyped an address.
  if email_value is null
    or length(email_value) > 254
    or email_value !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  then
    raise exception 'create_participant_invite requires a valid email address'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Her name creates her profile with the account (RAPP-300). A first name
  -- alone is a typo, so both or neither.
  if (first_name_value is null) <> (last_name_value is null) then
    raise exception 'create_participant_invite needs both her first and last name, or neither'
      using errcode = 'invalid_parameter_value';
  end if;
  creates_profile := first_name_value is not null;

  -- The flag lives on her profile, so a test player always has one. She is
  -- made up, so she carries no real referral.
  if test_account_value and not creates_profile then
    raise exception 'a test player needs her first and last name'
      using errcode = 'invalid_parameter_value';
  end if;
  if test_account_value and referral_value is not null then
    raise exception 'a test player cannot answer a referral'
      using errcode = 'invalid_parameter_value';
  end if;

  perform public.assert_within_hourly_limit('invite.create', 30);

  actor_org := (select public.current_org_id());

  if referral_value is not null and not exists (
    select 1 from public.entity_referrals referral
    where referral.id = referral_value
      and referral.org_id = actor_org
      and referral.status = 'pending'
  ) then
    raise exception 'an invitation can only carry a pending referral of this organization'
      using errcode = 'invalid_parameter_value';
  end if;

  select account.id into account_id
  from auth.users account
  where lower(account.email) = email_value;

  if account_id is not null
    and exists (select 1 from public.profiles profile where profile.id = account_id)
  then
    raise exception 'this address already belongs to an account'
      using errcode = 'unique_violation';
  end if;

  -- A test player is always a new account: an address that already has one
  -- may be a real woman's (an email-only invitation has no profile yet), and
  -- a test player can be deleted outright (RAPP-617).
  if test_account_value and account_id is not null then
    raise exception 'a test player needs an address that has no account yet'
      using errcode = 'unique_violation';
  end if;

  -- Her account, so her first code request succeeds. Confirmed, because staff
  -- typed the address with her; empty, because the wizard writes her profile.
  if account_id is null then
    account_id := extensions.gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', account_id,
      'authenticated', 'authenticated', email_value, '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', '', '', ''
    );

    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      account_id::text,
      account_id,
      jsonb_build_object('sub', account_id::text, 'email', email_value, 'email_verified', true),
      'email', now(), now(), now()
    );
  end if;

  insert into public.invites (org_id, email, reference_entity, referral_id, invited_by, expires_at)
  values (actor_org, email_value, reference_entity_value, referral_value, actor, invite_expires_at)
  returning id into new_invite_id;

  -- Her profile, created with the account and without consent: role
  -- 'invited' keeps her out of every player list, count and audience until
  -- she accepts the terms herself in the wizard (RAPP-300).
  if creates_profile then
    insert into public.profiles (id, org_id, role, first_name, last_name, preferred_language, is_test_account)
    values (
      account_id, actor_org, 'invited', first_name_value, last_name_value,
      coalesce((select o.locked_default_language from public.organizations o where o.id = actor_org), 'ca'),
      test_account_value
    );
    perform private.apply_profile_prefill(
      account_id, payload - 'email' - 'referral_id' - 'is_test_account', 'staff');

    -- From a referral (RAPP-303): the entity's answers fill the rest of her
    -- profile, recorded as given by the entity. What staff typed wins. The
    -- referral then keeps no copy: her answers live on her profile only.
    if referral_value is not null then
      select coalesce(public.decrypt_field(referral.intake_answers)::jsonb, '{}'::jsonb)
             || coalesce(jsonb_build_object('phone', public.decrypt_field(referral.referred_phone)), '{}'::jsonb)
        into entity_answers
        from public.entity_referrals referral
       where referral.id = referral_value;
      entity_answers := jsonb_strip_nulls(entity_answers)
        - array(select jsonb_object_keys(payload - 'email' - 'referral_id' - 'is_test_account'));
      if entity_answers <> '{}'::jsonb then
        perform private.apply_profile_prefill(account_id, entity_answers, 'entity');
      end if;
      update public.entity_referrals
         set intake_answers = null, referred_phone = null, referred_email = null, updated_at = now()
       where id = referral_value;
    end if;
  end if;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org,
    actor,
    'invite.create',
    'invite',
    new_invite_id,
    -- The referring entity and the referral are programme data, not personal
    -- data, so they are recorded. The invited ADDRESS is not: the audit trail
    -- says who invited and when, and the invite row itself holds who was invited.
    jsonb_build_object(
      'reference_entity', reference_entity_value,
      'referral_id', referral_value,
      'profile_created', creates_profile,
      'test_account', test_account_value
    )
  );

  -- Her profile id, so staff can open her record and complete it; null for
  -- an email-only invitation, which creates no profile.
  return query select new_invite_id, email_value, invite_expires_at,
    case when creates_profile then account_id end;
end;
$function$;

-- The team list says which accounts are test accounts, so an admin sees and
-- changes the flag next to each person. The return type gains a column.
drop function public.list_staff_members();

create function public.list_staff_members()
returns table(
  profile_id uuid, first_name text, last_name text, email text, role text, is_active boolean,
  invited_at timestamp with time zone, is_test_account boolean
)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not (select public.has_permission('team.manage')) then
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
    invitation.created_at,
    profile.is_test_account
  from public.profiles as profile
  join auth.users as account on account.id = profile.id
  left join public.staff_invitations as invitation on invitation.profile_id = profile.id
  where profile.org_id = (select public.current_org_id())
    and profile.role in ('staff', 'admin')
  order by profile.is_active desc, profile.last_name, profile.first_name, profile.id;
end;
$$;

revoke all on function public.list_staff_members() from public, anon;
grant execute on function public.list_staff_members() to authenticated;
