-- Surveys on the form engine close the gaps to the old surveys, so the old
-- surveys can go once nothing else needs them (RAPP-943 to RAPP-946).
--
-- WHY
--
-- Fabián, 2026-11-23: "if new surveys cover everything old surveys did, then
-- remove ols surveys", then "Yes, close all four". The comparison found what
-- the engine surveys (RAPP-929) did not do yet:
--   1. Their audience was a list frozen when the team saved it. An old survey
--      matched its audience live, so a player who signed up, joined a group
--      or arrived later was asked too (RAPP-943).
--   2. Her answers were plain jsonb. An old survey kept them encrypted with
--      the field key (RAPP-944).
--   3. A survey she left half way kept nothing. An old survey kept her
--      answers so far (RAPP-945).
--   4. The CSV was built in the browser. RAPP-402 had moved it behind a recent
--      authenticator code with an audit row per export (RAPP-946).
--   5. The results counted test players. RAPP-619 keeps a test player out of
--      every real report; a test account (staging review) still sees them.
--
-- WHAT THIS MIGRATION DOES
--
--   1. `custom_forms.audience_rule`: the notification audience a survey's
--      players were picked by. `set_custom_form_recipients` keeps it for a
--      survey, `private.custom_form_audience` matches it live, and
--      `my_surveys` asks her when she opens the app, the way the old
--      `list_player_surveys` did. A survey for everyone asks newcomers too.
--      A test player is asked only what a test account published (RAPP-885).
--   2. `survey_answers.value` becomes `value_encrypted` (`encrypt_field`).
--   3. A survey keeps her answers so far through the form progress functions
--      (RAPP-886); `my_surveys` says which are started, `complete_survey`
--      removes them when she sends, and a closed survey keeps nothing.
--   4. `create_survey_results_export`: the rows of the CSV after a recent
--      authenticator code, rate-limited and audited as `survey_export`.
--   5. `survey_results` and the export leave test players out, unless the
--      team member reading them is a test account.
--
-- Docs: https://www.postgresql.org/docs/17/sql-altertable.html
-- https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker

-- 1. A survey's audience is matched live ------------------------------------------------------------

alter table public.custom_forms add column audience_rule jsonb;
alter table public.custom_forms add constraint custom_forms_audience_rule_shape check (
  audience_rule is null
  or (kind = 'survey'
      and jsonb_typeof(audience_rule) = 'object'
      and audience_rule ->> 'kind' in ('all', 'interest', 'signup', 'entity', 'custom_group')
      and jsonb_typeof(audience_rule -> 'config') = 'object'));
comment on column public.custom_forms.audience_rule is
  'A survey''s players picked by a notification audience ({kind, config, chosen_by}), matched live by private.custom_form_audience (RAPP-943). Null when picked one by one, and on every other form.';

create or replace function public.set_custom_form_recipients(
  p_form_id uuid, p_audience_kind text, p_audience_config jsonb default '{}'::jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  form public.custom_forms;
  chosen uuid[];
begin
  select * into form from public.custom_forms f where f.id = p_form_id and f.org_id = actor_org;
  if form.id is null then
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
  -- A survey keeps the rule, so whoever matches it later is asked too (RAPP-943).
  update public.custom_forms
     set audience_rule = case
           when form.kind = 'survey' and p_audience_kind <> 'players'
             then jsonb_build_object('kind', p_audience_kind,
                                     'config', coalesce(p_audience_config, '{}'::jsonb),
                                     'chosen_by', (select auth.uid()))
         end
   where id = form.id;
  delete from public.custom_form_recipients where form_id = p_form_id;
  insert into public.custom_form_recipients (form_id, profile_id, org_id)
  select p_form_id, unnest(chosen), actor_org;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'custom_form.recipients', 'custom_form', p_form_id,
          jsonb_build_object('audience_kind', p_audience_kind, 'count', cardinality(chosen)));
  return cardinality(chosen);
end;
$$;

