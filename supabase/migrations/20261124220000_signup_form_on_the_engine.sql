-- An activity's sign-up can ask questions, on the form engine (RAPP-941).
--
-- WHY
--
-- Fabián, 2026-11-24: signing up for an activity records only that she is
-- going. Staff want to ask a few questions at that moment, per activity: a trip
-- asks whether she needs a seat on the bus and about food allergies, a
-- tournament asks her T-shirt size. Staff build those questions for one
-- activity on the board every form uses, and see each player's answers where
-- they see who signed up.
--
-- Three things stay exactly where they are:
--   - installed phone builds sign up by writing `event_signups` directly,
--     through `event_signups_insert_self` and `event_signups_update_self`.
--     Those policies, the column grants and `enforce_event_signup_state` (the
--     active count and the capacity) are not touched, so an installed build
--     still signs her up, without answers, on an activity that asks questions;
--   - installed phone builds read `intake_catalog()` strictly. A sign-up form,
--     its screens and its questions never reach it: its questions are of kind
--     `survey`, which that catalog already leaves out, and the form is left out
--     of its lists of forms, for the team and for a player;
--   - existing sign-ups: no row is moved or rewritten.
--
-- Who reads her answers: exactly who reads the sign-up today, under the rule of
-- `event_signups_select_org_staff_or_self` (events.edit, events.publish,
-- attendance.mark, attendance.reports, participants.view, or her own row). They
-- are encrypted with the sign-up and decrypted only by `event_signup_answers`.
-- The people who design the form never read a sign-up.
--
-- WHAT THIS MIGRATION DOES
--
--   1. A new form kind, `signup`: a form of the engine tied to one activity
--      (`custom_forms.event_id`), filled in by the player, never published and
--      asking nobody, one live form per activity. Archiving it, or deleting the
--      activity, leaves the activity asking nothing.
--   2. Its questions are its own, as a survey's are (fields of kind `survey`
--      owned by the form, created with `save_survey_question`); its screens
--      always show. These are the rules the forms she sends when she wants keep
--      (RAPP-939, RAPP-940), so `private.on_demand_form_key` names a sign-up
--      form too and their triggers apply to it.
--   3. `open_event_signup_form(activity)` gives the activity editor the form,
--      making it when the activity has none. It needs the form builder's
--      permission and the activity's.
--   4. Her answers are kept with the sign-up, encrypted, in
--      `event_signups.answers_encrypted`, never on her record. Each answer keeps
--      the question as she read it. The row is already purged with her account
--      (`personal_data_disposition`, `player_id`). Signing up again after
--      cancelling starts without the earlier answers: the new ones replace them.
--   5. `event_signup_form(activity)` gives her phone the form as she fills it
--      in, and `sign_up_for_event(activity, answers)` signs her up as she would
--      herself, with the rules the policies and the trigger enforce, then keeps
--      her answers. A required question is enforced there only.
--   6. `event_signup_answers(activity)` reads each sign-up with her answers,
--      under the rule that reads the sign-up.
--   7. `intake_catalog_with_surveys()` (the dashboard) lists sign-up forms with
--      their activity's title; `intake_catalog()` is unchanged for every reader.

-- 1. The sign-up form --------------------------------------------------------------------------------------

alter table public.custom_forms drop constraint custom_forms_kind_check;
alter table public.custom_forms add constraint custom_forms_kind_check
  check (kind = any (array['legal', 'other', 'survey', 'signup']));

-- An activity belongs to a survey (RAPP-929) and to a sign-up form; a closing time to a survey only.
alter table public.custom_forms drop constraint custom_forms_survey_only_settings;
alter table public.custom_forms add constraint custom_forms_survey_only_settings
  check ((kind in ('survey', 'signup') or event_id is null) and (kind = 'survey' or closes_at is null));

-- Filled in by her when she signs up: optional, for everyone, never published.
alter table public.custom_forms add constraint custom_forms_signup_form_shape
  check (kind <> 'signup'
         or (filled_by = 'player' and mandatory = 'optional' and deadline is null and audience = 'all'
             and not repeats_each_season and system_key is null and published_at is null));

-- One live sign-up form per activity.
create unique index custom_forms_one_signup_form_per_event
  on public.custom_forms (event_id) where kind = 'signup' and not is_archived;

