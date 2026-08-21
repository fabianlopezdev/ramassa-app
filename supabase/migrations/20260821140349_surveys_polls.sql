-- Multilingual surveys, attributed encrypted responses, and audience distribution (RAPP-60).

create table public.surveys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid,
  title jsonb not null,
  published_at timestamptz not null,
  closes_at timestamptz,
  audience_kind text not null check (
    audience_kind in ('all', 'interest', 'signup', 'entity', 'custom_group')
  ),
  audience_config jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint surveys_org_id_id_unique unique (org_id, id),
  constraint surveys_event_tenant_fkey
    foreign key (org_id, event_id)
    references public.events (org_id, id) on delete set null (event_id),
  constraint surveys_creator_tenant_fkey
    foreign key (org_id, created_by)
    references public.profiles (org_id, id) on delete set null (created_by),
  constraint surveys_window_check check (closes_at is null or closes_at > published_at)
);

create table public.survey_questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  survey_id uuid not null,
  prompt jsonb not null,
  question_type text not null check (
    question_type in ('rating', 'multiple_choice', 'yes_no', 'free_text')
  ),
  options jsonb,
  required boolean not null default true,
  sort_order integer not null check (sort_order >= 0),
  created_at timestamptz not null default now(),
  constraint survey_questions_org_id_id_unique unique (org_id, id),
  constraint survey_questions_order_unique unique (survey_id, sort_order),
  constraint survey_questions_survey_tenant_fkey
    foreign key (org_id, survey_id)
    references public.surveys (org_id, id) on delete cascade,
  constraint survey_questions_options_shape check (
    (question_type = 'multiple_choice' and jsonb_typeof(options) = 'array'
      and jsonb_array_length(options) between 2 and 12)
    or (question_type <> 'multiple_choice' and options is null)
  )
);

create table public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  survey_id uuid not null,
  player_id uuid not null,
  answers_encrypted bytea not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint survey_responses_org_id_id_unique unique (org_id, id),
  constraint survey_responses_survey_player_unique unique (survey_id, player_id),
  constraint survey_responses_survey_tenant_fkey
    foreign key (org_id, survey_id)
    references public.surveys (org_id, id) on delete cascade,
  constraint survey_responses_player_tenant_fkey
    foreign key (org_id, player_id)
    references public.profiles (org_id, id) on delete cascade,
  constraint survey_responses_completion_shape check (
    (status = 'in_progress' and completed_at is null)
    or (status = 'completed' and completed_at is not null)
  ),
  constraint survey_responses_encrypted_size check (octet_length(answers_encrypted) <= 131072)
);

comment on table public.surveys is
  'Staff-authored, audience-scoped, five-language surveys with optional event attachment.';
comment on table public.survey_responses is
  'Attributed personal survey responses. Answer JSON is encrypted at rest and purged with the player.';

create trigger surveys_set_updated_at
  before update on public.surveys
  for each row execute function public.set_updated_at();
create trigger survey_responses_set_updated_at
  before update on public.survey_responses
  for each row execute function public.set_updated_at();

create index surveys_event_id_idx on public.surveys (org_id, event_id, published_at desc);
create index surveys_schedule_idx on public.surveys (org_id, published_at, closes_at, id);
create index survey_questions_survey_id_idx
  on public.survey_questions (org_id, survey_id, sort_order, id);
create index survey_responses_player_id_idx
  on public.survey_responses (org_id, player_id, updated_at desc, id);
create index survey_responses_survey_id_idx
  on public.survey_responses (org_id, survey_id, status, completed_at desc, id);

alter table public.surveys enable row level security;
alter table public.surveys force row level security;
alter table public.survey_questions enable row level security;
alter table public.survey_questions force row level security;
alter table public.survey_responses enable row level security;
alter table public.survey_responses force row level security;

create policy surveys_select_staff
  on public.surveys for select to authenticated
  using (org_id = (select public.current_org_id()) and (select public.is_staff_or_admin()));
create policy survey_questions_select_staff
  on public.survey_questions for select to authenticated
  using (org_id = (select public.current_org_id()) and (select public.is_staff_or_admin()));
create policy survey_responses_select_owner_or_staff
  on public.survey_responses for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (player_id = (select auth.uid()) or (select public.is_staff_or_admin()))
  );

revoke all on table public.surveys from public, anon, authenticated;
revoke all on table public.survey_questions from public, anon, authenticated;
revoke all on table public.survey_responses from public, anon, authenticated;
grant select on table public.surveys to authenticated;
grant select on table public.survey_questions to authenticated;
grant select on table public.survey_responses to authenticated;

