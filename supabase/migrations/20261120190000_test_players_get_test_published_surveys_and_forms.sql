-- A test player receives the surveys and forms a test account published (RAPP-885).
--
-- WHY
--
-- Four people at Ramassà test the player side of the app on staging with test
-- accounts (`profiles.is_test_account`, the only accounts the staging sign-in
-- code opens, ADR-029). Since RAPP-619 a test player matches no notification
-- audience, so the client's own test players receive no real survey and stay
-- out of every real number. That rule also hid from the testers every survey
-- they were meant to try, and every form whose recipients staff chose by a
-- group.
--
-- The rule the owner approved: a test player receives a survey when a test
-- account published it. Real players and real reports stay exactly as they
-- are. Database only, with no screen changes. The same holds for a form whose
-- recipients are chosen by a group. Targeted notifications and push audiences
-- keep their own rule (`preview_notification_audience`,
-- `private.create_targeted_notification_send`) and are left as they are.
--
-- WHAT THIS MIGRATION DOES
--
--   1. `private.matches_notification_audience` takes a fourth argument,
--      `p_published_by`: the account that published the survey or chose the
--      form's recipients. A test player matches when that account is a test
--      account of her organization; everyone else matches exactly as before.
--      Left out, it is null and the function answers as it always did. The
--      three-argument version is dropped so a call with three arguments has
--      one function to reach.
--   2. A survey's publisher is `surveys.created_by`: `save_survey` writes the
--      survey and its publication date in one call and keeps the creator on
--      every edit. `list_player_surveys` and `save_survey_response` pass it.
--   3. A form's recipients are written by `set_custom_form_recipients`, and
--      the team member who calls it passes herself. A form for everyone
--      (`custom_forms.audience = 'all'`) never read this function and is
--      unchanged.
--
-- Counts, results and exports already leave every test player out and are
-- not touched: `list_surveys` (response counts), `list_survey_responses` and
-- `create_survey_export` (RAPP-619, 20261022030000_test_players_out_of_reports.sql).
--
-- Docs: https://www.postgresql.org/docs/17/sql-dropfunction.html
-- https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker

-- 1. The audience rule -------------------------------------------------------------------------------------------

drop function private.matches_notification_audience(uuid, text, jsonb);

create function private.matches_notification_audience(
  p_profile_id uuid,
  p_audience_kind text,
  p_audience_config jsonb default '{}'::jsonb,
  p_published_by uuid default null
)
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
      -- A test player only gets what a test account of her organization
      -- published (RAPP-885); a real player is not affected by who published.
      and (
        not profile.is_test_account
        or exists (
          select 1
          from public.profiles as publisher
          where publisher.id = p_published_by
            and publisher.org_id = profile.org_id
            and publisher.is_test_account
        )
      )
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

revoke all on function private.matches_notification_audience(uuid, text, jsonb, uuid)
  from public, anon, authenticated;

-- 2. Surveys: the list she sees and her answer -------------------------------------------------------------------

