-- Hide a screen on every form (RAPP-711).
--
-- WHY
--
-- Staff could hide only the app's built-in Onboarding screens. Ramassà may
-- want to hide any screen: a screen the team made on Onboarding, or a screen
-- of a form the team created. Her phone skips a hidden screen, and a hidden
-- screen can never keep her from finishing.
--
-- THE RULE
--
-- A screen can be hidden only while it asks nothing required and holds no
-- signature block (`private.screen_must_show`): no required field, no
-- required consent, no signature. While a screen is hidden, nothing required
-- goes on it: making a field or a consent required there is refused, a field
-- placed there is optional, and a signature block cannot be added. To ask
-- something required, staff show the screen first. Built-in screens already
-- followed this for fields and signatures; required consents now count too.
--
-- WHAT THIS MIGRATION DOES
--
--   1. `intake_screens.is_hidden` and `custom_form_screens.is_hidden`, false
--      by default, so every screen shows as before.
--   2. `private.screen_must_show` and `private.screen_is_hidden`, and
--      `private.builtin_screen_hideable` reads the first one.
--   3. `public.set_screen_hidden` hides or shows a team screen at once.
--   4. Placing a field or consent, making one required and adding a signature
--      block refuse anything required on a hidden screen.
--   5. The catalog sends `is_hidden` on both kinds of screen. A form's
--      published version leaves its hidden screens out, so her phone skips
--      them from the next Publica, older builds included. Publishing needs
--      a screen that is shown.
--   6. The Onboarding setup file carries the flag; an older file imports with
--      every screen shown.
--
-- An older app build ignores the new key: it shows a hidden Onboarding team
-- screen, which asks nothing required, so she can still finish.
--
-- Docs: https://www.postgresql.org/docs/current/sql-altertable.html

-- 1. The flag ----------------------------------------------------------------------------------------------

alter table public.intake_screens add column is_hidden boolean not null default false;
alter table public.custom_form_screens add column is_hidden boolean not null default false;
comment on column public.intake_screens.is_hidden is
  'Staff hid the screen (RAPP-711): her phone skips it. It asks nothing required and holds no signature.';
comment on column public.custom_form_screens.is_hidden is
  'Staff hid the screen (RAPP-711): the next published version leaves it out.';

-- 2. What keeps a screen shown ------------------------------------------------------------------------------

