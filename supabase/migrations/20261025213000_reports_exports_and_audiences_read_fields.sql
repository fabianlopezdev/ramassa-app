-- The impact report, the exports and the notification audiences read fields (RAPP-662, D7, D9).
--
-- WHY
--
-- Step 3 of 7 (RAPP-660 to RAPP-666). The impact report counted ages and
-- nationalities, the participants export listed sixteen or twenty-two fixed
-- columns, and the notification audiences matched her entity, all from her
-- profile's columns, which no writer updates since RAPP-661. They now read
-- the answers: the report and the audiences through the fields the registry
-- names (D7), the export one column per field with the level deciding what
-- each scope holds (D9).
--
-- WHAT CHANGES
--
--   1. `get_impact_report`: age bands from the `impact.age_bands` field (a
--      date) and nationalities from `impact.nationalities` (a country). A
--      field whose type no longer fits counts as unknown. Suppression below
--      three stays as it was.
--   2. `create_data_export`, participants dataset: her id, names, language,
--      then one column per field in the order of Dades de les jugadores (its
--      system key, or its Catalan name), then active and created. The default
--      scope holds Normal and Personal fields, the full scope Sensitive ones
--      too, under the same permissions as before. Values are her current
--      answers as text (`private.custom_answer_text`). The custom answers
--      dataset holds every field's answers (the RAPP-660 TEMPORARY filter goes).
--   3. Audiences: `private.matches_notification_audience` (her own surveys)
--      reads her entity from the `notifications.entity` field;
--      `preview_notification_audience` (and so every send) matches it at the
--      field's level: a Normal field for anyone who sends, a Personal or
--      Sensitive one only for a sender who reads that level.
--   4. `public.notification_audience_entities()`: the entities a sender can
--      target, read the same way. It replaces the apps' direct read of
--      `profiles.reference_entity`.
--
-- Docs: https://www.postgresql.org/docs/17/functions-json.html
-- (jsonb_to_recordset, jsonb_object_agg).

-- 1. The impact report -----------------------------------------------------------------------------------------

create or replace function public.get_impact_report(p_start_date date, p_end_date date, p_category_id uuid DEFAULT NULL::uuid, p_collaborating_entity_id uuid DEFAULT NULL::uuid)
 returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_org_id uuid := (select public.current_org_id());
  period_start_at timestamptz;
  period_end_at timestamptz;
  result jsonb;
