-- The mentoring request moves onto the form engine (RAPP-940), sharing the rules of the suggestions form.
--
-- WHY
--
-- Fabián, 2026-11-23: the Onboarding screens are how every form should look,
-- and the remaining forms move onto the engine. Players ask the club for a
-- one-to-one conversation from the app (Mentoria); staff now build that form on
-- a board of screens, each edited in the shared screen editor, and add their
-- own questions to it, exactly as they build the suggestions form since
-- RAPP-939. The mentoring queue shows what a player answered.
--
-- The two forms do the same job: a form of the app's own that she sends when
-- she wants, with one fixed screen that holds the request's own parts and
-- questions staff add around it. So the rules RAPP-939 wrote for the
-- suggestions form become one set of rules for both ("forms she sends when she
-- wants", `private.on_demand_form_keys()`), and this migration replaces the
-- suggestions form's own functions and triggers with them. The suggestions form
-- behaves exactly as before: the same checks, the same messages.
--
-- Three things stay exactly where they are:
--   - the request itself. Its topic, its detail and its preferred date and time
--     are the form's own fixed parts: `mentoring_requests` keeps them in the
--     same columns with the same encryption, and `create_mentoring_request(text,
--     text, date, time)` is not touched, so an installed build still sends one;
--   - installed phone builds read `intake_catalog()` strictly. The mentoring
--     form, its screens and its questions never reach it: its questions are of
--     kind `survey`, which that catalog already leaves out, and the form is left
--     out of its lists of forms;
--   - existing requests: no row is moved or rewritten.
--
-- Who reads her answers: exactly who reads the request's detail today. They are
-- encrypted with the request and decrypted only by `list_staff_mentoring_requests`,
-- under the same `mentoring.manage` rule. The people who design the form never
-- read a request.
--
-- WHAT THIS MIGRATION DOES
--
--   1. Each organization gets the mentoring form (`custom_forms.system_key`
--      `mentoring`, filled in by the player), with one fixed first screen,
--      `system_screen` `mentoring_request`: the topic, the detail and the
--      preferred date and time. A new organization gets both forms.
--   2. One set of rules for both forms, replacing the suggestions form's own:
--      their choices stay, they are never published and ask nobody, their
--      screens always show, and they ask their own questions only (fields of
--      kind `survey` owned by the form, created with `save_survey_question`).
--   3. Her answers are kept with the request, encrypted, in
--      `mentoring_requests.answers_encrypted`, never on her record. Each answer
--      keeps the question as she read it. The row is already purged with her
--      account (`personal_data_disposition`, `player_id`).
--   4. `my_mentoring_form()` gives her phone the form as she fills it in, and
--      `send_mentoring_request(topic, detail, date, time, answers)` sends a
--      request with its answers. A question staff mark required is enforced
--      there only: an installed build calls the old function, which cannot send
--      answers, so its request saves without them. The answers are checked by
--      one function both forms share.
--   5. `list_staff_mentoring_requests` adds each request's answers.
--   6. `intake_catalog_with_surveys()` (the dashboard) sends the form apart, as
--      `mentoring_form`, with its questions; `intake_catalog()` is unchanged for
--      every reader.

-- 1. The forms she sends when she wants --------------------------------------------------------------------

-- The app's own forms she sends when she wants, with questions staff add: the
-- suggestions form (RAPP-939) and the mentoring request (RAPP-940).
create or replace function private.on_demand_form_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['feedback', 'mentoring'];
$$;
revoke all on function private.on_demand_form_keys() from public, anon, authenticated;

-- How the database names each one in a refusal.
create or replace function private.on_demand_form_name(p_system_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_system_key when 'feedback' then 'the suggestions form'
                           when 'mentoring' then 'the mentoring form' end;
$$;
revoke all on function private.on_demand_form_name(text) from public, anon, authenticated;

alter table public.custom_forms drop constraint custom_forms_system_key_check;
alter table public.custom_forms add constraint custom_forms_system_key_check
  check (system_key is null
         or system_key = any (array['app_terms', 'season_authorization', 'entity_referral', 'feedback', 'mentoring']));

alter table public.custom_forms drop constraint custom_forms_system_form_is_legal;
alter table public.custom_forms add constraint custom_forms_system_form_is_legal
  check (system_key is null
         or (system_key in ('entity_referral', 'feedback', 'mentoring') and kind = 'other')
         or (system_key not in ('entity_referral', 'feedback', 'mentoring') and kind = 'legal'));

-- The shape RAPP-939 gave the suggestions form, now for both.
alter table public.custom_forms drop constraint custom_forms_feedback_form_shape;
alter table public.custom_forms add constraint custom_forms_on_demand_form_shape
  check (system_key is null or system_key not in ('feedback', 'mentoring')
         or (filled_by = 'player' and mandatory = 'optional' and deadline is null
             and audience = 'all' and not repeats_each_season and published_at is null));

alter table public.custom_form_screens drop constraint custom_form_screens_system_screen_check;
alter table public.custom_form_screens add constraint custom_form_screens_system_screen_check
  check (system_screen is null
         or system_screen = any (array['terms_sign', 'authorization_sign', 'reregistration',
                                       'reregistration_season', 'feedback_message', 'mentoring_request']));

-- The form of an organization with this system key.
create or replace function private.system_form_id(p_org_id uuid, p_system_key text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select f.id from public.custom_forms f where f.org_id = p_org_id and f.system_key = p_system_key;
$$;
revoke all on function private.system_form_id(uuid, text) from public, anon, authenticated;

create or replace function private.feedback_form_id(p_org_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.system_form_id(p_org_id, 'feedback');
$$;
revoke all on function private.feedback_form_id(uuid) from public, anon, authenticated;

-- A form she sends when she wants, made with its fixed screen when the
-- organization has none. The names are the ones each form starts with; staff
-- reword them.
create or replace function private.ensure_on_demand_form(p_org_id uuid, p_system_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  the_form uuid := private.system_form_id(p_org_id, p_system_key);
  fixed_screen text := case p_system_key when 'feedback' then 'feedback_message'
                                         when 'mentoring' then 'mentoring_request' end;
begin
  if fixed_screen is null then
    raise invalid_parameter_value using message = 'not a form she sends when she wants';
  end if;
  if the_form is null then
    insert into public.custom_forms (org_id, name, filled_by, mandatory, deadline, audience,
                                     repeats_each_season, kind, system_key)
    values (p_org_id,
            case p_system_key
              when 'feedback' then
                '{"ca": "Formulari de suggeriments", "es": "Formulario de sugerencias", "en": "Suggestions form"}'::jsonb
              else '{"ca": "Formulari de mentoria", "es": "Formulario de mentoría", "en": "Mentoring form"}'::jsonb
            end,
            'player', 'optional', null, 'all', false, 'other', p_system_key)
    on conflict (org_id, system_key) where system_key is not null do nothing
    returning id into the_form;
    the_form := coalesce(the_form, private.system_form_id(p_org_id, p_system_key));
  end if;
  if not exists (select 1 from public.custom_form_screens s
                  where s.form_id = the_form and s.system_screen = fixed_screen and not s.is_archived) then
    insert into public.custom_form_screens (org_id, form_id, title, sort_order, system_screen)
    values (p_org_id, the_form,
            case p_system_key
              when 'feedback' then '{"ca": "Nou suggeriment", "es": "Nueva sugerencia", "en": "New suggestion"}'::jsonb
              else '{"ca": "Nova sol·licitud", "es": "Nueva solicitud", "en": "New request"}'::jsonb
            end,
            coalesce((select min(s.sort_order) - 1 from public.custom_form_screens s
                       where s.form_id = the_form and not s.is_archived), 0),
            fixed_screen);
  end if;
  return the_form;
end;
$$;
revoke all on function private.ensure_on_demand_form(uuid, text) from public, anon, authenticated;

select private.ensure_on_demand_form(o.id, k.key)
  from public.organizations o cross join unnest(private.on_demand_form_keys()) k(key);

-- A new organization gets both.
drop trigger organizations_seed_feedback_form on public.organizations;
drop function private.seed_feedback_form_for_new_org();
drop function private.ensure_feedback_form(uuid);
create or replace function private.seed_on_demand_forms_for_new_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ensure_on_demand_form(new.id, k.key) from unnest(private.on_demand_form_keys()) k(key);
  return null;
end;
$$;
revoke all on function private.seed_on_demand_forms_for_new_org() from public, anon, authenticated;
create trigger organizations_seed_on_demand_forms
  after insert on public.organizations
  for each row execute function private.seed_on_demand_forms_for_new_org();

-- 2. What both forms keep (replacing the suggestions form's own rules) -------------------------------------

drop trigger custom_forms_feedback_stays on public.custom_forms;
drop trigger custom_form_versions_feedback_unpublished on public.custom_form_versions;
drop trigger custom_form_responses_feedback_none on public.custom_form_responses;
drop trigger custom_form_screens_feedback_rules on public.custom_form_screens;
drop trigger field_placements_feedback_own on public.field_placements;
drop trigger form_blocks_feedback_own on public.form_blocks;
drop trigger consent_placements_feedback_own on public.consent_placements;
drop function private.feedback_form_stays();
drop function private.feedback_form_asks_nobody();
drop function private.feedback_screen_rules();
drop function private.feedback_form_asks_its_own();

-- The system key of the form when it is one she sends when she wants; null otherwise.
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
revoke all on function private.on_demand_form_key(uuid) from public, anon, authenticated;

-- Its choices stay: only its name changes. It is never archived and never published.
create or replace function private.on_demand_form_stays()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.system_key = any (private.on_demand_form_keys())
     and (new.system_key, new.kind, new.filled_by, new.mandatory, new.deadline, new.audience,
          new.repeats_each_season, new.is_archived, new.version, new.published_at, new.org_id)
         is distinct from
         (old.system_key, old.kind, old.filled_by, old.mandatory, old.deadline, old.audience,
          old.repeats_each_season, old.is_archived, old.version, old.published_at, old.org_id) then
    raise check_violation
      using message = private.on_demand_form_name(old.system_key) || ' keeps its choices; only its name changes';
  end if;
  return new;
end;
$$;
revoke all on function private.on_demand_form_stays() from public, anon, authenticated;
create trigger custom_forms_on_demand_stays
  before update on public.custom_forms
  for each row execute function private.on_demand_form_stays();

-- No version is published and nobody is asked it: she sends it when she wants.
create or replace function private.on_demand_form_asks_nobody()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  form_key text := private.on_demand_form_key(new.form_id);
begin
  if form_key is not null then
    raise check_violation using message = private.on_demand_form_name(form_key) || ' has no versions and asks nobody';
  end if;
  return new;
end;
$$;
revoke all on function private.on_demand_form_asks_nobody() from public, anon, authenticated;
create trigger custom_form_versions_on_demand_unpublished
  before insert on public.custom_form_versions
  for each row execute function private.on_demand_form_asks_nobody();
create trigger custom_form_responses_on_demand_none
  before insert on public.custom_form_responses
  for each row execute function private.on_demand_form_asks_nobody();

-- Its screens always show and depend on no answer.
create or replace function private.on_demand_screen_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  form_key text;
begin
  if new.is_hidden or new.show_when_field_id is not null then
    form_key := private.on_demand_form_key(new.form_id);
    if form_key is not null then
      raise check_violation using message = 'a screen of ' || private.on_demand_form_name(form_key) || ' always shows';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.on_demand_screen_rules() from public, anon, authenticated;
create trigger custom_form_screens_on_demand_rules
  before insert or update on public.custom_form_screens
  for each row execute function private.on_demand_screen_rules();

-- It asks its own questions only: no other field, no block, no consent.
create or replace function private.on_demand_form_asks_its_own()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  form_key text;
begin
  if new.custom_form_id is null then
    return new;
  end if;
  form_key := private.on_demand_form_key(new.custom_form_id);
  if form_key is null then
    return new;
  end if;
  -- A block and a consent are never its own; a field is when the form owns it.
  if tg_table_name = 'field_placements' then
    if exists (select 1 from public.profile_fields pf
                where pf.id = (to_jsonb(new) ->> 'field_id')::uuid and pf.kind = 'survey'
                  and pf.survey_form_id = new.custom_form_id) then
      return new;
    end if;
  end if;
  raise check_violation using message = private.on_demand_form_name(form_key) || ' asks its own questions only';
end;
$$;
revoke all on function private.on_demand_form_asks_its_own() from public, anon, authenticated;
create trigger field_placements_on_demand_own
  before insert or update of field_id, custom_form_id on public.field_placements
  for each row execute function private.on_demand_form_asks_its_own();
create trigger form_blocks_on_demand_own
  before insert or update of custom_form_id on public.form_blocks
  for each row execute function private.on_demand_form_asks_its_own();
create trigger consent_placements_on_demand_own
  before insert or update of custom_form_id on public.consent_placements
  for each row execute function private.on_demand_form_asks_its_own();

-- 3. Her answers, checked once for both forms ----------------------------------------------------------------

-- The form as she fills it in, for the active player asking: its screens in
-- order and its questions, each with its wording, type, settings and options,
-- the shape a survey version has. Null when her organization has none.
create or replace function private.my_on_demand_form(p_system_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor public.profiles;
  found_form uuid;
begin
  select p.* into actor from public.profiles p
   where p.id = (select auth.uid()) and p.role = 'player' and p.is_active;
  if actor.id is null then
    raise insufficient_privilege using message = 'only active players fill in ' || private.on_demand_form_name(p_system_key);
  end if;
  found_form := private.system_form_id(actor.org_id, p_system_key);
  if found_form is null then
    return null;
  end if;
  return (select jsonb_build_object('form_id', f.id, 'name', f.name,
                                    'content', private.custom_form_content(f.id))
            from public.custom_forms f where f.id = found_form);
end;
$$;
revoke all on function private.my_on_demand_form(text) from public, anon, authenticated;

-- Her answers to the questions the form asks now, by question id, checked
-- and returned as kept: a list of {field_id, question, value} in the form's
-- order, each question as she read it. A required question needs an answer.
create or replace function private.on_demand_answers_kept(p_org_id uuid, p_system_key text, p_answers jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  answers jsonb := coalesce(nullif(p_answers, 'null'::jsonb), '{}'::jsonb);
  asked jsonb;
  placement jsonb;
  answer jsonb;
  question_type text;
  live_options text[];
  kept jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(answers) <> 'object' then
    raise invalid_parameter_value using message = 'the answers are an object by question';
  end if;
  asked := private.custom_form_content(private.system_form_id(p_org_id, p_system_key));
  -- Only the questions the form asks now.
  if exists (select 1 from jsonb_object_keys(answers) k
              where not exists (select 1 from jsonb_array_elements(coalesce(asked -> 'placements', '[]'::jsonb)) p
                                 where p ->> 'field_id' = k)) then
    raise invalid_parameter_value
      using message = 'an answer to a question ' || private.on_demand_form_name(p_system_key) || ' does not ask';
  end if;
  for placement in
    select p.value from jsonb_array_elements(coalesce(asked -> 'placements', '[]'::jsonb)) p
      left join jsonb_array_elements(coalesce(asked -> 'screens', '[]'::jsonb)) with ordinality s(value, place)
        on s.value ->> 'id' = p.value ->> 'screen_key'
     order by s.place, (p.value ->> 'sort_order')::integer
  loop
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
    kept := kept || jsonb_build_array(jsonb_build_object(
      'field_id', placement -> 'field_id', 'question', placement -> 'field', 'value', answer));
  end loop;
  return kept;
end;
$$;
revoke all on function private.on_demand_answers_kept(uuid, text, jsonb) from public, anon, authenticated;

-- The suggestions form reads and sends through the shared functions (RAPP-939's behaviour, unchanged).
create or replace function public.my_feedback_form()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.my_on_demand_form('feedback');
$$;
revoke all on function public.my_feedback_form() from public, anon;
grant execute on function public.my_feedback_form() to authenticated, service_role;

-- A suggestion with her answers to the questions staff added. The type, the
-- text and the photo are checked and stored by `create_feedback_submission`,
-- as from an installed build; her answers are checked against the form as it
-- is now and kept with the suggestion.
create or replace function public.send_feedback_submission(
  p_type text, p_content text, p_image_url text, p_answers jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sent_id uuid;
  sent_org uuid;
  kept jsonb;
begin
  if jsonb_typeof(coalesce(nullif(p_answers, 'null'::jsonb), '{}'::jsonb)) <> 'object' then
    raise invalid_parameter_value using message = 'the answers are an object by question';
  end if;
  sent_id := public.create_feedback_submission(p_type, p_content, p_image_url);
  select s.org_id into sent_org from public.feedback_submissions s where s.id = sent_id;
  kept := private.on_demand_answers_kept(sent_org, 'feedback', p_answers);
  if jsonb_array_length(kept) > 0 then
    update public.feedback_submissions
       set answers_encrypted = public.encrypt_field(kept::text)
     where id = sent_id;
  end if;
  return sent_id;
end;
$$;
revoke all on function public.send_feedback_submission(text, text, text, jsonb) from public, anon;
grant execute on function public.send_feedback_submission(text, text, text, jsonb) to authenticated, service_role;

-- 4. The mentoring request keeps her answers -------------------------------------------------------------

alter table public.mentoring_requests add column answers_encrypted bytea;
alter table public.mentoring_requests add constraint mentoring_requests_answers_encrypted_check
  check (answers_encrypted is null or octet_length(answers_encrypted) between 1 and 262144);
comment on column public.mentoring_requests.answers_encrypted is
  'Her answers to the questions staff added to the mentoring form (RAPP-940), encrypted: a JSON list of '
  '{field_id, question, value}, each question as she read it. Null when she answered none, and on every '
  'request sent before them or from an older build. Read only through list_staff_mentoring_requests.';

-- The mentoring form as she fills it in.
create or replace function public.my_mentoring_form()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.my_on_demand_form('mentoring');
$$;
revoke all on function public.my_mentoring_form() from public, anon;
grant execute on function public.my_mentoring_form() to authenticated, service_role;

-- A mentoring request with her answers to the questions staff added. The
-- topic, the detail and the preferred date and time are checked and stored by
-- `create_mentoring_request`, as from an installed build; her answers are
-- checked against the form as it is now and kept with the request.
create or replace function public.send_mentoring_request(
  p_topic text, p_topic_detail text, p_preferred_date date, p_preferred_time time without time zone,
  p_answers jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sent_id uuid;
  sent_org uuid;
  kept jsonb;
begin
  if jsonb_typeof(coalesce(nullif(p_answers, 'null'::jsonb), '{}'::jsonb)) <> 'object' then
    raise invalid_parameter_value using message = 'the answers are an object by question';
  end if;
  sent_id := public.create_mentoring_request(p_topic, p_topic_detail, p_preferred_date, p_preferred_time);
  select r.org_id into sent_org from public.mentoring_requests r where r.id = sent_id;
  kept := private.on_demand_answers_kept(sent_org, 'mentoring', p_answers);
  if jsonb_array_length(kept) > 0 then
    update public.mentoring_requests
       set answers_encrypted = public.encrypt_field(kept::text)
     where id = sent_id;
  end if;
  return sent_id;
end;
$$;
revoke all on function public.send_mentoring_request(text, text, date, time without time zone, jsonb) from public, anon;
grant execute on function public.send_mentoring_request(text, text, date, time without time zone, jsonb)
  to authenticated, service_role;

-- 5. The queue reads her answers, under the rule that reads the detail ---------------------------------------

drop function public.list_staff_mentoring_requests();
create function public.list_staff_mentoring_requests()
 RETURNS TABLE(id uuid, player_id uuid, player_first_name text, player_last_name text, topic text, topic_detail text, preferred_date date, preferred_time time without time zone, status text, scheduled_at timestamp with time zone, assigned_staff_id uuid, assigned_staff_name text, staff_notes text, completed_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, answers jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    request.id,
    request.player_id,
    private.shown_name(player.id, 'first_name'),
    private.shown_name(player.id, 'last_name'),
    request.topic,
    case
      when request.topic_detail_encrypted is null then null
      else public.decrypt_field(request.topic_detail_encrypted)
    end,
    request.preferred_date,
    request.preferred_time,
    request.status,
    request.scheduled_at,
    request.assigned_staff_id,
    case
      when staff.id is null then null
      else concat_ws(' ', staff.first_name, staff.last_name)
    end,
    case
      when request.staff_notes_encrypted is null then null
      else public.decrypt_field(request.staff_notes_encrypted)
    end,
    request.completed_at,
    request.created_at,
    request.updated_at,
    -- Her answers to the questions staff added (RAPP-940); none before them.
    coalesce(public.decrypt_field(request.answers_encrypted)::jsonb, '[]'::jsonb)
  from public.mentoring_requests as request
  join public.profiles as player
    on player.org_id = request.org_id
   and player.id = request.player_id
  left join public.profiles as staff
    on staff.org_id = request.org_id
   and staff.id = request.assigned_staff_id
  where request.org_id = (select public.current_org_id())
    and public.has_permission('mentoring.manage')
  order by
    case request.status
      when 'requested' then 0
      when 'scheduled' then 1
      when 'completed' then 2
      else 3
    end,
    request.created_at,
    request.id;
$function$;
revoke all on function public.list_staff_mentoring_requests() from public, anon;
grant execute on function public.list_staff_mentoring_requests() to authenticated, service_role;

-- 6. Both forms' questions are their own, as a survey's --------------------------------------------------

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

-- 7. The dashboard reads both forms apart ---------------------------------------------------------------

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