-- Who a form is for now. A survey picked by an audience matches it live, and
-- a test player gets a survey only when a test account published it (RAPP-885).
create or replace function private.custom_form_audience(p_form_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(p.id order by p.created_at, p.id), array[]::uuid[])
    from public.custom_forms f
    join public.profiles p on p.org_id = f.org_id and p.role = 'player' and p.is_active
                          and p.anonymized_at is null
   where f.id = p_form_id
     and (f.kind <> 'survey'
          or not p.is_test_account
          or exists (select 1 from public.profiles pub
                      where pub.org_id = f.org_id and pub.is_test_account
                        and pub.id in (f.created_by,
                                       (select v.published_by from public.custom_form_versions v
                                         where v.form_id = f.id order by v.version desc limit 1),
                                       (f.audience_rule ->> 'chosen_by')::uuid)))
     and (f.audience = 'all'
          or (f.kind = 'survey' and f.audience_rule is not null
              and private.matches_notification_audience(
                    p.id, f.audience_rule ->> 'kind', f.audience_rule -> 'config',
                    (f.audience_rule ->> 'chosen_by')::uuid))
          or ((f.kind <> 'survey' or f.audience_rule is null)
              and exists (select 1 from public.custom_form_recipients r
                           where r.form_id = f.id and r.profile_id = p.id)));
$$;
revoke all on function private.custom_form_audience(uuid) from public, anon, authenticated;

-- 2. Her answers are encrypted -----------------------------------------------------------------------

alter table public.survey_answers add column value_encrypted bytea;
update public.survey_answers set value_encrypted = public.encrypt_field(value::text);
alter table public.survey_answers alter column value_encrypted set not null;
alter table public.survey_answers drop column value;
comment on table public.survey_answers is
  'A response''s answers to a survey (RAPP-929), encrypted with the field key (RAPP-944): never her record. Written by complete_survey, read by survey_results and create_survey_results_export.';

-- 3. Her surveys: asked live, started or not ---------------------------------------------------------