-- A sign-up form stays one, tied to an activity of its organization. The
-- activity goes only when it is deleted (the foreign key then clears it).
create or replace function private.signup_form_stays()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (old.kind = 'signup') <> (new.kind = 'signup') then
    raise check_violation using message = 'a sign-up form stays a sign-up form';
  end if;
  if new.kind <> 'signup' then
    return new;
  end if;
  if tg_op = 'INSERT' and new.event_id is null then
    raise check_violation using message = 'a sign-up form belongs to an activity';
  end if;
  if tg_op = 'UPDATE' and new.event_id is distinct from old.event_id and new.event_id is not null then
    raise check_violation using message = 'a sign-up form stays with its activity';
  end if;
  if new.event_id is not null
     and not exists (select 1 from public.events e where e.id = new.event_id and e.org_id = new.org_id) then
    raise check_violation using message = 'a sign-up form belongs to an activity of its organization';
  end if;
  return new;
end;
$$;
revoke all on function private.signup_form_stays() from public, anon, authenticated;
create trigger custom_forms_signup_stays
  before insert or update on public.custom_forms
  for each row execute function private.signup_form_stays();

-- A deleted activity asks nothing: its sign-up form is archived before the foreign key clears it.
create or replace function private.archive_signup_form_of_deleted_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.custom_forms
     set is_archived = true, updated_at = now()
   where event_id = old.id and kind = 'signup' and not is_archived;
  return old;
end;
$$;
revoke all on function private.archive_signup_form_of_deleted_event() from public, anon, authenticated;
create trigger events_archive_signup_form
  before delete on public.events
  for each row execute function private.archive_signup_form_of_deleted_event();

-- 2. Its questions are its own and its screens always show, as on the forms she sends when she wants -------

