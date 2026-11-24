-- Remove the activity sign-up questions (RAPP-968).
--
-- WHY
--
-- Fabián, 2026-11-24, after seeing them in the dashboard on staging: the
-- sign-up questions read as one more kind of form next to Enquestes, Altres
-- formularis, the legal forms, Onboarding and the entity form, and nobody
-- asked for them. They come out. The forms of the dashboard stay the ones he
-- named.
--
-- WHAT THIS MIGRATION DOES
--
-- It undoes `20261124220000_signup_form_on_the_engine.sql`, which is applied
-- on staging and so stays in the history:
--   1. every sign-up form goes, with its screens and its own questions (their
--      fields cascade with the form);
--   2. its triggers, functions, index and constraint go, and the form kinds
--      are again legal, other and survey;
--   3. `event_signups.answers_encrypted` goes. No sign-up holds an answer:
--      the phone never sent one;
--   4. the functions it changed are back as `20261124180000` left them.
--      `private.form_answers_kept`, the answer check it took out of the
--      suggestions and mentoring forms, stays: both use it.
-- A player still signs up with "Hi aniré", as installed builds always did.

-- 1. The triggers that keep a sign-up form, then the forms ----------------------------------------------

drop trigger custom_forms_signup_stays on public.custom_forms;
drop trigger events_archive_signup_form on public.events;
drop trigger event_signups_again_clears_answers on public.event_signups;

delete from public.custom_forms where kind = 'signup';

-- 2. What made a sign-up form ---------------------------------------------------------------------------

drop function public.open_event_signup_form(uuid);
drop function public.event_signup_form(uuid);
drop function public.sign_up_for_event(uuid, jsonb);
drop function public.event_signup_answers(uuid);
drop function private.event_she_signs_up_for(uuid);
drop function private.signup_form_stays();
drop function private.archive_signup_form_of_deleted_event();
drop function private.signup_again_clears_answers();

drop index public.custom_forms_one_signup_form_per_event;
alter table public.custom_forms drop constraint custom_forms_signup_form_shape;
alter table public.custom_forms drop constraint custom_forms_kind_check;
alter table public.custom_forms
  add constraint custom_forms_kind_check check (kind in ('legal', 'other', 'survey'));
alter table public.custom_forms drop constraint custom_forms_survey_only_settings;
alter table public.custom_forms
  add constraint custom_forms_survey_only_settings check (
    kind = 'survey' or (event_id is null and closes_at is null));

-- 3. Her answers at sign-up ------------------------------------------------------------------------------

alter table public.event_signups drop constraint event_signups_answers_encrypted_check;
alter table public.event_signups drop column answers_encrypted;

-- 4. The functions as 20261124180000 left them --------------------------------------------------------------