begin
  if not (select public.has_permission('impact.view')) then
    raise exception 'impact reports require staff access'
      using errcode = 'insufficient_privilege';
  end if;

  if p_start_date is null
    or p_end_date is null
    or p_start_date > p_end_date
    or p_end_date - p_start_date > 3660
  then
    raise exception 'invalid impact report period'
      using errcode = 'invalid_datetime_format';
  end if;

  if p_category_id is not null and not exists (
    select 1
    from public.event_categories as category
    where category.org_id = actor_org_id
      and category.id = p_category_id
  ) then
    raise exception 'impact report category is outside the caller organization'
      using errcode = 'insufficient_privilege';
  end if;

  if p_collaborating_entity_id is not null and not exists (
    select 1
    from public.collaborating_entities as entity
    where entity.org_id = actor_org_id
      and entity.id = p_collaborating_entity_id
  ) then
    raise exception 'impact report entity is outside the caller organization'
      using errcode = 'insufficient_privilege';
  end if;

  period_start_at := p_start_date::timestamp at time zone 'Europe/Madrid';
  period_end_at := (p_end_date + 1)::timestamp at time zone 'Europe/Madrid';

  with
  category_options as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('id', category.id, 'name', category.name)
        order by category.sort_order, category.id
      ),
      '[]'::jsonb
    ) as value
    from public.event_categories as category
    where category.org_id = actor_org_id
  ),
  entity_options as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('id', entity.id, 'name', entity.name)
        order by entity.name, entity.id
      ),
      '[]'::jsonb
    ) as value
    from public.collaborating_entities as entity
    where entity.org_id = actor_org_id
      and entity.is_active
  ),
  linked_entities as (
    select
      referral.referred_profile_id as player_id,
      referral.collaborating_entity_id,
      entity.name as entity_name
    from public.entity_referrals as referral
    join public.collaborating_entities as entity
      on entity.org_id = referral.org_id
     and entity.id = referral.collaborating_entity_id
    where referral.org_id = actor_org_id
      and referral.referred_profile_id is not null
  ),
  attendance_period as (
    select
      attendance.id,
      attendance.player_id,
      attendance.status,
      occurrence.starts_at,
      event.category_id,
      category.name as category_name,
      category.color as category_color
    from public.attendance as attendance
    join public.event_occurrences as occurrence
      on occurrence.org_id = attendance.org_id
     and occurrence.id = attendance.occurrence_id
    join public.events as event
      on event.org_id = occurrence.org_id
     and event.id = occurrence.event_id
    join public.event_categories as category
      on category.org_id = event.org_id
     and category.id = event.category_id
    left join linked_entities as entity_link
      on entity_link.player_id = attendance.player_id
    where attendance.org_id = actor_org_id
      and occurrence.starts_at >= period_start_at
      and occurrence.starts_at < period_end_at
      and (p_category_id is null or event.category_id = p_category_id)
      and (
        p_collaborating_entity_id is null
        or entity_link.collaborating_entity_id = p_collaborating_entity_id
      )
  ),
  category_participants as (
    select distinct attendance.player_id
    from attendance_period as attendance
    union
    select distinct signup.player_id
    from public.event_signups as signup
    join public.events as event
      on event.org_id = signup.org_id
     and event.id = signup.event_id
    join public.event_occurrences as occurrence
      on occurrence.org_id = event.org_id
     and occurrence.event_id = event.id
    left join linked_entities as entity_link
      on entity_link.player_id = signup.player_id
    where signup.org_id = actor_org_id
      and signup.state in ('interested', 'confirmed')
      and occurrence.starts_at >= period_start_at
      and occurrence.starts_at < period_end_at
      and (p_category_id is null or event.category_id = p_category_id)
      and (
        p_collaborating_entity_id is null
        or entity_link.collaborating_entity_id = p_collaborating_entity_id
      )
  ),
  cohort as (
    select
      profile.id,
      profile.is_active,
      profile.created_at,
      -- Her date of birth and nationality from the fields the registry names
      -- (D7): nothing when a field no longer has the type the report reads.
      (private.feature_answer(profile.id, 'impact.age_bands') #>> '{}')::date as date_of_birth,
      coalesce(private.feature_text(profile.id, 'impact.nationalities'), 'unknown') as nationality,
      entity_link.collaborating_entity_id,
      entity_link.entity_name
    from public.profiles as profile
    left join linked_entities as entity_link
      on entity_link.player_id = profile.id
    where profile.org_id = actor_org_id
      and profile.role = 'player'
      and not profile.is_test_account
      and profile.created_at < period_end_at
      and (
        p_collaborating_entity_id is null
        or entity_link.collaborating_entity_id = p_collaborating_entity_id
      )
      and (
        p_category_id is null
        or profile.id in (select participant.player_id from category_participants as participant)
      )
  ),
  privacy as (
    select count(*)::integer as participant_count
    from cohort
  ),
  attendance_scoped as (
    select attendance.*
    from attendance_period as attendance
    join cohort on cohort.id = attendance.player_id
  ),
  attendance_totals as (
    select
      count(*) filter (where status = 'present')::integer as present_count,
      count(*) filter (where status in ('present', 'absent'))::integer as eligible_count,
      count(*)::integer as marked_count,
      count(distinct player_id)::integer as participant_count
    from attendance_scoped
  ),
  summary as (
    select
      privacy.participant_count < 3 as suppressed,
      privacy.participant_count,
      count(*) filter (where cohort.is_active)::integer as active_participant_count,
      count(*) filter (
        where cohort.created_at >= period_start_at
          and cohort.created_at < period_end_at
      )::integer as new_participant_count,
      attendance_totals.present_count as attendance_present_count,
      attendance_totals.eligible_count as attendance_eligible_count,
      attendance_totals.marked_count as attendance_marked_count,
      attendance_totals.participant_count as participating_participant_count,
      coalesce(
        round(
          100.0 * attendance_totals.present_count
          / nullif(attendance_totals.eligible_count, 0),
          2
        ),
        0.00
      ) as attendance_rate
    from cohort
    cross join privacy
    cross join attendance_totals
    group by
      privacy.participant_count,
      attendance_totals.present_count,
      attendance_totals.eligible_count,
      attendance_totals.marked_count,
      attendance_totals.participant_count
  ),
  category_rows as (
    select
      attendance.category_id,
      attendance.category_name,
      attendance.category_color,
      count(distinct attendance.player_id)::integer as participant_count,
      count(*) filter (where attendance.status = 'present')::integer as present_count,
      count(*) filter (where attendance.status in ('present', 'absent'))::integer as eligible_count,
      count(*)::integer as marked_count
    from attendance_scoped as attendance
    group by attendance.category_id, attendance.category_name, attendance.category_color
  ),
  category_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'category_id', category.category_id,
          'category_name', category.category_name,
          'category_color', category.category_color,
          'participant_count', category.participant_count,
          'attendance_present_count', category.present_count,
          'attendance_eligible_count', category.eligible_count,
          'attendance_marked_count', category.marked_count,
          'attendance_rate', coalesce(
            round(100.0 * category.present_count / nullif(category.eligible_count, 0), 2),
            0.00
          )
        )
        order by category.category_id
      ),
      '[]'::jsonb
    ) as value
    from category_rows as category
  ),
  months as (
    select generate_series(
      date_trunc('month', p_start_date::timestamp),
      date_trunc('month', p_end_date::timestamp),
      interval '1 month'
    )::date as month_start
  ),
  trend_rows as (
    select
      months.month_start,
      count(distinct cohort.id) filter (
        where cohort.created_at >= months.month_start::timestamp at time zone 'Europe/Madrid'
          and cohort.created_at < (months.month_start + interval '1 month')::timestamp at time zone 'Europe/Madrid'
      )::integer as new_participant_count,
      count(distinct attendance.player_id)::integer as participating_participant_count,
      count(attendance.id) filter (where attendance.status = 'present')::integer as present_count,
      count(attendance.id) filter (where attendance.status in ('present', 'absent'))::integer as eligible_count,
      count(attendance.id)::integer as marked_count
    from months
    left join cohort on true
    left join attendance_scoped as attendance
      on attendance.player_id = cohort.id
     and attendance.starts_at >= months.month_start::timestamp at time zone 'Europe/Madrid'
     and attendance.starts_at < (months.month_start + interval '1 month')::timestamp at time zone 'Europe/Madrid'
    group by months.month_start
  ),
  trend_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'month_start', trend.month_start,
          'new_participant_count', trend.new_participant_count,
          'participating_participant_count', trend.participating_participant_count,
          'attendance_present_count', trend.present_count,
          'attendance_eligible_count', trend.eligible_count,
          'attendance_marked_count', trend.marked_count,
          'attendance_rate', coalesce(
            round(100.0 * trend.present_count / nullif(trend.eligible_count, 0), 2),
            0.00
          )
        )
        order by trend.month_start
      ),
      '[]'::jsonb
    ) as value
    from trend_rows as trend
  ),
  nationality_rows as (
    select cohort.nationality as label, count(*)::integer as participant_count
    from cohort
    group by cohort.nationality
  ),
  nationality_json as (
    select coalesce(
      jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'label', nationality.label,
            'suppressed', nationality.participant_count < 3,
            'count', case when nationality.participant_count >= 3 then nationality.participant_count end
          )
        )
        order by nationality.participant_count desc, nationality.label
      ),
      '[]'::jsonb
    ) as value
    from nationality_rows as nationality
  ),
  age_rows as (
    select
      case
        when cohort.date_of_birth is null then 'unknown'
        when extract(year from age(p_end_date, cohort.date_of_birth)) < 18 then 'under-18'
        when extract(year from age(p_end_date, cohort.date_of_birth)) between 18 and 24 then '18-24'
        when extract(year from age(p_end_date, cohort.date_of_birth)) between 25 and 34 then '25-34'
        when extract(year from age(p_end_date, cohort.date_of_birth)) between 35 and 44 then '35-44'
        when extract(year from age(p_end_date, cohort.date_of_birth)) between 45 and 54 then '45-54'
        else '55-plus'
      end as label,
      count(*)::integer as participant_count
    from cohort
    group by 1
  ),
  age_json as (
    select coalesce(
      jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'label', age_band.label,
            'suppressed', age_band.participant_count < 3,
            'count', case when age_band.participant_count >= 3 then age_band.participant_count end
          )
        )
        order by age_band.label
      ),
      '[]'::jsonb
    ) as value
    from age_rows as age_band
  ),
  entity_rows as (
    select
      cohort.collaborating_entity_id as entity_id,
      cohort.entity_name,
      count(distinct cohort.id)::integer as participant_count,
      count(attendance.id) filter (where attendance.status = 'present')::integer as present_count,
      count(attendance.id) filter (where attendance.status in ('present', 'absent'))::integer as eligible_count,
      count(attendance.id)::integer as marked_count
    from cohort
    left join attendance_scoped as attendance on attendance.player_id = cohort.id
    where cohort.collaborating_entity_id is not null
    group by cohort.collaborating_entity_id, cohort.entity_name
  ),
  entity_json as (
    select coalesce(
      jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'entity_id', entity.entity_id,
            'entity_name', entity.entity_name,
            'suppressed', entity.participant_count < 3,
            'participant_count', case when entity.participant_count >= 3 then entity.participant_count end,
            'attendance_present_count', case when entity.participant_count >= 3 then entity.present_count end,
            'attendance_eligible_count', case when entity.participant_count >= 3 then entity.eligible_count end,
            'attendance_marked_count', case when entity.participant_count >= 3 then entity.marked_count end,
            'attendance_rate', case when entity.participant_count >= 3 then coalesce(
              round(100.0 * entity.present_count / nullif(entity.eligible_count, 0), 2),
              0.00
            ) end
          )
        )
        order by entity.entity_name, entity.entity_id
      ),
      '[]'::jsonb
    ) as value
    from entity_rows as entity
  ),
  forum_totals as (
    select
      (select count(*)::integer
       from public.forum_posts as post
       join cohort on cohort.id = post.author_id
       where post.org_id = actor_org_id
         and post.created_at >= period_start_at
         and post.created_at < period_end_at) as post_count,
      (select count(*)::integer
       from public.forum_replies as reply
       join cohort on cohort.id = reply.author_id
       where reply.org_id = actor_org_id
         and reply.created_at >= period_start_at
         and reply.created_at < period_end_at) as reply_count,
      (select count(distinct activity.author_id)::integer
       from (
         select post.author_id
         from public.forum_posts as post
         join cohort on cohort.id = post.author_id
         where post.org_id = actor_org_id
           and post.created_at >= period_start_at
           and post.created_at < period_end_at
         union all
         select reply.author_id
         from public.forum_replies as reply
         join cohort on cohort.id = reply.author_id
         where reply.org_id = actor_org_id
           and reply.created_at >= period_start_at
           and reply.created_at < period_end_at
       ) as activity) as contributor_count
  ),
  referral_totals as (
    select
      count(*)::integer as referral_count,
      count(*) filter (
        where referral.referred_profile_id is not null
          and referral.status in ('active', 'inactive')
      )::integer as converted_count
    from public.entity_referrals as referral
    where referral.org_id = actor_org_id
      and not exists (select 1 from public.profiles as test_profile where test_profile.id = referral.referred_profile_id and test_profile.is_test_account)
      and referral.created_at >= period_start_at
      and referral.created_at < period_end_at
      and (
        p_collaborating_entity_id is null
        or referral.collaborating_entity_id = p_collaborating_entity_id
      )
      and (
        p_category_id is null
        or referral.referred_profile_id in (select cohort.id from cohort)
      )
  )
  select jsonb_build_object(
    'version', 1,
    'period', jsonb_build_object(
      'start_date', p_start_date,
      'end_date', p_end_date,
      'time_zone', 'Europe/Madrid'
    ),
    'filters', jsonb_strip_nulls(jsonb_build_object(
      'category_id', p_category_id,
      'collaborating_entity_id', p_collaborating_entity_id
    )),
    'available_filters', jsonb_build_object(
      'categories', category_options.value,
      'entities', entity_options.value
    ),
    'summary', case
      when summary.suppressed then jsonb_build_object('suppressed', true)
      else jsonb_build_object(
        'suppressed', false,
        'participant_count', summary.participant_count,
        'active_participant_count', summary.active_participant_count,
        'new_participant_count', summary.new_participant_count,
        'participating_participant_count', summary.participating_participant_count,
        'attendance_present_count', summary.attendance_present_count,
        'attendance_eligible_count', summary.attendance_eligible_count,
        'attendance_marked_count', summary.attendance_marked_count,
        'attendance_rate', summary.attendance_rate
      )
    end,
    'participant_trend', case when summary.suppressed then '[]'::jsonb else trend_json.value end,
    'categories', case when summary.suppressed then '[]'::jsonb else category_json.value end,
    'demographics', jsonb_build_object(
      'nationalities', nationality_json.value,
      'age_bands', age_json.value
    ),
    'entities', entity_json.value,
    'forum_activity', case
      when summary.suppressed then jsonb_build_object('suppressed', true)
      else jsonb_build_object(
        'suppressed', false,
        'post_count', forum_totals.post_count,
        'reply_count', forum_totals.reply_count,
        'contributor_count', forum_totals.contributor_count
      )
    end,
    'referrals', case
      when summary.suppressed then jsonb_build_object('suppressed', true)
      else jsonb_build_object(
        'suppressed', false,
        'referral_count', referral_totals.referral_count,
        'converted_count', referral_totals.converted_count,
        'conversion_rate', coalesce(
          round(100.0 * referral_totals.converted_count / nullif(referral_totals.referral_count, 0), 2),
          0.00
        )
      )
    end
  )
  into result
  from summary
  cross join category_options
  cross join entity_options
  cross join category_json
  cross join trend_json
  cross join nationality_json
  cross join age_json
  cross join entity_json
  cross join forum_totals
  cross join referral_totals;

  return result;
