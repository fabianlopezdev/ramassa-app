-- RAPP-698 (follow-up): her health answer needs the health permission again.
--
-- WHY
--
-- Before RAPP-698 her health answer was read only with
-- participants.view_health. As a Sensible field it was read with
-- participants.view_sensitive, which the Staff preset holds. Fabián,
-- 2026-10-26: keep health readable only by people with the health permission,
-- as before.
--
-- WHAT THIS MIGRATION DOES
--
--   1. `profile_fields.read_permission`: a permission a reader needs on top
--      of the field's privacy level. Only participants.view_health is
--      allowed. The health field gets it; it stays when staff change the
--      field's privacy, type or wording, because nothing but this migration
--      writes it.
--   2. `private.reads_field(profile, field)`: the field's privacy level, and
--      its read permission when it has one. Every answer reader uses it: her
--      page and her record, the season answers, the referral answers, the
--      coach app (the same functions).
--   3. The search index never holds such an answer, an export holds it only
--      for someone with the permission, and a file answer opens only for them.
--   4. The privacy-change preview (RAPP-692) counts the people and roles who
--      hold the read permission too.
--   5. The catalog sends it, so the field dialog says who reads the field.
--
-- Writing is not affected: whoever could write her health still can.
--
-- Docs: https://www.postgresql.org/docs/current/sql-altertable.html and
-- https://supabase.com/docs/guides/database/postgres/row-level-security
-- (security definer functions with an empty search path, checks inside).

-- 1. The field's read permission ------------------------------------------------------------------------

alter table public.profile_fields
  add column read_permission text
    check (read_permission is null or read_permission = 'participants.view_health');
comment on column public.profile_fields.read_permission is
  'A permission a reader needs on top of the privacy level (RAPP-698): participants.view_health on her health answer. Set by migrations only.';

update public.profile_fields
   set read_permission = 'participants.view_health'
 where system_key = 'health_info' and kind = 'custom';

