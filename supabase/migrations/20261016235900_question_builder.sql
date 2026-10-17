-- The staff question builder (RAPP-307).
--
-- Staff add their own questions to Ramassà's registration without a new app
-- version, and reword the built-in ones:
--
--   1. Screens: a title, an optional intro and one or more questions, placed
--      after one of the built-in wizard steps. The wizard asks one topic per
--      screen (RAPP-97), so custom questions never join a built-in screen.
--   2. Custom questions: short text, long text, yes/no/maybe, single choice or
--      multiple choice, with a Catalan label (the other languages optional).
--      Each shows in any of: the player wizard, the entity referral form, each
--      season (answers kept per season), or staff only on the participant page.
--   3. A privacy level per question, set once when it is created: Normal,
--      Personal or Sensitive, the levels of the built-in fields (RAPP-240).
--      Sensitive answers are encrypted and need participants.view_sensitive.
--   4. The type and the level never change. Options can be added and
--      relabelled; a removed option is archived and answers keep it. Deleting a
--      screen or a question archives it, and its answers stay.
--   5. Built-in questions: staff change wording, help text and option labels,
--      and hide options. A question the app needs (every required question, and
--      the sizes the equipment stock reads) cannot be hidden.
--   6. Organization presets for which questions a woman is asked (RAPP-301).
--
-- Every create, change, reorder and archive is written to the audit log.

-- 1. Helpers -------------------------------------------------------------------------------------------

-- Localized text with a Catalan value: what every custom label needs.
create or replace function private.catalan_text_valid(p_text jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    private.localized_text_valid(p_text) and length(btrim(coalesce(p_text ->> 'ca', ''))) > 0,
    false);
$$;

-- The built-in wizard screens a staff screen can follow, in wizard order.
create or replace function private.intake_builtin_screens()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['identity', 'background', 'documentation', 'logistics', 'season']::text[];
$$;

-- Built-in questions the app needs: every required question, and the sizes the
-- equipment stock reads. Staff can reword them, but never hide them.
create or replace function private.unhideable_intake_questions()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select private.required_intake_questions() || array['clothing_size', 'shoe_size']::text[];
$$;

revoke all on function private.catalan_text_valid(jsonb) from public, anon, authenticated;
revoke all on function private.intake_builtin_screens() from public, anon, authenticated;
revoke all on function private.unhideable_intake_questions() from public, anon, authenticated;

-- 2. Tables ----------------------------------------------------------------------------------------------

create table public.intake_screens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  title jsonb not null check (private.catalan_text_valid(title)),
  intro jsonb check (intro is null or private.localized_text_valid(intro)),
  after_screen text not null check (after_screen = any (private.intake_builtin_screens())),
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index intake_screens_org_idx on public.intake_screens (org_id, after_screen, sort_order);
comment on table public.intake_screens is
  'Registration screens staff build (RAPP-307), each placed after a built-in wizard step.';

create table public.custom_questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  screen_id uuid not null references public.intake_screens (id) on delete cascade,
  question_type text not null
    check (question_type in ('short_text', 'long_text', 'yes_no_maybe', 'single_choice', 'multiple_choice')),
  label jsonb not null check (private.catalan_text_valid(label)),
  help jsonb check (help is null or private.localized_text_valid(help)),
  privacy text not null check (privacy in ('normal', 'personal', 'sensitive')),
  placements text[] not null check (
    cardinality(placements) > 0
    and placements <@ array['wizard', 'entity_form', 'season', 'staff']::text[]
  ),
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index custom_questions_screen_idx on public.custom_questions (screen_id, sort_order);
create index custom_questions_org_idx on public.custom_questions (org_id);
comment on table public.custom_questions is
  'Questions staff add to registration (RAPP-307). Type and privacy level never change.';

create table public.custom_question_options (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  question_id uuid not null references public.custom_questions (id) on delete cascade,
  label jsonb not null check (private.catalan_text_valid(label)),
  sort_order integer not null default 0,
  is_archived boolean not null default false
);
create index custom_question_options_question_idx
  on public.custom_question_options (question_id, sort_order);
comment on table public.custom_question_options is
  'Options of a choice question (RAPP-307). A removed option is archived; answers keep it.';