drop function public.my_surveys();
create function public.my_surveys()
returns table (
  response_id uuid,
  form_id uuid,
  version integer,
  name jsonb,
  event_id uuid,
  closes_at timestamptz,
  asked_at timestamptz,
  content jsonb,
  is_started boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  -- Asked when she matches a live survey she was never asked (RAPP-943).
  insert into public.custom_form_responses (org_id, form_id, version, profile_id, season_id)
  select f.org_id, f.id, v.version, caller, v.season_id
    from public.custom_forms f
    join public.profiles me on me.id = caller and me.org_id = f.org_id and me.role = 'player'
    cross join lateral (select cv.version, cv.season_id from public.custom_form_versions cv
                         where cv.form_id = f.id order by cv.version desc limit 1) v
   where f.kind = 'survey' and not f.is_archived
     and (f.closes_at is null or f.closes_at > now())
     and caller = any (private.custom_form_audience(f.id))
     and not exists (select 1 from public.custom_form_responses r
                      where r.form_id = f.id and r.profile_id = caller)
  on conflict do nothing;
  return query
  select r.id, f.id, cv.version, cv.content -> 'name', f.event_id, f.closes_at, r.asked_at, cv.content,
         exists (select 1 from public.custom_form_progress g where g.response_id = r.id)
    from public.custom_form_responses r
    join public.custom_forms f on f.id = r.form_id
    join public.custom_form_versions cv on cv.form_id = f.id and cv.version = r.version
   where r.profile_id = caller and r.status = 'pending'
     and f.kind = 'survey' and not f.is_archived
     and (f.closes_at is null or f.closes_at > now())
     and jsonb_array_length(cv.content -> 'screens') > 0
   order by f.closes_at nulls last, r.asked_at, r.id;
end;
$$;
revoke all on function public.my_surveys() from public, anon;
grant execute on function public.my_surveys() to authenticated;
comment on function public.my_surveys() is
  'The surveys waiting for her, each as the version she was asked, with whether she started it (RAPP-929, RAPP-943, RAPP-945). Asks her any live survey she now matches.';

-- Her answers, encrypted, and her answers so far removed (RAPP-944, RAPP-945).
create or replace function public.complete_survey(p_response_id uuid, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  response public.custom_form_responses;
  form public.custom_forms;
  asked jsonb;
  placement jsonb;
  asked_field uuid;
  answer jsonb;
  question_type text;
  live_options text[];
  answers jsonb := coalesce(nullif(p_answers, 'null'::jsonb), '{}'::jsonb);
begin
  select * into response from public.custom_form_responses where id = p_response_id for update;
  if response.id is null or response.profile_id is distinct from caller then
    raise insufficient_privilege using message = 'a survey is answered by the player it asks';
  end if;
  select * into form from public.custom_forms where id = response.form_id;
  if form.kind is distinct from 'survey' or form.is_archived then
    raise insufficient_privilege using message = 'this survey is not asked now';
  end if;
  if response.status <> 'pending' then
    raise check_violation using message = 'the survey is already answered';
  end if;
  if form.closes_at is not null and form.closes_at <= now() then
    raise check_violation using message = 'the survey is closed';
  end if;
  if jsonb_typeof(answers) <> 'object' then
    raise invalid_parameter_value using message = 'the answers are an object by question';
  end if;
  select v.content into asked
    from public.custom_form_versions v where v.form_id = form.id and v.version = response.version;
  if asked is null then
    raise insufficient_privilege using message = 'this survey is not asked now';
  end if;
  -- Only the questions of the version she was asked.
  if exists (select 1 from jsonb_object_keys(answers) k
              where not exists (select 1 from jsonb_array_elements(asked -> 'placements') p
                                 where p ->> 'field_id' = k)) then
    raise invalid_parameter_value using message = 'an answer to a question the survey does not ask';
  end if;
  for placement in select value from jsonb_array_elements(asked -> 'placements') loop
    asked_field := (placement ->> 'field_id')::uuid;
    answer := nullif(answers -> (placement ->> 'field_id'), 'null'::jsonb);
    if answer is null then
      if coalesce((placement ->> 'required')::boolean, false) then
        raise check_violation using message = 'a required question has no answer';
      end if;
      continue;
    end if;
    question_type := placement -> 'field' ->> 'question_type';
    select coalesce(array_agg(o ->> 'id'), '{}') into live_options
      from jsonb_array_elements(coalesce(placement -> 'field' -> 'options', '[]'::jsonb)) o;
    answer := private.custom_answer_tidied(question_type, answer);
    if not private.custom_answer_value_valid(
         question_type, coalesce(placement -> 'field' -> 'settings', '{}'::jsonb), answer, live_options) then
      raise check_violation using message = 'an answer does not fit its question';
    end if;
    insert into public.survey_answers (response_id, field_id, org_id, profile_id, value_encrypted)
    values (response.id, asked_field, response.org_id, response.profile_id, public.encrypt_field(answer::text))
    on conflict (response_id, field_id) do update set value_encrypted = excluded.value_encrypted;
  end loop;
  delete from public.custom_form_progress where response_id = response.id;
  update public.custom_form_responses
     set status = 'done', answered_at = now(), answered_by = caller, filled_by = 'player'
   where id = response.id;
end;
$$;
revoke all on function public.complete_survey(uuid, jsonb) from public, anon;
grant execute on function public.complete_survey(uuid, jsonb) to authenticated;

-- Her answers so far: the form progress functions keep a survey's too (RAPP-945).
CREATE OR REPLACE FUNCTION public.save_custom_form_progress(p_response_id uuid, p_answers jsonb, p_screen_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
  her public.profiles;
  response public.custom_form_responses;
  form public.custom_forms;
  asked uuid[];
  kept jsonb;
begin
  select * into her from public.profiles where id = caller;
  select * into response from public.custom_form_responses where id = p_response_id for update;
  if her.id is null or her.role <> 'player' or response.id is null or response.profile_id <> caller then
    raise insufficient_privilege using message = 'a form is kept by the player it asks';
  end if;
  select * into form from public.custom_forms where id = response.form_id;
  if form.filled_by <> 'player' or form.is_archived
     or not exists (select 1 from private.custom_form_version_for(form.id, caller)) then
    raise insufficient_privilege using message = 'this form is not asked now';
  end if;
  -- A closed survey keeps nothing more (RAPP-945).
  if form.kind = 'survey' and form.closes_at is not null and form.closes_at <= now() then
    raise check_violation using message = 'the survey is closed';
  end if;
  if response.status <> 'pending' then
    raise check_violation using message = 'the form is already answered';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise invalid_parameter_value using message = 'save_custom_form_progress takes her answers by field';
  end if;
  if octet_length(p_answers::text) > 65536 then
    raise check_violation using message = 'her answers so far are too long to keep';
  end if;
  asked := private.custom_form_progress_fields(form.id, caller);
  if exists (select 1 from jsonb_object_keys(p_answers) k
              where k !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                 or not (k::uuid = any (asked))) then
    raise check_violation using message = 'her answers so far answer the fields the form asks';
  end if;
  if p_screen_id is not null and not exists (
    select 1 from public.custom_form_screens s
     where s.id = p_screen_id and s.form_id = form.id and not s.is_archived) then
    raise check_violation using message = 'the screen she is on is a screen of the form';
  end if;
  kept := jsonb_strip_nulls(p_answers);
  if kept = '{}'::jsonb and p_screen_id is null then
    delete from public.custom_form_progress where response_id = response.id;
    return;
  end if;
  insert into public.custom_form_progress (response_id, org_id, profile_id, screen_id, answers_encrypted)
  values (response.id, response.org_id, caller, p_screen_id, public.encrypt_field(kept::text))
  on conflict (response_id) do update
    set screen_id = excluded.screen_id,
        answers_encrypted = excluded.answers_encrypted,
        saved_at = now();
end;
$function$;

-- 4. The results and their CSV -----------------------------------------------------------------------

-- Whether a test player's answers count for whoever reads them: never in a
-- real report (RAPP-619), always for a test account reviewing staging.
create or replace function private.survey_counts_player(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not coalesce((select p.is_test_account from public.profiles p where p.id = p_profile_id), false)
      or coalesce((select me.is_test_account from public.profiles me where me.id = (select auth.uid())), false);
$$;
revoke all on function private.survey_counts_player(uuid) from public, anon, authenticated;

-- Each answered response of a survey with its answers, for the team (RAPP-929).
create or replace function public.survey_results(p_form_id uuid)
returns table (
  response_id uuid,
  profile_id uuid,
  display_name text,
  member_number integer,
  version integer,
  answered_at timestamptz,
  answers jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
begin
  if not ((select public.has_permission('participants.view'))
          or (select public.has_permission('surveys.results'))) then
    raise insufficient_privilege using message = 'survey results are read by the team';
  end if;
  if not exists (select 1 from public.custom_forms f
                  where f.id = p_form_id and f.org_id = actor_org and f.kind = 'survey') then
    raise no_data_found using message = 'no such survey';
  end if;
  return query
  select r.id, r.profile_id,
         nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
         p.member_number, r.version, r.answered_at,
         coalesce((select jsonb_object_agg(a.field_id::text, public.decrypt_field(a.value_encrypted)::jsonb)
                     from public.survey_answers a where a.response_id = r.id), '{}'::jsonb)
    from public.custom_form_responses r
    join public.profiles p on p.id = r.profile_id
   where r.form_id = p_form_id and r.status = 'done'
     and private.survey_counts_player(r.profile_id)
   order by r.answered_at desc, r.id;
end;
$$;
revoke all on function public.survey_results(uuid) from public, anon;
grant execute on function public.survey_results(uuid) to authenticated;

-- The rows of a survey's CSV (RAPP-946): it names every player who answered,
-- so it asks for a recent authenticator code, is rate-limited, and writes one
-- audit row per export without copying any answer (as RAPP-402 did).
create or replace function public.create_survey_results_export(p_form_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  export_id uuid := gen_random_uuid();
  export_rows jsonb;
begin
  perform private.require_recent_second_factor();
  if actor is null or actor_org is null or not (
       (select public.has_permission('participants.view'))
       or (select public.has_permission('surveys.results'))) then
    raise insufficient_privilege using message = 'survey exports require survey results access';
  end if;
  if not exists (select 1 from public.custom_forms f
                  where f.id = p_form_id and f.org_id = actor_org and f.kind = 'survey') then
    raise no_data_found using message = 'no such survey';
  end if;
  if (select count(*) from public.audit_log l
       where l.actor_id = actor and l.action = 'survey_export'
         and l.created_at >= now() - interval '1 minute') >= 5 then
    raise sqlstate '42901' using message = 'export rate limit exceeded';
  end if;
  select coalesce(jsonb_agg(to_jsonb(result)), '[]'::jsonb) into export_rows
    from public.survey_results(p_form_id) as result;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'survey_export', 'custom_form', p_form_id,
          jsonb_build_object('export_id', export_id, 'format', 'csv',
                             'row_count', jsonb_array_length(export_rows)));
  return jsonb_build_object('version', 1, 'export_id', export_id, 'form_id', p_form_id,
                            'generated_at', now(), 'rows', export_rows);
end;
$$;
revoke all on function public.create_survey_results_export(uuid) from public, anon;
grant execute on function public.create_survey_results_export(uuid) to authenticated;
comment on function public.create_survey_results_export(uuid) is
  'The rows of a survey''s CSV after a recent authenticator code, rate-limited and audited as survey_export, without copying answers into the audit row (RAPP-946).';
