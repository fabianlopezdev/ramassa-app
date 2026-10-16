-- The survey CSV gets the data export rules on the server (RAPP-402).
--
-- The CSV names every participant who answered, but the web admin built it in
-- the browser from `list_survey_responses`, with no recent second factor and
-- no audit entry. This function returns the same rows only after a recent
-- authenticator code, writes one audit row per export, and keeps the data
-- exports' rate limit (five a minute). Both apps build the CSV from its rows.

create or replace function public.create_survey_export(p_survey_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  export_id uuid := gen_random_uuid();
  export_rows jsonb;
begin
  perform private.require_recent_second_factor();
  if actor is null or actor_org is null or not (select public.has_permission('surveys.results')) then
    raise insufficient_privilege using message = 'survey exports require survey results access';
  end if;
  if not exists (
    select 1 from public.surveys as survey
    where survey.id = p_survey_id and survey.org_id = actor_org
  ) then
    raise no_data_found using message = 'survey not found';
  end if;
  if (
    select count(*)
    from public.audit_log as log
    where log.actor_id = actor
      and log.action = 'survey_export'
      and log.created_at >= now() - interval '1 minute'
  ) >= 5 then
    raise sqlstate '42901' using message = 'export rate limit exceeded';
  end if;

  select coalesce(jsonb_agg(to_jsonb(response)), '[]'::jsonb)
  into export_rows
  from public.list_survey_responses(p_survey_id) as response;

  insert into public.audit_log (id, org_id, actor_id, action, target_type, target_id, changes)
  values (
    gen_random_uuid(), actor_org, actor, 'survey_export', 'survey', p_survey_id,
    jsonb_build_object(
      'export_id', export_id,
      'format', 'csv',
      'row_count', jsonb_array_length(export_rows)
    )
  );

  return jsonb_build_object(
    'version', 1,
    'export_id', export_id,
    'survey_id', p_survey_id,
    'generated_at', now(),
    'rows', export_rows
  );
end;
$$;

revoke all on function public.create_survey_export(uuid) from public, anon;
grant execute on function public.create_survey_export(uuid) to authenticated;
comment on function public.create_survey_export(uuid) is
  'The responses of one survey for its CSV, for surveys.results holders after a recent authenticator code. Rate-limited and audited as survey_export, without copying answers into the audit row.';