end;
$$;
-- 2. The exports ------------------------------------------------------------------------------------------------

create or replace function public.create_data_export(p_dataset text, p_scope text, p_format text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_reason text DEFAULT NULL::text, p_confirmed boolean DEFAULT false)
 returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
      ) named;
    export_columns := '["id","first_name","last_name","preferred_language"]'::jsonb
      || coalesce((select jsonb_agg(c -> 'column_name' order by ordinality)
                     from jsonb_array_elements(field_columns) with ordinality as listed(c, ordinality)), '[]'::jsonb)
      || '["is_active","created_at"]'::jsonb;
    select coalesce(jsonb_agg(
             jsonb_build_object(
               'id', profile.id,
               'first_name', profile.first_name,
               'last_name', profile.last_name,
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
             order by profile.last_name, profile.first_name, profile.id), '[]'::jsonb)
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
      'first_name', profile.first_name,
      'last_name', profile.last_name,
      'section', section.title ->> 'ca',
      'question', field.label ->> 'ca',
      'privacy', field.privacy,
      'season', season.name,
      'answer', private.custom_answer_text(
        field, coalesce(answer.value, (public.decrypt_field(answer.value_encrypted))::jsonb)),
      'answered_at', answer.answered_at
    ) order by profile.last_name, profile.first_name, profile.id, section.sort_order, field.sort_order,
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
      and (p_scope = 'full' or field.privacy <> 'sensitive');
  elsif p_dataset = 'consents' then
    -- Every consent decision with the words she was shown (RAPP-614): one row
    -- per decision, signing and later changes alike. No health answer, no
    -- signature: a consent's wording is the organization's own text.
    export_columns := '["participant_id","first_name","last_name","season","version","consent_key","consent","language","required","granted","method","decided_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'participant_id', profile.id,
      'first_name', profile.first_name,
      'last_name', profile.last_name,
      'season', season.name,
      'version', version.version_number,
      'consent_key', event.consent_key,
      'consent', event.wording,
      'language', event.language,
      'required', event.required,
      'granted', event.granted,
      'method', event.method,
      'decided_at', event.decided_at
    ) order by profile.last_name, profile.first_name, profile.id, event.decided_at, event.id), '[]'::jsonb)
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
$$;
-- 3. The audiences ----------------------------------------------------------------------------------------------

