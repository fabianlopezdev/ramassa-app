-- Test players stay out of every real report, export and audience (RAPP-619).
--
-- WHY
--
-- A test player (`profiles.is_test_account`) who joined counted as a real
-- woman: the impact report went from 20 to 21 participants, season
-- registration from 18 to 19, and the participants export listed her. The
-- programme's numbers go to the funder, so a made-up woman must never be one
-- of them.
--
-- WHAT THIS MIGRATION DOES
--
-- Every report, statistic, export and audience that counts or lists real
-- players leaves test players out:
--   1. the impact report (participants, attendance, demographics, entities,
--      forum activity, referrals);
--   2. the attendance statistics per event, category and month, and the
--      attendance export. The roll call of one session and a woman's own
--      history still show a test player, so staff can mark and check her;
--   3. season registration;
--   4. the participants export (both scopes) and the staff-question answers
--      export;
--   5. survey results, their counts and their export;
--   6. the notification audience preview and the targeted send;
--   7. stock levels (a handover to a test player moved no real stock);
--   8. the participant filter options and the feedback counts;
--   9. the entity's summary, trend and tracking list.
-- A fixture season (RAPP-619) is refused by season registration as unknown.
-- Lists staff work in (participants, referrals, conversations) keep showing
-- test players: the design role works on them there.

-- 2. Attendance statistics ------------------------------------------------------------------------------

-- The rows keep every woman and say whether she is a test player; the
-- statistics count the real ones only.
create or replace view public.attendance_report_rows
with (security_invoker = true) as
select
  attendance.id as attendance_id,
  attendance.org_id,
  attendance.occurrence_id,
  occurrence.event_id,
  event.category_id,
  attendance.player_id,
  profile.first_name,
  profile.last_name,
  attendance.status,
  attendance.marked_at,
  occurrence.starts_at,
  occurrence.ends_at,
  event.title as event_title,
  event.location as event_location,
  category.name as category_name,
  category.color as category_color,
  -- The flag itself is not readable by the app (column grants), so the view
  -- asks the definer helper.
  (select private.is_test_player(attendance.player_id)) as is_test_account
from public.attendance
join public.event_occurrences occurrence
  on occurrence.id = attendance.occurrence_id and occurrence.org_id = attendance.org_id
join public.events event
  on event.id = occurrence.event_id and event.org_id = occurrence.org_id
join public.event_categories category
  on category.id = event.category_id and category.org_id = event.org_id
join public.profiles profile
  on profile.id = attendance.player_id and profile.org_id = attendance.org_id;

create or replace view public.attendance_event_stats
with (security_invoker = true) as
select
  org_id,
  event_id,
  category_id,
  event_title,
  event_location,
  category_name,
  category_color,
  count(distinct occurrence_id)::integer as occurrence_count,
  count(*) filter (where status = 'present')::integer as present_count,
  count(*) filter (where status = 'absent')::integer as absent_count,
  count(*) filter (where status = 'excused')::integer as excused_count,
  count(*)::integer as marked_count,
  coalesce(round(100.0 * count(*) filter (where status = 'present')
    / nullif(count(*) filter (where status in ('present', 'absent')), 0), 2), 0.00) as attendance_rate,
  max(starts_at) as latest_occurrence_at
from public.attendance_report_rows
where not is_test_account
group by org_id, event_id, category_id, event_title, event_location, category_name, category_color;

create or replace view public.attendance_category_stats
with (security_invoker = true) as
select
  org_id,
  category_id,
  category_name,
  category_color,
  count(distinct event_id)::integer as event_count,
  count(distinct occurrence_id)::integer as occurrence_count,
  count(*) filter (where status = 'present')::integer as present_count,
  count(*) filter (where status = 'absent')::integer as absent_count,
  count(*) filter (where status = 'excused')::integer as excused_count,
  count(*)::integer as marked_count,
  coalesce(round(100.0 * count(*) filter (where status = 'present')
    / nullif(count(*) filter (where status in ('present', 'absent')), 0), 2), 0.00) as attendance_rate,
  max(starts_at) as latest_occurrence_at
from public.attendance_report_rows
where not is_test_account
group by org_id, category_id, category_name, category_color;