-- One answer per woman and question, or per season for a seasonal question.
-- The value is jsonb; a Sensitive answer is stored encrypted instead.
create table public.custom_answers (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  question_id uuid not null references public.custom_questions (id) on delete cascade,
  -- The season of a seasonal answer, else the zero uuid, so the key stays whole.
  season_key uuid not null default '00000000-0000-0000-0000-000000000000',
  season_id uuid references public.seasons (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  value jsonb,
  value_encrypted bytea,
  source text not null check (source in ('player', 'entity', 'staff')),
  answered_at timestamptz not null default now(),
  primary key (profile_id, question_id, season_key),
  constraint custom_answers_one_value check ((value is null) <> (value_encrypted is null)),
  constraint custom_answers_season_key check (
    season_key = coalesce(season_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
);
create index custom_answers_question_idx on public.custom_answers (question_id);
comment on table public.custom_answers is
  'Her answers to custom questions (RAPP-307); Sensitive ones encrypted.';

-- What an entity answered on the referral form, until she is invited. Always
-- encrypted, as the referral's own answers are.
create table public.referral_custom_answers (
  referral_id uuid not null references public.entity_referrals (id) on delete cascade,
  question_id uuid not null references public.custom_questions (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  value_encrypted bytea not null,
  created_at timestamptz not null default now(),
  primary key (referral_id, question_id)
);
comment on table public.referral_custom_answers is
  'Custom answers sent with a referral (RAPP-307); copied to her profile when she is invited.';

create table public.builtin_question_overrides (
  org_id uuid not null references public.organizations (id) on delete cascade,
  question text not null check (question = any (private.wizard_intake_questions())),
  label jsonb check (label is null or private.localized_text_valid(label)),
  help jsonb check (help is null or private.localized_text_valid(help)),
  is_hidden boolean not null default false,
  -- {option value: {"label": localized text, "hidden": boolean}}
  option_overrides jsonb not null default '{}'::jsonb check (jsonb_typeof(option_overrides) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  primary key (org_id, question),
  constraint builtin_question_overrides_needed_stays
    check (not is_hidden or not (question = any (private.unhideable_intake_questions())))
);
comment on table public.builtin_question_overrides is
  'Staff wording and hidden options for built-in questions (RAPP-307). Stored values never change.';

create table public.intake_state_presets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  -- {question: 'ask' | 'skip'}; a question left out is Auto.
  states jsonb not null check (jsonb_typeof(states) = 'object'),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);
comment on table public.intake_state_presets is
  'Organization presets for which questions a woman is asked (RAPP-301, RAPP-307).';

-- Reads go through the functions below. Select policies keep the team's own
-- organization in reach for the realtime and direct reads the grants allow.
alter table public.intake_screens enable row level security;
alter table public.custom_questions enable row level security;
alter table public.custom_question_options enable row level security;
alter table public.custom_answers enable row level security;
alter table public.referral_custom_answers enable row level security;
alter table public.builtin_question_overrides enable row level security;
alter table public.intake_state_presets enable row level security;

create policy intake_screens_select_org on public.intake_screens
  for select to authenticated using (org_id = (select public.current_org_id()));
create policy custom_questions_select_org on public.custom_questions
  for select to authenticated using (org_id = (select public.current_org_id()));
create policy custom_question_options_select_org on public.custom_question_options
  for select to authenticated using (org_id = (select public.current_org_id()));
create policy custom_answers_select_self on public.custom_answers
  for select to authenticated using (profile_id = (select auth.uid()));
create policy referral_custom_answers_select_none on public.referral_custom_answers
  for select to authenticated using (false);
create policy builtin_question_overrides_select_org on public.builtin_question_overrides
  for select to authenticated using (org_id = (select public.current_org_id()));
create policy intake_state_presets_select_team on public.intake_state_presets
  for select to authenticated using (
    org_id = (select public.current_org_id())
    and (select public.has_permission('participants.view_personal'))
  );

revoke all on table public.intake_screens, public.custom_questions, public.custom_question_options,
  public.custom_answers, public.referral_custom_answers, public.builtin_question_overrides,
  public.intake_state_presets from anon, authenticated;
grant select on table public.intake_screens, public.custom_questions, public.custom_question_options,
  public.builtin_question_overrides, public.intake_state_presets to authenticated;
grant select (profile_id, question_id, season_id, org_id, value, source, answered_at)
  on table public.custom_answers to authenticated;

-- 3. The catalog -----------------------------------------------------------------------------------------

-- Every screen, question and option of the caller's organization, with the
-- built-in overrides; presets for staff who set what a woman is asked.
-- Archived screens and questions only for the builder (settings.organization).
create or replace function public.intake_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
  with_archived boolean := (select public.has_permission('settings.organization'));
begin
  if actor_org is null then
    raise insufficient_privilege using message = 'the question catalog needs an account';
  end if;
  return jsonb_build_object(
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'intro', s.intro, 'after_screen', s.after_screen,
        'sort_order', s.sort_order, 'is_archived', s.is_archived,
        'questions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', q.id, 'question_type', q.question_type, 'label', q.label, 'help', q.help,
            'privacy', q.privacy, 'placements', to_jsonb(q.placements), 'sort_order', q.sort_order,
            'is_archived', q.is_archived,
            'options', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', o.id, 'label', o.label, 'sort_order', o.sort_order, 'is_archived', o.is_archived)
                order by o.sort_order, o.id)
                from public.custom_question_options o where o.question_id = q.id), '[]'::jsonb))
            order by q.sort_order, q.created_at)
            from public.custom_questions q
           where q.screen_id = s.id and (with_archived or not q.is_archived)), '[]'::jsonb))
        order by array_position(private.intake_builtin_screens(), s.after_screen), s.sort_order, s.created_at)
        from public.intake_screens s
       where s.org_id = actor_org and (with_archived or not s.is_archived)), '[]'::jsonb),
    'overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question', o.question, 'label', o.label, 'help', o.help, 'is_hidden', o.is_hidden,
        'option_overrides', o.option_overrides) order by o.question)
        from public.builtin_question_overrides o where o.org_id = actor_org), '[]'::jsonb),
    'presets', case when (select public.has_permission('participants.view_personal')) then coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'states', p.states)
        order by p.name, p.id)
        from public.intake_state_presets p where p.org_id = actor_org), '[]'::jsonb)
      else '[]'::jsonb end
  );