-- Her entity for a sender choosing an audience (D9): the field the registry
-- names, a Normal one for anyone who sends notifications, a Personal or
-- Sensitive one only for a sender who reads that level. Her own read (a
-- survey that targets her) always sees it.
create or replace function private.entity_audience_text(p_profile_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  field public.profile_fields;
begin
  if not (p_profile_id = (select auth.uid())
          or (select public.has_permission('notifications.send'))
          or (select public.has_permission('surveys.manage'))) then
    return null;
  end if;
  field := private.feature_field((select p.org_id from public.profiles p where p.id = p_profile_id), 'notifications.entity');
  if field.id is null
     or not (p_profile_id = (select auth.uid()) or field.privacy = 'normal'
             or private.reads_privacy(p_profile_id, field.privacy)) then
    return null;
  end if;
  return private.field_text_now(p_profile_id, field);
end;
$$;
revoke all on function private.entity_audience_text(uuid) from public, anon, authenticated;
-- `preview_notification_audience` runs as its caller (her profile's row policy
-- decides who is listed); the helper decides what it reads.
grant execute on function private.entity_audience_text(uuid) to authenticated;

create or replace function private.matches_notification_audience(p_profile_id uuid, p_audience_kind text, p_audience_config jsonb DEFAULT '{}'::jsonb)
 returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as profile
    where profile.id = p_profile_id
      and profile.org_id = (select public.current_org_id())
      and profile.role = 'player'
      and profile.is_active
      and not profile.is_test_account
      and (
        p_audience_kind = 'all'
        or (
          p_audience_kind = 'interest'
          and exists (
            select 1
            from public.service_interests as interest
            join public.services as service
              on service.org_id = interest.org_id and service.id = interest.service_id
            where interest.org_id = profile.org_id
              and interest.user_id = profile.id
              and service.category_id = nullif(p_audience_config->>'service_category_id', '')::uuid
          )
        )
        or (
          p_audience_kind = 'signup'
          and exists (
            select 1
            from public.event_signups as signup
            where signup.org_id = profile.org_id
              and signup.player_id = profile.id
              and signup.event_id = nullif(p_audience_config->>'event_id', '')::uuid
              and signup.state in ('interested', 'confirmed')
          )
        )
        or (
          p_audience_kind = 'entity'
          -- Her entity from the field the registry names (RAPP-662, D7).
          and lower(private.feature_text(profile.id, 'notifications.entity')) =
            lower(btrim(nullif(p_audience_config->>'entity_name', '')))
        )
        or (
          p_audience_kind = 'custom_group'
          and exists (
            select 1
            from public.custom_notification_group_members as membership
            where membership.org_id = profile.org_id
              and membership.participant_id = profile.id
              and membership.group_id = nullif(p_audience_config->>'custom_group_id', '')::uuid
          )
        )
      )
  );