create or replace view public.attendance_period_stats
with (security_invoker = true) as
select
  org_id,
  date_trunc('month', starts_at at time zone 'Europe/Madrid')::date as period_start,
  count(distinct event_id)::integer as event_count,
  count(distinct occurrence_id)::integer as occurrence_count,
  count(*) filter (where status = 'present')::integer as present_count,
  count(*) filter (where status = 'absent')::integer as absent_count,
  count(*) filter (where status = 'excused')::integer as excused_count,
  count(*)::integer as marked_count,
  coalesce(round(100.0 * count(*) filter (where status = 'present')
    / nullif(count(*) filter (where status in ('present', 'absent')), 0), 2), 0.00) as attendance_rate
from public.attendance_report_rows
where not is_test_account
group by org_id, date_trunc('month', starts_at at time zone 'Europe/Madrid')::date;


-- 1. The impact report ------------------------------------------------------------------------------

create or replace function public.get_impact_report(p_start_date date, p_end_date date, p_category_id uuid DEFAULT NULL::uuid, p_collaborating_entity_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      profile.date_of_birth,
      coalesce(nullif(btrim(profile.nationality), ''), 'unknown') as nationality,
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
$function$;

-- 3. Season registration ---------------------------------------------------------------------------

create or replace function public.season_registration_status(p_season_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profile_id uuid, first_name text, last_name text, registered boolean, method text, signed_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := (select public.current_org_id());
  season uuid := coalesce(p_season_id, private.current_season_id(actor_org));
begin
  if not (select public.has_permission('participants.view_personal')) then
    raise insufficient_privilege using message = 'the season view needs participants.view_personal';
  end if;
  if not exists (select 1 from public.seasons where id = season and org_id = actor_org and not is_test_fixture) then
    return;
  end if;
  return query
    select p.id, p.first_name, p.last_name, latest.id is not null, latest.method, latest.signed_at
      from public.profiles p
      left join lateral (
        select sig.id, sig.method, sig.signed_at
          from public.authorization_signatures sig
         where sig.profile_id = p.id and sig.season_id = season
         order by sig.signed_at desc
         limit 1
      ) latest on true
     where p.org_id = actor_org and p.role = 'player' and p.is_active and not p.is_test_account
     order by (latest.id is not null), p.last_name, p.first_name;
end;
$function$;

-- 4. The data exports --------------------------------------------------------------------------------

create or replace function public.create_data_export(p_dataset text, p_scope text, p_format text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_reason text DEFAULT NULL::text, p_confirmed boolean DEFAULT false)
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
  export_rows jsonb;
  start_instant timestamptz;
  end_instant timestamptz;
begin
  perform private.require_recent_second_factor();
  if actor is null or actor_org is null or not (
    -- Custom answers (RAPP-307) need what the participants export needs.
    case (case when p_dataset = 'custom_answers' then 'participants' else p_dataset end)
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
  if p_dataset not in ('participants', 'custom_answers', 'attendance', 'events') then
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

  if p_dataset = 'participants' and p_scope = 'default' then
    export_columns := '["id","first_name","last_name","date_of_birth","place_of_birth","nationality","preferred_language","city","reference_entity","reference_contact_name","has_dependents","num_dependents","clothing_size","shoe_size","is_active","created_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', profile.id,
      'first_name', profile.first_name,
      'last_name', profile.last_name,
      'date_of_birth', profile.date_of_birth,
      'place_of_birth', profile.place_of_birth,
      'nationality', profile.nationality,
      'preferred_language', profile.preferred_language,
      'city', profile.city,
      'reference_entity', profile.reference_entity,
      'reference_contact_name', profile.reference_contact_name,
      'has_dependents', profile.has_dependents,
      'num_dependents', profile.num_dependents,
      'clothing_size', profile.clothing_size,
      'shoe_size', profile.shoe_size,
      'is_active', profile.is_active,
      'created_at', profile.created_at
    ) order by profile.last_name, profile.first_name, profile.id), '[]'::jsonb)
    into export_rows
    from public.profiles profile
    where profile.org_id = actor_org
      and profile.role = 'player'
      and not profile.is_test_account;
  elsif p_dataset = 'participants' then
    export_columns := '["id","first_name","last_name","date_of_birth","place_of_birth","nationality","preferred_language","document_type","document_name","document_number","phone","address","city","postal_code","reference_entity","reference_contact_name","has_dependents","num_dependents","clothing_size","shoe_size","is_active","created_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', profile.id,
      'first_name', profile.first_name,
      'last_name', profile.last_name,
      'date_of_birth', profile.date_of_birth,
      'place_of_birth', profile.place_of_birth,
      'nationality', profile.nationality,
      'preferred_language', profile.preferred_language,
      'document_type', profile.document_type,
      'document_name', profile.document_name,
      'document_number', public.decrypt_field(profile.document_number),
      'phone', public.decrypt_field(profile.phone),
      'address', public.decrypt_field(profile.address),
      'city', profile.city,
      'postal_code', public.decrypt_field(profile.postal_code),
      'reference_entity', profile.reference_entity,
      'reference_contact_name', profile.reference_contact_name,
      'has_dependents', profile.has_dependents,
      'num_dependents', profile.num_dependents,
      'clothing_size', profile.clothing_size,
      'shoe_size', profile.shoe_size,
      'is_active', profile.is_active,
      'created_at', profile.created_at
    ) order by profile.last_name, profile.first_name, profile.id), '[]'::jsonb)
    into export_rows
    from public.profiles profile
    where profile.org_id = actor_org
      and profile.role = 'player'
      and not profile.is_test_account;
  elsif p_dataset = 'custom_answers' then
    -- Answers to the questions staff added (RAPP-307), one row per answer. The
    -- default scope holds Normal and Personal answers; Sensitive answers only
    -- the full scope, which needs participants.view_sensitive above.
    export_columns := '["participant_id","first_name","last_name","screen","question","privacy","season","answer","answered_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'participant_id', profile.id,
      'first_name', profile.first_name,
      'last_name', profile.last_name,
      'screen', screen.title ->> 'ca',
      'question', question.label ->> 'ca',
      'privacy', question.privacy,
      'season', season.name,
      'answer', private.custom_answer_text(
        question, coalesce(answer.value, (public.decrypt_field(answer.value_encrypted))::jsonb)),
      'answered_at', answer.answered_at
    ) order by profile.last_name, profile.first_name, profile.id, screen.sort_order, question.sort_order,
             season.starts_on), '[]'::jsonb)
    into export_rows
    from public.custom_answers answer
    join public.custom_questions question on question.id = answer.question_id
    join public.intake_screens screen on screen.id = question.screen_id
    join public.profiles profile on profile.id = answer.profile_id
    left join public.seasons season on season.id = answer.season_id
    where answer.org_id = actor_org
      and profile.role = 'player'
      and not profile.is_test_account
      and (p_scope = 'full' or question.privacy <> 'sensitive');
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