-- The form's key when it is one she sends when she wants, or 'signup' for an
-- activity's sign-up form (RAPP-941); null otherwise. The triggers that keep
-- those forms' questions their own, their screens always shown and their
-- versions and responses at none read it.
create or replace function private.on_demand_form_key(p_form_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when f.kind = 'signup' then 'signup' else f.system_key end
    from public.custom_forms f
   where f.id = p_form_id
     and (f.kind = 'signup' or f.system_key = any (private.on_demand_form_keys()));
$$;
revoke all on function private.on_demand_form_key(uuid) from public, anon, authenticated;

create or replace function private.on_demand_form_name(p_system_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_system_key when 'feedback' then 'the suggestions form'
                           when 'mentoring' then 'the mentoring form'
                           when 'signup' then 'the sign-up form' end;
$$;
revoke all on function private.on_demand_form_name(text) from public, anon, authenticated;

-- 3. The activity editor opens the form --------------------------------------------------------------------

-- The live sign-up form of an activity, made when it has none. The form
-- builder's permission builds it; the activity's ties it to the activity.
create or replace function public.open_event_signup_form(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  signup_form uuid;
begin
  if not ((select public.has_permission('events.edit')) or (select public.has_permission('events.publish'))) then
    raise insufficient_privilege using message = 'an activity''s questions need events.edit or events.publish';
  end if;
  if not exists (select 1 from public.events e where e.id = p_event_id and e.org_id = actor_org) then
    raise no_data_found using message = 'no such activity';
  end if;
  select f.id into signup_form from public.custom_forms f
   where f.event_id = p_event_id and f.kind = 'signup' and not f.is_archived;
  if signup_form is not null then
    return signup_form;
  end if;
  insert into public.custom_forms (org_id, name, filled_by, mandatory, deadline, audience,
                                   repeats_each_season, kind, event_id, created_by)
  values (actor_org,
          '{"ca": "Preguntes de la inscripció", "es": "Preguntas de la inscripción", "en": "Sign-up questions"}'::jsonb,
          'player', 'optional', null, 'all', false, 'signup', p_event_id,
          case when exists (select 1 from public.profiles where id = (select auth.uid())) then (select auth.uid()) end)
  on conflict (event_id) where kind = 'signup' and not is_archived do nothing
  returning id into signup_form;
  if signup_form is null then
    -- Another staff member made it at the same moment.
    select f.id into signup_form from public.custom_forms f
     where f.event_id = p_event_id and f.kind = 'signup' and not f.is_archived;
    return signup_form;
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'custom_form.create', 'custom_form', signup_form,
          jsonb_build_object('kind', 'signup', 'event_id', p_event_id));
  return signup_form;
end;
$$;
revoke all on function public.open_event_signup_form(uuid) from public, anon;
grant execute on function public.open_event_signup_form(uuid) to authenticated, service_role;

-- 4. Her answers, kept with the sign-up ---------------------------------------------------------------------

alter table public.event_signups add column answers_encrypted bytea;
alter table public.event_signups add constraint event_signups_answers_encrypted_check
  check (answers_encrypted is null or octet_length(answers_encrypted) between 1 and 262144);
comment on column public.event_signups.answers_encrypted is
  'Her answers to the activity''s sign-up questions (RAPP-941), encrypted: a JSON list of '
  '{field_id, question, value}, each question as she read it. Null when she answered none, on every '
  'sign-up made before them or from an older build, and once she signs up again after cancelling. '
  'Read only through event_signup_answers.';

-- Signing up again after cancelling starts without the earlier answers; the
-- function that signs her up with answers keeps the new ones right after.
create or replace function private.signup_again_clears_answers()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.state = 'cancelled' and new.state <> 'cancelled' then
    new.answers_encrypted := null;
  end if;
  return new;
end;
$$;
revoke all on function private.signup_again_clears_answers() from public, anon, authenticated;
create trigger event_signups_again_clears_answers
  before update of state on public.event_signups
  for each row execute function private.signup_again_clears_answers();

-- Her answers to the questions a form asks now, by question id, checked and
-- returned as kept: a list of {field_id, question, value} in the form's order,
-- each question as she read it. A required question needs an answer. Shared by
-- the forms she sends when she wants and the sign-up form; `p_form_name` names
-- the form in a refusal.
create or replace function private.form_answers_kept(p_form_id uuid, p_form_name text, p_answers jsonb)
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
  asked := private.custom_form_content(p_form_id);
  -- Only the questions the form asks now.
  if exists (select 1 from jsonb_object_keys(answers) k
              where not exists (select 1 from jsonb_array_elements(coalesce(asked -> 'placements', '[]'::jsonb)) p
                                 where p ->> 'field_id' = k)) then
    raise invalid_parameter_value
      using message = 'an answer to a question ' || p_form_name || ' does not ask';
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
revoke all on function private.form_answers_kept(uuid, text, jsonb) from public, anon, authenticated;

-- The forms she sends when she wants check through it (RAPP-939, RAPP-940: the same checks, the same messages).
create or replace function private.on_demand_answers_kept(p_org_id uuid, p_system_key text, p_answers jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.form_answers_kept(private.system_form_id(p_org_id, p_system_key),
                                   private.on_demand_form_name(p_system_key), p_answers);
$$;
revoke all on function private.on_demand_answers_kept(uuid, text, jsonb) from public, anon, authenticated;

-- 5. Her phone: the form, and a sign-up with her answers ------------------------------------------------------

-- The activity as her own sign-up reaches it: an activity of her organization
-- she may read, by the rule `event_signups_insert_self` reads it through the
-- events policy (published and visible now, or one she attended). Null otherwise.
create or replace function private.event_she_signs_up_for(p_event_id uuid)
returns public.events
language sql
stable
security definer
set search_path = ''
as $$
  select e.* from public.events e
   where e.id = p_event_id
     and (select public.current_app_role()) = 'player'
     and e.org_id = (select public.current_org_id())
     and (public.is_content_visible(e.status, e.published_at, e.expires_at)
          or (select public.has_own_attendance_for_event(e.id)));
$$;
revoke all on function private.event_she_signs_up_for(uuid) from public, anon, authenticated;

-- The activity's live sign-up form as she fills it in: its screens in order and
-- its questions, each with its wording, type, settings and options, the shape a
-- survey version has. Null when the activity asks nothing.
create or replace function public.event_signup_form(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  activity public.events := private.event_she_signs_up_for(p_event_id);
begin
  if activity.id is null then
    raise no_data_found using message = 'EVENTS/NOT_FOUND';
  end if;
  return (select jsonb_build_object('form_id', f.id, 'event_id', f.event_id, 'name', f.name,
                                    'content', private.custom_form_content(f.id))
            from public.custom_forms f
           where f.event_id = activity.id and f.kind = 'signup' and not f.is_archived);
end;
$$;
revoke all on function public.event_signup_form(uuid) from public, anon;
grant execute on function public.event_signup_form(uuid) to authenticated, service_role;

-- She signs up for an activity with her answers to its questions. The sign-up
-- is written as she writes it herself (her row, her organization, an activity
-- she may read), so `enforce_event_signup_state` checks the sign-up mode, the
-- state and the places as for an installed build. Her answers are checked
-- against the form as it is now and replace any she gave before. Already signed
-- up, she keeps her place and her answers are replaced.
create or replace function public.sign_up_for_event(p_event_id uuid, p_answers jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  activity public.events := private.event_she_signs_up_for(p_event_id);
  signup_state text;
  signup public.event_signups;
  kept jsonb;
begin
  if jsonb_typeof(coalesce(nullif(p_answers, 'null'::jsonb), '{}'::jsonb)) <> 'object' then
    raise invalid_parameter_value using message = 'the answers are an object by question';
  end if;
  if activity.id is null then
    raise insufficient_privilege using message = 'EVENTS/NOT_FOUND';
  end if;
  signup_state := case activity.signup_mode when 'interest' then 'interested' when 'confirm' then 'confirmed' end;
  if signup_state is null then
    raise exception using errcode = 'P0001', message = 'EVENTS/SIGNUP_CLOSED';
  end if;
  insert into public.event_signups (org_id, event_id, player_id, state)
  values (activity.org_id, activity.id, (select auth.uid()), signup_state)
  on conflict (event_id, player_id) do update set state = excluded.state
  returning * into signup;
  kept := private.form_answers_kept(
    (select f.id from public.custom_forms f
      where f.event_id = activity.id and f.kind = 'signup' and not f.is_archived),
    private.on_demand_form_name('signup'), p_answers);
  update public.event_signups
     set answers_encrypted = case when jsonb_array_length(kept) > 0 then public.encrypt_field(kept::text) end
   where id = signup.id
  returning * into signup;
  return jsonb_build_object('id', signup.id, 'state', signup.state, 'updated_at', signup.updated_at);
end;
$$;
revoke all on function public.sign_up_for_event(uuid, jsonb) from public, anon;
grant execute on function public.sign_up_for_event(uuid, jsonb) to authenticated, service_role;

-- 6. Staff read her answers, under the rule that reads the sign-up ---------------------------------------------

-- Each sign-up to an activity with her answers, for whoever reads that sign-up
-- through `event_signups_select_org_staff_or_self`: the team who reads an
-- activity's sign-ups, and she her own. Her name at the level the reader may
-- read it.
create or replace function public.event_signup_answers(p_event_id uuid)
returns table(signup_id uuid, player_id uuid, first_name text, last_name text, state text,
              created_at timestamp with time zone, updated_at timestamp with time zone, answers jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.player_id,
         private.shown_name(s.player_id, 'first_name'),
         private.shown_name(s.player_id, 'last_name'),
         s.state, s.created_at, s.updated_at,
         coalesce(public.decrypt_field(s.answers_encrypted)::jsonb, '[]'::jsonb)
    from public.event_signups s
   where s.event_id = p_event_id
     and s.org_id = (select public.current_org_id())
     and ((select public.has_permission('events.edit'))
          or (select public.has_permission('events.publish'))
          or (select public.has_permission('attendance.mark'))
          or (select public.has_permission('attendance.reports'))
          or (select public.has_permission('participants.view'))
          or ((select public.current_app_role()) = 'player' and s.player_id = (select auth.uid())))
   order by s.created_at, s.id;
$$;
revoke all on function public.event_signup_answers(uuid) from public, anon;
grant execute on function public.event_signup_answers(uuid) to authenticated, service_role;

-- 7. The questions of a sign-up form are its own, as a survey's ------------------------------------------------

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
  -- form (RAPP-940), and of an activity's sign-up form (RAPP-941).
  if p_survey_form_id is not null
     and not exists (select 1 from public.custom_forms f
                      where f.id = p_survey_form_id and f.org_id = p_org_id
                        and (f.kind in ('survey', 'signup') or f.system_key = any (private.on_demand_form_keys()))) then
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
     -- The suggestions form (RAPP-939), the mentoring form (RAPP-940) and an
     -- activity's sign-up form (RAPP-941) add their questions the same way.
     or not exists (select 1 from public.custom_forms f
                     where f.id = form_id
                       and (f.kind in ('survey', 'signup') or f.system_key = any (private.on_demand_form_keys()))) then
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

-- 8. The dashboard lists sign-up forms with their activity; intake_catalog() leaves them out ---------------

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
       -- Surveys (RAPP-929) and sign-up forms (RAPP-941) only for the dashboard that asks for them.
       and (p_with_surveys or f.kind not in ('survey', 'signup'))
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
        -- A sign-up form names its activity (RAPP-941); no other form gets the key.
        || case when f.kind = 'signup'
                then jsonb_build_object('event_title', (select e.title from public.events e where e.id = f.event_id))
                else '{}'::jsonb end
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
         -- A survey reaches her through my_surveys, never the catalog (RAPP-929);
         -- a sign-up form through event_signup_form (RAPP-941).
         and f.kind not in ('survey', 'signup')
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
