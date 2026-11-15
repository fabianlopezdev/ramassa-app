-- Ramassà's own questions are chosen per player too (RAPP-643).
--
-- WHY
--
-- The Onboarding page is the template, and what one player is asked is
-- decided when staff create her. Until now the Auto / Ask / Don't ask choice
-- (RAPP-301) existed only for the app's own questions
-- (`intake_question_states`, keyed by the built-in question name); the
-- questions staff write in the question builder (RAPP-307, RAPP-642) were
-- always asked. Staff now choose them the same way.
--
-- THE MODEL
--
-- A sibling table, `custom_question_states`, with the same columns and the
-- same row security as `intake_question_states`, keyed by the question's id
-- with a foreign key. It keeps the built-in table and its primary key as they
-- are, and a question's rows go with it. On the wire the choices travel in the
-- same `question_states` object as the built-in ones, a staff question as
-- `custom:<question id>`, so the invitation, her page and the setter keep one
-- payload and one audit row.
--
--   1. The table, readable by the same staff as the built-in states.
--   2. `private.apply_intake_question_states` accepts `custom:<id>` keys: a
--      live question of her organization, Ask or Don't ask, and Don't ask
--      only on an optional question or a required one she answered (the
--      built-in rule). `create_participant_invite` and
--      `set_intake_question_states` call it, so both accept them unchanged.
--   3. `participant_question_states` returns her staff-question rows as
--      `custom:<id>` with the built-in ones.
--   4. `my_custom_question_asking()`: what her phone needs, never the staff
--      setting itself: per staff question with a choice, whether her wizard
--      asks it (Ask) or leaves it out (Don't ask, while allowed). A required
--      question whose answer is missing is asked after all, as a built-in one
--      is (`my_questions_to_ask`).
--
-- Existing rows and grants stay as they are.
--
-- Docs: https://supabase.com/docs/guides/database/postgres/row-level-security
-- (select policies with security definer helpers wrapped in select) and
-- https://www.postgresql.org/docs/current/functions-json.html (`jsonb_each_text`).

-- 1. The table -------------------------------------------------------------------------------------------------

create table public.custom_question_states (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  question_id uuid not null references public.custom_questions (id) on delete cascade,
  state text not null check (state in ('ask', 'skip')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (profile_id, question_id)
);
create index custom_question_states_org_idx on public.custom_question_states (org_id);
create index custom_question_states_question_idx on public.custom_question_states (question_id);

comment on table public.custom_question_states is
  'Per-woman states of the questions staff wrote, set before she joins (RAPP-643). No row = Auto.';

-- As the built-in states: nobody writes it directly, staff read their
-- organization's rows, she reads only what her wizard asks.
alter table public.custom_question_states enable row level security;
revoke all on table public.custom_question_states from anon, authenticated;
grant select on table public.custom_question_states to authenticated;

create policy custom_question_states_select_team
  on public.custom_question_states
  for select
  to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.has_permission('participants.view_personal'))
      or ((select public.has_permission('test_players.manage')) and private.is_test_player(profile_id))
    )
  );

-- 2. One setter for both kinds -----------------------------------------------------------------------------