-- 5. Survey results (the survey export reads list_survey_responses) ------------------------------

create or replace function public.list_survey_responses(p_survey_id uuid)
 RETURNS TABLE(id uuid, player_id uuid, player_name text, language text, answers jsonb, status text, completed_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (select public.has_permission('surveys.results')) then
    raise exception 'SURVEYS/STAFF_ONLY' using errcode = '42501';
  end if;
  return query
  select
    response.id,
    response.player_id,
    btrim(profile.first_name || ' ' || profile.last_name),
    case when profile.preferred_language in ('ca', 'es', 'en', 'ar', 'fa')
      then profile.preferred_language else 'ca' end,
    public.decrypt_field(response.answers_encrypted)::jsonb,
    response.status,
    response.completed_at,
    response.updated_at
  from public.survey_responses as response
  join public.profiles as profile
    on profile.org_id = response.org_id and profile.id = response.player_id
  where response.org_id = (select public.current_org_id())
    and response.survey_id = p_survey_id
    and not profile.is_test_account
  order by response.completed_at desc nulls last, response.updated_at desc, response.id;
end;
$function$;

create or replace function public.list_surveys()
 RETURNS TABLE(id uuid, title jsonb, event_id uuid, published_at timestamp with time zone, closes_at timestamp with time zone, audience_kind text, audience_config jsonb, questions jsonb, response_count bigint, completed_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    survey.id,
    survey.title,
    survey.event_id,
    survey.published_at,
    survey.closes_at,
    survey.audience_kind,
    survey.audience_config,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', question.id,
        'type', question.question_type,
        'prompt', question.prompt,
        'options', question.options,
        'required', question.required,
        'sortOrder', question.sort_order
      ) order by question.sort_order, question.id)
      from public.survey_questions as question
      where question.org_id = survey.org_id and question.survey_id = survey.id
    ), '[]'::jsonb),
    (select count(*) from public.survey_responses as response
      where response.org_id = survey.org_id and response.survey_id = survey.id
        and not exists (select 1 from public.profiles as test_profile where test_profile.id = response.player_id and test_profile.is_test_account)),
    (select count(*) from public.survey_responses as response
      where response.org_id = survey.org_id and response.survey_id = survey.id
        and not exists (select 1 from public.profiles as test_profile where test_profile.id = response.player_id and test_profile.is_test_account)
        and response.status = 'completed')
  from public.surveys as survey
  where survey.org_id = (select public.current_org_id())
    and (select (public.has_permission('surveys.manage') or public.has_permission('surveys.results')))
  order by survey.created_at desc, survey.id desc;