end;
$$;

-- 4. Building ---------------------------------------------------------------------------------------------

create or replace function private.require_question_builder()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.has_permission('settings.organization')) then
    raise insufficient_privilege using message = 'the question builder needs settings.organization';
  end if;
  return (select public.current_org_id());
end;
$$;
revoke all on function private.require_question_builder() from public, anon, authenticated;

create or replace function public.save_intake_screen(
  p_id uuid,
  p_title jsonb,
  p_intro jsonb,
  p_after_screen text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  saved_id uuid;
begin
  if not private.catalan_text_valid(p_title) then
    raise check_violation using message = 'a screen needs a title in Catalan';
  end if;
  if p_id is null then
    insert into public.intake_screens (org_id, title, intro, after_screen, sort_order)
    values (actor_org, p_title, nullif(p_intro, 'null'::jsonb), p_after_screen,
            coalesce((select max(sort_order) + 1 from public.intake_screens
                       where org_id = actor_org and after_screen = p_after_screen), 0))
    returning id into saved_id;
  else
    update public.intake_screens
       set title = p_title, intro = nullif(p_intro, 'null'::jsonb), after_screen = p_after_screen,
           updated_at = now()
     where id = p_id and org_id = actor_org
    returning id into saved_id;
    if saved_id is null then
      raise no_data_found using message = 'no such screen';
    end if;
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.screen_save', 'intake_screen', saved_id,
          jsonb_build_object('after_screen', p_after_screen, 'created', p_id is null));
  return saved_id;
end;
$$;

-- Archives the screen and its questions. Their answers stay.
create or replace function public.archive_intake_screen(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
begin
  update public.intake_screens set is_archived = true, updated_at = now()
   where id = p_id and org_id = actor_org;
  if not found then
    raise no_data_found using message = 'no such screen';
  end if;
  update public.custom_questions set is_archived = true, updated_at = now()
   where screen_id = p_id and not is_archived;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.screen_archive', 'intake_screen', p_id, '{}'::jsonb);
end;
$$;

-- The order of the screens after one built-in step.
create or replace function public.reorder_intake_screens(p_after_screen text, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
begin
  update public.intake_screens s
     set sort_order = array_position(p_ids, s.id) - 1, updated_at = now()
   where s.org_id = actor_org and s.after_screen = p_after_screen and s.id = any (p_ids);
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.screens_reorder', 'organization', actor_org,
          jsonb_build_object('after_screen', p_after_screen, 'order', to_jsonb(p_ids)));
end;
$$;

-- Creates or changes a question. p_options: [{id?: uuid, label: localized text}]
-- in order. An option left out is archived; its answers keep it.
create or replace function public.save_custom_question(
  p_id uuid,
  p_screen_id uuid,
  p_type text,
  p_label jsonb,
  p_help jsonb,
  p_privacy text,
  p_placements text[],
  p_options jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  existing public.custom_questions;
  saved_id uuid;
  is_choice boolean := p_type in ('single_choice', 'multiple_choice');
  option_item jsonb;
  position_index integer := 0;
  kept_ids uuid[] := '{}';
  option_id uuid;
begin
  if not exists (select 1 from public.intake_screens
                  where id = p_screen_id and org_id = actor_org and not is_archived) then
    raise no_data_found using message = 'no such screen';
  end if;
  if not private.catalan_text_valid(p_label) then
    raise check_violation using message = 'a question needs a label in Catalan';
  end if;
  if jsonb_typeof(coalesce(p_options, '[]'::jsonb)) <> 'array' then
    raise check_violation using message = 'options must be a list';
  end if;
  if is_choice and (
    select count(*) from jsonb_array_elements(coalesce(p_options, '[]'::jsonb))) < 2 then
    raise check_violation using message = 'a choice question needs at least two options';
  end if;
  if not is_choice and jsonb_array_length(coalesce(p_options, '[]'::jsonb)) > 0 then
    raise check_violation using message = 'only a choice question has options';
  end if;
  if jsonb_array_length(coalesce(p_options, '[]'::jsonb)) > 60 then
    raise check_violation using message = 'too many options';
  end if;

  if p_id is null then
    insert into public.custom_questions (
      org_id, screen_id, question_type, label, help, privacy, placements, sort_order)
    values (actor_org, p_screen_id, p_type, p_label, nullif(p_help, 'null'::jsonb), p_privacy, p_placements,
            coalesce((select max(sort_order) + 1 from public.custom_questions where screen_id = p_screen_id), 0))
    returning id into saved_id;
  else
    select * into existing from public.custom_questions where id = p_id and org_id = actor_org for update;
    if existing.id is null then
      raise no_data_found using message = 'no such question';
    end if;
    if existing.question_type <> p_type then
      raise check_violation using message = 'the type of a question never changes';
    end if;
    if existing.privacy <> p_privacy then
      raise check_violation using message = 'the privacy level of a question never changes';
    end if;
    update public.custom_questions
       set screen_id = p_screen_id, label = p_label, help = nullif(p_help, 'null'::jsonb),
           placements = p_placements, is_archived = false, updated_at = now()
     where id = p_id;
    saved_id := p_id;
  end if;

  for option_item in select value from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) loop
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
      values (actor_org, saved_id, option_item -> 'label', position_index)
      returning id into option_id;
    end if;
    kept_ids := kept_ids || option_id;
    position_index := position_index + 1;
  end loop;
  update public.custom_question_options
     set is_archived = true
   where question_id = saved_id and not (id = any (kept_ids)) and not is_archived;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.question_save', 'custom_question', saved_id,
          jsonb_build_object('created', p_id is null, 'type', p_type, 'privacy', p_privacy,
                             'placements', to_jsonb(p_placements), 'options', cardinality(kept_ids)));
  return saved_id;
