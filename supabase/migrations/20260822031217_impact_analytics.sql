-- Canonical, tenant-safe impact analytics for the staff dashboard, reports,
-- and later exports (RAPP-62). One function owns every metric so every surface
-- uses identical filters, denominators, privacy rules, and Madrid date bounds.

create index profiles_impact_cohort_idx
  on public.profiles (org_id, created_at, id)
  where role = 'player';

create index forum_posts_org_created_idx
  on public.forum_posts (org_id, created_at, author_id);

create index forum_replies_org_created_idx
  on public.forum_replies (org_id, created_at, author_id);

create index entity_referrals_org_created_idx
  on public.entity_referrals (org_id, created_at, id);

create or replace function public.get_impact_report(
  p_start_date date,
  p_end_date date,
  p_category_id uuid default null,
  p_collaborating_entity_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
stable
as $$
declare
  actor_org_id uuid := (select public.current_org_id());
  period_start_at timestamptz;
  period_end_at timestamptz;
  result jsonb;
begin
  if not (select public.is_staff_or_admin()) then
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

comment on function public.get_impact_report(date, date, uuid, uuid) is
  'Canonical staff-only impact report metrics. Uses inclusive Europe/Madrid dates, optional category/entity cohort filters, tenant isolation, and small-n suppression below three participants.';

revoke all on function public.get_impact_report(date, date, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_impact_report(date, date, uuid, uuid)
  to authenticated;