create or replace function public.list_player_surveys()
returns table (
  id uuid,
  title jsonb,
  event_id uuid,
  published_at timestamptz,
  closes_at timestamptz,
  questions jsonb,
  response_status text,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    survey.id,
    survey.title,
    survey.event_id,
    survey.published_at,
    survey.closes_at,
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
    response.status,
    response.completed_at
  from public.surveys as survey
  left join public.survey_responses as response
    on response.org_id = survey.org_id
   and response.survey_id = survey.id
   and response.player_id = (select auth.uid())
  where survey.org_id = (select public.current_org_id())
    and survey.published_at <= now()
    and (survey.closes_at is null or survey.closes_at > now())
    and private.matches_notification_audience(
      (select auth.uid()), survey.audience_kind, survey.audience_config, survey.created_by
    )
  order by survey.published_at desc, survey.id desc;
$$;

create or replace function public.save_survey_response(
  p_survey_id uuid,
  p_answers jsonb,
  p_complete boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  selected_survey public.surveys%rowtype;
  response_id uuid;
  existing_status text;
begin
  select profile.* into actor
  from public.profiles as profile
  where profile.id = (select auth.uid()) and profile.role = 'player' and profile.is_active;
  if not found then
    raise exception 'SURVEYS/PLAYER_ONLY' using errcode = '42501';
  end if;

  select survey.* into selected_survey
  from public.surveys as survey
  where survey.id = p_survey_id and survey.org_id = actor.org_id
  for update;
  if not found then
    raise exception 'SURVEYS/NOT_FOUND' using errcode = 'P0002';
  end if;
  if selected_survey.published_at > now()
    or (selected_survey.closes_at is not null and selected_survey.closes_at <= now())
    or not private.matches_notification_audience(
      actor.id, selected_survey.audience_kind, selected_survey.audience_config,
      selected_survey.created_by
    )
  then
    raise exception 'SURVEYS/CLOSED' using errcode = 'P0001';
  end if;

  select response.status into existing_status
  from public.survey_responses as response
  where response.survey_id = p_survey_id and response.player_id = actor.id
  for update;
  if existing_status = 'completed' then
    raise exception 'SURVEYS/ALREADY_COMPLETED' using errcode = 'P0001';
  end if;
  if not private.valid_survey_answers(p_survey_id, p_answers, p_complete) then
    raise exception 'SURVEYS/INVALID_ANSWER' using errcode = '23514';
  end if;

  insert into public.survey_responses (
    org_id, survey_id, player_id, answers_encrypted, status, completed_at
  ) values (
    actor.org_id,
    p_survey_id,
    actor.id,
    public.encrypt_field(p_answers::text),
    case when p_complete then 'completed' else 'in_progress' end,
    case when p_complete then now() else null end
  )
  on conflict (survey_id, player_id) do update set
    answers_encrypted = excluded.answers_encrypted,
    status = excluded.status,
    completed_at = excluded.completed_at
  returning id into response_id;

  if p_complete then
    insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
    values (
      actor.org_id,
      actor.id,
      'survey_response_completed',
      'survey',
      p_survey_id,
      jsonb_build_object('response_id', response_id)
    );
  end if;
  return response_id;
end;
$$;

-- 3. Forms: the recipients chosen by a group ---------------------------------------------------------------------

create or replace function public.set_custom_form_recipients(
  p_form_id uuid,
  p_audience_kind text,
  p_audience_config jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  chosen uuid[];
begin
  if not exists (select 1 from public.custom_forms f where f.id = p_form_id and f.org_id = actor_org) then
    raise no_data_found using message = 'no such form';
  end if;
  if p_audience_kind = 'players' then
    select coalesce(array_agg(p.id), array[]::uuid[]) into chosen
      from public.profiles p
     where p.org_id = actor_org and p.role = 'player'
       and p.id::text in (select jsonb_array_elements_text(coalesce(p_audience_config -> 'participant_ids', '[]'::jsonb)));
  elsif p_audience_kind in ('all', 'interest', 'signup', 'entity', 'custom_group') then
    -- The team member who chooses the recipients publishes the form to them (RAPP-885).
    select coalesce(array_agg(p.id), array[]::uuid[]) into chosen
      from public.profiles p
     where p.org_id = actor_org and p.role = 'player'
       and private.matches_notification_audience(
         p.id, p_audience_kind, coalesce(p_audience_config, '{}'::jsonb), (select auth.uid()));
  else
    raise invalid_parameter_value using message = 'NOTIFICATIONS/INVALID_AUDIENCE';
  end if;
  delete from public.custom_form_recipients where form_id = p_form_id;
  insert into public.custom_form_recipients (form_id, profile_id, org_id)
  select p_form_id, unnest(chosen), actor_org;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'custom_form.recipients', 'custom_form', p_form_id,
          jsonb_build_object('audience_kind', p_audience_kind, 'count', cardinality(chosen)));
  return cardinality(chosen);
end;
$$;