create or replace function private.screen_must_show(p_org_id uuid, p_surface text, p_screen_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_screen_key is not null and (
    exists (select 1 from public.field_placements p
              join public.profile_fields f on f.id = p.field_id and not f.is_archived
             where p.org_id = p_org_id and p.surface = p_surface and p.screen_key = p_screen_key
               and p.required)
    or exists (select 1 from public.consent_placements p
                 join public.consents c on c.id = p.consent_id and not c.is_archived
                where p.org_id = p_org_id and p.surface = p_surface and p.screen_key = p_screen_key
                  and p.required)
    or exists (select 1 from public.form_blocks b
                where b.org_id = p_org_id and b.surface = p_surface and b.screen_key = p_screen_key));
$$;
revoke all on function private.screen_must_show(uuid, text, text) from public, anon, authenticated;

create or replace function private.screen_is_hidden(p_org_id uuid, p_surface text, p_screen_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_screen_key is null then false
    when p_surface = 'onboarding' and private.is_uuid_text(p_screen_key) then
      exists (select 1 from public.intake_screens s
               where s.id = p_screen_key::uuid and s.org_id = p_org_id and s.is_hidden)
    when p_surface = 'onboarding' then
      exists (select 1 from public.intake_builtin_screens b
               where b.org_id = p_org_id and b.screen = p_screen_key and b.is_hidden)
      and private.builtin_screen_hideable(p_screen_key)
    when p_surface = 'custom_form' and private.is_uuid_text(p_screen_key) then
      exists (select 1 from public.custom_form_screens s
               where s.id = p_screen_key::uuid and s.org_id = p_org_id and s.is_hidden)
    else false end;
$$;
revoke all on function private.screen_is_hidden(uuid, text, text) from public, anon, authenticated;

-- A built-in screen: the same rule, for the actor's organization.
create or replace function private.builtin_screen_hideable(p_screen text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from private.system_profile_fields() s where s.screen = p_screen)
     and not private.screen_must_show(
           coalesce((select public.current_org_id()), (select public.default_organization_id())),
           'onboarding', p_screen);
$$;

-- 3. Hiding a team screen ----------------------------------------------------------------------------------

create or replace function public.set_screen_hidden(p_screen_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  hidden boolean := coalesce(p_hidden, false);
  surface text;
begin
  if exists (select 1 from public.intake_screens s
              where s.id = p_screen_id and s.org_id = actor_org and not s.is_archived) then
    surface := 'onboarding';
  elsif exists (select 1 from public.custom_form_screens s
                 join public.custom_forms f on f.id = s.form_id and not f.is_archived
                where s.id = p_screen_id and s.org_id = actor_org and not s.is_archived) then
    surface := 'custom_form';
  else
    raise no_data_found using message = 'no such screen';
  end if;
  if hidden and private.screen_must_show(actor_org, surface, p_screen_id::text) then
    raise check_violation using message = 'a screen with a required field, a required consent or a signature cannot be hidden';
  end if;
  if surface = 'onboarding' then
    update public.intake_screens set is_hidden = hidden, updated_at = now() where id = p_screen_id;
  else
    update public.custom_form_screens set is_hidden = hidden, updated_at = now() where id = p_screen_id;
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.screen_hide',
          case surface when 'onboarding' then 'intake_screen' else 'custom_form_screen' end, p_screen_id,
          jsonb_build_object('hidden', hidden, 'surface', surface));
end;
$$;
revoke all on function public.set_screen_hidden(uuid, boolean) from public, anon;
grant execute on function public.set_screen_hidden(uuid, boolean) to authenticated;

-- 4. Nothing required on a hidden screen (bodies otherwise unchanged) ---------------------------------------

CREATE OR REPLACE FUNCTION public.place_field(p_field_id uuid, p_surface text, p_screen_key text DEFAULT NULL::text, p_required boolean DEFAULT NULL::boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := private.require_question_builder();
  field public.profile_fields;
  form_id uuid;
  saved_id uuid;
begin
  select * into field from public.profile_fields where id = p_field_id and org_id = actor_org and not is_archived;
  if field.id is null then
    raise no_data_found using message = 'no such question';
  end if;
  if p_surface is null or p_surface not in ('onboarding', 'entity_form', 'season', 'authorization', 'custom_form') then
    raise check_violation using message = 'a field is placed on onboarding, the entity form, the season, the authorization or a form';
  end if;
  -- Her names live on her account: her identity screen and the entity form ask them.
  if private.is_name_field(field)
     and not (p_surface = 'entity_form' or (p_surface = 'onboarding' and p_screen_key = 'identity')) then
    raise check_violation using message = 'her names are asked on her identity screen';
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
  elsif p_surface = 'custom_form' then
    form_id := private.custom_form_of_screen(actor_org, p_screen_key);
    if form_id is null then
      raise no_data_found using message = 'no such screen';
    end if;
    if private.field_is_hers_only(field.question_type, field.settings)
       and exists (select 1 from public.custom_forms f where f.id = form_id and f.filled_by <> 'player') then
      raise check_violation using message = 'a file or a signature is asked of her only';
    end if;
  elsif p_screen_key is not null then
    raise check_violation using message = 'only an onboarding placement names a screen';
  end if;
  if private.field_is_hers_only(field.question_type, field.settings) and p_surface = 'entity_form' then
    raise check_violation using message = 'a file or a signature is asked of her only';
  end if;
  if exists (select 1 from public.field_placements
              where field_id = p_field_id and surface = p_surface
                and custom_form_id is not distinct from form_id) then
    raise unique_violation using message = 'the field is already asked there';
  end if;

  -- A hidden screen asks nothing required (RAPP-711): a field placed on it is optional.
  if private.screen_is_hidden(actor_org, p_surface, p_screen_key) and coalesce(p_required, false) then
    raise check_violation using message = 'a hidden screen asks nothing required';
  end if;
  insert into public.field_placements (org_id, field_id, surface, screen_key, custom_form_id, sort_order, required)
  values (actor_org, p_field_id, p_surface, p_screen_key, form_id,
          coalesce((select max(p.sort_order) + 1 from public.field_placements p
                     where p.org_id = actor_org and p.surface = p_surface
                       and p.screen_key is not distinct from p_screen_key), 0),
          coalesce(p_required, field.default_required)
            and not private.screen_is_hidden(actor_org, p_surface, p_screen_key))
  returning id into saved_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.field_place', 'profile_field', p_field_id,
          jsonb_build_object('placement_id', saved_id, 'surface', p_surface, 'screen', p_screen_key,
                             'custom_form', form_id));
  return saved_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_placement(p_placement_id uuid, p_required boolean, p_label_override jsonb DEFAULT NULL::jsonb, p_help_override jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := private.require_question_builder();
  placement public.field_placements;
  field public.profile_fields;
  clean_label jsonb := nullif(nullif(p_label_override, 'null'::jsonb), '{}'::jsonb);
  clean_help jsonb := nullif(nullif(p_help_override, 'null'::jsonb), '{}'::jsonb);
  new_required boolean;
begin
  select p.* into placement from public.field_placements p where p.id = p_placement_id and p.org_id = actor_org;
  if placement.id is null then
    raise no_data_found using message = 'no such placement';
  end if;
  select * into field from public.profile_fields where id = placement.field_id;
  if (clean_label is not null and not private.localized_text_valid(clean_label))
     or (clean_help is not null and not private.localized_text_valid(clean_help)) then
    raise check_violation using message = 'a wording is text in the five languages';
  end if;
  new_required := coalesce(p_required, placement.required);
  if new_required and not placement.required
     and private.screen_is_hidden(actor_org, placement.surface, placement.screen_key) then
    raise check_violation using message = 'a hidden screen asks nothing required';
  end if;
  if field.kind = 'builtin' and placement.surface <> 'entity_form' then
    -- The field that stands for an app question carries its required flag,
    -- on her onboarding and her season form alike; the other parts of a
    -- split field follow the app's own rules.
    if private.question_system_key(private.system_key_question(field.system_key)) = field.system_key then
      if new_required is distinct from placement.required then
        perform public.save_builtin_question_required(private.system_key_question(field.system_key), new_required);
      end if;
      select p.required into new_required from public.field_placements p where p.id = p_placement_id;
    else
      new_required := false;
    end if;
  end if;
  if placement.surface = 'entity_form' and field.system_key = any (private.entity_form_always_asked()) then
    new_required := true;
  end if;
  update public.field_placements
     set required = new_required, label_override = clean_label, help_override = clean_help, updated_at = now()
   where id = p_placement_id;
  -- The field names only: the wording is in the row.
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.placement_save', 'profile_field', placement.field_id,
          jsonb_build_object('placement_id', p_placement_id, 'surface', placement.surface,
                             'required', new_required,
                             'label_override', coalesce((select jsonb_agg(k order by k) from jsonb_object_keys(clean_label) k), '[]'::jsonb),
                             'help_override', coalesce((select jsonb_agg(k order by k) from jsonb_object_keys(clean_help) k), '[]'::jsonb)));
end;
$function$;

CREATE OR REPLACE FUNCTION public.place_consent(p_consent_id uuid, p_surface text, p_screen_key text DEFAULT NULL::text, p_required boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := private.require_question_builder();
  consent public.consents;
  form_id uuid;
  saved_id uuid;
begin
  select * into consent from public.consents where id = p_consent_id and org_id = actor_org and not is_archived;
  if consent.id is null then
    raise no_data_found using message = 'no such consent';
  end if;
  if p_surface is null or p_surface not in ('authorization', 'onboarding', 'custom_form') then
    raise check_violation using message = 'a consent is asked on the authorization, an onboarding screen or a form';
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
  elsif p_surface = 'custom_form' then
    form_id := private.custom_form_of_screen(actor_org, p_screen_key);
    if form_id is null then
      raise no_data_found using message = 'no such screen';
    end if;
    if exists (select 1 from public.custom_forms f where f.id = form_id and f.filled_by <> 'player') then
      raise check_violation using message = 'a consent is asked on a form she fills in';
    end if;
  elsif p_screen_key is not null then
    raise check_violation using message = 'only an onboarding placement names a screen';
  end if;
  -- Image rights drive the photo consent, which she can always refuse.
  if coalesce(p_required, false) and private.screen_is_hidden(actor_org, p_surface, p_screen_key) then
    raise check_violation using message = 'a hidden screen asks nothing required';
  end if;
  if consent.key = 'image_rights' and coalesce(p_required, false) then
    raise check_violation using message = 'image rights are never required';
  end if;
  if exists (select 1 from public.consent_placements
              where consent_id = consent.id and surface = p_surface
                and custom_form_id is not distinct from form_id) then
    raise unique_violation using message = 'the consent is already asked there';
  end if;
  insert into public.consent_placements (org_id, consent_id, surface, screen_key, custom_form_id, sort_order, required)
  values (actor_org, consent.id, p_surface, p_screen_key, form_id,
          private.next_form_position(actor_org, p_surface, p_screen_key), coalesce(p_required, false))
  returning id into saved_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'consent.place', 'consent', consent.id,
          jsonb_build_object('placement_id', saved_id, 'surface', p_surface, 'screen', p_screen_key,
                             'required', coalesce(p_required, false), 'custom_form', form_id));
  return saved_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_consent_placement(p_placement_id uuid, p_required boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if p_required and not placement.required
     and private.screen_is_hidden(actor_org, placement.surface, placement.screen_key) then
    raise check_violation using message = 'a hidden screen asks nothing required';
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
$function$;

CREATE OR REPLACE FUNCTION public.save_form_block(p_id uuid, p_surface text, p_screen_key text, p_body jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := private.require_question_builder();
  form_id uuid;
  saved_id uuid;
begin
  if p_body is null or not private.catalan_text_valid(p_body) or not private.localized_text_valid(p_body) then
    raise check_violation using message = 'a signature needs its text in Catalan';
  end if;
  if p_id is null then
    if p_surface is null or p_surface not in ('onboarding', 'entity_form', 'custom_form') then
      raise check_violation using message = 'a signature goes on an onboarding screen, the entity form or a form';
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
    elsif p_surface = 'custom_form' then
      form_id := private.custom_form_of_screen(actor_org, p_screen_key);
      if form_id is null then
        raise no_data_found using message = 'no such screen';
      end if;
      if exists (select 1 from public.custom_forms f where f.id = form_id and f.filled_by <> 'player') then
        raise check_violation using message = 'a signature is asked on a form she fills in';
      end if;
    elsif p_screen_key is not null then
      raise check_violation using message = 'only an onboarding block names a screen';
    end if;
    if private.screen_is_hidden(actor_org, p_surface, p_screen_key) then
      raise check_violation using message = 'a hidden screen holds no signature';
    end if;
    insert into public.form_blocks (org_id, surface, screen_key, custom_form_id, kind, body, sort_order)
    values (actor_org, p_surface, p_screen_key, form_id, 'signature', p_body,
            private.next_form_position(actor_org, p_surface, p_screen_key))
    returning id into saved_id;
  else
    update public.form_blocks set body = p_body, updated_at = now()
     where id = p_id and org_id = actor_org
    returning id into saved_id;
    if saved_id is null then
      raise no_data_found using message = 'no such block';
    end if;
  end if;
  -- The text as saved, every time: the audit log is the history of the text.
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.block_save', 'form_block', saved_id,
          jsonb_build_object('created', p_id is null, 'kind', 'signature', 'body', p_body));
  return saved_id;
end;
$function$;

-- 5. The catalog and a form's published version (bodies otherwise unchanged) -------------------------------

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
  reads_team_forms boolean := with_archived or (select public.has_permission('participants.view'));
  forms_shown uuid[];
  forms_json jsonb;
  form_placements_json jsonb;
  form_blocks_json jsonb;
  form_consents_json jsonb;
begin
  if (select auth.uid()) is null or actor_org is null then
    raise insufficient_privilege using message = 'the question catalog needs an account';
  end if;
  if reads_team_forms then
    -- The team reads each form's draft, and designers its published versions.
    select coalesce(array_agg(f.id), array[]::uuid[]) into forms_shown
      from public.custom_forms f
     where f.org_id = actor_org and (with_archived or not f.is_archived);
    forms_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'filled_by', f.filled_by, 'mandatory', f.mandatory,
        'deadline', f.deadline,
        -- What an older build reads (RAPP-700).
        'appears', case when f.audience = 'chosen' then 'sent'
                        when f.repeats_each_season then 'every_season' else 'once' end,
        'audience', f.audience, 'repeats_each_season', f.repeats_each_season,
        'recipient_count', (select count(*) from public.custom_form_recipients r where r.form_id = f.id),
        'version', f.version, 'published_at', f.published_at, 'is_archived', f.is_archived,
        'versions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'version', v.version, 'season_id', v.season_id, 'is_correction', v.is_correction,
            'published_at', v.published_at) order by v.version desc)
            from public.custom_form_versions v where v.form_id = f.id), '[]'::jsonb),
        'screens', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', s.id, 'title', s.title, 'intro', s.intro, 'sort_order', s.sort_order,
            'is_hidden', s.is_hidden)
            order by s.sort_order, s.created_at)
            from public.custom_form_screens s
           where s.form_id = f.id and not s.is_archived), '[]'::jsonb))
        order by f.created_at, f.id)
        from public.custom_forms f where f.id = any (forms_shown)), '[]'::jsonb);
    form_placements_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'field_id', p.field_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'custom_form_id', p.custom_form_id, 'sort_order', p.sort_order, 'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.screen_key, p.sort_order, p.created_at)
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id and not f.is_archived
       where p.surface = 'custom_form' and p.custom_form_id = any (forms_shown)), '[]'::jsonb);
    form_blocks_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'surface', b.surface, 'screen_key', b.screen_key, 'custom_form_id', b.custom_form_id,
        'kind', b.kind, 'body', b.body, 'sort_order', b.sort_order)
        order by b.screen_key, b.sort_order, b.created_at)
        from public.form_blocks b
       where b.surface = 'custom_form' and b.custom_form_id = any (forms_shown)), '[]'::jsonb);
    form_consents_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'consent_id', p.consent_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'custom_form_id', p.custom_form_id, 'sort_order', p.sort_order, 'required', p.required)
        order by p.screen_key, p.sort_order, p.created_at)
        from public.consent_placements p
        join public.consents c on c.id = p.consent_id and not c.is_archived
       where p.surface = 'custom_form' and p.custom_form_id = any (forms_shown)), '[]'::jsonb);
  else
    -- She reads the published version of each live form she fills in (RAPP-701).
    with live as (
      select f.id, f.audience, f.repeats_each_season, f.published_at, v.version, v.content
        from public.custom_forms f
        cross join lateral private.custom_form_live_version(f.id) v
       where f.org_id = actor_org and f.filled_by = 'player' and not f.is_archived)
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'name', l.content -> 'name', 'filled_by', 'player',
        'mandatory', l.content ->> 'mandatory', 'deadline', l.content -> 'deadline',
        'appears', case when l.audience = 'chosen' then 'sent'
                        when l.repeats_each_season then 'every_season' else 'once' end,
        'audience', l.audience, 'repeats_each_season', l.repeats_each_season,
        'version', l.version, 'published_at', l.published_at, 'is_archived', false,
        'screens', l.content -> 'screens')), '[]'::jsonb),
      coalesce((
        select jsonb_agg(p || jsonb_build_object('surface', 'custom_form', 'custom_form_id', l2.id))
          from live l2
          cross join lateral jsonb_array_elements(l2.content -> 'placements') p
          join public.profile_fields f on f.id = (p ->> 'field_id')::uuid and not f.is_archived), '[]'::jsonb),
      coalesce((
        select jsonb_agg(b || jsonb_build_object('surface', 'custom_form', 'custom_form_id', l2.id,
                                                 'kind', 'signature'))
          from live l2
          cross join lateral jsonb_array_elements(l2.content -> 'blocks') b), '[]'::jsonb),
      coalesce((
        select jsonb_agg(p || jsonb_build_object('surface', 'custom_form', 'custom_form_id', l2.id))
          from live l2
          cross join lateral jsonb_array_elements(l2.content -> 'consent_placements') p
          join public.consents c on c.id = (p ->> 'consent_id')::uuid and not c.is_archived), '[]'::jsonb)
      into forms_json, form_placements_json, form_blocks_json, form_consents_json
      from live l;
  end if;
  return jsonb_build_object(
    -- Ramassà screens. The fields each one asks are its placements, below.
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'intro', s.intro, 'after_screen', s.after_screen,
        'sort_order', s.sort_order, 'is_archived', s.is_archived, 'is_hidden', s.is_hidden)
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
       where p.org_id = actor_org and p.surface <> 'custom_form'
         and (with_archived or not f.is_archived)), '[]'::jsonb),
    -- The blocks of each screen and of the entity form (RAPP-690), in the
    -- order they share with the placements.
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'surface', b.surface, 'screen_key', b.screen_key, 'kind', b.kind,
        'body', b.body, 'sort_order', b.sort_order)
        order by b.surface, b.screen_key, b.sort_order, b.created_at)
        from public.form_blocks b where b.org_id = actor_org and b.surface <> 'custom_form'), '[]'::jsonb),
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
       where p.org_id = actor_org and p.surface <> 'custom_form'), '[]'::jsonb),
    -- The forms the team created (RAPP-700, RAPP-701), with their screens in order.
    'custom_forms', forms_json,
    'custom_form_placements', form_placements_json,
    'custom_form_blocks', form_blocks_json,
    'custom_form_consent_placements', form_consents_json
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.custom_form_content(p_form_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'name', f.name, 'mandatory', f.mandatory, 'deadline', f.deadline,
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'intro', s.intro,
                                          'sort_order', s.sort_order)
                       order by s.sort_order, s.created_at)
        from public.custom_form_screens s where s.form_id = f.id and not s.is_archived and not s.is_hidden), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'field_id', p.field_id, 'screen_key', p.screen_key, 'sort_order', p.sort_order,
        'required', p.required, 'label_override', p.label_override, 'help_override', p.help_override)
        order by p.screen_key, p.sort_order)
        from public.field_placements p
       where p.surface = 'custom_form' and p.custom_form_id = f.id
         and private.custom_form_screen_live(p.screen_key)
         and not private.screen_is_hidden(f.org_id, 'custom_form', p.screen_key)), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'screen_key', b.screen_key, 'body', b.body,
                                          'sort_order', b.sort_order)
                       order by b.screen_key, b.sort_order)
        from public.form_blocks b
       where b.surface = 'custom_form' and b.custom_form_id = f.id
         and private.custom_form_screen_live(b.screen_key)
         and not private.screen_is_hidden(f.org_id, 'custom_form', b.screen_key)), '[]'::jsonb),
    'consent_placements', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'consent_id', p.consent_id, 'screen_key', p.screen_key,
                                          'sort_order', p.sort_order, 'required', p.required)
                       order by p.screen_key, p.sort_order)
        from public.consent_placements p
       where p.surface = 'custom_form' and p.custom_form_id = f.id
         and private.custom_form_screen_live(p.screen_key)
         and not private.screen_is_hidden(f.org_id, 'custom_form', p.screen_key)), '[]'::jsonb))
    from public.custom_forms f where f.id = p_form_id;