create or replace function private.on_demand_form_key(p_form_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select f.system_key from public.custom_forms f
   where f.id = p_form_id and f.system_key = any (private.on_demand_form_keys());
$$;

create or replace function private.on_demand_form_name(p_system_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_system_key when 'feedback' then 'the suggestions form'
                           when 'mentoring' then 'the mentoring form' end;
$$;

CREATE OR REPLACE FUNCTION private.write_profile_field(p_org_id uuid, p_id uuid, p_section_id uuid, p_type text, p_label jsonb, p_help jsonb, p_privacy text, p_default_required boolean, p_options jsonb, p_settings jsonb, p_survey_form_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  existing public.profile_fields;
  saved public.profile_fields;
  saved_id uuid;
  is_choice boolean := p_type in ('single_choice', 'multiple_choice', 'search_choice');
  clean_settings jsonb := coalesce(nullif(p_settings, 'null'::jsonb), '{}'::jsonb);
  options jsonb := coalesce(nullif(p_options, 'null'::jsonb), '[]'::jsonb);
  option_item jsonb;
  position_index integer := 0;
  kept_ids uuid[] := '{}';
  option_id uuid;
  creator uuid := (select auth.uid());
  conditions_cleared integer := 0;
  change jsonb;
begin
  -- A survey's question belongs to its survey and no section (RAPP-929); so
  -- does a question of the suggestions form (RAPP-939) and of the mentoring
  -- form (RAPP-940).
  if p_survey_form_id is not null
     and not exists (select 1 from public.custom_forms f
                      where f.id = p_survey_form_id and f.org_id = p_org_id
                        and (f.kind = 'survey' or f.system_key = any (private.on_demand_form_keys()))) then
    raise no_data_found using message = 'no such survey';
  end if;
  if p_section_id is not null
     and not exists (select 1 from public.profile_sections where id = p_section_id and org_id = p_org_id) then
    raise no_data_found using message = 'no such section';
  end if;
  if not private.catalan_text_valid(p_label) then
    raise check_violation using message = 'a question needs a label in Catalan';
  end if;
  if nullif(p_help, 'null'::jsonb) is not null and not private.localized_text_valid(p_help) then
    raise check_violation using message = 'the help is text in the five languages';
  end if;

  if p_id is not null then
    select * into existing from public.profile_fields where id = p_id and org_id = p_org_id for update;
    if existing.id is null then
      raise no_data_found using message = 'no such question';
    end if;
  end if;

  if not (p_type = any (private.custom_question_types())) then
    raise check_violation using message = 'not a question type';
  end if;
  if p_type = 'rating' and coalesce(p_survey_form_id, existing.survey_form_id) is null then
    raise check_violation using message = 'a rating is asked on a survey only';
  end if;
  if p_privacy is null or p_privacy not in ('normal', 'personal', 'sensitive') then
    raise check_violation using message = 'the privacy level is normal, personal or sensitive';
  end if;
  if not private.custom_question_settings_valid(p_type, clean_settings) then
    raise check_violation using message = 'the settings do not fit the type';
  end if;
  if jsonb_typeof(options) <> 'array' then
    raise check_violation using message = 'options must be a list';
  end if;
  if is_choice and jsonb_array_length(options) < 2 then
    raise check_violation using message = 'a choice question needs at least two options';
  end if;
  if not is_choice and jsonb_array_length(options) > 0 then
    raise check_violation using message = 'only a choice question has options';
  end if;
  if jsonb_array_length(options) > (case when p_type = 'search_choice' then 500 else 60 end) then
    raise check_violation using message = 'too many options';
  end if;
  -- A file or a consent she signs is hers to give: it never goes on the entity form.
  if p_id is not null and private.field_is_hers_only(p_type, clean_settings)
     and exists (select 1 from public.field_placements where field_id = p_id and surface = 'entity_form') then
    raise check_violation using message = 'a file or a signature is asked of her only';
  end if;

  if p_id is null then
    if p_section_id is null and p_survey_form_id is null then
      raise no_data_found using message = 'no such section';
    end if;
    insert into public.profile_fields (
      org_id, section_id, kind, survey_form_id, question_type, label, help, privacy, default_required,
      settings, sort_order, created_by)
    values (
      p_org_id, case when p_survey_form_id is null then p_section_id end,
      case when p_survey_form_id is null then 'custom' else 'survey' end, p_survey_form_id,
      p_type, p_label, nullif(p_help, 'null'::jsonb), p_privacy,
      coalesce(p_default_required, false), clean_settings,
      case when p_survey_form_id is null
           then coalesce((select max(f.sort_order) + 1 from public.profile_fields f where f.section_id = p_section_id), 0)
           else coalesce((select max(f.sort_order) + 1 from public.profile_fields f where f.survey_form_id = p_survey_form_id), 0) end,
      case when exists (select 1 from public.profiles where id = creator) then creator end)
    returning id into saved_id;
  else
    -- A one-choice field that stops being one frees the fields that opened on its options.
    if existing.question_type = 'single_choice' and p_type <> 'single_choice' then
      update public.profile_fields
         set show_when_field_id = null, show_when_option_id = null, updated_at = now()
       where show_when_field_id = p_id;
      get diagnostics conditions_cleared = row_count;
    end if;
    update public.profile_fields
       set label = p_label, help = nullif(p_help, 'null'::jsonb), question_type = p_type, privacy = p_privacy,
           settings = clean_settings,
           -- An app field's required default follows the app's required list.
           default_required = case when kind = 'builtin' then default_required
                                   else coalesce(p_default_required, default_required) end,
           section_id = case when kind = 'survey' then null else coalesce(p_section_id, section_id) end,
           sort_order = case when p_section_id is null or p_section_id = section_id then sort_order
                             else coalesce((select max(f.sort_order) + 1 from public.profile_fields f
                                             where f.section_id = p_section_id), 0) end,
           is_archived = false, updated_at = now()
     where id = p_id;
    saved_id := p_id;
  end if;

  for option_item in select value from jsonb_array_elements(options) loop
    if not private.catalan_text_valid(option_item -> 'label') then
      raise check_violation using message = 'every option needs a label in Catalan';
    end if;
    option_id := nullif(option_item ->> 'id', '')::uuid;
    if option_id is not null then
      update public.custom_question_options
         set label = option_item -> 'label', sort_order = position_index, is_archived = false
       where id = option_id and question_id = saved_id;
      if not found then
        raise no_data_found using message = 'no such option';
      end if;
    else
      insert into public.custom_question_options (org_id, question_id, label, sort_order)
      values (p_org_id, saved_id, option_item -> 'label', position_index)
      returning id into option_id;
    end if;
    kept_ids := kept_ids || option_id;
    position_index := position_index + 1;
  end loop;
  update public.custom_question_options
     set is_archived = true
   where question_id = saved_id and not (id = any (kept_ids)) and not is_archived;

  -- Her answers follow the field, in this transaction (D8).
  if p_id is not null and (existing.question_type <> p_type or existing.privacy <> p_privacy) then
    select * into saved from public.profile_fields where id = p_id;
    change := private.apply_field_change(existing, saved)
              || jsonb_build_object('conditions_cleared', conditions_cleared);
    if (change ->> 'answers')::integer > 0 or conditions_cleared > 0 then
      insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
      values (p_org_id, creator, 'intake.field_change', 'profile_field', p_id, change);
    end if;
  end if;

  return saved_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_survey_question(p_id uuid, p_screen_id uuid, p_type text, p_label jsonb, p_help jsonb, p_required boolean DEFAULT false, p_options jsonb DEFAULT '[]'::jsonb, p_settings jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := private.require_question_builder();
  form_id uuid := private.custom_form_of_screen(actor_org, p_screen_id::text);
  saved_id uuid;
begin
  if form_id is null
     -- The suggestions form (RAPP-939) and the mentoring form (RAPP-940) add
     -- their questions the same way.
     or not exists (select 1 from public.custom_forms f
                     where f.id = form_id
                       and (f.kind = 'survey' or f.system_key = any (private.on_demand_form_keys()))) then
    raise no_data_found using message = 'no such survey screen';
  end if;
  if p_id is not null
     and not exists (select 1 from public.profile_fields f
                      where f.id = p_id and f.org_id = actor_org and f.survey_form_id = form_id) then
    raise no_data_found using message = 'no such survey question';
  end if;
  saved_id := private.write_profile_field(
    actor_org, p_id, null, p_type, p_label, p_help, 'normal', p_required, p_options, p_settings, form_id);
  if p_id is null then
    perform public.place_field(saved_id, 'custom_form', p_screen_id::text, coalesce(p_required, false));
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'survey.question_save', 'profile_field', saved_id,
          jsonb_build_object('survey', form_id, 'type', p_type));
  return saved_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.intake_catalog_core(p_with_surveys boolean)
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
  reads_team_forms boolean := with_archived or (select public.has_permission('participants.view'))
    -- The survey builder reads its surveys' drafts (RAPP-929).
    or (p_with_surveys and (select public.has_permission('surveys.results')));
  forms_shown uuid[];
  forms_json jsonb;
  -- The forms she sends when she wants, sent apart to the dashboard by key
  -- (`feedback_form` RAPP-939, `mentoring_form` RAPP-940).
  on_demand_json jsonb;
  form_placements_json jsonb;
  form_blocks_json jsonb;
  form_consents_json jsonb;
  -- The old Health screen an older build draws: the questions of the
  -- authorization she is shown (RAPP-773). Designers read the form itself.
  old_health_json jsonb := case when with_archived then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', private.stable_uuid((x.p ->> 'id') || ':authorization'), 'field_id', x.p -> 'field_id',
             'surface', 'authorization', 'screen_key', null, 'sort_order', x.place,
             'required', x.p -> 'required', 'label_override', x.p -> 'label_override',
             'help_override', x.p -> 'help_override')
           order by x.place)
      from (select value as p, row_number() over (order by (value ->> 'sort_order')::integer) - 1 as place
              from jsonb_array_elements(coalesce(
                     private.authorization_snapshot_for(actor_org, (select auth.uid())) -> 'placements',
                     '[]'::jsonb))) x
      join public.profile_fields f on f.id = (x.p ->> 'field_id')::uuid and not f.is_archived), '[]'::jsonb) end;
  -- The entity form as an older build reads it (RAPP-938): one order across its screens.
  entity_places jsonb := coalesce((
    select jsonb_object_agg(o.id::text, o.place) from private.entity_form_order(actor_org) o), '{}'::jsonb);