$function$;

-- 6. Notification audiences and the targeted send --------------------------------------------------

create or replace function public.preview_notification_audience(p_audience_kind text, p_audience_config jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(participant_id uuid, full_name text, language text, device_count integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
        and lower(btrim(profile.reference_entity)) =
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
$function$;

create or replace function private.matches_notification_audience(p_profile_id uuid, p_audience_kind text, p_audience_config jsonb DEFAULT '{}'::jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
          and lower(btrim(profile.reference_entity)) =
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
$function$;

create or replace function private.create_targeted_notification_send(p_template_id uuid, p_title jsonb, p_body jsonb, p_audience_kind text, p_audience_config jsonb, p_expected_recipient_count integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  recipient_ids uuid[];
  actual_recipient_count integer;
  actual_device_count integer;
  send_id uuid;
  publication_id uuid;
begin
  if not (select public.has_permission('notifications.send')) then
    raise exception 'NOTIFICATIONS/STAFF_ONLY' using errcode = '42501';
  end if;
  if not private.valid_notification_copy(p_title, 120)
    or not private.valid_notification_copy(p_body, 1000)
    or p_expected_recipient_count < 1
  then
    raise exception 'NOTIFICATIONS/INVALID_SEND' using errcode = '23514';
  end if;
  if p_template_id is not null and not exists (
    select 1 from public.notification_templates
    where id = p_template_id and org_id = actor_org
  ) then
    raise exception 'NOTIFICATIONS/TEMPLATE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select
    coalesce(array_agg(audience.participant_id), '{}'::uuid[]),
    count(*)::integer,
    coalesce(sum(audience.device_count), 0)::integer
  into recipient_ids, actual_recipient_count, actual_device_count
  from public.preview_notification_audience(p_audience_kind, coalesce(p_audience_config, '{}'::jsonb)) audience;

  if actual_recipient_count <> p_expected_recipient_count then
    raise exception 'NOTIFICATIONS/AUDIENCE_CHANGED' using errcode = 'P0001';
  end if;

  insert into public.targeted_notification_sends (
    org_id, template_id, title, body, audience_kind, audience_config,
    recipient_count, sent_by
  ) values (
    actor_org, p_template_id, p_title, p_body, p_audience_kind,
    coalesce(p_audience_config, '{}'::jsonb), actual_recipient_count, actor
  ) returning id into send_id;

  insert into public.push_publications (
    org_id, content_type, content_id, scheduled_for, recipient_count
  ) values (
    actor_org, 'targeted_notification', send_id, now(), actual_device_count
  ) returning id into publication_id;

  insert into public.push_deliveries (
    org_id, publication_id, push_token_id, recipient_id, language, next_attempt_at
  )
  select
    actor_org,
    publication_id,
    push_token.id,
    profile.id,
    case when profile.preferred_language in ('ca', 'es', 'en', 'ar', 'fa')
      then profile.preferred_language else 'ca' end,
    now()
  from public.profiles as profile
  join public.push_tokens as push_token on push_token.user_id = profile.id
  where profile.org_id = actor_org
    and profile.id = any(recipient_ids)
    and profile.role = 'player'
    and profile.is_active
    and not profile.is_test_account
    and profile.push_notifications_enabled;

  insert into public.audit_log (
    org_id, actor_id, action, target_type, target_id, changes
  ) values (
    actor_org,
    actor,
    'targeted_notification_sent',
    'targeted_notification_send',
    send_id,
    jsonb_build_object(
      'audience_kind', p_audience_kind,
      'recipient_count', actual_recipient_count,
      'template_id', p_template_id
    )
  );

  perform private.invoke_push_dispatch('targeted');
  return send_id;
end;
$function$;

-- 7. Stock levels ----------------------------------------------------------------------------------

create or replace function public.stock_levels()
 RETURNS TABLE(item_type_id uuid, item_key text, kind text, size text, quantity integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    item_type.id,
    item_type.key,
    item_type.kind,
    movement.size,
    sum(movement.quantity)::integer
  from public.stock_movements movement
  join public.equipment_item_types item_type on item_type.id = movement.item_type_id
  where movement.org_id = (select public.current_org_id())
    and (select private.holds_any_equipment_permission())
    and not exists (select 1 from public.profiles as test_profile where test_profile.id = movement.participant_id and test_profile.is_test_account)
  group by item_type.id, item_type.key, item_type.kind, movement.size
  order by item_type.key, movement.size nulls first;
$function$;

-- 8. Participant filters and feedback counts ------------------------------------------------------

create or replace function public.participant_filter_options()
 RETURNS TABLE(entities text[], nationalities text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    coalesce(array_agg(distinct p.reference_entity) filter (where p.reference_entity is not null), '{}'),
    case when (select public.has_permission('participants.view_personal'))
      then coalesce(array_agg(distinct p.nationality) filter (where p.nationality is not null), '{}')
      else '{}'::text[]
    end
  from public.profiles as p
  where p.role = 'player'
    and not p.is_test_account
    and p.org_id = (select public.current_org_id())
    and (select public.has_permission('participants.view'));
$function$;

create or replace function public.feedback_monthly_counts()
 RETURNS TABLE(month date, type text, count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (public.has_permission('feedback.view') or public.has_permission('impact.view')) then
    raise exception 'only staff may view feedback counts' using errcode = 'insufficient_privilege';
  end if;
  return query
  select date_trunc('month', submission.created_at)::date, submission.type, count(*)
  from public.feedback_submissions as submission
  where submission.org_id = (select public.current_org_id())
    and not exists (select 1 from public.profiles as test_profile where test_profile.id = submission.author_id and test_profile.is_test_account)
  group by 1, submission.type
  order by 1 desc, submission.type;
end;
$function$;

-- 9. The entity's tracking ---------------------------------------------------------------------------

create or replace function public.get_entity_impact_summary()
 RETURNS TABLE(suppressed boolean, referred_count integer, active_count integer, inactive_count integer, attendance_present_count integer, attendance_eligible_count integer, attendance_marked_count integer, attendance_rate numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with linked as (
    select referral.referred_profile_id, referral.status
    from public.entity_referrals as referral
    where referral.collaborating_entity_id =
        (select public.current_collaborating_entity_id())
      and referral.referred_profile_id is not null
      and not (select private.is_test_player(referral.referred_profile_id))
  ), totals as (
    select
      count(distinct linked.referred_profile_id)::integer as people,
      count(distinct linked.referred_profile_id)
        filter (where linked.status = 'active')::integer as active_people,
      count(distinct linked.referred_profile_id)
        filter (where linked.status = 'inactive')::integer as inactive_people,
      count(attendance.id)
        filter (where attendance.status = 'present')::integer as present_marks,
      count(attendance.id)
        filter (where attendance.status in ('present', 'absent'))::integer as eligible_marks,
      count(attendance.id)::integer as all_marks
    from linked
    left join public.attendance as attendance
      on attendance.player_id = linked.referred_profile_id
     and attendance.org_id = (select public.current_org_id())
  )
  select
    people < 3,
    case when people >= 3 then people end,
    case when people >= 3 then active_people end,
    case when people >= 3 then inactive_people end,
    case when people >= 3 then present_marks end,
    case when people >= 3 then eligible_marks end,
    case when people >= 3 then all_marks end,
    case when people >= 3 then
      coalesce(round(100.0 * present_marks / nullif(eligible_marks, 0), 2), 0.00)
    end
  from totals;
$function$;

create or replace function public.list_entity_participation_trend()
 RETURNS TABLE(month_start date, participant_count integer, attendance_present_count integer, attendance_eligible_count integer, attendance_marked_count integer, attendance_rate numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with linked as (
    select distinct referral.referred_profile_id
    from public.entity_referrals as referral
    where referral.collaborating_entity_id =
        (select public.current_collaborating_entity_id())
      and referral.referred_profile_id is not null
      and not (select private.is_test_player(referral.referred_profile_id))
  ), privacy as (
    select count(*)::integer as people from linked
  ), months as (
    select generate_series(
      date_trunc('month', now()) - interval '2 months',
      date_trunc('month', now()),
      interval '1 month'
    ) as month_start
  ), monthly as (
    select
      date_trunc('month', attendance.marked_at) as month_start,
      count(distinct attendance.player_id)::integer as participant_count,
      count(attendance.id)
        filter (where attendance.status = 'present')::integer as present_count,
      count(attendance.id)
        filter (where attendance.status in ('present', 'absent'))::integer as eligible_count,
      count(attendance.id)::integer as marked_count
    from public.attendance as attendance
    join linked on linked.referred_profile_id = attendance.player_id
    where attendance.org_id = (select public.current_org_id())
      and attendance.marked_at >= date_trunc('month', now()) - interval '2 months'
      and attendance.marked_at < date_trunc('month', now()) + interval '1 month'
    group by date_trunc('month', attendance.marked_at)
  )
  select
    months.month_start::date,
    coalesce(monthly.participant_count, 0),
    coalesce(monthly.present_count, 0),
    coalesce(monthly.eligible_count, 0),
    coalesce(monthly.marked_count, 0),
    coalesce(
      round(
        100.0 * monthly.present_count / nullif(monthly.eligible_count, 0),
        2
      ),
      0.00
    )
  from months
  cross join privacy
  left join monthly on monthly.month_start = months.month_start
  where privacy.people >= 3
  order by months.month_start;
$function$;

create or replace function public.list_entity_referral_tracking()
 RETURNS TABLE(referral_id uuid, referred_profile_id uuid, referred_first_name text, referred_last_name text, status text, attendance_present_count integer, attendance_absent_count integer, attendance_excused_count integer, attendance_marked_count integer, attendance_rate numeric, latest_occurrence_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select
    referral.id,
    referral.referred_profile_id,
    referral.referred_first_name,
    referral.referred_last_name,
    referral.status,
    count(attendance.id) filter (where attendance.status = 'present')::integer,
    count(attendance.id) filter (where attendance.status = 'absent')::integer,
    count(attendance.id) filter (where attendance.status = 'excused')::integer,
    count(attendance.id)::integer,
    coalesce(
      round(
        100.0 * count(attendance.id) filter (where attendance.status = 'present')
        / nullif(count(attendance.id) filter (
          where attendance.status in ('present', 'absent')
        ), 0),
        2
      ),
      0.00
    ),
    max(occurrence.starts_at)
  from public.entity_referrals as referral
  left join public.attendance as attendance
    on attendance.org_id = referral.org_id
   and attendance.player_id = referral.referred_profile_id
  left join public.event_occurrences as occurrence
    on occurrence.org_id = attendance.org_id
   and occurrence.id = attendance.occurrence_id
  where referral.collaborating_entity_id =
      (select public.current_collaborating_entity_id())
    and referral.referred_profile_id is not null
      and not (select private.is_test_player(referral.referred_profile_id))
  group by referral.id
  order by referral.referred_last_name, referral.referred_first_name, referral.id;
$function$;