$function$;

-- Publishing needs a screen she is shown.
CREATE OR REPLACE FUNCTION public.publish_custom_form(p_id uuid, p_is_correction boolean DEFAULT false, p_season_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := private.require_question_builder();
  form public.custom_forms;
  current_season uuid := private.current_season_id(actor_org);
  next_version integer;
  is_live boolean;
  asked integer := 0;
  everyone uuid[];
begin
  select * into form from public.custom_forms where id = p_id and org_id = actor_org for update;
  if form.id is null or form.is_archived then
    raise no_data_found using message = 'no such form';
  end if;
  if not exists (select 1 from public.custom_form_screens s
                  where s.form_id = form.id and not s.is_archived and not s.is_hidden) then
    raise check_violation using message = 'a form needs a screen before it is published';
  end if;
  if form.repeats_each_season then
    if p_season_id is null or not exists (
      select 1 from public.seasons s
       where s.id = p_season_id and s.org_id = actor_org
         and (s.is_current or s.starts_on > coalesce(
               (select c.starts_on from public.seasons c where c.id = current_season), '-infinity'::date))) then
      raise check_violation using message = 'a repeating form is published to the current season or a future one';
    end if;
  elsif p_season_id is not null then
    raise check_violation using message = 'only a repeating form is published to a season';
  end if;
  if coalesce(p_is_correction, false) and not exists (
    select 1 from public.custom_form_versions v
     where v.form_id = form.id and v.season_id is not distinct from p_season_id) then
    raise check_violation using message = 'a correction needs a published version to correct';
  end if;

  select coalesce(max(v.version), 0) + 1 into next_version
    from public.custom_form_versions v where v.form_id = form.id;
  insert into public.custom_form_versions (org_id, form_id, version, season_id, content, is_correction, published_by)
  values (actor_org, form.id, next_version, p_season_id, private.custom_form_content(form.id),
          coalesce(p_is_correction, false), (select auth.uid()));
  update public.custom_forms
     set version = next_version, published_at = coalesce(published_at, now()), updated_at = now()
   where id = form.id;

  is_live := not form.repeats_each_season or p_season_id = current_season;
  if is_live then
    update public.custom_form_responses
       set version = next_version, season_id = p_season_id
     where form_id = form.id and status = 'pending';
    everyone := private.custom_form_audience(form.id);
    if coalesce(p_is_correction, false) then
      -- A correction asks only who was never asked (this season, when it repeats).
      everyone := array(
        select a from unnest(everyone) a
         where not exists (select 1 from public.custom_form_responses r
                            where r.form_id = form.id and r.profile_id = a
                              and r.season_id is not distinct from p_season_id));
    end if;
    asked := private.ask_custom_form(form.id, everyone, p_season_id);
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'custom_form.publish', 'custom_form', form.id,
          jsonb_build_object('version', next_version, 'season', p_season_id,
                             'is_correction', coalesce(p_is_correction, false), 'asked', asked));
  return asked;