create or replace function private.valid_survey_copy(copy jsonb, max_length integer)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_typeof(copy) = 'object'
    and (select count(*) from jsonb_object_keys(copy)) = 5
    and copy ?& array['ca', 'es', 'en', 'ar', 'fa']
    and not exists (
      select 1
      from jsonb_each(copy) as item(language, value)
      where item.language not in ('ca', 'es', 'en', 'ar', 'fa')
        or jsonb_typeof(item.value) <> 'string'
        or length(btrim(item.value #>> '{}')) not between 1 and max_length
    );
$$;

create or replace function private.matches_notification_audience(
  p_profile_id uuid,
  p_audience_kind text,
  p_audience_config jsonb default '{}'::jsonb
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
$$;

create or replace function private.validate_survey_questions(p_questions jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_typeof(p_questions) = 'array'
    and jsonb_array_length(p_questions) between 1 and 30
    and not exists (
      select 1
      from jsonb_array_elements(p_questions) as question(value)
      where not (question.value ?& array['id', 'type', 'prompt', 'required', 'sortOrder'])
        or (question.value->>'id')::uuid is null
        or question.value->>'type' not in ('rating', 'multiple_choice', 'yes_no', 'free_text')
        or not private.valid_survey_copy(question.value->'prompt', 1000)
        or jsonb_typeof(question.value->'required') <> 'boolean'
        or (question.value->>'sortOrder')::integer < 0
        or (
          question.value->>'type' = 'multiple_choice'
          and (
            jsonb_typeof(question.value->'options') <> 'array'
            or jsonb_array_length(question.value->'options') not between 2 and 12
            or exists (
              select 1 from jsonb_array_elements(question.value->'options') as option(value)
              where not (option.value ?& array['id', 'label'])
                or jsonb_typeof(option.value->'id') <> 'string'
                or length(btrim(option.value->>'id')) not between 1 and 80
                or option.value->>'id' !~ '^[a-z0-9_-]+$'
                or not private.valid_survey_copy(option.value->'label', 1000)
            )
            or (
              select count(*) <> count(distinct option.value->>'id')
              from jsonb_array_elements(question.value->'options') as option(value)
            )
          )
        )
        or (
          question.value->>'type' <> 'multiple_choice'
          and question.value->'options' <> 'null'::jsonb
        )
    )
    and (
      select count(*) = count(distinct question.value->>'id')
        and count(*) = count(distinct question.value->>'sortOrder')
      from jsonb_array_elements(p_questions) as question(value)
    );
$$;

create or replace function public.save_survey(
  p_id uuid,
  p_title jsonb,
  p_event_id uuid,
  p_published_at timestamptz,
  p_closes_at timestamptz,
  p_audience_kind text,
  p_audience_config jsonb,
  p_questions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  saved_id uuid;
  question jsonb;
begin
  if not (select public.is_staff_or_admin()) then
    raise exception 'SURVEYS/STAFF_ONLY' using errcode = '42501';
  end if;
  if not private.valid_survey_copy(p_title, 160)
    or p_audience_kind not in ('all', 'interest', 'signup', 'entity', 'custom_group')
    or p_published_at is null
    or (p_closes_at is not null and p_closes_at <= p_published_at)
    or not private.validate_survey_questions(p_questions)
  then
    raise exception 'SURVEYS/INVALID_DEFINITION' using errcode = '23514';
  end if;
  if p_event_id is not null and not exists (
    select 1 from public.events where id = p_event_id and org_id = actor_org
  ) then
    raise exception 'SURVEYS/EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_id is null then
    insert into public.surveys (
      org_id, event_id, title, published_at, closes_at, audience_kind, audience_config, created_by
    ) values (
      actor_org, p_event_id, p_title, p_published_at, p_closes_at,
      p_audience_kind, coalesce(p_audience_config, '{}'::jsonb), actor
    ) returning id into saved_id;
  else
    if exists (
      select 1 from public.survey_responses
      where org_id = actor_org and survey_id = p_id
    ) then
      raise exception 'SURVEYS/RESPONSES_EXIST' using errcode = '55000';
    end if;
    update public.surveys set
      event_id = p_event_id,
      title = p_title,
      published_at = p_published_at,
      closes_at = p_closes_at,
      audience_kind = p_audience_kind,
      audience_config = coalesce(p_audience_config, '{}'::jsonb)
    where id = p_id and org_id = actor_org
    returning id into saved_id;
    if saved_id is null then
      raise exception 'SURVEYS/NOT_FOUND' using errcode = 'P0002';
    end if;
    delete from public.survey_questions where survey_id = saved_id and org_id = actor_org;
  end if;

  for question in select value from jsonb_array_elements(p_questions)
  loop
    insert into public.survey_questions (
      id, org_id, survey_id, prompt, question_type, options, required, sort_order
    ) values (
      (question->>'id')::uuid,
      actor_org,
      saved_id,
      question->'prompt',
      question->>'type',
      nullif(question->'options', 'null'::jsonb),
      (question->>'required')::boolean,
      (question->>'sortOrder')::integer
    );
  end loop;
  return saved_id;
end;
$$;

create or replace function public.list_surveys()
returns table (
  id uuid,
  title jsonb,
  event_id uuid,
  published_at timestamptz,
  closes_at timestamptz,
  audience_kind text,
  audience_config jsonb,
  questions jsonb,
  response_count bigint,
  completed_count bigint
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
      where response.org_id = survey.org_id and response.survey_id = survey.id),
    (select count(*) from public.survey_responses as response
      where response.org_id = survey.org_id and response.survey_id = survey.id
        and response.status = 'completed')
  from public.surveys as survey
  where survey.org_id = (select public.current_org_id())
    and (select public.is_staff_or_admin())
  order by survey.created_at desc, survey.id desc;
$$;

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
      (select auth.uid()), survey.audience_kind, survey.audience_config
    )
  order by survey.published_at desc, survey.id desc;
$$;

create or replace function private.valid_survey_answers(
  p_survey_id uuid,
  p_answers jsonb,
  p_complete boolean
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  question record;
  answer jsonb;
begin
  if jsonb_typeof(p_answers) <> 'object' or octet_length(p_answers::text) > 65536 then
    return false;
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_answers) as supplied(question_id)
    where not exists (
      select 1 from public.survey_questions
      where survey_id = p_survey_id and id = supplied.question_id::uuid
    )
  ) then
    return false;
  end if;
  for question in
    select id, question_type, options, required
    from public.survey_questions
    where survey_id = p_survey_id
  loop
    answer := p_answers->question.id::text;
    if answer is null then
      if p_complete and question.required then return false; end if;
      continue;
    end if;
    if question.question_type = 'rating' and not (
      jsonb_typeof(answer) = 'number'
      and (answer #>> '{}')::numeric = trunc((answer #>> '{}')::numeric)
      and (answer #>> '{}')::integer between 1 and 5
    ) then return false;
    elsif question.question_type = 'multiple_choice' and not (
      jsonb_typeof(answer) = 'string'
      and exists (
        select 1 from jsonb_array_elements(question.options) as option(value)
        where option.value->>'id' = answer #>> '{}'
      )
    ) then return false;
    elsif question.question_type = 'yes_no' and jsonb_typeof(answer) <> 'boolean' then
      return false;
    elsif question.question_type = 'free_text' and not (
      jsonb_typeof(answer) = 'string'
      and length(btrim(answer #>> '{}')) between 1 and 4000
    ) then return false;
    end if;
  end loop;
  return true;
exception when invalid_text_representation then
  return false;
end;
$$;

create or replace function public.get_own_survey_response(p_survey_id uuid)
returns table (id uuid, answers jsonb, status text, completed_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    response.id,
    public.decrypt_field(response.answers_encrypted)::jsonb,
    response.status,
    response.completed_at,
    response.updated_at
  from public.survey_responses as response
  where response.org_id = (select public.current_org_id())
    and response.survey_id = p_survey_id
    and response.player_id = (select auth.uid());
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
      actor.id, selected_survey.audience_kind, selected_survey.audience_config
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

create or replace function public.list_survey_responses(p_survey_id uuid)
returns table (
  id uuid,
  player_id uuid,
  player_name text,
  language text,
  answers jsonb,
  status text,
  completed_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.is_staff_or_admin()) then
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
  order by response.completed_at desc nulls last, response.updated_at desc, response.id;
end;
$$;

revoke all on function private.valid_survey_copy(jsonb, integer) from public, anon, authenticated;
revoke all on function private.validate_survey_questions(jsonb) from public, anon, authenticated;
revoke all on function private.matches_notification_audience(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function private.valid_survey_answers(uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.save_survey(uuid, jsonb, uuid, timestamptz, timestamptz, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.list_surveys() from public, anon, authenticated;
revoke all on function public.list_player_surveys() from public, anon, authenticated;
revoke all on function public.get_own_survey_response(uuid) from public, anon, authenticated;
revoke all on function public.save_survey_response(uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.list_survey_responses(uuid) from public, anon, authenticated;

grant execute on function public.save_survey(uuid, jsonb, uuid, timestamptz, timestamptz, text, jsonb, jsonb)
  to authenticated;
grant execute on function public.list_surveys() to authenticated;
grant execute on function public.list_player_surveys() to authenticated;
grant execute on function public.get_own_survey_response(uuid) to authenticated;
grant execute on function public.save_survey_response(uuid, jsonb, boolean) to authenticated;
grant execute on function public.list_survey_responses(uuid) to authenticated;

create or replace function public.personal_data_disposition()
returns table (table_name text, participant_column text, disposition text, reason text)
language sql
immutable
security invoker
set search_path = ''
as $$
  select * from (values
    ('profiles', 'id', 'purge', 'The participant profile and its encrypted fields.'),
    ('participant_notes', 'profile_id', 'purge', 'Staff prose about the participant.'),
    ('push_tokens', 'user_id', 'purge', 'Registered participant devices.'),
    ('push_deliveries', 'recipient_id', 'purge', 'Per-device notification delivery history.'),
    ('custom_notification_group_members', 'participant_id', 'purge', 'Curated notification membership.'),
    ('terms_acceptances', 'profile_id', 'purge', 'Participant consent records.'),
    ('deletion_requests', 'profile_id', 'purge', 'Participant erasure requests.'),
    ('invites', 'accepted_by', 'purge', 'The invitation that admitted the participant.'),
    ('entity_invitations', 'profile_id', 'purge', 'The invitation that admitted an entity collaborator.'),
    ('equipment_deliveries', 'profile_id', 'purge', 'Participant equipment history.'),
    ('event_signups', 'player_id', 'purge', 'Participant event activity.'),
    ('attendance', 'player_id', 'purge', 'Participant attendance history.'),
    ('service_interests', 'user_id', 'purge', 'Participant service interests.'),
    ('conversations', 'user_id', 'purge', 'Participant direct correspondence.'),
    ('messages', 'sender_id', 'purge', 'Participant-authored messages.'),
    ('conversation_read_states', 'user_id', 'purge', 'Participant message read history.'),
    ('conversation_assignment_history', 'user_id', 'purge', 'Participant conversation handling history.'),
    ('forum_posts', 'author_id', 'purge', 'Participant-authored forum posts.'),
    ('forum_replies', 'author_id', 'purge', 'Participant-authored forum replies.'),
    ('forum_flags', 'flagger_id', 'purge', 'Participant safety reports and optional comments.'),
    ('media_items', 'uploaded_by', 'purge', 'Participant gallery media and its consent record.'),
    ('entity_referrals', 'referred_profile_id', 'purge', 'Referral intake cascades with the linked participant.'),
    ('referral_updates', 'author_id', 'purge', 'Referral updates authored by the participant.'),
    ('mentoring_requests', 'player_id', 'purge', 'Private support requests belonging to the player.'),
    ('mentoring_notification_events', 'recipient_id', 'purge', 'Technical mentoring schedule notifications.'),
    ('feedback_submissions', 'author_id', 'purge', 'Encrypted feedback and its private attachment key.'),
    ('survey_responses', 'player_id', 'purge', 'Attributed encrypted survey responses.'),
    ('audit_log', 'actor_id', 'purge', 'Rows where the participant acted.'),
    ('audit_log', 'target_id', 'retain', 'Opaque lawful-access and erasure record.'),
    ('entity_referrals', null, 'retain_limited', 'Unlinked referral intake is purged after 24 months.'),
    ('entity_invitations', null, 'retain_limited', 'Expired entity invitations are purged after 24 months.'),
    ('notification_templates', null, 'not_personal', 'Organization-owned notification copy.'),
    ('custom_notification_groups', null, 'not_personal', 'Organization-owned audience definitions.'),
    ('targeted_notification_sends', null, 'not_personal', 'Aggregate organization send history.'),
    ('surveys', null, 'not_personal', 'Organization-owned survey definitions.'),
    ('survey_questions', null, 'not_personal', 'Organization-owned survey questions.'),
    ('announcements', null, 'not_personal', 'Organization-owned operational content.'),
    ('event_categories', null, 'not_personal', 'Organization-owned event vocabulary.'),
    ('events', null, 'not_personal', 'Organization-owned schedules.'),
    ('event_occurrences', null, 'not_personal', 'Materialized organization schedules.'),
    ('knowledge_categories', null, 'not_personal', 'Organization-owned knowledge vocabulary.'),
    ('knowledge_articles', 'author_id', 'purge', 'Participant-authored knowledge stories.'),
    ('push_publications', 'recipient_id', 'purge', 'Recipient-specific push publications.'),
    ('service_categories', null, 'not_personal', 'Organization-owned service vocabulary.'),
    ('services', null, 'not_personal', 'Organization-owned directory content.'),
    ('service_images', null, 'not_personal', 'Organization-owned service media.'),
    ('service_submission_comments', null, 'not_personal', 'Organization review correspondence.'),
    ('service_submission_notifications', null, 'not_personal', 'Organization staff queue.'),
    ('forum_categories', null, 'not_personal', 'Organization-owned forum vocabulary.'),
    ('collaborating_entities', null, 'not_personal', 'A tenant-owned partner organization.'),
    ('organizations', null, 'not_personal', 'A tenant, not a person.'),
    ('municipality_catalog', null, 'not_personal', 'Official geography with no participant data.')
  ) as disposition(table_name, participant_column, disposition, reason);
$$;