-- A new organization's health field gets it too. The body of the latest
-- `seed_authorization_fields`.
CREATE OR REPLACE FUNCTION private.seed_authorization_fields(p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  questions jsonb := coalesce(
    (private.current_authorization_version(p_org_id)).content -> 'questions',
    '{"health": {"asked": true, "required": true},
      "emergency_contact": {"asked": true, "required": false}}'::jsonb);
begin
  insert into public.profile_fields (
    org_id, section_id, kind, system_key, question_type, label, privacy, default_required, sort_order)
  select p_org_id, s.id, 'custom', d.system_key, d.question_type, d.label, 'sensitive', false,
         coalesce((select max(f.sort_order) + 1 from public.profile_fields f where f.section_id = s.id), 0)
           + d.position
    from (values
      ('health_info', 'health_needs', 'long_text', 0,
       '{"ca": "Tens alguna malaltia, al·lèrgia, discapacitat, lesió o tractament mèdic rellevant?", "es": "¿Tienes alguna enfermedad, alergia, discapacidad, lesión o tratamiento médico relevante?", "en": "Do you have any relevant illness, allergy, disability, injury or medical treatment?", "ar": "هل لديكِ أي مرض أو حساسية أو إعاقة أو إصابة أو علاج طبي مهم؟", "fa": "آیا بیماری، حساسیت، معلولیت، آسیب یا درمان پزشکی مهمی دارید؟"}'::jsonb),
      ('emergency_contact_name', 'contact', 'short_text', 0,
       '{"ca": "Contacte d''emergència: nom", "es": "Contacto de emergencia: nombre", "en": "Emergency contact: name", "ar": "جهة اتصال للطوارئ: الاسم", "fa": "تماس اضطراری: نام"}'::jsonb),
      ('emergency_contact_relation', 'contact', 'short_text', 1,
       '{"ca": "Contacte d''emergència: relació amb tu", "es": "Contacto de emergencia: relación contigo", "en": "Emergency contact: relationship to you", "ar": "جهة اتصال للطوارئ: صلته بكِ", "fa": "تماس اضطراری: نسبت با شما"}'::jsonb),
      ('emergency_contact_phone', 'contact', 'phone', 2,
       '{"ca": "Contacte d''emergència: telèfon", "es": "Contacto de emergencia: teléfono", "en": "Emergency contact: phone", "ar": "جهة اتصال للطوارئ: الهاتف", "fa": "تماس اضطراری: تلفن"}'::jsonb)
    ) as d(system_key, section_key, question_type, position, label)
    join public.profile_sections s on s.org_id = p_org_id and s.key = d.section_key
  on conflict (org_id, system_key) do nothing;

  -- Her health is read only with the health permission (RAPP-698).
  update public.profile_fields
     set read_permission = 'participants.view_health'
   where org_id = p_org_id and system_key = 'health_info' and kind = 'custom'
     and read_permission is null;

  -- Placed on the Health screen when the version asks them, required as it did.
  insert into public.field_placements (org_id, field_id, surface, sort_order, required)
  select p_org_id, f.id, 'authorization', d.position,
         coalesce((questions -> d.question ->> 'required')::boolean, false) and d.can_require
    from (values
      ('health_info', 'health', 0, true),
      ('emergency_contact_name', 'emergency_contact', 1, true),
      ('emergency_contact_relation', 'emergency_contact', 2, false),
      ('emergency_contact_phone', 'emergency_contact', 3, true)
    ) as d(system_key, question, position, can_require)
    join public.profile_fields f on f.org_id = p_org_id and f.system_key = d.system_key
   where coalesce((questions -> d.question ->> 'asked')::boolean, true)
  on conflict (field_id, surface) do nothing;
end;
$function$;

-- 2. Every answer reader --------------------------------------------------------------------------------

-- Whether the signed-in person reads this field's answers about her: its
-- privacy level, and its read permission when it has one.
create or replace function private.reads_field(p_profile_id uuid, p_field public.profile_fields)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.reads_privacy(p_profile_id, p_field.privacy)
     and (p_field.read_permission is null
          or coalesce(private.participant_permission(p_profile_id, p_field.read_permission), false));
$$;
revoke all on function private.reads_field(uuid, public.profile_fields) from public, anon, authenticated;

-- The body of the latest `field_answers_for`, reading through `reads_field`.
CREATE OR REPLACE FUNCTION private.field_answers_for(p_profile_id uuid, p_everything boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_object_agg(
           a.question_id::text, coalesce(a.value, (public.decrypt_field(a.value_encrypted))::jsonb)),
         '{}'::jsonb)
    from public.custom_answers a
    join public.profile_fields f on f.id = a.question_id
   where a.profile_id = p_profile_id
     and a.season_key = case when private.field_is_seasonal(f.id)
                             then private.current_season_id(f.org_id)
                             else '00000000-0000-0000-0000-000000000000'::uuid end
     and (p_everything or private.reads_field(p_profile_id, f));
$function$;

-- The body of the latest `participant_season_answers`, reading through `reads_field`.
CREATE OR REPLACE FUNCTION public.participant_season_answers(p_profile_id uuid)
 RETURNS TABLE(season_id uuid, season_name text, starts_on date, answers jsonb, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view')) then
    raise insufficient_privilege using message = 'her season answers need participants.view';
  end if;
  return query
    select s.id, s.name, s.starts_on,
           jsonb_object_agg(a.question_id::text,
                            coalesce(a.value, (public.decrypt_field(a.value_encrypted))::jsonb)),
           max(a.answered_at)
      from public.custom_answers a
      join public.profile_fields f on f.id = a.question_id
      join public.seasons s on s.id = a.season_id
     where a.profile_id = p_profile_id
       and a.org_id = (select public.current_org_id())
       and private.reads_field(p_profile_id, f)
     group by s.id, s.name, s.starts_on
     order by s.starts_on desc;
end;
$function$;

-- The body of the latest `participant_custom_answers`, reading through `reads_field`.
CREATE OR REPLACE FUNCTION public.participant_custom_answers(p_profile_id uuid)
 RETURNS TABLE(question_id uuid, season_id uuid, season_name text, value jsonb, source text, answered_at timestamp with time zone, answered_by_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := (select public.current_org_id());
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view')) then
    raise insufficient_privilege using message = 'her answers need participants.view';
  end if;
  return query
  select a.question_id, a.season_id, s.name,
         coalesce(a.value, (public.decrypt_field(a.value_encrypted))::jsonb),
         a.source, a.answered_at,
         private.answer_author_name(a.answered_by, a.source, actor_org)
    from public.custom_answers a
    join public.profile_fields f on f.id = a.question_id
    left join public.seasons s on s.id = a.season_id
   where a.profile_id = p_profile_id
     and a.org_id = actor_org
     and private.reads_field(p_profile_id, f)
   order by f.sort_order, s.starts_on desc nulls first;
end;
$function$;

-- The body of the latest `participant_profile_answers`, reading through `reads_field`.
CREATE OR REPLACE FUNCTION public.participant_profile_answers(p_profile_id uuid)
 RETURNS TABLE(field_id uuid, question text, source text, answered_at timestamp with time zone, answered_by_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := (select public.current_org_id());
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view')) then
    raise insufficient_privilege using message = 'her answers need participants.view';
  end if;
  return query
  select a.question_id,
         -- The app question the field belongs to; a staff field has none.
         private.system_key_question(f.system_key),
         a.source, a.answered_at,
         private.answer_author_name(a.answered_by, a.source, actor_org)
    from public.custom_answers a
    join public.profile_fields f on f.id = a.question_id
   where a.profile_id = p_profile_id
     and a.org_id = actor_org
     and a.season_key = case when private.field_is_seasonal(f.id)
                             then private.current_season_id(f.org_id)
                             else '00000000-0000-0000-0000-000000000000'::uuid end
     and private.reads_field(p_profile_id, f)
   order by f.sort_order, a.question_id;
end;
$function$;

-- The body of the latest `referral_answers_for`, reading through `reads_field`.
CREATE OR REPLACE FUNCTION private.referral_answers_for(p_referral_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_object_agg(r.question_id::text, (public.decrypt_field(r.value_encrypted))::jsonb), '{}'::jsonb)
    from public.entity_referrals referral
    join public.referral_custom_answers r on r.referral_id = referral.id
    join public.profile_fields f on f.id = r.question_id
   where referral.id = p_referral_id
     and referral.org_id = (select public.current_org_id())
     and (
       referral.collaborating_entity_id = (select public.current_collaborating_entity_id())
       or ((select public.has_permission('referrals.manage'))
           and private.reads_field(null, f))
     );
$function$;

-- 3. The search index never holds such an answer. The body of the latest
-- `participant_search_text`.
CREATE OR REPLACE FUNCTION private.participant_search_text(p_profile_id uuid, p_levels text[])
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- Her names are text answers here like any other (RAPP-693).
  select concat_ws(' ', (
    select string_agg(private.custom_answer_text(f, a.value), ' ' order by f.sort_order)
      from public.custom_answers a
      join public.profile_fields f on f.id = a.question_id
     where a.profile_id = p.id
       -- Only a stored value: a Sensitive answer is encrypted and never read here.
       and a.value is not null
       and f.privacy = any (p_levels)
       and f.privacy <> 'sensitive'
       -- Nor an answer that needs a read permission (RAPP-698).
       and f.read_permission is null
       and f.question_type in ('short_text', 'long_text', 'country', 'municipality', 'item_list')))
    from public.profiles p
   where p.id = p_profile_id;
$function$;

-- An export holds it only for someone with the permission. The body of the
-- latest `create_data_export`.
CREATE OR REPLACE FUNCTION public.create_data_export(p_dataset text, p_scope text, p_format text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_reason text DEFAULT NULL::text, p_confirmed boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    from public.authorization_consent_events event
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
$function$;

-- A file answer opens only for them. The body of the latest
-- `can_read_custom_answer_object`.
CREATE OR REPLACE FUNCTION public.can_read_custom_answer_object(p_object_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
  owner_id uuid;
  answer record;
begin
  if caller is null or p_object_key is null
     or split_part(p_object_key, '/', 2) <> 'intake-answers'
     or split_part(p_object_key, '/', 1) is distinct from (select public.current_org_id())::text then
    return false;
  end if;
  begin
    owner_id := split_part(p_object_key, '/', 3)::uuid;
  exception when others then
    return false;
  end;
  if owner_id = caller then
    return true;
  end if;
  for answer in
    select f.privacy, f.read_permission, coalesce(a.value, (public.decrypt_field(a.value_encrypted))::jsonb) as value
      from public.custom_answers a
      join public.profile_fields f on f.id = a.question_id
     where a.profile_id = owner_id and f.question_type = 'file_upload'
  loop
    if answer.value ->> 'key' = p_object_key then
      return (select private.participant_permission(owner_id,
        case answer.privacy
          when 'normal' then 'participants.view'
          when 'personal' then 'participants.view_personal'
          else 'participants.view_sensitive' end))
        and (answer.read_permission is null
             or (select private.participant_permission(owner_id, answer.read_permission)));
    end if;
  end loop;
  return false;
end;
$function$;

-- 4. The privacy-change preview counts the read permission ------------------------------------------------

-- The people who read before and not after, by role, among those who also
-- hold `p_also` when it is given (a field's read permission).
create or replace function private.readers_by_role(
  p_org_id uuid, p_reads text, p_not_reads text, p_also text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'role_id', role.id, 'builtin_key', role.builtin_key, 'name', role.name, 'people', grouped.people)
           order by role.id is null, role.builtin_key is null, role.builtin_key, role.name), '[]'::jsonb)
    from (
      select access.preset_id, count(*)::integer as people
        from public.profiles member
        left join public.team_member_access access on access.profile_id = member.id
       where member.org_id = p_org_id
         and p_reads is distinct from p_not_reads
         and private.profile_has_permission(member.id, p_reads)
         and not private.profile_has_permission(member.id, p_not_reads)
         and (p_also is null or private.profile_has_permission(member.id, p_also))
       group by access.preset_id
    ) grouped
    left join public.permission_presets role on role.id = grouped.preset_id;
$$;
revoke all on function private.readers_by_role(uuid, text, text, text) from public, anon, authenticated;

-- The body of the latest `preview_field_change`, counting only people who also
-- hold the field's read permission.
CREATE OR REPLACE FUNCTION public.preview_field_change(p_field_id uuid, p_type text, p_privacy text, p_options jsonb DEFAULT NULL::jsonb, p_settings jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := private.require_question_builder();
  field public.profile_fields;
  to_type text;
  to_privacy text;
  to_settings jsonb;
  options jsonb := '[]'::jsonb;
  type_changed boolean;
  answer record;
  plain jsonb;
  converted jsonb;
  total integer := 0;
  kept integer := 0;
  not_kept integer := 0;
  to_encrypt integer := 0;
  to_decrypt integer := 0;
  permission_before text;
  permission_after text;
begin
  select * into field from public.profile_fields where id = p_field_id and org_id = actor_org;
  if field.id is null then
    raise no_data_found using message = 'no such question';
  end if;
  to_type := coalesce(p_type, field.question_type);
  to_privacy := coalesce(p_privacy, field.privacy);
  if not (to_type = any (private.custom_question_types())) then
    raise check_violation using message = 'not a question type';
  end if;
  if to_privacy not in ('normal', 'personal', 'sensitive') then
    raise check_violation using message = 'the privacy level is normal, personal or sensitive';
  end if;
  type_changed := to_type <> field.question_type;
  to_settings := coalesce(nullif(p_settings, 'null'::jsonb),
                          case when type_changed then '{}'::jsonb else field.settings end);
  if to_type in ('single_choice', 'multiple_choice', 'search_choice') then
    if nullif(p_options, 'null'::jsonb) is null then
      options := private.field_options_json(field.id);
    elsif jsonb_typeof(p_options) <> 'array' then
      raise check_violation using message = 'options must be a list';
    else
      -- A saved option keeps its key, so an answer still matches it by key.
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', saved.id::text, 'key', saved.key, 'label', x.o -> 'label') order by x.position), '[]'::jsonb)
        into options
        from jsonb_array_elements(p_options) with ordinality as x(o, position)
        left join public.custom_question_options saved
          on saved.question_id = field.id and saved.id::text = x.o ->> 'id';
    end if;
  end if;

  for answer in
    select a.value, a.value_encrypted, false as is_referral
      from public.custom_answers a where a.question_id = field.id
    union all
    select null::jsonb, r.value_encrypted, true from public.referral_custom_answers r where r.question_id = field.id
  loop
    total := total + 1;
    if not type_changed then
      converted := '"kept"'::jsonb;
    else
      plain := coalesce(answer.value, public.decrypt_field(answer.value_encrypted)::jsonb);
      converted := private.converted_answer(field.question_type, plain, to_type, to_settings, options);
    end if;
    if converted is null then
      not_kept := not_kept + 1;
    else
      kept := kept + 1;
      if not answer.is_referral then
        if to_privacy = 'sensitive' and answer.value is not null then
          to_encrypt := to_encrypt + 1;
        elsif to_privacy <> 'sensitive' and answer.value_encrypted is not null then
          to_decrypt := to_decrypt + 1;
        end if;
      end if;
    end if;
  end loop;

  permission_before := private.privacy_permission(field.privacy);
  permission_after := private.privacy_permission(to_privacy);
  return jsonb_build_object(
    'type_from', field.question_type, 'type_to', to_type,
    'privacy_from', field.privacy, 'privacy_to', to_privacy,
    'answers', total, 'converted', kept, 'not_converted', not_kept,
    'to_encrypt', to_encrypt, 'to_decrypt', to_decrypt,
    'permission_before', permission_before, 'permission_after', permission_after,
    -- The permission a reader needs on top, whatever the privacy (RAPP-698).
    'read_permission', field.read_permission,
    -- Team members who will read these answers, or stop reading them.
    'readers_gaining', (
      select count(*) from public.profiles member
       where member.org_id = actor_org
         and private.profile_has_permission(member.id, permission_after)
         and not private.profile_has_permission(member.id, permission_before)
         and (field.read_permission is null
              or private.profile_has_permission(member.id, field.read_permission))),
    'readers_losing', (
      select count(*) from public.profiles member
       where member.org_id = actor_org
         and private.profile_has_permission(member.id, permission_before)
         and not private.profile_has_permission(member.id, permission_after)
         and (field.read_permission is null
              or private.profile_has_permission(member.id, field.read_permission))),
    -- The same people by role (RAPP-692), for the warning that names them.
    'roles_losing', private.readers_by_role(actor_org, permission_before, permission_after, field.read_permission),
    'roles_gaining', private.readers_by_role(actor_org, permission_after, permission_before, field.read_permission),
    -- The registry's features that read this field (D7), before and after.
    'features', coalesce((
      select jsonb_agg(jsonb_build_object(
               'feature', r.feature,
               'fits_now', field.question_type = any (r.accepted_types),
               'fits_after', to_type = any (r.accepted_types)) order by r.feature)
        from private.field_features() r where r.system_key = field.system_key), '[]'::jsonb),
    'conditions_cleared', case when field.question_type = 'single_choice' and to_type <> 'single_choice'
      then (select count(*) from public.profile_fields child where child.show_when_field_id = field.id)
      else 0 end);
end;
$function$;

drop function private.readers_by_role(uuid, text, text);

-- 5. The catalog sends it, for the field dialog. The body of the latest
-- `intake_catalog`.
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
        from public.form_blocks b where b.org_id = actor_org), '[]'::jsonb)
  );
end;
$function$;