end;
$function$;

-- 6. The Onboarding setup file (bodies otherwise unchanged) -------------------------------------------------

CREATE OR REPLACE FUNCTION public.export_onboarding_setup(p_app_commit text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  document jsonb;
begin
  if not (select private.can_design_onboarding()) or actor_org is null then
    raise insufficient_privilege using message = 'exporting the onboarding setup needs settings.organization or onboarding.design';
  end if;
  if p_app_commit is not null and p_app_commit !~ '^[0-9A-Za-z._-]{1,64}$' then
    raise check_violation using message = 'the app commit is a short version name';
  end if;

  document := jsonb_build_object(
    'format', 'ramassa.onboarding-setup',
    'schema_version', 3,
    'app_commit', p_app_commit,
    'exported_at', now(),
    -- The profile layout (RAPP-649): sections, every field with its options, and
    -- where each is asked. Version 3 (RAPP-656) carries nothing else about them.
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'key', s.key, 'title', s.title, 'sort_order', s.sort_order, 'is_builtin', s.is_builtin)
        order by s.sort_order, s.created_at, s.id)
        from public.profile_sections s where s.org_id = actor_org), '[]'::jsonb),
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'section_id', f.section_id, 'kind', f.kind, 'system_key', f.system_key,
        'question_type', f.question_type, 'label', f.label, 'help', f.help, 'privacy', f.privacy,
        'default_required', f.default_required, 'settings', f.settings,
        'show_when_field_id', f.show_when_field_id, 'show_when_option_id', f.show_when_option_id,
        'sort_order', f.sort_order, 'is_archived', f.is_archived,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'key', o.key, 'label', o.label, 'sort_order', o.sort_order, 'is_archived', o.is_archived)
            order by o.sort_order, o.id)
            from public.custom_question_options o where o.question_id = f.id), '[]'::jsonb))
        -- The app's fields by key, then Ramassà's in their order: the same
        -- setup always gives the same file.
        order by f.kind, f.system_key, f.sort_order, f.created_at, f.id)
        from public.profile_fields f
       where f.org_id = actor_org
         and not coalesce(f.system_key = any (private.authorization_field_keys()), false)), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'field_id', p.field_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'sort_order', p.sort_order, 'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.surface, p.screen_key, p.sort_order, coalesce(f.system_key, f.id::text))
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id
       where p.org_id = actor_org and p.surface not in ('authorization', 'custom_form')), '[]'::jsonb),
    -- Ramassà screens, in the order of their anchors.
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'intro', s.intro,
        'after_screen', s.after_screen, 'sort_order', s.sort_order,
        'home_after_screen', s.home_after_screen, 'home_sort_order', s.home_sort_order,
        'is_archived', s.is_archived, 'is_hidden', s.is_hidden)
        order by array_position(private.intake_builtin_screens(), s.after_screen), s.sort_order, s.created_at, s.id)
        from public.intake_screens s where s.org_id = actor_org), '[]'::jsonb),
    -- The placements above carry the wording, the hiding and the required
    -- flag of the app's questions (RAPP-666). The two lists stay in the file,
    -- empty, so it is still a version 3 file; an older file may fill them.
    'builtin_question_overrides', '[]'::jsonb,
    'builtin_screens', coalesce((
      select jsonb_agg(jsonb_build_object('screen', b.screen, 'texts', b.texts, 'is_hidden', b.is_hidden)
        order by b.screen)
        from public.intake_builtin_screens b where b.org_id = actor_org), '[]'::jsonb),
    'flow_order', (select to_jsonb(f.step_order) from public.intake_flow_orders f where f.org_id = actor_org),
    'required_questions', '[]'::jsonb,
    'presets', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.name, 'states', p.states) order by p.name, p.id)
        from public.intake_state_presets p where p.org_id = actor_org), '[]'::jsonb),
    'document_step_explanation', (
      select o.document_step_explanation from public.organizations o where o.id = actor_org),
    'app_terms', jsonb_build_object(
      'published', coalesce((
        select jsonb_agg(jsonb_build_object(
          'version_number', v.version_number, 'published_at', v.published_at, 'content', v.content)
          order by v.version_number)
          from public.app_terms_versions v where v.org_id = actor_org and v.published_at is not null), '[]'::jsonb),
      'draft', (
        select jsonb_build_object('content', v.content)
          from public.app_terms_versions v where v.org_id = actor_org and v.published_at is null)),
    -- Real seasons only: a test fixture season is never moved.
    'seasons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'starts_on', s.starts_on, 'is_current', s.is_current)
        order by s.starts_on, s.name)
        from public.seasons s where s.org_id = actor_org and not s.is_test_fixture), '[]'::jsonb),
    'authorization', jsonb_build_object(
      'published', coalesce((
        select jsonb_agg(jsonb_build_object(
          'season_id', v.season_id, 'version_number', v.version_number,
          'published_at', v.published_at, 'content', v.content)
          order by s.starts_on, v.version_number)
          from public.authorization_versions v
          join public.seasons s on s.id = v.season_id and not s.is_test_fixture
         where v.org_id = actor_org and v.published_at is not null), '[]'::jsonb),
      'draft', (
        select jsonb_build_object('content', v.content)
          from public.authorization_versions v where v.org_id = actor_org and v.published_at is null)),
    -- The signature blocks (RAPP-690), in the order they share with the placements.
    'signature_blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'surface', b.surface, 'screen_key', b.screen_key, 'body', b.body, 'sort_order', b.sort_order)
        order by b.surface, b.screen_key, b.sort_order, b.created_at, b.id)
        from public.form_blocks b where b.org_id = actor_org and b.surface <> 'custom_form'), '[]'::jsonb),
    -- Dades legals (RAPP-699): every consent by key, the system ones with
    -- their wording, and where each is asked on Onboarding. The
    -- authorization's consents travel in its draft.
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', c.key, 'system_key', c.system_key, 'name', c.name, 'body', c.body,
        'is_archived', c.is_archived)
        order by c.key)
        from public.consents c where c.org_id = actor_org), '[]'::jsonb),
    'consent_placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'consent_key', c.key, 'screen_key', p.screen_key, 'sort_order', p.sort_order,
        'required', p.required)
        order by p.screen_key, p.sort_order, c.key)
        from public.consent_placements p
        join public.consents c on c.id = p.consent_id
       where p.org_id = actor_org and p.surface = 'onboarding'), '[]'::jsonb)
  );

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'onboarding.export', 'organization', actor_org,
          jsonb_build_object('schema_version', 3, 'app_commit', p_app_commit,
                             'counts', private.onboarding_setup_counts(document)));
  return document;