create or replace function private.apply_intake_question_states(
  p_profile_id uuid,
  p_states jsonb,
  p_actor uuid,
  p_org_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry record;
  old_state text;
  custom_id uuid;
  custom_question public.custom_questions;
  changes jsonb := '{}'::jsonb;
begin
  if p_states is null or jsonb_typeof(p_states) <> 'object' then
    raise invalid_parameter_value using message = 'question states are an object';
  end if;

  for entry in select key as question, value as state from jsonb_each_text(p_states) loop
    if entry.state is null or entry.state not in ('auto', 'ask', 'skip') then
      raise invalid_parameter_value using message = 'unknown state ' || coalesce(entry.state, 'null');
    end if;

    -- A question staff wrote (RAPP-643).
    if entry.question like 'custom:%' then
      if entry.question !~ '^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise invalid_parameter_value using message = 'unknown question ' || entry.question;
      end if;
      custom_id := substr(entry.question, 8)::uuid;
      select * into custom_question from public.custom_questions q
       where q.id = custom_id and q.org_id = p_org_id and not q.is_archived;
      if custom_question.id is null then
        raise invalid_parameter_value using message = 'unknown question ' || entry.question;
      end if;
      if entry.state = 'skip' and custom_question.is_required
         and not exists (
           select 1 from public.custom_answers a
            where a.profile_id = p_profile_id and a.question_id = custom_id)
      then
        raise check_violation
          using message = 'a required question needs an answer before it can be hidden: ' || entry.question;
      end if;

      select s.state into old_state from public.custom_question_states s
       where s.profile_id = p_profile_id and s.question_id = custom_id;
      old_state := coalesce(old_state, 'auto');
      continue when old_state = entry.state;

      if entry.state = 'auto' then
        delete from public.custom_question_states s
         where s.profile_id = p_profile_id and s.question_id = custom_id;
      else
        insert into public.custom_question_states (profile_id, org_id, question_id, state, updated_by)
        values (p_profile_id, p_org_id, custom_id, entry.state, p_actor)
        on conflict (profile_id, question_id) do update
          set state = excluded.state, updated_at = now(), updated_by = excluded.updated_by;
      end if;
      changes := changes || jsonb_build_object(
        entry.question, jsonb_build_object('old', old_state, 'new', entry.state));
      continue;
    end if;

    -- An app question, as before.
    if not (entry.question = any (private.wizard_intake_questions())) then
      raise invalid_parameter_value using message = 'unknown question ' || entry.question;
    end if;
    if entry.state = 'skip'
      and entry.question = any (private.required_intake_questions())
      and not exists (
        select 1 from public.profile_answers a
         where a.profile_id = p_profile_id and a.question = entry.question
      )
    then
      raise check_violation
        using message = 'a required question needs an answer before it can be hidden: ' || entry.question;
    end if;

    select s.state into old_state from public.intake_question_states s
     where s.profile_id = p_profile_id and s.question = entry.question;
    old_state := coalesce(old_state, 'auto');
    continue when old_state = entry.state;

    if entry.state = 'auto' then
      delete from public.intake_question_states s
       where s.profile_id = p_profile_id and s.question = entry.question;
    else
      insert into public.intake_question_states (profile_id, org_id, question, state, updated_by)
      values (p_profile_id, p_org_id, entry.question, entry.state, p_actor)
      on conflict (profile_id, question) do update
        set state = excluded.state, updated_at = now(), updated_by = excluded.updated_by;
    end if;
    changes := changes || jsonb_build_object(
      entry.question, jsonb_build_object('old', old_state, 'new', entry.state));
  end loop;

  if changes <> '{}'::jsonb then
    insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
    values (p_org_id, p_actor, 'profile.intake_questions_update', 'profile', p_profile_id, changes);
  end if;
end;
$$;

-- 3. Her page reads both ---------------------------------------------------------------------------------

create or replace function public.participant_question_states(p_profile_id uuid)
returns table (question text, state text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view_personal')) then
    raise insufficient_privilege using message = 'reading question states needs participants.view_personal';
  end if;
  return query
    select rows.question, rows.state
      from (
        select s.question, s.state
          from public.intake_question_states s
         where s.profile_id = p_profile_id
           and s.org_id = (select public.current_org_id())
        union all
        -- The questions staff wrote (RAPP-643), keyed as on the wire.
        select 'custom:' || c.question_id::text, c.state
          from public.custom_question_states c
         where c.profile_id = p_profile_id
           and c.org_id = (select public.current_org_id())
      ) rows
     order by rows.question;
end;
$$;

-- 4. What her phone reads ----------------------------------------------------------------------------------

create or replace function public.my_custom_question_asking()
returns table (question_id uuid, is_asked boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.question_id,
         s.state = 'ask'
         -- Don't ask on a required question whose answer is missing is
         -- asked after all, so a finished profile is always complete.
         or (q.is_required and not exists (
               select 1 from public.custom_answers a
                where a.profile_id = s.profile_id and a.question_id = s.question_id))
    from public.custom_question_states s
    join public.custom_questions q on q.id = s.question_id and not q.is_archived
   where s.profile_id = (select auth.uid())
   order by s.question_id;
$$;

revoke all on function public.my_custom_question_asking() from public, anon;
grant execute on function public.my_custom_question_asking() to authenticated;