$$;
create or replace function public.preview_notification_audience(p_audience_kind text, p_audience_config jsonb DEFAULT '{}'::jsonb)
 returns TABLE(participant_id uuid, full_name text, language text, device_count integer)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not (select public.has_permission('notifications.send')) then
    raise exception 'NOTIFICATIONS/STAFF_ONLY' using errcode = '42501';
  end if;
  if p_audience_kind not in ('all', 'interest', 'signup', 'entity', 'custom_group') then
    raise exception 'NOTIFICATIONS/INVALID_AUDIENCE' using errcode = '22023';
  end if;

  return query
  select
    profile.id,
    btrim(profile.first_name || ' ' || profile.last_name),
    case
      when profile.preferred_language in ('ca', 'es', 'en', 'ar', 'fa')
        then profile.preferred_language
      else 'ca'
    end,
    count(distinct push_token.id)::integer
  from public.profiles as profile
  join public.push_tokens as push_token on push_token.user_id = profile.id
  where profile.org_id = (select public.current_org_id())
    and profile.role = 'player'
    and profile.is_active
    and not (select private.is_test_player(profile.id))
    and profile.push_notifications_enabled
    and (
      p_audience_kind = 'all'
      or (
        p_audience_kind = 'interest'
        and exists (
          select 1
          from public.service_interests as interest
          join public.services as service
            on service.org_id = interest.org_id
           and service.id = interest.service_id
          where interest.org_id = profile.org_id
            and interest.user_id = profile.id
            and service.category_id = nullif(p_audience_config->>'service_category_id', '')::uuid
        )
      )
      or (
        p_audience_kind = 'signup'
        and exists (
          select 1
          from public.event_signups as signup
          where signup.org_id = profile.org_id
            and signup.player_id = profile.id
            and signup.event_id = nullif(p_audience_config->>'event_id', '')::uuid
            and signup.state in ('interested', 'confirmed')
        )
      )
      or (
        p_audience_kind = 'entity'
        -- Her entity at its field's level (RAPP-662, D9).
        and lower(private.entity_audience_text(profile.id)) =
          lower(btrim(nullif(p_audience_config->>'entity_name', '')))
      )
      or (
        p_audience_kind = 'custom_group'
        and exists (
          select 1
          from public.custom_notification_group_members as membership
          where membership.org_id = profile.org_id
            and membership.participant_id = profile.id
            and membership.group_id = nullif(p_audience_config->>'custom_group_id', '')::uuid
        )
      )
    )
  group by profile.id, profile.first_name, profile.last_name, profile.preferred_language
  order by profile.last_name, profile.first_name, profile.id;
end;
$$;
-- The entities a sender can target: the answers of her organization's active
-- players to the field the registry names, at its level (D9).
create or replace function public.notification_audience_entities()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct private.entity_audience_text(p.id) as entity
    from public.profiles p
   where p.org_id = (select public.current_org_id())
     and p.role = 'player'
     and p.is_active
     and not p.is_test_account
     and ((select public.has_permission('notifications.send')) or (select public.has_permission('surveys.manage')))
     and private.entity_audience_text(p.id) is not null
   order by 1;
$$;
revoke all on function public.notification_audience_entities() from public, anon;
grant execute on function public.notification_audience_entities() to authenticated, service_role;