end;
$function$;

CREATE OR REPLACE FUNCTION private.apply_onboarding_setup(p_document jsonb, p_org_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  season_map jsonb := '{}'::jsonb;
  screen_map jsonb := '{}'::jsonb;
  option_map jsonb := '{}'::jsonb;
  section_map jsonb := '{}'::jsonb;
  field_map jsonb := '{}'::jsonb;
  -- A file of an older version is read as version 3 (RAPP-656).
  document jsonb := private.onboarding_setup_as_version_3(p_document, p_org_id);
  new_field uuid;
  placed_screen text;
  item record;
  option_item record;
  new_id uuid;
  new_screen uuid;
  question_count integer := 0;
  option_ties boolean;
  steps text[];
  legal jsonb := private.onboarding_setup_legal_plan(p_document);
  flow_problem text;
begin
  -- A file with nothing to import is refused, or an empty export could be
  -- imported again and again (pending fix 33).
  if private.onboarding_setup_is_empty(p_document) then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/EMPTY: the file holds no onboarding setup to import';
  end if;

  -- Ids inside the file are unique per type, or references are ambiguous.
  if (select count(*) <> count(distinct s ->> 'id') from jsonb_array_elements(document -> 'screens') s)
     or (select count(*) <> count(distinct s ->> 'id') from jsonb_array_elements(document -> 'seasons') s)
     or (select count(*) <> count(distinct s ->> 'id') from jsonb_array_elements(document -> 'sections') s)
     or (select count(*) <> count(distinct f ->> 'id') from jsonb_array_elements(document -> 'fields') f)
     or (select count(*) <> count(distinct o ->> 'id')
           from jsonb_array_elements(document -> 'fields') f, jsonb_array_elements(f -> 'options') o)
  then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: an id appears twice';
  end if;

  -- Seasons.
  for item in select value from jsonb_array_elements(p_document -> 'seasons') loop
    insert into public.seasons (org_id, name, starts_on, is_current)
    values (p_org_id, item.value ->> 'name', (item.value ->> 'starts_on')::date,
            coalesce((item.value ->> 'is_current')::boolean, false))
    returning id into new_id;
    season_map := season_map || jsonb_build_object(item.value ->> 'id', new_id);
  end loop;

  -- Ramassà screens. Fields reach them through placements, below.
  for item in select value, ordinality from jsonb_array_elements(document -> 'screens') with ordinality loop
    insert into public.intake_screens (
      org_id, title, intro, after_screen, sort_order, home_after_screen, home_sort_order, is_archived,
      is_hidden, created_at, updated_at)
    values (
      p_org_id, item.value -> 'title', private.json_value_or_null(item.value -> 'intro'),
      item.value ->> 'after_screen', (item.value ->> 'sort_order')::integer,
      coalesce(item.value ->> 'home_after_screen', item.value ->> 'after_screen'),
      coalesce((item.value ->> 'home_sort_order')::integer, (item.value ->> 'sort_order')::integer),
      coalesce((item.value ->> 'is_archived')::boolean, false),
      -- An older file has no hide flag: the screen shows (RAPP-711).
      coalesce((item.value ->> 'is_hidden')::boolean, false),
      now() + item.ordinality * interval '1 microsecond', now())
    returning id into new_screen;
    screen_map := screen_map || jsonb_build_object(item.value ->> 'id', new_screen);
  end loop;

  -- The profile layout (RAPP-649): built-in sections and fields by their key,
  -- the others new; then where each is asked; then conditions.
  for item in select value from jsonb_array_elements(document -> 'sections') loop
    new_id := null;
    if coalesce((item.value ->> 'is_builtin')::boolean, false) then
      update public.profile_sections
         set title = item.value -> 'title', sort_order = (item.value ->> 'sort_order')::integer, updated_at = now()
       where org_id = p_org_id and key = item.value ->> 'key' and is_builtin
      returning id into new_id;
    end if;
    if new_id is null then
      new_id := gen_random_uuid();
      insert into public.profile_sections (id, org_id, key, title, sort_order)
      values (new_id, p_org_id, 'custom_' || replace(new_id::text, '-', ''), item.value -> 'title',
              (item.value ->> 'sort_order')::integer);
    end if;
    section_map := section_map || jsonb_build_object(item.value ->> 'id', new_id);
  end loop;

  for item in select value, ordinality from jsonb_array_elements(document -> 'fields') with ordinality loop
    if section_map ->> (item.value ->> 'section_id') is null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a question names a section that is not in the file';
    end if;
    if item.value ->> 'kind' = 'builtin' then
      update public.profile_fields
         set label = item.value -> 'label', help = private.json_value_or_null(item.value -> 'help'),
             section_id = (section_map ->> (item.value ->> 'section_id'))::uuid,
             sort_order = (item.value ->> 'sort_order')::integer, updated_at = now()
       where org_id = p_org_id and system_key = private.setup_system_key(item.value)
      returning id into new_field;
      if new_field is null then
        raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: an app question this app does not know';
      end if;
      -- Its options are the app's: a condition in the file finds them by key.
      for option_item in select value from jsonb_array_elements(item.value -> 'options') loop
        select o.id into new_id from public.custom_question_options o
         where o.question_id = new_field and o.key = option_item.value ->> 'key';
        if new_id is not null then
          option_map := option_map || jsonb_build_object(option_item.value ->> 'id', new_id);
        end if;
      end loop;
    else
      question_count := question_count + 1;
      insert into public.profile_fields (
        org_id, section_id, kind, question_type, label, help, privacy, default_required, settings,
        sort_order, created_by, is_archived, created_at, updated_at)
      values (
        p_org_id, (section_map ->> (item.value ->> 'section_id'))::uuid, 'custom', item.value ->> 'question_type',
        item.value -> 'label', private.json_value_or_null(item.value -> 'help'), item.value ->> 'privacy',
        coalesce((item.value ->> 'default_required')::boolean, false),
        coalesce(private.json_value_or_null(item.value -> 'settings'), '{}'::jsonb),
        (item.value ->> 'sort_order')::integer,
        p_actor, coalesce((item.value ->> 'is_archived')::boolean, false),
        now() + question_count * interval '1 microsecond', now())
      returning id into new_field;
      select count(*) <> count(distinct o ->> 'sort_order') into option_ties
        from jsonb_array_elements(item.value -> 'options') o;
      for option_item in select value, ordinality from jsonb_array_elements(item.value -> 'options') with ordinality loop
        insert into public.custom_question_options (org_id, question_id, label, sort_order, is_archived)
        values (p_org_id, new_field, option_item.value -> 'label',
                case when option_ties then option_item.ordinality::integer - 1
                     else (option_item.value ->> 'sort_order')::integer end,
                coalesce((option_item.value ->> 'is_archived')::boolean, false))
        returning id into new_id;
        option_map := option_map || jsonb_build_object(option_item.value ->> 'id', new_id);
      end loop;
    end if;
    field_map := field_map || jsonb_build_object(item.value ->> 'id', new_field);
  end loop;

  -- The built-in fields the file names are placed as the file says. A file
  -- converted from version 1 names none, so theirs stay as they are.
  -- The parts of a split field go with their first part, and the parts shown
  -- on a condition go first, so no condition is left without its field.
  delete from public.field_placements p
   using public.profile_fields f
   where f.id = p.field_id and f.org_id = p_org_id and f.kind = 'builtin'
     and p.surface <> 'custom_form'
     and f.show_when_field_id is not null
     and private.question_system_key(private.system_key_question(f.system_key))
         in (select private.question_system_key(private.system_key_question(private.setup_system_key(b)))
               from jsonb_array_elements(document -> 'fields') b where b ->> 'kind' = 'builtin');
  delete from public.field_placements p
   using public.profile_fields f
   where f.id = p.field_id and f.org_id = p_org_id and f.kind = 'builtin'
     and p.surface <> 'custom_form'
     and private.question_system_key(private.system_key_question(f.system_key))
         in (select private.question_system_key(private.system_key_question(private.setup_system_key(b)))
               from jsonb_array_elements(document -> 'fields') b where b ->> 'kind' = 'builtin');
  for item in select value from jsonb_array_elements(document -> 'placements') loop
    if field_map ->> (item.value ->> 'field_id') is null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a placement names a question that is not in the file';
    end if;
    placed_screen := private.json_value_or_null(item.value -> 'screen_key') #>> '{}';
    if private.is_uuid_text(placed_screen) then
      placed_screen := screen_map ->> placed_screen;
      if placed_screen is null then
        raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a placement names a screen that is not in the file';
      end if;
    end if;
    insert into public.field_placements (
      org_id, field_id, surface, screen_key, sort_order, required, label_override, help_override)
    values (
      p_org_id, (field_map ->> (item.value ->> 'field_id'))::uuid, item.value ->> 'surface', placed_screen,
      (item.value ->> 'sort_order')::integer, coalesce((item.value ->> 'required')::boolean, false),
      private.json_value_or_null(item.value -> 'label_override'),
      private.json_value_or_null(item.value -> 'help_override'));
  end loop;
  -- The signature blocks (RAPP-690), each on its screen; an older file has none.
  for item in select value from jsonb_array_elements(private.json_array_or_empty(p_document -> 'signature_blocks')) loop
    placed_screen := private.json_value_or_null(item.value -> 'screen_key') #>> '{}';
    if private.is_uuid_text(placed_screen) then
      placed_screen := screen_map ->> placed_screen;
      if placed_screen is null then
        raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a signature block names a screen that is not in the file';
      end if;
    end if;
    insert into public.form_blocks (org_id, surface, screen_key, kind, body, sort_order)
    values (p_org_id, item.value ->> 'surface', placed_screen, 'signature', item.value -> 'body',
            coalesce((item.value ->> 'sort_order')::integer, 0));
  end loop;
  -- Dades legals (RAPP-699); an older file has none. A system consent takes
  -- the file's wording by key; a staff consent is made by key, or takes the
  -- file's wording when the key exists.
  for item in select value from jsonb_array_elements(private.json_array_or_empty(p_document -> 'consents')) loop
    insert into public.consents (org_id, key, system_key, name, body, is_archived, created_by)
    values (p_org_id, item.value ->> 'key',
            case when item.value ->> 'key' = any (private.system_consent_keys()) then item.value ->> 'key' end,
            item.value -> 'name', item.value -> 'body', coalesce((item.value ->> 'is_archived')::boolean, false),
            case when item.value ->> 'key' = any (private.system_consent_keys()) then null else p_actor end)
    on conflict (org_id, key) do update
      set name = excluded.name, body = excluded.body, is_archived = excluded.is_archived, updated_at = now();
  end loop;
  for item in select value from jsonb_array_elements(private.json_array_or_empty(p_document -> 'consent_placements')) loop
    placed_screen := item.value ->> 'screen_key';
    if private.is_uuid_text(placed_screen) then
      placed_screen := screen_map ->> placed_screen;
      if placed_screen is null then
        raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a consent names a screen that is not in the file';
      end if;
    end if;
    select id into new_id from public.consents
     where org_id = p_org_id and key = item.value ->> 'consent_key' and not is_archived;
    if new_id is null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a consent placement names a consent that is not in the file';
    end if;
    insert into public.consent_placements (org_id, consent_id, surface, screen_key, sort_order, required)
    values (p_org_id, new_id, 'onboarding', placed_screen, coalesce((item.value ->> 'sort_order')::integer, 0),
            coalesce((item.value ->> 'required')::boolean, false)
              and item.value ->> 'consent_key' <> 'image_rights')
    on conflict (consent_id, surface, custom_form_id) do nothing;
  end loop;
  -- A file from before the split places the first parts only.
  perform private.place_system_field_parts(p_org_id);

  for item in
    select value from jsonb_array_elements(document -> 'fields')
     where private.json_value_or_null(value -> 'show_when_field_id') is not null
  loop
    if field_map ->> (item.value ->> 'show_when_field_id') is null
       or option_map ->> (item.value ->> 'show_when_option_id') is null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a condition names a question or option that is not in the file';
    end if;
    update public.profile_fields
       set show_when_field_id = (field_map ->> (item.value ->> 'show_when_field_id'))::uuid,
           show_when_option_id = (option_map ->> (item.value ->> 'show_when_option_id'))::uuid
     where id = (field_map ->> (item.value ->> 'id'))::uuid;
  end loop;

  -- An older file's required list, then its wording, hiding and option
  -- changes of the app's questions, land on their fields and placements
  -- (RAPP-666). A hide counts only while the question is optional.
  for item in select value from jsonb_array_elements(p_document -> 'required_questions') loop
    if not (item.value ->> 'question' = any (private.wizard_intake_questions())) then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a required question this app does not know';
    end if;
    if jsonb_typeof(item.value -> 'is_required') is distinct from 'boolean' then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: the file is incomplete or damaged';
    end if;
    continue when item.value ->> 'question' = any (private.locked_required_intake_questions());
    perform private.set_app_question_required(p_org_id, item.value ->> 'question', (item.value ->> 'is_required')::boolean);
  end loop;
  for item in select value from jsonb_array_elements(p_document -> 'builtin_question_overrides') loop
    if not (item.value ->> 'question' = any (private.wizard_intake_questions())) then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a change to an app question this app does not know';
    end if;
    perform private.fold_app_option_overrides(
      p_org_id, item.value ->> 'question', private.json_value_or_null(item.value -> 'option_overrides'));
    if coalesce((item.value ->> 'is_hidden')::boolean, false)
       and not (item.value ->> 'question' = any (private.required_intake_questions(p_org_id))) then
      perform private.set_app_question_hidden(p_org_id, item.value ->> 'question', true);
    end if;
    perform private.set_app_question_wording(
      p_org_id, item.value ->> 'question',
      private.json_value_or_null(item.value -> 'label'), private.json_value_or_null(item.value -> 'help'));
  end loop;

  -- The app screens' wording.
  insert into public.intake_builtin_screens (org_id, screen, texts, is_hidden, updated_by)
  select p_org_id, b ->> 'screen', coalesce(private.json_value_or_null(b -> 'texts'), '{}'::jsonb),
         coalesce((b ->> 'is_hidden')::boolean, false), p_actor
    from jsonb_array_elements(p_document -> 'builtin_screens') b;

  -- The flow order, staff screens remapped.
  if jsonb_typeof(document -> 'flow_order') = 'array' then
    select array_agg(
             case when step.value like 'custom:%' then 'custom:' || (screen_map ->> substr(step.value, 8))
                  else step.value end
             order by step.ordinality)
      into steps
      from jsonb_array_elements_text(document -> 'flow_order') with ordinality as step(value, ordinality);
    -- The same checks as save_intake_flow_order (pending fix 31), on the
    -- screens just created with the file's archived flags.
    flow_problem := private.intake_flow_order_problem(p_org_id, coalesce(steps, array[]::text[]));
    if flow_problem is not null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: ' || case flow_problem
        when 'too_many' then 'the flow order has more than 200 steps'
        when 'repeated' then 'the flow order names a step twice'
        when 'fixed_end' then 'the summary, the terms and the authorization always end the onboarding'
        when 'archived_screen' then 'the flow order names an archived screen'
        else 'the flow order names a step that is not in the file' end;
    end if;
    if cardinality(steps) > 0 then
      insert into public.intake_flow_orders (org_id, step_order, updated_by) values (p_org_id, steps, p_actor);
    end if;
  end if;

  -- A screen that asks something required or holds a signature shows (RAPP-711).
  update public.intake_screens s set is_hidden = false
   where s.org_id = p_org_id and s.is_hidden
     and private.screen_must_show(p_org_id, 'onboarding', s.id::text);

  -- Presets and the document step note.
  if exists (
    select 1 from jsonb_array_elements(p_document -> 'presets') p
     where jsonb_typeof(p -> 'states') is distinct from 'object'
        or exists (select 1 from jsonb_each_text(p -> 'states') entry
                    where not (entry.key = any (private.wizard_intake_questions()))
                       or entry.value not in ('ask', 'skip'))
  ) then
    raise check_violation using message = 'ONBOARDING_SETUP/MALFORMED: a preset sets ask or skip on wizard questions';
  end if;
  insert into public.intake_state_presets (org_id, name, states, created_by)
  select p_org_id, btrim(p ->> 'name'), p -> 'states', p_actor
    from jsonb_array_elements(p_document -> 'presets') p;

  update public.organizations
     set document_step_explanation = private.json_value_or_null(p_document -> 'document_step_explanation')
   where id = p_org_id;

  -- The legal texts: drafts only, through the draft functions that validate them.
  if (legal -> 'app_terms' ->> 'imported')::boolean then
    perform public.save_app_terms_draft(legal -> 'app_terms' -> 'content');
  end if;
  if (legal -> 'authorization' ->> 'imported')::boolean then
    perform public.save_authorization_draft(legal -> 'authorization' -> 'content');
  end if;

  return jsonb_build_object(
    'counts', private.onboarding_setup_import_counts(p_document),
    'legal', jsonb_build_object(
      'app_terms', (legal -> 'app_terms') - 'content',
      'authorization', (legal -> 'authorization') - 'content'));
end;
$function$;