end;
$$;

create or replace function public.archive_custom_question(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
begin
  update public.custom_questions set is_archived = true, updated_at = now()
   where id = p_id and org_id = actor_org;
  if not found then
    raise no_data_found using message = 'no such question';
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.question_archive', 'custom_question', p_id, '{}'::jsonb);
end;
$$;

create or replace function public.reorder_custom_questions(p_screen_id uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
begin
  update public.custom_questions q
     set sort_order = array_position(p_ids, q.id) - 1, updated_at = now()
   where q.org_id = actor_org and q.screen_id = p_screen_id and q.id = any (p_ids);
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.questions_reorder', 'intake_screen', p_screen_id,
          jsonb_build_object('order', to_jsonb(p_ids)));
end;
$$;

-- Wording, help and options of a built-in question. Stored values never change:
-- options are only relabelled or hidden. An empty override is removed.
create or replace function public.save_builtin_question_override(
  p_question text,
  p_label jsonb,
  p_help jsonb,
  p_is_hidden boolean,
  p_option_overrides jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  cleaned jsonb := '{}'::jsonb;
  entry record;
begin
  if not (p_question = any (private.wizard_intake_questions())) then
    raise check_violation using message = 'not a built-in question';
  end if;
  if coalesce(p_is_hidden, false) and p_question = any (private.unhideable_intake_questions()) then
    raise check_violation using message = 'the app needs this question, so it cannot be hidden';
  end if;
  if jsonb_typeof(coalesce(p_option_overrides, '{}'::jsonb)) <> 'object' then
    raise check_violation using message = 'option changes must be an object';
  end if;
  for entry in select key, value from jsonb_each(coalesce(p_option_overrides, '{}'::jsonb)) loop
    if length(entry.key) > 80 or jsonb_typeof(entry.value) <> 'object'
       or entry.value - array['label', 'hidden'] <> '{}'::jsonb
       or (entry.value ? 'label' and jsonb_typeof(entry.value -> 'label') <> 'null'
           and not private.localized_text_valid(entry.value -> 'label'))
       or (entry.value ? 'hidden' and jsonb_typeof(entry.value -> 'hidden') <> 'boolean') then
      raise check_violation using message = 'invalid option change';
    end if;
    if coalesce((entry.value ->> 'hidden')::boolean, false)
       or private.localized_text_valid(entry.value -> 'label') then
      cleaned := cleaned || jsonb_build_object(entry.key, jsonb_strip_nulls(entry.value));
    end if;
  end loop;

  if nullif(p_label, 'null'::jsonb) is null and nullif(p_help, 'null'::jsonb) is null
     and not coalesce(p_is_hidden, false) and cleaned = '{}'::jsonb then
    delete from public.builtin_question_overrides where org_id = actor_org and question = p_question;
  else
    insert into public.builtin_question_overrides (
      org_id, question, label, help, is_hidden, option_overrides, updated_at, updated_by)
    values (actor_org, p_question, nullif(p_label, 'null'::jsonb), nullif(p_help, 'null'::jsonb),
            coalesce(p_is_hidden, false), cleaned, now(), (select auth.uid()))
    on conflict (org_id, question) do update
      set label = excluded.label, help = excluded.help, is_hidden = excluded.is_hidden,
          option_overrides = excluded.option_overrides, updated_at = now(),
          updated_by = excluded.updated_by;
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.builtin_override', 'organization', actor_org,
          jsonb_build_object('question', p_question, 'hidden', coalesce(p_is_hidden, false),
                             'reworded', nullif(p_label, 'null'::jsonb) is not null,
                             'options_changed', (select count(*) from jsonb_object_keys(cleaned))));
end;
$$;

-- 5. Organization presets (RAPP-301) --------------------------------------------------------------------

create or replace function public.save_intake_state_preset(p_id uuid, p_name text, p_states jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
  saved_id uuid;
begin
  if not (select public.has_permission('participants.view_personal')) then
    raise insufficient_privilege using message = 'presets need participants.view_personal';
  end if;
  if jsonb_typeof(p_states) <> 'object' or exists (
    select 1 from jsonb_each_text(p_states) entry
     where not (entry.key = any (private.wizard_intake_questions()))
        or entry.value not in ('ask', 'skip')
  ) then
    raise check_violation using message = 'a preset sets ask or skip on wizard questions';
  end if;
  if p_id is null then
    insert into public.intake_state_presets (org_id, name, states, created_by)
    values (actor_org, btrim(p_name), p_states, (select auth.uid()))
    returning id into saved_id;
  else
    update public.intake_state_presets set name = btrim(p_name), states = p_states
     where id = p_id and org_id = actor_org
    returning id into saved_id;
    if saved_id is null then
      raise no_data_found using message = 'no such preset';
    end if;
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.preset_save', 'intake_state_preset', saved_id,
          jsonb_build_object('name', btrim(p_name), 'states', p_states));
  return saved_id;
end;
$$;

create or replace function public.delete_intake_state_preset(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
begin
  if not (select public.has_permission('participants.view_personal')) then
    raise insufficient_privilege using message = 'presets need participants.view_personal';
  end if;
  delete from public.intake_state_presets where id = p_id and org_id = actor_org;
  if not found then
    raise no_data_found using message = 'no such preset';
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.preset_delete', 'intake_state_preset', p_id, '{}'::jsonb);
end;
$$;

-- 6. Answers -----------------------------------------------------------------------------------------------

-- A value of the question's type: text, 'yes'/'no'/'maybe', an option id, or a
-- list of option ids. Archived options are not offered again.
create or replace function private.custom_answer_valid(p_question public.custom_questions, p_value jsonb)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case p_question.question_type
    when 'short_text' then jsonb_typeof(p_value) = 'string'
      and length(btrim(p_value #>> '{}')) between 1 and 500
    when 'long_text' then jsonb_typeof(p_value) = 'string'
      and length(btrim(p_value #>> '{}')) between 1 and 4000
    when 'yes_no_maybe' then jsonb_typeof(p_value) = 'string' and p_value #>> '{}' in ('yes', 'no', 'maybe')
    when 'single_choice' then jsonb_typeof(p_value) = 'string' and exists (
      select 1 from public.custom_question_options o
       where o.question_id = p_question.id and not o.is_archived and o.id::text = p_value #>> '{}')
    when 'multiple_choice' then jsonb_typeof(p_value) = 'array' and jsonb_array_length(p_value) > 0
      and (select count(distinct e) from jsonb_array_elements_text(p_value) e) = jsonb_array_length(p_value)
      and not exists (
        select 1 from jsonb_array_elements_text(p_value) e
         where not exists (select 1 from public.custom_question_options o
                            where o.question_id = p_question.id and not o.is_archived and o.id::text = e))
    else false
  end;
$$;

-- Writes one answer: an empty value removes it. A seasonal question answers the
-- current season. Sensitive answers are encrypted.
create or replace function private.write_custom_answer(
  p_profile_id uuid,
  p_question public.custom_questions,
  p_value jsonb,
  p_source text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  season uuid := case when 'season' = any (p_question.placements)
                      then private.current_season_id(p_question.org_id) end;
  key uuid := coalesce(season, '00000000-0000-0000-0000-000000000000'::uuid);
  is_empty boolean := p_value is null or jsonb_typeof(p_value) = 'null'
    or (jsonb_typeof(p_value) = 'string' and btrim(p_value #>> '{}') = '')
    or (jsonb_typeof(p_value) = 'array' and jsonb_array_length(p_value) = 0);
  stored jsonb := case when jsonb_typeof(p_value) = 'string' then to_jsonb(btrim(p_value #>> '{}')) else p_value end;
begin
  if 'season' = any (p_question.placements) and season is null then
    raise check_violation using message = 'a seasonal question needs a current season';
  end if;
  if is_empty then
    delete from public.custom_answers
     where profile_id = p_profile_id and question_id = p_question.id and season_key = key;
    return;
  end if;
  if not private.custom_answer_valid(p_question, stored) then
    raise check_violation using message = 'the answer does not fit the question';
  end if;
  insert into public.custom_answers (
    profile_id, question_id, season_key, season_id, org_id, value, value_encrypted, source, answered_at)
  values (
    p_profile_id, p_question.id, key, season, p_question.org_id,
    case when p_question.privacy = 'sensitive' then null else stored end,
    case when p_question.privacy = 'sensitive' then public.encrypt_field(stored::text) end,
    p_source, now())
  on conflict (profile_id, question_id, season_key) do update
    set value = excluded.value, value_encrypted = excluded.value_encrypted,
        source = excluded.source, answered_at = now();
end;
$$;

revoke all on function private.custom_answer_valid(public.custom_questions, jsonb) from public, anon, authenticated;
revoke all on function private.write_custom_answer(uuid, public.custom_questions, jsonb, text)
  from public, anon, authenticated;

-- Her own answers: those of no season and those of the current season.
create or replace function public.my_custom_answers()
returns table (question_id uuid, value jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select a.question_id,
         coalesce(a.value, (public.decrypt_field(a.value_encrypted))::jsonb)
    from public.custom_answers a
   where a.profile_id = (select auth.uid())
     and (a.season_id is null
          or a.season_id = private.current_season_id((select public.current_org_id())));
$$;

-- What she answers in the wizard or at re-registration: {question id: value}.
create or replace function public.save_my_custom_answers(p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  entry record;
  question public.custom_questions;
begin
  if not exists (select 1 from public.profiles where id = actor and role in ('player', 'invited')) then
    raise insufficient_privilege using message = 'only a participant answers her own questions';
  end if;
  if jsonb_typeof(p_answers) <> 'object' then
    raise check_violation using message = 'answers must be an object';
  end if;
  for entry in select key, value from jsonb_each(p_answers) loop
    select * into question from public.custom_questions q
     where q.id::text = entry.key and q.org_id = actor_org and not q.is_archived
       and q.placements && array['wizard', 'season']::text[];
    if question.id is null then
      raise insufficient_privilege using message = 'not a question she is asked';
    end if;
    perform private.write_custom_answer(actor, question, entry.value, 'player');
  end loop;
end;
$$;

-- Her answers for the staff page, each season kept apart. A Personal answer
-- needs participants.view_personal, a Sensitive one participants.view_sensitive.
create or replace function public.participant_custom_answers(p_profile_id uuid)
returns table (
  question_id uuid,
  season_id uuid,
  season_name text,
  value jsonb,
  source text,
  answered_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
  sees_personal boolean := (select public.has_permission('participants.view_personal'));
  sees_sensitive boolean := (select public.has_permission('participants.view_sensitive'));
begin
  if not (select public.has_permission('participants.view')) then
    raise insufficient_privilege using message = 'her answers need participants.view';
  end if;
  return query
  select a.question_id, a.season_id, s.name,
         coalesce(a.value, (public.decrypt_field(a.value_encrypted))::jsonb),
         a.source, a.answered_at
    from public.custom_answers a
    join public.custom_questions q on q.id = a.question_id
    left join public.seasons s on s.id = a.season_id
   where a.profile_id = p_profile_id
     and a.org_id = actor_org
     and (q.privacy = 'normal'
          or (q.privacy = 'personal' and sees_personal)
          or (q.privacy = 'sensitive' and sees_sensitive))
   order by q.sort_order, s.starts_on desc nulls first;
end;
$$;

-- Staff complete or correct her answers on the participant page.
create or replace function public.set_participant_custom_answers(p_profile_id uuid, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
  entry record;
  question public.custom_questions;
  changed text[] := '{}';
begin
  if not (select public.has_permission('participants.view_personal')) then
    raise insufficient_privilege using message = 'editing her answers needs participants.view_personal';
  end if;
  if not exists (select 1 from public.profiles
                  where id = p_profile_id and org_id = actor_org and role in ('player', 'invited')) then
    raise no_data_found using message = 'no such participant';
  end if;
  if jsonb_typeof(p_answers) <> 'object' then
    raise check_violation using message = 'answers must be an object';
  end if;
  for entry in select key, value from jsonb_each(p_answers) loop
    select * into question from public.custom_questions q
     where q.id::text = entry.key and q.org_id = actor_org and not q.is_archived;
    if question.id is null then
      raise no_data_found using message = 'no such question';
    end if;
    if question.privacy = 'sensitive' and not (select public.has_permission('participants.view_sensitive')) then
      raise insufficient_privilege using message = 'a Sensitive answer needs participants.view_sensitive';
    end if;
    perform private.write_custom_answer(p_profile_id, question, entry.value, 'staff');
    changed := changed || question.id::text;
  end loop;
  -- The questions only: answers may be Sensitive and never enter the log (ADR-004).
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'profile.custom_answers_update', 'profile', p_profile_id,
          jsonb_build_object('questions', to_jsonb(changed)));
end;
$$;

-- What the entity answers on the referral form, right after she sends it.
create or replace function public.save_referral_custom_answers(p_referral_id uuid, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  referral public.entity_referrals;
  entry record;
  question public.custom_questions;
  is_empty boolean;
begin
  select * into referral from public.entity_referrals where id = p_referral_id;
  if referral.id is null or referral.entity_user_id <> actor or referral.referred_profile_id is not null then
    raise insufficient_privilege using message = 'only the entity that sent the referral adds its answers';
  end if;
  if jsonb_typeof(p_answers) <> 'object' then
    raise check_violation using message = 'answers must be an object';
  end if;
  for entry in select key, value from jsonb_each(p_answers) loop
    select * into question from public.custom_questions q
     where q.id::text = entry.key and q.org_id = referral.org_id and not q.is_archived
       and 'entity_form' = any (q.placements);
    if question.id is null then
      raise insufficient_privilege using message = 'not a question of the referral form';
    end if;
    is_empty := jsonb_typeof(entry.value) = 'null'
      or (jsonb_typeof(entry.value) = 'string' and btrim(entry.value #>> '{}') = '')
      or (jsonb_typeof(entry.value) = 'array' and jsonb_array_length(entry.value) = 0);
    if is_empty then
      delete from public.referral_custom_answers where referral_id = referral.id and question_id = question.id;
      continue;
    end if;
    if not private.custom_answer_valid(question, entry.value) then
      raise check_violation using message = 'the answer does not fit the question';
    end if;
    insert into public.referral_custom_answers (referral_id, question_id, org_id, value_encrypted)
    values (referral.id, question.id, referral.org_id, public.encrypt_field(entry.value::text))
    on conflict (referral_id, question_id) do update set value_encrypted = excluded.value_encrypted;
  end loop;
end;
$$;

-- The referral's custom answers, as get_entity_referral shows its own: in full
-- to the entity that sent it; to staff by each question's level.
create or replace function public.referral_custom_answers(p_referral_id uuid)
returns table (question_id uuid, value jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  referral public.entity_referrals;
  is_sender boolean;
  sees_personal boolean := (select public.has_permission('participants.view_personal'));
  sees_sensitive boolean := (select public.has_permission('participants.view_sensitive'));
begin
  select * into referral from public.entity_referrals where id = p_referral_id;
  is_sender := referral.entity_user_id = actor;
  if referral.id is null or not (
    is_sender
    or (referral.org_id = (select public.current_org_id())
        and (select public.has_permission('participants.view')))
  ) then
    raise insufficient_privilege using message = 'not your referral';
  end if;
  return query
  select r.question_id, (public.decrypt_field(r.value_encrypted))::jsonb
    from public.referral_custom_answers r
    join public.custom_questions q on q.id = r.question_id
   where r.referral_id = p_referral_id
     and (is_sender or q.privacy = 'normal'
          or (q.privacy = 'personal' and sees_personal)
          or (q.privacy = 'sensitive' and sees_sensitive));
end;
$$;

-- When she is invited from the referral, its answers become hers. What staff
-- already typed wins, as for the built-in answers (RAPP-303).
create or replace function private.adopt_referral_custom_answers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  answer record;
  question public.custom_questions;
  season uuid;
begin
  for answer in select * from public.referral_custom_answers where referral_id = new.id loop
    select * into question from public.custom_questions where id = answer.question_id;
    season := case when 'season' = any (question.placements)
                   then private.current_season_id(question.org_id) end;
    if 'season' = any (question.placements) and season is null then
      continue;
    end if;
    insert into public.custom_answers (
      profile_id, question_id, season_key, season_id, org_id, value, value_encrypted, source)
    values (
      new.referred_profile_id, question.id,
      coalesce(season, '00000000-0000-0000-0000-000000000000'::uuid), season, question.org_id,
      case when question.privacy = 'sensitive' then null
           else (public.decrypt_field(answer.value_encrypted))::jsonb end,
      case when question.privacy = 'sensitive' then answer.value_encrypted end,
      'entity')
    on conflict (profile_id, question_id, season_key) do nothing;
  end loop;
  delete from public.referral_custom_answers where referral_id = new.id;
  return new;
end;
$$;
revoke all on function private.adopt_referral_custom_answers() from public, anon, authenticated;

create trigger entity_referrals_adopt_custom_answers
  after update of referred_profile_id on public.entity_referrals
  for each row
  when (old.referred_profile_id is null and new.referred_profile_id is not null)
  execute function private.adopt_referral_custom_answers();

revoke all on function public.intake_catalog() from public, anon;
revoke all on function public.save_intake_screen(uuid, jsonb, jsonb, text) from public, anon;
revoke all on function public.archive_intake_screen(uuid) from public, anon;
revoke all on function public.reorder_intake_screens(text, uuid[]) from public, anon;
revoke all on function public.save_custom_question(uuid, uuid, text, jsonb, jsonb, text, text[], jsonb) from public, anon;
revoke all on function public.archive_custom_question(uuid) from public, anon;
revoke all on function public.reorder_custom_questions(uuid, uuid[]) from public, anon;
revoke all on function public.save_builtin_question_override(text, jsonb, jsonb, boolean, jsonb) from public, anon;
revoke all on function public.save_intake_state_preset(uuid, text, jsonb) from public, anon;
revoke all on function public.delete_intake_state_preset(uuid) from public, anon;
revoke all on function public.my_custom_answers() from public, anon;
revoke all on function public.save_my_custom_answers(jsonb) from public, anon;
revoke all on function public.participant_custom_answers(uuid) from public, anon;
revoke all on function public.set_participant_custom_answers(uuid, jsonb) from public, anon;
revoke all on function public.save_referral_custom_answers(uuid, jsonb) from public, anon;
revoke all on function public.referral_custom_answers(uuid) from public, anon;
grant execute on function public.intake_catalog(), public.save_intake_screen(uuid, jsonb, jsonb, text),
  public.archive_intake_screen(uuid), public.reorder_intake_screens(text, uuid[]),
  public.save_custom_question(uuid, uuid, text, jsonb, jsonb, text, text[], jsonb),
  public.archive_custom_question(uuid), public.reorder_custom_questions(uuid, uuid[]),
  public.save_builtin_question_override(text, jsonb, jsonb, boolean, jsonb),
  public.save_intake_state_preset(uuid, text, jsonb), public.delete_intake_state_preset(uuid),
  public.my_custom_answers(), public.save_my_custom_answers(jsonb),
  public.participant_custom_answers(uuid), public.set_participant_custom_answers(uuid, jsonb),
  public.save_referral_custom_answers(uuid, jsonb), public.referral_custom_answers(uuid)
  to authenticated;

-- An answer as one line of text, in Catalan: an archived option says so.
create or replace function private.custom_answer_text(p_question public.custom_questions, p_value jsonb)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_question.question_type in ('single_choice', 'multiple_choice') then (
      select string_agg(
               coalesce(o.label ->> 'ca', chosen.id)
                 || case when o.is_archived then ' (arxivada)' else '' end,
               '; ' order by o.sort_order)
        from (select jsonb_array_elements_text(
                       case when jsonb_typeof(p_value) = 'array' then p_value
                            else jsonb_build_array(p_value) end) as id) chosen
        left join public.custom_question_options o
          on o.id::text = chosen.id and o.question_id = p_question.id)
    else p_value #>> '{}'
  end;
$$;
revoke all on function private.custom_answer_text(public.custom_questions, jsonb) from public, anon, authenticated;

-- 7. Exports and the personal data registry ------------------------------------------------------

create or replace function public.create_data_export(p_dataset text, p_scope text, p_format text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_reason text DEFAULT NULL::text, p_confirmed boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
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
      and profile.role = 'player';
  elsif p_dataset = 'participants' then
    export_columns := '["id","first_name","last_name","date_of_birth","place_of_birth","nationality","preferred_language","document_type","document_number","phone","address","city","postal_code","reference_entity","reference_contact_name","has_dependents","num_dependents","clothing_size","shoe_size","is_active","created_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', profile.id,
      'first_name', profile.first_name,
      'last_name', profile.last_name,
      'date_of_birth', profile.date_of_birth,
      'place_of_birth', profile.place_of_birth,
      'nationality', profile.nationality,
      'preferred_language', profile.preferred_language,
      'document_type', profile.document_type,
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
      and profile.role = 'player';
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

create or replace function public.personal_data_disposition()
 RETURNS TABLE(table_name text, participant_column text, disposition text, reason text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $$
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
    ('staff_invitations', null, 'not_personal', 'Organization staff access administration history.'),
    ('internal_documents', null, 'not_personal', 'Organization-owned private operational documents.'),
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
    ('municipality_catalog', null, 'not_personal', 'Official geography with no participant data.'),
    ('permissions', null, 'not_personal', 'The product permission catalog.'),
    ('permission_preset_defaults', null, 'not_personal', 'Product default permissions of the built-in presets.'),
    ('permission_presets', null, 'not_personal', 'Organization-owned access presets.'),
    ('permission_preset_permissions', null, 'not_personal', 'Organization-owned access presets.'),
    ('team_member_access', null, 'not_personal', 'Team access administration; players never hold permissions.'),
    ('team_member_permissions', null, 'not_personal', 'Team access administration; players never hold permissions.'),
    ('equipment_item_types', null, 'not_personal', 'The organization''s material catalog.'),
    ('stock_movements', 'participant_id', 'purge', 'Stock movements keep their quantity so stock stays right; her link is cleared by ON DELETE SET NULL.'),
    ('stock_alerts', null, 'not_personal', 'Stock that went below zero, for the team to count.'),
    ('equipment_arrivals', null, 'not_personal', 'Goods received: source, problems and cost. No participant data.'),
    ('equipment_arrival_photos', null, 'not_personal', 'Photos of goods received and their receipts.'),
    ('stock_counts', null, 'not_personal', 'Stock counts: what was expected and what was on the shelf.'),
    ('staff_checkouts', null, 'not_personal', 'Material lent to a staff member for a trip or an event.'),
    ('photo_handoffs', null, 'not_personal', 'A staff member''s request to take a document photo with the phone.'),
    ('profile_answers', 'profile_id', 'purge', 'Which intake questions were answered, and by whom.'),
    ('intake_question_states', 'profile_id', 'purge', 'Which intake questions staff chose to ask or not ask her.'),
    ('seasons', null, 'not_personal', 'The organization''s seasons.'),
    ('authorization_versions', null, 'not_personal', 'The organization''s published authorization texts.'),
    ('authorization_signatures', 'profile_id', 'purge', 'Her signed or paper authorizations, with her drawn signature.'),
    ('authorization_consent_events', 'profile_id', 'purge', 'Each consent she gave or withdrew.'),
    ('season_answers', 'profile_id', 'purge', 'Her registration answers, one row per season.'),
    ('walk_in_signings', null, 'retain_limited', 'A walk-in''s tablet signing until staff confirm it; purged after 60 days.'),
    ('intake_screens', null, 'not_personal', 'Registration screens staff built.'),
    ('custom_questions', null, 'not_personal', 'Questions staff added to registration.'),
    ('custom_question_options', null, 'not_personal', 'Options of those questions.'),
    ('builtin_question_overrides', null, 'not_personal', 'Staff wording for the built-in questions.'),
    ('intake_state_presets', null, 'not_personal', 'Organization presets for which questions are asked.'),
    ('custom_answers', 'profile_id', 'purge', 'Her answers to the questions staff added.'),
    ('referral_custom_answers', null, 'retain_limited', 'Extra answers sent with a referral; moved to her profile when she is invited, or purged with the referral.')
  ) as disposition(table_name, participant_column, disposition, reason);
$$;