begin
  if (select auth.uid()) is null or actor_org is null then
    raise insufficient_privilege using message = 'the question catalog needs an account';
  end if;
  if reads_team_forms then
    -- The team reads each form's draft, and designers its published versions.
    select coalesce(array_agg(f.id), array[]::uuid[]) into forms_shown
      from public.custom_forms f
     where f.org_id = actor_org and (with_archived or not f.is_archived)
       -- Surveys only for the dashboard that asks for them (RAPP-929).
       and (p_with_surveys or f.kind <> 'survey')
       -- The referral form is sent as `entity_form` (RAPP-938): an older build lists these.
       and f.system_key is distinct from 'entity_referral'
       -- The suggestions and mentoring forms only for the dashboard that asks
       -- for them (RAPP-939, RAPP-940).
       and (p_with_surveys or f.system_key is null
            or not (f.system_key = any (private.on_demand_form_keys())));
    forms_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'filled_by', f.filled_by, 'mandatory', f.mandatory,
        'deadline', f.deadline,
        -- A survey's activity and closing time (RAPP-929).
        'event_id', f.event_id, 'closes_at', f.closes_at,
        -- What an older build reads (RAPP-700).
        'appears', case when f.audience = 'chosen' then 'sent'
                        when f.repeats_each_season then 'every_season' else 'once' end,
        'audience', f.audience, 'repeats_each_season', f.repeats_each_season,
        -- Legal or other, and the app's own legal forms (RAPP-771).
        'kind', f.kind, 'system_key', f.system_key,
        'recipient_count', (select count(*) from public.custom_form_recipients r where r.form_id = f.id),
        'version', f.version, 'published_at', f.published_at, 'is_archived', f.is_archived,
        'versions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'version', v.version, 'season_id', v.season_id, 'is_correction', v.is_correction,
            'published_at', v.published_at) order by v.version desc)
            from public.custom_form_versions v where v.form_id = f.id and f.system_key is null), '[]'::jsonb)
          -- The app terms' versions are their ledger's (RAPP-772).
          || coalesce((
          select jsonb_agg(jsonb_build_object(
            'version', v.version_number, 'season_id', null, 'is_correction', v.is_correction,
            'published_at', v.published_at) order by v.version_number desc)
            from public.app_terms_versions v
           where f.system_key = 'app_terms' and v.org_id = f.org_id and v.published_at is not null), '[]'::jsonb)
          -- The authorization's are its ledger's, numbered per season (RAPP-773).
          || coalesce((
          select jsonb_agg(jsonb_build_object(
            'version', v.version_number, 'season_id', v.season_id, 'is_correction', v.is_correction,
            'published_at', v.published_at) order by v.published_at desc, v.version_number desc)
            from public.authorization_versions v
           where f.system_key = 'season_authorization' and v.org_id = f.org_id
             and v.published_at is not null), '[]'::jsonb),
        'screens', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', s.id, 'title', s.title, 'intro', s.intro, 'sort_order', s.sort_order,
            'is_hidden', s.is_hidden,
            -- The answer that opens it (RAPP-715); null: it always shows.
            'show_when_field_id', s.show_when_field_id, 'show_when_values', to_jsonb(s.show_when_values),
            -- Its help line and buttons, and its locked part (RAPP-771).
            'texts', s.texts, 'system_screen', s.system_screen,
            -- The season documents (RAPP-773).
            'attachments', s.attachments)
            order by s.sort_order, s.created_at)
            from public.custom_form_screens s
           where s.form_id = f.id and not s.is_archived), '[]'::jsonb))
        order by f.created_at, f.id)
        from public.custom_forms f where f.id = any (forms_shown)), '[]'::jsonb);
    -- The forms she sends when she wants go apart (RAPP-939, RAPP-940): a
    -- list of forms never shows them.
    on_demand_json := (
      select jsonb_object_agg(k.key || '_form', (
               select e from jsonb_array_elements(forms_json) e where e ->> 'system_key' = k.key limit 1))
        from unnest(private.on_demand_form_keys()) k(key));
    forms_json := coalesce((
      select jsonb_agg(x.e order by x.n) from jsonb_array_elements(forms_json) with ordinality x(e, n)
       where x.e ->> 'system_key' is null
          or not (x.e ->> 'system_key' = any (private.on_demand_form_keys()))), '[]'::jsonb);
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
        'kind', b.kind, 'body', b.body, 'title', b.title, 'points', b.points,
        -- A legal form's own signature and its texts (RAPP-773).
        'settings', b.settings, 'sort_order', b.sort_order)
        order by b.screen_key, b.sort_order, b.created_at)
        from public.form_blocks b
       where b.surface = 'custom_form' and b.custom_form_id = any (forms_shown)), '[]'::jsonb);
    form_consents_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'consent_id', p.consent_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'custom_form_id', p.custom_form_id, 'sort_order', p.sort_order, 'required', p.required,
        -- The form's own wording of the consent (RAPP-771).
        'body_override', p.body_override)
        order by p.screen_key, p.sort_order, p.created_at)
        from public.consent_placements p
        join public.consents c on c.id = p.consent_id and not c.is_archived
       where p.surface = 'custom_form' and p.custom_form_id = any (forms_shown)), '[]'::jsonb);
  else
    -- She reads the published version of each live form she fills in
    -- (RAPP-701); a test player the draft of a legal form (RAPP-771).
    with live as (
      select f.id, f.audience, f.repeats_each_season, f.published_at, f.kind, f.system_key, v.version, v.content
        from public.custom_forms f
        cross join lateral private.custom_form_version_for(f.id, (select auth.uid())) v
       where f.org_id = actor_org and f.filled_by = 'player' and not f.is_archived
         and f.system_key is null
         -- A survey reaches her through my_surveys, never the catalog (RAPP-929).
         and f.kind <> 'survey'
      union all
      -- The terms form as the version she is shown holds it (RAPP-772).
      select f.id, f.audience, f.repeats_each_season, f.published_at, f.kind, f.system_key,
             coalesce(v.version_number, (select coalesce(max(x.version_number), 0) + 1
                                           from public.app_terms_versions x where x.org_id = f.org_id)),
             private.app_terms_version_snapshot(v)
        from public.custom_forms f
        cross join lateral private.app_terms_version_for(f.org_id, (select auth.uid())) v
       where f.org_id = actor_org and f.system_key = 'app_terms' and v.id is not null
         and private.app_terms_version_snapshot(v) is not null
      union all
      -- The authorization form as the version she is shown holds it (RAPP-773).
      select f.id, f.audience, f.repeats_each_season, f.published_at, f.kind, f.system_key,
             coalesce(v.version_number, (select coalesce(max(x.version_number), 0) + 1
                                           from public.authorization_versions x where x.season_id = v.season_id)),
             private.authorization_version_snapshot(v)
        from public.custom_forms f
        cross join lateral private.authorization_version_for(f.org_id, (select auth.uid())) v
       where f.org_id = actor_org and f.system_key = 'season_authorization' and v.id is not null
         and private.authorization_version_snapshot(v) is not null)
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'name', l.content -> 'name', 'filled_by', 'player',
        'mandatory', l.content ->> 'mandatory', 'deadline', l.content -> 'deadline',
        'appears', case when l.audience = 'chosen' then 'sent'
                        when l.repeats_each_season then 'every_season' else 'once' end,
        'audience', l.audience, 'repeats_each_season', l.repeats_each_season,
        'kind', l.kind, 'system_key', l.system_key,
        'version', l.version, 'published_at', l.published_at, 'is_archived', false,
        'screens', l.content -> 'screens')), '[]'::jsonb),
      coalesce((
        select jsonb_agg(p || jsonb_build_object('surface', 'custom_form', 'custom_form_id', l2.id))
          from live l2
          cross join lateral jsonb_array_elements(l2.content -> 'placements') p
          join public.profile_fields f on f.id = (p ->> 'field_id')::uuid and not f.is_archived), '[]'::jsonb),
      coalesce((
        -- A version published before RAPP-770 names no kind: its blocks are signatures.
        select jsonb_agg(b || jsonb_build_object('surface', 'custom_form', 'custom_form_id', l2.id,
                                                 'kind', coalesce(b ->> 'kind', 'signature')))
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
        'sort_order', s.sort_order, 'is_archived', s.is_archived, 'is_hidden', s.is_hidden,
            -- The answer that opens it (RAPP-715); null: it always shows.
            'show_when_field_id', s.show_when_field_id, 'show_when_values', to_jsonb(s.show_when_values),
            -- Its help line and buttons (RAPP-771).
            'texts', s.texts)
        order by array_position(private.intake_builtin_screens(), s.after_screen), s.sort_order, s.created_at)
        from public.intake_screens s
       where s.org_id = actor_org and (with_archived or not s.is_archived)), '[]'::jsonb),
    -- The app's questions as staff worded or hid them (RAPP-666).
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
    'builtin_screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'screen', b.screen, 'texts', b.texts,
        'is_deleted', b.is_deleted,
        'is_hidden', b.is_deleted or (b.is_hidden and private.builtin_screen_hideable(b.screen)))
        order by b.screen)
        from public.intake_builtin_screens b where b.org_id = actor_org), '[]'::jsonb),
    -- The wizard steps as staff arranged them (RAPP-612); null is the app's order.
    'flow_order', (
      select to_jsonb(f.step_order) from public.intake_flow_orders f where f.org_id = actor_org),
    -- The built-in questions that need an answer (RAPP-611).
    'required_questions', to_jsonb(private.required_intake_questions(actor_org)),
    -- The app terms she accepts (RAPP-613, RAPP-772).
    'terms', (
      select jsonb_build_object('id', v.id, 'version_number', v.version_number,
                                'content', private.app_terms_version_content(v),
                                'is_draft', v.published_at is null,
                                'form_id', private.app_terms_form_id(actor_org),
                                'legacy_compatible', private.app_terms_version_compatible(v))
        from private.app_terms_version_for(actor_org, (select auth.uid())) v
       where v.id is not null),
    -- The profile layout (RAPP-649): sections, fields and where each is asked.
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'key', s.key, 'title', s.title, 'sort_order', s.sort_order, 'is_builtin', s.is_builtin)
        order by s.sort_order, s.created_at)
        from public.profile_sections s where s.org_id = actor_org), '[]'::jsonb),
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'section_id', f.section_id, 'kind', f.kind, 'survey_form_id', f.survey_form_id, 'system_key', f.system_key,
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
       where f.org_id = actor_org and (with_archived or not f.is_archived)
         -- A survey's questions only for the dashboard that asks for them (RAPP-929).
         and (p_with_surveys or f.kind <> 'survey')), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'field_id', p.field_id, 'surface', p.surface,
        -- The entity form as an older build reads it: no screen, one order (RAPP-938).
        'screen_key', case when p.surface = 'entity_form' then null else p.screen_key end,
        'sort_order', case when p.surface = 'entity_form'
                           then coalesce((entity_places ->> p.id::text)::integer, p.sort_order)
                           else p.sort_order end,
        'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.surface, p.screen_key, p.sort_order, p.created_at)
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id
       where p.org_id = actor_org and p.surface <> 'custom_form'
         and (with_archived or not f.is_archived)), '[]'::jsonb) || old_health_json,
    -- The blocks of each screen and of the entity form (RAPP-690).
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'surface', b.surface,
        'screen_key', case when b.surface = 'entity_form' then null else b.screen_key end,
        'kind', b.kind, 'body', b.body, 'title', b.title, 'points', b.points,
        'sort_order', case when b.surface = 'entity_form'
                           then coalesce((entity_places ->> b.id::text)::integer, b.sort_order)
                           else b.sort_order end)
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
    'custom_form_consent_placements', form_consents_json,
    -- The referral form (RAPP-938): its screens and the screen of each of its
    -- fields and blocks, by id. An older build drops this key.
    'entity_form', (
      select jsonb_build_object(
        'id', f.id, 'name', f.name,
        'screens', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', s.id, 'title', s.title, 'intro', s.intro, 'sort_order', s.sort_order, 'texts', s.texts)
            order by s.sort_order, s.created_at)
            from public.custom_form_screens s
           where s.form_id = f.id and not s.is_archived), '[]'::jsonb),
        'items', coalesce((
          select jsonb_agg(jsonb_build_object('id', i.id, 'screen_key', i.screen_key))
            from (select p.id, p.screen_key from public.field_placements p
                   where p.org_id = actor_org and p.surface = 'entity_form'
                  union all
                  select b.id, b.screen_key from public.form_blocks b
                   where b.org_id = actor_org and b.surface = 'entity_form') i), '[]'::jsonb))
        from public.custom_forms f
       where f.org_id = actor_org and f.system_key = 'entity_referral')
  )
  -- The suggestions form (RAPP-939) and the mentoring form (RAPP-940), for the
  -- dashboard only, as `feedback_form` and `mentoring_form`: their screens are
  -- in a form's own shape and their questions among the fields and form placements.
  || case when p_with_surveys
          then coalesce(on_demand_json, jsonb_build_object('feedback_form', null, 'mentoring_form', null))
          else '{}'::jsonb end;
end;
$function$;
