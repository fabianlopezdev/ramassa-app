-- Required or optional for every onboarding question (RAPP-611).
--
-- WHY
--
-- Every staff question was optional, and the built-in required list was fixed
-- in code (`REQUIRED_INTAKE_QUESTIONS`) and in `private.required_intake_questions()`.
-- Ramassà staff now choose, in the admin, which questions need an answer,
-- inside the guards of the spec: her first name, last name and app language
-- are always required.
--
-- WHAT THIS MIGRATION DOES
--
--   1. One required list in the database. `private.default_required_intake_questions()`
--      is today's list (a parity test reads its block against the code's
--      defaults) and `private.locked_required_intake_questions()` the three
--      that never change. `public.intake_required_questions` holds what staff
--      changed per organization; `private.required_intake_questions(org)` is
--      the result, and the old no-argument function reads it for the caller's
--      organization, so every reader (the RAPP-301 Don't ask rule, the
--      RAPP-612 hide rule, the scenarios, the catalog) follows staff.
--   2. A hide counts only while the question is optional. The table check that
--      kept required questions visible read a fixed list; the list is data
--      now, so the check moves into the functions and the catalog.
--   3. `custom_questions.is_required` (default false, so no existing question
--      changes). It binds where she answers: her wizard and each season.
--      The entity referral form never requires an answer: an entity gives
--      what it knows, and she answers the rest in her wizard (RAPP-300).
--   4. `save_builtin_question_required` and `save_custom_question_required`
--      for onboarding designers (`private.can_design_onboarding`), audited.
--   5. `intake_catalog()` carries the required built-in list and each staff
--      question's flag: her phone reads both in its one catalog call.
--   6. The server re-checks: `complete_onboarding` refuses a missing required
--      built-in answer (the old fixed place-of-birth check becomes data);
--      `complete_onboarding_signed` now saves her staff answers in the same
--      transaction (`custom_answers` in the payload) and refuses a missing
--      required one; `update_my_season_answers`, the call that ends a
--      re-registration, refuses a missing required season answer.
--   7. `profiles.has_dependents` may be null: an optional dependants question
--      she did not answer is unknown, never "no", so no count miscounts it.
--
-- Docs: https://www.postgresql.org/docs/current/ddl-constraints.html (a CHECK
-- must not depend on other rows, so a data-driven rule is enforced by the
-- writing function), https://www.postgresql.org/docs/current/xfunc-volatility.html
-- (a function reading a table is STABLE, never IMMUTABLE),
-- https://supabase.com/docs/guides/database/postgres/row-level-security.

-- 1. The one required list --------------------------------------------------------------------------------

create or replace function private.default_required_intake_questions()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    -- required-intake-questions:start
    'first_name', 'last_name', 'date_of_birth', 'place_of_birth', 'nationality',
    'preferred_language', 'reference_entity', 'dependents', 'clothing_size', 'shoe_size'
    -- required-intake-questions:end
  ]::text[];
$$;

-- Her name and her app language: always required (spec guard).
create or replace function private.locked_required_intake_questions()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    -- locked-required-intake-questions:start
    'first_name', 'last_name', 'preferred_language'
    -- locked-required-intake-questions:end
  ]::text[];
$$;

revoke all on function private.default_required_intake_questions() from public, anon, authenticated;
revoke all on function private.locked_required_intake_questions() from public, anon, authenticated;

create table public.intake_required_questions (
  org_id uuid not null references public.organizations (id) on delete cascade,
  question text not null check (question = any (private.wizard_intake_questions())),
  is_required boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  primary key (org_id, question),
  constraint intake_required_questions_locked_stay_required
    check (is_required or not (question = any (private.locked_required_intake_questions())))
);
comment on table public.intake_required_questions is
  'Which built-in onboarding questions staff made required or optional (RAPP-611). No row: the app default.';

alter table public.intake_required_questions enable row level security;
create policy intake_required_questions_select_org on public.intake_required_questions
  for select to authenticated using (org_id = (select public.current_org_id()));
revoke all on table public.intake_required_questions from anon, authenticated;
grant select on table public.intake_required_questions to authenticated;

-- The required built-in questions of an organization, in the app's order.
create or replace function private.required_intake_questions(p_org_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  with candidates as (
    select c.question, min(c.position) as position
      from unnest(private.default_required_intake_questions()
                  || private.locked_required_intake_questions()
                  || private.wizard_intake_questions()) with ordinality as c(question, position)
     group by c.question)
  select coalesce(array_agg(c.question order by c.position), array[]::text[])
    from candidates c
    left join public.intake_required_questions r
      on r.org_id = p_org_id and r.question = c.question
   where c.question = any (private.locked_required_intake_questions())
      or coalesce(r.is_required, c.question = any (private.default_required_intake_questions()));
$$;

-- For the caller's organization; a woman with no profile yet registers in the
-- default one, as the catalog reads it.
create or replace function private.required_intake_questions()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select private.required_intake_questions(
    coalesce((select public.current_org_id()), (select public.default_organization_id())));
$$;

-- What can never be hidden: the required questions, and only them now that
-- the equipment stock reads a missing size as unknown.
create or replace function private.unhideable_intake_questions()
returns text[]
language sql
stable
set search_path = ''
as $$
  select private.required_intake_questions();
$$;

revoke all on function private.required_intake_questions(uuid) from public, anon, authenticated;
revoke all on function private.required_intake_questions() from public, anon, authenticated;
revoke all on function private.unhideable_intake_questions() from public, anon, authenticated;

-- 2. A hide counts only while the question is optional -------------------------------------------------------

alter table public.builtin_question_overrides
  drop constraint builtin_question_overrides_needed_stays;

-- 3. Staff questions --------------------------------------------------------------------------------------

alter table public.custom_questions
  add column is_required boolean not null default false;
comment on column public.custom_questions.is_required is
  'She must answer it in her wizard and each season (RAPP-611). Never on the entity referral form.';

-- 4. Staff choose ---------------------------------------------------------------------------------------------

create or replace function public.save_builtin_question_required(p_question text, p_is_required boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  required boolean := coalesce(p_is_required, false);
begin
  if p_question = any (private.locked_required_intake_questions()) then
    raise check_violation using message = 'her first name, last name and app language are always required';
  end if;
  if not (p_question = any (private.wizard_intake_questions())) then
    raise check_violation using message = 'not a built-in question of the wizard';
  end if;
  if required = (p_question = any (private.default_required_intake_questions())) then
    delete from public.intake_required_questions where org_id = actor_org and question = p_question;
  else
    insert into public.intake_required_questions (org_id, question, is_required, updated_at, updated_by)
    values (actor_org, p_question, required, now(), (select auth.uid()))
    on conflict (org_id, question) do update
      set is_required = excluded.is_required, updated_at = now(), updated_by = excluded.updated_by;
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.required_question_save', 'organization', actor_org,
          jsonb_build_object('question', p_question, 'required', required));
end;
$$;

create or replace function public.save_custom_question_required(p_id uuid, p_is_required boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  question public.custom_questions;
  required boolean := coalesce(p_is_required, false);
begin
  select * into question from public.custom_questions
   where id = p_id and org_id = actor_org and not is_archived;
  if question.id is null then
    raise no_data_found using message = 'no such question';
  end if;
  if required and not (question.placements && array['wizard', 'season']::text[]) then
    raise check_violation using message = 'only a question she answers herself can be required';
  end if;
  update public.custom_questions set is_required = required, updated_at = now() where id = p_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.custom_required_save', 'custom_question', p_id,
          jsonb_build_object('required', required));
end;
$$;

revoke all on function public.save_builtin_question_required(text, boolean) from public, anon;
revoke all on function public.save_custom_question_required(uuid, boolean) from public, anon;
grant execute on function public.save_builtin_question_required(text, boolean) to authenticated;
grant execute on function public.save_custom_question_required(uuid, boolean) to authenticated;

-- The built-in hide refuses a required question, read from the one list.
create or replace function public.save_builtin_screen(p_screen text, p_texts jsonb, p_is_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  texts jsonb := coalesce(nullif(p_texts, 'null'::jsonb), '{}'::jsonb);
  hidden boolean := coalesce(p_is_hidden, false);
begin
  if private.builtin_screen_text_fields(p_screen) is null then
    raise check_violation using message = 'not a built-in screen';
  end if;
  if not private.builtin_screen_texts_valid(p_screen, texts) then
    raise check_violation using message = 'only this screen''s fields, as text in the five languages';
  end if;
  if hidden and not private.builtin_screen_hideable(p_screen) then
    raise check_violation using message = 'a screen with a required question, the summary or the terms cannot be hidden';
  end if;
  if texts = '{}'::jsonb and not hidden then
    delete from public.intake_builtin_screens where org_id = actor_org and screen = p_screen;
  else
    insert into public.intake_builtin_screens (org_id, screen, texts, is_hidden, updated_at, updated_by)
    values (actor_org, p_screen, texts, hidden, now(), (select auth.uid()))
    on conflict (org_id, screen) do update
      set texts = excluded.texts, is_hidden = excluded.is_hidden, updated_at = now(),
          updated_by = excluded.updated_by;
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.builtin_screen_save', 'organization', actor_org,
          jsonb_build_object('screen', p_screen, 'hidden', hidden,
                             'fields', (select coalesce(jsonb_agg(field order by field), '[]'::jsonb)
                                          from jsonb_object_keys(texts) field)));
end;
$$;

-- 5. Required staff questions she has not answered --------------------------------------------------------

-- The live required staff questions she is asked in a place ('wizard' or
-- 'season') that she shows (a conditional one only once its condition holds)
-- and has no answer to. A seasonal one is answered per current season; with
-- no current season there is nowhere to keep it, so it never blocks her.
create or replace function private.missing_required_custom_answers(p_profile_id uuid, p_placement text)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(q.id order by q.sort_order), array[]::uuid[])
    from public.custom_questions q
    join public.intake_screens s on s.id = q.screen_id and not s.is_archived
    join public.profiles p on p.id = p_profile_id and p.org_id = q.org_id
   where q.is_required and not q.is_archived
     and p_placement = any (q.placements)
     and not ('season' = any (q.placements) and private.current_season_id(q.org_id) is null)
     and (q.show_when_question_id is null or exists (
           select 1 from public.custom_answers c
            where c.profile_id = p_profile_id and c.question_id = q.show_when_question_id
              and coalesce(c.value, (public.decrypt_field(c.value_encrypted))::jsonb)
                  = to_jsonb(q.show_when_option_id::text)))
     and not exists (
           select 1 from public.custom_answers a
            where a.profile_id = p_profile_id and a.question_id = q.id
              and a.season_key = case when 'season' = any (q.placements)
                                      then private.current_season_id(q.org_id)
                                      else '00000000-0000-0000-0000-000000000000'::uuid end);
$$;
revoke all on function private.missing_required_custom_answers(uuid, text) from public, anon, authenticated;

-- Her own answers to the staff questions she is asked (wizard or season):
-- shared by `save_my_custom_answers` and the signed wizard completion.
create or replace function private.save_player_custom_answers(p_profile_id uuid, p_org_id uuid, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry record;
  question public.custom_questions;
begin
  if jsonb_typeof(p_answers) <> 'object' then
    raise check_violation using message = 'answers must be an object';
  end if;
  for entry in select key, value from jsonb_each(p_answers) loop
    select * into question from public.custom_questions q
     where q.id::text = entry.key and q.org_id = p_org_id and not q.is_archived
       and q.placements && array['wizard', 'season']::text[];
    if question.id is null then
      raise insufficient_privilege using message = 'not a question she is asked';
    end if;
    perform private.write_custom_answer(p_profile_id, question, entry.value, 'player');
  end loop;
end;
$$;
revoke all on function private.save_player_custom_answers(uuid, uuid, jsonb) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_my_custom_answers(p_answers jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
begin
  if not exists (select 1 from public.profiles where id = actor and role in ('player', 'invited')) then
    raise insufficient_privilege using message = 'only a participant answers her own questions';
  end if;
  perform private.save_player_custom_answers(actor, (select public.current_org_id()), p_answers);
end;
$function$;

revoke all on function public.save_my_custom_answers(jsonb) from public, anon;
grant execute on function public.save_my_custom_answers(jsonb) to authenticated;

-- 6. Her phone reads the required list in its one catalog call ---------------------------------------------

CREATE OR REPLACE FUNCTION public.intake_catalog()
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
begin
  if (select auth.uid()) is null or actor_org is null then
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
            'is_archived', q.is_archived, 'settings', q.settings, 'is_required', q.is_required,
            'show_when_question_id', q.show_when_question_id, 'show_when_option_id', q.show_when_option_id,
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
        'question', o.question, 'label', o.label, 'help', o.help,
        -- A hide counts only while the question is optional (RAPP-611).
        'is_hidden', o.is_hidden and not (o.question = any (private.required_intake_questions(actor_org))),
        'option_overrides', o.option_overrides) order by o.question)
        from public.builtin_question_overrides o where o.org_id = actor_org), '[]'::jsonb),
    'presets', case when ((select public.has_permission('participants.view_personal')) or (select public.has_permission('onboarding.design'))) then coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'states', p.states)
        order by p.name, p.id)
        from public.intake_state_presets p where p.org_id = actor_org), '[]'::jsonb)
      else '[]'::jsonb end,
    -- Staff wording of the built-in screens and their hide switch (RAPP-612).
    -- A hide counts only while none of the screen's questions is required.
    'builtin_screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'screen', b.screen, 'texts', b.texts,
        'is_hidden', b.is_hidden and private.builtin_screen_hideable(b.screen))
        order by b.screen)
        from public.intake_builtin_screens b where b.org_id = actor_org), '[]'::jsonb),
    -- The wizard steps as staff arranged them (RAPP-612); null is the app's order.
    'flow_order', (
      select to_jsonb(f.step_order) from public.intake_flow_orders f where f.org_id = actor_org),
    -- The built-in questions that need an answer (RAPP-611): the one list her
    -- phone, her summary and the staff preview read.
    'required_questions', to_jsonb(private.required_intake_questions(actor_org)),
    -- The app terms she accepts (RAPP-613): the current published version.
    'terms', (
      select jsonb_build_object('id', v.id, 'version_number', v.version_number, 'content', v.content)
        from private.current_app_terms_version(actor_org) v
       where v.id is not null)
  );
end;
$function$;

-- 7. Dependants she did not answer are unknown ---------------------------------------------------------------

alter table public.profiles alter column has_dependents drop not null;

-- 8. The server re-checks ----------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_onboarding(payload jsonb)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
  stored public.profiles;
  saved public.profiles;
  terms_version_value text := nullif(payload ->> 'terms_version', '');
  locale_shown_value text := nullif(payload ->> 'locale_shown', '');
  -- Every value below is the merge: a question the wizard sent takes her
  -- answer, and a question it did not send keeps what is stored.
  first_name_value text;
  last_name_value text;
  date_of_birth_value date;
  place_of_birth_value text;
  nationality_value text;
  preferred_language_value text;
  document_type_value text;
  document_number_value text;
  document_name_value text;
  phone_value text;
  address_value text;
  city_value text;
  postal_code_value text;
  reference_entity_value text;
  reference_contact_name_value text;
  has_dependents_value boolean;
  num_dependents_value integer;
  clothing_size_value text;
  shoe_size_value text;
  avatar_url_value text;
  media_consent_at_value timestamptz;
  required_questions text[];
  missing text[];
begin
  if caller is null then
    raise exception 'complete_onboarding requires an authenticated caller'
      using errcode = 'insufficient_privilege';
  end if;

  if terms_version_value is null or locale_shown_value is null then
    raise exception 'complete_onboarding requires terms_version and locale_shown'
      using errcode = 'not_null_violation';
  end if;

  select * into stored from public.profiles where id = caller for update;
  if stored.id is not null and stored.role not in ('player', 'invited') then
    raise exception 'complete_onboarding is the participant path'
      using errcode = 'insufficient_privilege';
  end if;

  first_name_value := case when payload ? 'first_name'
    then nullif(btrim(payload ->> 'first_name'), '') else stored.first_name end;
  last_name_value := case when payload ? 'last_name'
    then nullif(btrim(payload ->> 'last_name'), '') else stored.last_name end;
  date_of_birth_value := case when payload ? 'date_of_birth'
    then nullif(payload ->> 'date_of_birth', '')::date else stored.date_of_birth end;
  place_of_birth_value := case when payload ? 'place_of_birth'
    then nullif(btrim(payload ->> 'place_of_birth'), '') else stored.place_of_birth end;
  nationality_value := case when payload ? 'nationality'
    then nullif(btrim(payload ->> 'nationality'), '') else stored.nationality end;
  preferred_language_value := coalesce(
    nullif(payload ->> 'preferred_language', ''), stored.preferred_language, 'ca');
  document_type_value := case when payload ? 'document_type'
    then nullif(payload ->> 'document_type', '') else stored.document_type end;
  document_name_value := case when document_type_value is distinct from 'other' then null
    when payload ? 'document_name' then nullif(btrim(payload ->> 'document_name'), '')
    when stored.document_type = 'other' then stored.document_name else null end;
  if payload ? 'document_type' and document_type_value = 'other' and document_name_value is null then
    raise not_null_violation using message = 'enter the name of the other document';
  end if;
  document_number_value := case when payload ? 'document_number'
    then nullif(btrim(payload ->> 'document_number'), '')
    else public.decrypt_field(stored.document_number) end;
  -- No type means no document was given (RAPP-302), so a number cannot stand
  -- alone either.
  if document_type_value is null or document_type_value = 'none' then
    document_number_value := null;
  end if;
  phone_value := case when payload ? 'phone'
    then nullif(btrim(payload ->> 'phone'), '') else public.decrypt_field(stored.phone) end;
  address_value := case when payload ? 'address'
    then nullif(btrim(payload ->> 'address'), '') else public.decrypt_field(stored.address) end;
  city_value := case when payload ? 'city'
    then nullif(btrim(payload ->> 'city'), '') else stored.city end;
  postal_code_value := case when payload ? 'postal_code'
    then nullif(btrim(payload ->> 'postal_code'), '') else public.decrypt_field(stored.postal_code) end;
  reference_entity_value := case when payload ? 'reference_entity'
    then nullif(btrim(payload ->> 'reference_entity'), '') else stored.reference_entity end;
  reference_contact_name_value := case when payload ? 'reference_contact_name'
    then nullif(btrim(payload ->> 'reference_contact_name'), '') else stored.reference_contact_name end;
  -- Dependants can be optional (RAPP-611): an answer she did not give stays
  -- unknown (null), never "no". A stored value counts only when somebody
  -- answered it (RAPP-300); the column default is not an answer.
  has_dependents_value := case
    when payload ? 'has_dependents' then nullif(payload ->> 'has_dependents', '')::boolean
    -- A player who joined already gave it (it was required); for anyone else
    -- a stored value counts only when somebody answered it (RAPP-300).
    when stored.role = 'player' or exists (select 1 from public.profile_answers a
                  where a.profile_id = caller and a.question = 'dependents') then stored.has_dependents
    else null end;
  num_dependents_value := case when has_dependents_value
    then coalesce(nullif(payload ->> 'num_dependents', '')::integer, stored.num_dependents, 0)
    else 0 end;
  clothing_size_value := case when payload ? 'clothing_size'
    then nullif(payload ->> 'clothing_size', '') else stored.clothing_size end;
  shoe_size_value := case when payload ? 'shoe_size'
    then nullif(payload ->> 'shoe_size', '') else stored.shoe_size end;
  avatar_url_value := case when payload ? 'avatar_url'
    then nullif(payload ->> 'avatar_url', '') else stored.avatar_url end;
  media_consent_at_value := case
    when nullif(payload ->> 'media_consent', '') is null then stored.media_consent_at
    when (payload ->> 'media_consent')::boolean then coalesce(stored.media_consent_at, now())
    else null
  end;

  if not private.season_answers_valid(payload) then
    raise invalid_parameter_value using message = 'a season answer is outside its choices';
  end if;

  if first_name_value is null or last_name_value is null then
    raise exception 'complete_onboarding requires first_name and last_name'
      using errcode = 'not_null_violation';
  end if;


  -- The document is optional (RAPP-302): she may skip it. Once she chooses a
  -- type, a number is required unless the answer is "none", which is a
  -- first-class answer: many participants genuinely have no document, and
  -- onboarding must never dead-end on it.
  if document_type_value in ('nie', 'passport')
    and document_number_value is null
  then
    raise exception 'complete_onboarding requires document_number for a chosen document_type'
      using errcode = 'not_null_violation';
  end if;

  if stored.id is null then
    insert into public.profiles (
      id, org_id, role,
      first_name, last_name, date_of_birth, place_of_birth, nationality, preferred_language,
      document_type, document_number, document_name,
      phone, address, city, postal_code,
      reference_entity, reference_contact_name,
      has_dependents, num_dependents, clothing_size, shoe_size, avatar_url,
      terms_accepted_at, media_consent_at
    )
    values (
      caller, (select public.default_organization_id()), 'player',
      first_name_value, last_name_value, date_of_birth_value, place_of_birth_value,
      nationality_value, preferred_language_value,
      document_type_value, public.encrypt_field(document_number_value), document_name_value,
      public.encrypt_field(phone_value), public.encrypt_field(address_value), city_value,
      public.encrypt_field(postal_code_value),
      reference_entity_value, reference_contact_name_value,
      has_dependents_value, num_dependents_value, clothing_size_value, shoe_size_value,
      avatar_url_value, now(), media_consent_at_value
    )
    returning * into saved;
  else
    -- Role and org are not the wizard's to change, except that joining makes
    -- an invited woman a player (RAPP-300).
    update public.profiles set
      role = 'player',
      first_name = first_name_value,
      last_name = last_name_value,
      date_of_birth = date_of_birth_value,
      place_of_birth = place_of_birth_value,
      nationality = nationality_value,
      preferred_language = preferred_language_value,
      document_type = document_type_value,
      document_name = document_name_value,
      document_number = public.encrypt_field(document_number_value),
      phone = public.encrypt_field(phone_value),
      address = public.encrypt_field(address_value),
      city = city_value,
      postal_code = public.encrypt_field(postal_code_value),
      reference_entity = reference_entity_value,
      reference_contact_name = reference_contact_name_value,
      has_dependents = has_dependents_value,
      num_dependents = num_dependents_value,
      clothing_size = clothing_size_value,
      shoe_size = shoe_size_value,
      avatar_url = avatar_url_value,
      terms_accepted_at = now(),
      media_consent_at = media_consent_at_value,
      updated_at = now()
    where id = caller
    returning * into saved;
  end if;

  -- The registration questions (RAPP-306): optional wizard questions. A key
  -- left out keeps its value; the trigger keeps the season's copy.
  if payload ?| array['applicant_status_details', 'applicant_status', 'supporting_entities', 'childcare_need', 'specific_needs'] then
    update public.profiles p set
      applicant_status = case when payload ? 'applicant_status'
        then public.encrypt_field(nullif(btrim(payload ->> 'applicant_status'), '')) else p.applicant_status end,
    applicant_status_details = case when payload ? 'applicant_status_details'
      then public.encrypt_field(nullif(btrim(payload ->> 'applicant_status_details'), '')) else p.applicant_status_details end,
      supporting_entities = case when payload ? 'supporting_entities'
        then private.text_array_answer(payload -> 'supporting_entities') else p.supporting_entities end,
      childcare_need = case when payload ? 'childcare_need'
        then nullif(payload ->> 'childcare_need', '') else p.childcare_need end,
      specific_needs = case when payload ? 'specific_needs'
        then public.encrypt_field(nullif(btrim(payload ->> 'specific_needs'), '')) else p.specific_needs end
    where p.id = caller
    returning * into saved;
  end if;

  -- Every question staff made required (RAPP-611), read from the one list,
  -- has an answer once the wizard's answers are merged with what is stored.
  -- Her name and her app language are always required, and checked above.
  required_questions := private.required_intake_questions(saved.org_id);
  select array_agg(r.question order by r.position) into missing
    from unnest(required_questions) with ordinality as r(question, position)
   where not case r.question
     when 'first_name' then first_name_value is not null
     when 'last_name' then last_name_value is not null
     when 'preferred_language' then true
     when 'date_of_birth' then date_of_birth_value is not null
     when 'place_of_birth' then place_of_birth_value is not null
     when 'nationality' then nationality_value is not null
     when 'document' then document_type_value is not null
     when 'phone' then phone_value is not null
     when 'address' then address_value is not null
     when 'city' then city_value is not null
     when 'postal_code' then postal_code_value is not null
     -- "None" is an answer: the key sent, even empty, or an entity stored.
     when 'reference_entity' then payload ? 'reference_entity' or reference_entity_value is not null
     -- Her contact there is asked only once she names an entity.
     when 'reference_contact_name' then reference_entity_value is null or reference_contact_name_value is not null
     when 'dependents' then has_dependents_value is not null
     when 'clothing_size' then clothing_size_value is not null
     when 'shoe_size' then shoe_size_value is not null
     when 'applicant_status' then saved.applicant_status is not null
     when 'supporting_entities' then coalesce(cardinality(saved.supporting_entities), 0) > 0
     when 'childcare_need' then saved.childcare_need is not null
     when 'specific_needs' then saved.specific_needs is not null
     else true end;
  if missing is not null then
    raise exception 'complete_onboarding requires %', array_to_string(missing, ', ')
      using errcode = 'not_null_violation';
  end if;

  -- Her own answers: a question she sent with a value becomes hers when it was
  -- unanswered or she changed it; one she confirmed unchanged keeps the staff
  -- or entity record; one she cleared is no longer answered.
  with question (name, touched, has_value, changed) as (
    values
      ('first_name', payload ? 'first_name', first_name_value is not null,
        first_name_value is distinct from stored.first_name),
      ('last_name', payload ? 'last_name', last_name_value is not null,
        last_name_value is distinct from stored.last_name),
      ('date_of_birth', payload ? 'date_of_birth', date_of_birth_value is not null,
        date_of_birth_value is distinct from stored.date_of_birth),
      ('place_of_birth', payload ? 'place_of_birth', place_of_birth_value is not null,
        place_of_birth_value is distinct from stored.place_of_birth),
      ('nationality', payload ? 'nationality', nationality_value is not null,
        nationality_value is distinct from stored.nationality),
      ('preferred_language', nullif(payload ->> 'preferred_language', '') is not null, true,
        preferred_language_value is distinct from stored.preferred_language),
      ('document', payload ?| array['document_type', 'document_number', 'document_name'], true,
        document_name_value is distinct from stored.document_name
        or document_type_value is distinct from stored.document_type
        or document_number_value is distinct from public.decrypt_field(stored.document_number)),
      ('phone', payload ? 'phone', phone_value is not null,
        phone_value is distinct from public.decrypt_field(stored.phone)),
      ('address', payload ? 'address', address_value is not null,
        address_value is distinct from public.decrypt_field(stored.address)),
      ('city', payload ? 'city', city_value is not null, city_value is distinct from stored.city),
      ('postal_code', payload ? 'postal_code', postal_code_value is not null,
        postal_code_value is distinct from public.decrypt_field(stored.postal_code)),
      ('reference_entity', payload ? 'reference_entity', reference_entity_value is not null,
        reference_entity_value is distinct from stored.reference_entity),
      ('reference_contact_name', payload ? 'reference_contact_name', reference_contact_name_value is not null,
        reference_contact_name_value is distinct from stored.reference_contact_name),
      ('dependents', payload ? 'has_dependents', has_dependents_value is not null,
        has_dependents_value is distinct from stored.has_dependents
        or num_dependents_value is distinct from stored.num_dependents),
      ('clothing_size', payload ? 'clothing_size', clothing_size_value is not null,
        clothing_size_value is distinct from stored.clothing_size),
      ('shoe_size', payload ? 'shoe_size', shoe_size_value is not null,
        shoe_size_value is distinct from stored.shoe_size),
      ('avatar', payload ? 'avatar_url', avatar_url_value is not null,
        avatar_url_value is distinct from stored.avatar_url),
      ('applicant_status', payload ?| array['applicant_status', 'applicant_status_details'], saved.applicant_status is not null,
        public.decrypt_field(saved.applicant_status) is distinct from public.decrypt_field(stored.applicant_status)
        or public.decrypt_field(saved.applicant_status_details) is distinct from public.decrypt_field(stored.applicant_status_details)),
      ('supporting_entities', payload ? 'supporting_entities', saved.supporting_entities is not null,
        saved.supporting_entities is distinct from stored.supporting_entities),
      ('childcare_need', payload ? 'childcare_need', saved.childcare_need is not null,
        saved.childcare_need is distinct from stored.childcare_need),
      ('specific_needs', payload ? 'specific_needs', saved.specific_needs is not null,
        public.decrypt_field(saved.specific_needs) is distinct from public.decrypt_field(stored.specific_needs))
  ),
  cleared as (
    delete from public.profile_answers answer
     using question
     where answer.profile_id = caller
       and answer.question = question.name
       and question.touched
       and not question.has_value
  )
  insert into public.profile_answers (profile_id, org_id, question, source)
  select caller, saved.org_id, question.name, 'player'
    from question
   where question.touched
     and question.has_value
     and (
       question.changed
       or not exists (
         select 1 from public.profile_answers existing
          where existing.profile_id = caller and existing.question = question.name
       )
     )
  on conflict (profile_id, question) do update
    set source = 'player', answered_at = now();

  insert into public.terms_acceptances (profile_id, terms_version, locale_shown)
  values (caller, terms_version_value, locale_shown_value);

  return saved;
end;
$function$;

revoke all on function public.complete_onboarding(jsonb) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION private.complete_onboarding_signed(payload jsonb, p_signing jsonb)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
  saved public.profiles;
  previous_ids uuid[];
  acceptance uuid;
  drawing jsonb := nullif(p_signing->'signature','null'::jsonb);
  cannot_draw boolean;
begin
  if caller is null then raise insufficient_privilege using message='authenticated signing required'; end if;
  if jsonb_typeof(p_signing) is distinct from 'object'
    or (p_signing->'terms_accepted') is distinct from 'true'::jsonb
    or jsonb_typeof(p_signing->'media_consent') is distinct from 'boolean'
    or jsonb_typeof(p_signing->'unable_to_draw') is distinct from 'boolean'
    or (payload->'media_consent') is distinct from (p_signing->'media_consent')
    or length(coalesce(p_signing->>'device',''))>200
  then raise check_violation using message='explicit terms acceptance and matching media choice required'; end if;
  cannot_draw := (p_signing->>'unable_to_draw')::boolean;
  if (cannot_draw and drawing is not null) or
    (not cannot_draw and not private.app_signature_valid(drawing))
  then raise check_violation using message='draw a valid signature or use the cannot-draw alternative'; end if;

  -- Serialize calls for an existing account and identify this acceptance exactly,
  -- including two acceptances made in one transaction with the same timestamp.
  perform 1 from public.profiles where id=caller for update;
  select coalesce(array_agg(id),'{}'::uuid[]) into previous_ids
    from public.terms_acceptances where profile_id=caller;
  -- Her answers to the staff questions travel with the wizard (RAPP-611), so
  -- they are saved in the same transaction as her profile and the required
  -- ones are checked before anything is kept.
  saved := public.complete_onboarding(payload - 'custom_answers');
  if payload ? 'custom_answers' then
    perform private.save_player_custom_answers(caller, saved.org_id,
      coalesce(nullif(payload -> 'custom_answers', 'null'::jsonb), '{}'::jsonb));
  end if;
  if cardinality(private.missing_required_custom_answers(caller, 'wizard')) > 0 then
    raise not_null_violation using message = 'complete_onboarding requires an answer to a required staff question';
  end if;
  select id into strict acceptance from public.terms_acceptances
    where profile_id=caller and not (id=any(previous_ids));
  insert into public.app_terms_signatures
    (acceptance_id,profile_id,org_id,signature,unable_to_draw,media_consent,device)
  values (acceptance,caller,saved.org_id,drawing,cannot_draw,(p_signing->>'media_consent')::boolean,nullif(p_signing->>'device',''));
  return saved;
end $function$;

revoke all on function private.complete_onboarding_signed(jsonb, jsonb) from public, anon;
grant execute on function private.complete_onboarding_signed(jsonb, jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.update_my_season_answers(p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
begin
  if not exists (select 1 from public.profiles where id = caller and role = 'player') then
    raise insufficient_privilege using message = 'only a player answers her season questions';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or p_payload - array['applicant_status_details', 'applicant_status', 'supporting_entities', 'childcare_need', 'specific_needs'] <> '{}'::jsonb
    or not private.season_answers_valid(p_payload)
  then
    raise invalid_parameter_value using message = 'a season answer is outside its choices';
  end if;

  update public.profiles p set
    applicant_status = case when p_payload ? 'applicant_status'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'applicant_status'), '')) else p.applicant_status end,
    applicant_status_details = case when p_payload ? 'applicant_status_details'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'applicant_status_details'), '')) else p.applicant_status_details end,
    supporting_entities = case when p_payload ? 'supporting_entities'
      then private.text_array_answer(p_payload -> 'supporting_entities') else p.supporting_entities end,
    childcare_need = case when p_payload ? 'childcare_need'
      then nullif(p_payload ->> 'childcare_need', '') else p.childcare_need end,
    specific_needs = case when p_payload ? 'specific_needs'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'specific_needs'), '')) else p.specific_needs end,
    updated_at = now()
  where p.id = caller;

  insert into public.profile_answers (profile_id, org_id, question, source)
  select distinct caller, p.org_id, case when key = 'applicant_status_details' then 'applicant_status' else key end, 'player'
    from public.profiles p, jsonb_object_keys(p_payload) key
   where p.id = caller
  on conflict (profile_id, question) do update set source = 'player', answered_at = now();

  -- Re-registration asks the season questions staff made required (RAPP-611),
  -- built-in and staff ones: they are re-checked here, the call that ends it.
  -- Her staff answers are saved just before this one.
  if exists (
    select 1 from public.profiles p,
           unnest(private.required_intake_questions(p.org_id)) required(question)
     where p.id = caller
       and case required.question
         when 'applicant_status' then p.applicant_status is null
         when 'supporting_entities' then coalesce(cardinality(p.supporting_entities), 0) = 0
         when 'childcare_need' then p.childcare_need is null
         when 'specific_needs' then p.specific_needs is null
         else false end)
     or cardinality(private.missing_required_custom_answers(caller, 'season')) > 0 then
    raise not_null_violation using message = 'a required season question has no answer';
  end if;
end;
$function$;

revoke all on function public.update_my_season_answers(jsonb) from public, anon;
grant execute on function public.update_my_season_answers(jsonb) to authenticated;

-- 9. Her edits and staff's: never stricter than registration ------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_own_profile(payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
  document_type_value text := nullif(payload ->> 'document_type', '');
  document_number_value text := nullif(payload ->> 'document_number', '');
  place_of_birth_value text := nullif(trim(payload ->> 'place_of_birth'), '');
begin
  if caller is null then
    raise exception 'update_own_profile requires an authenticated caller'
      using errcode = 'insufficient_privilege';
  end if;

  -- Editing is never stricter than intake: her place of birth is required
  -- only when staff keep it required, and her registration checks that
  -- (RAPP-611). An edit checks every value it is given.

  -- Same rule the wizard follows. Editing must not be stricter than intake, or
  -- a participant who has no papers cannot save. The document is optional
  -- (RAPP-302), and a number cannot stand without a type.
  if document_type_value is null or document_type_value = 'none' then
    document_number_value := null;
  elsif document_type_value in ('nie', 'passport') and document_number_value is null then
    raise exception 'update_own_profile requires document_number for a chosen document_type'
      using errcode = 'not_null_violation';
  end if;

  -- The column list IS the authorization boundary. `role`, `org_id`,
  -- `terms_accepted_at`, `is_active` and `is_forum_banned` are absent on
  -- purpose: they are not the participant's to change, and a payload that
  -- carries them (a client echoing the whole profile back, or an attacker
  -- trying it on) simply has those keys ignored.
  if not private.season_answers_valid(payload) then
    raise invalid_parameter_value using message = 'a season answer is outside its choices';
  end if;

  perform set_config('ramassa.trusted_profile_write', 'on', true);
  update public.profiles set
    first_name = payload ->> 'first_name',
    last_name = payload ->> 'last_name',
    date_of_birth = (payload ->> 'date_of_birth')::date,
    place_of_birth = place_of_birth_value,
    nationality = payload ->> 'nationality',
    preferred_language = coalesce(nullif(payload ->> 'preferred_language', ''), preferred_language),
    document_type = document_type_value,
    document_name = case when payload ? 'document_name' then nullif(btrim(payload ->> 'document_name'), '') else document_name end,
    document_number = public.encrypt_field(document_number_value),
    phone = public.encrypt_field(nullif(payload ->> 'phone', '')),
    address = public.encrypt_field(nullif(payload ->> 'address', '')),
    city = nullif(payload ->> 'city', ''),
    postal_code = public.encrypt_field(nullif(payload ->> 'postal_code', '')),
    reference_entity = nullif(payload ->> 'reference_entity', ''),
    reference_contact_name = nullif(payload ->> 'reference_contact_name', ''),
    -- No answer stays unknown, never "no" (RAPP-611).
    has_dependents = nullif(payload ->> 'has_dependents', '')::boolean,
    num_dependents = coalesce((payload ->> 'num_dependents')::integer, 0),
    clothing_size = nullif(payload ->> 'clothing_size', ''),
    shoe_size = nullif(payload ->> 'shoe_size', ''),
    avatar_url = coalesce(nullif(payload ->> 'avatar_url', ''), avatar_url),
    -- Revocable in both directions, unlike the terms: a woman who agreed to
    -- appear in photos must be able to change her mind from this screen.
    media_consent_at = case
      when (payload ->> 'media_consent')::boolean then coalesce(media_consent_at, now())
      else null
    end,
    -- The season registration answers (RAPP-303): a key left out keeps its
    -- value, so an older build never wipes them.
    applicant_status = case when payload ? 'applicant_status'
      then public.encrypt_field(nullif(btrim(payload ->> 'applicant_status'), '')) else applicant_status end,
    applicant_status_details = case when payload ? 'applicant_status_details'
      then public.encrypt_field(nullif(btrim(payload ->> 'applicant_status_details'), '')) else applicant_status_details end,
    supporting_entities = case when payload ? 'supporting_entities'
      then private.text_array_answer(payload -> 'supporting_entities') else supporting_entities end,
    season_number = case when payload ? 'season_number'
      then nullif(payload ->> 'season_number', '')::smallint else season_number end,
    childcare_need = case when payload ? 'childcare_need'
      then nullif(payload ->> 'childcare_need', '') else childcare_need end,
    specific_needs = case when payload ? 'specific_needs'
      then public.encrypt_field(nullif(btrim(payload ->> 'specific_needs'), '')) else specific_needs end,
    updated_at = now()
  where id = caller;
  perform set_config('ramassa.trusted_profile_write', '', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_participant_profile(participant_id uuid, payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  document_type_value text := nullif(payload ->> 'document_type', '');
  document_number_value text := nullif(payload ->> 'document_number', '');
  place_of_birth_value text := nullif(btrim(payload ->> 'place_of_birth'), '');
  -- The columns whose VALUES must never reach the audit log (ADR-004).
  encrypted_fields text[] := array[
    'document_number', 'phone', 'address', 'postal_code', 'applicant_status', 'applicant_status_details', 'specific_needs'];
  before_document jsonb;
  changes_document jsonb;
begin
  if not (select private.participant_permission(participant_id, 'participants.view_personal')) then
    raise exception 'update_participant_profile is the staff path; a participant edits herself through update_own_profile()'
      using errcode = 'insufficient_privilege';
  end if;

  -- A woman who has not joined yet is completed in parts: only the fields
  -- sent change, each one becomes an answer, and her consent stays hers
  -- (RAPP-300). Sensitive fields need their own permission, as below.
  if exists (
    select 1 from public.profiles p
     where p.id = participant_id
       and p.org_id = (select public.current_org_id())
       and p.role = 'invited'
  ) then
    if not (select private.participant_permission(participant_id, 'participants.view_sensitive')) then
      payload := payload - 'document_number' - 'phone' - 'address' - 'postal_code'
        - 'applicant_status' - 'applicant_status_details' - 'specific_needs';
    end if;
    perform private.apply_profile_prefill(participant_id, payload, 'staff');
    insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
    values (
      (select public.current_org_id()), actor, 'profile.update', 'profile', participant_id,
      jsonb_build_object('fields', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb)
                                      from jsonb_object_keys(payload) k))
    );
    return;
  end if;

  -- Staff correct her record as she does: a place of birth left empty is
  -- unknown (RAPP-611); the organization's required list binds registration.

  -- A caller without participants.view_sensitive never sends the document
  -- number; for her the check runs below, on the stored value.
  -- The document is optional (RAPP-302): only a chosen type needs a number.
  if document_type_value in ('nie', 'passport')
    and document_number_value is null
    and (select private.participant_permission(participant_id, 'participants.view_sensitive'))
  then
    raise exception 'update_participant_profile requires document_number for a chosen document_type'
      using errcode = 'not_null_violation';
  end if;

  -- The record as it stands, in the payload's own shape, so the diff below is a
  -- key-by-key comparison rather than nineteen hand-written IF statements that
  -- a twentieth column would silently escape. The encrypted values are decrypted
  -- HERE and never leave this block: they are what makes "did the phone actually
  -- change" answerable at all.
  select jsonb_build_object(
    'first_name', p.first_name,
    'last_name', p.last_name,
    'date_of_birth', p.date_of_birth,
    'place_of_birth', p.place_of_birth,
    'nationality', p.nationality,
    'preferred_language', p.preferred_language,
    'document_type', p.document_type,
    'document_name', p.document_name,
    'document_number', public.decrypt_field(p.document_number),
    'phone', public.decrypt_field(p.phone),
    'address', public.decrypt_field(p.address),
    'city', p.city,
    'postal_code', public.decrypt_field(p.postal_code),
    'reference_entity', p.reference_entity,
    'reference_contact_name', p.reference_contact_name,
    'has_dependents', p.has_dependents,
    'num_dependents', p.num_dependents,
    'clothing_size', p.clothing_size,
    'shoe_size', p.shoe_size,
    'media_consent', p.media_consent_at is not null,
    'applicant_status', public.decrypt_field(p.applicant_status),
    'applicant_status_details', public.decrypt_field(p.applicant_status_details),
    'supporting_entities', p.supporting_entities,
    'season_number', p.season_number,
    'childcare_need', p.childcare_need,
    'specific_needs', public.decrypt_field(p.specific_needs)
  )
  into before_document
  from public.profiles p
  where p.id = participant_id
    and p.org_id = (select public.current_org_id());

  -- No readable row means no row this caller may edit: RLS has already decided,
  -- and there is nothing to audit.
  if before_document is null then
    return;
  end if;

  -- The four encrypted fields change only for a caller who may see them. For
  -- anyone else the stored values are kept, whatever the payload says, so a
  -- screen without them can never wipe them (RAPP-230).
  if not private.season_answers_valid(payload) then
    raise invalid_parameter_value using message = 'a season answer is outside its choices';
  end if;

  if not (select private.participant_permission(participant_id, 'participants.view_sensitive')) then
    payload := payload - 'applicant_status' - 'applicant_status_details' - 'specific_needs';
    payload := payload || jsonb_build_object(
      'document_number', before_document ->> 'document_number',
      'phone', before_document ->> 'phone',
      'address', before_document ->> 'address',
      'postal_code', before_document ->> 'postal_code'
    );
    document_number_value := nullif(payload ->> 'document_number', '');
    if document_type_value in ('nie', 'passport')
      and document_number_value is null
    then
      raise exception 'update_participant_profile requires document_number for a chosen document_type'
        using errcode = 'not_null_violation';
    end if;
  end if;

  -- No type, or "none", means no number: a stored number goes with the type.
  if document_type_value is null or document_type_value = 'none' then
    document_number_value := null;
    payload := payload || jsonb_build_object('document_number', null);
  end if;

  perform set_config('ramassa.trusted_profile_write', 'on', true);
  update public.profiles set
    first_name = payload ->> 'first_name',
    last_name = payload ->> 'last_name',
    date_of_birth = (payload ->> 'date_of_birth')::date,
    place_of_birth = place_of_birth_value,
    nationality = payload ->> 'nationality',
    preferred_language = coalesce(nullif(payload ->> 'preferred_language', ''), preferred_language),
    document_type = document_type_value,
    document_name = case when payload ? 'document_name' then nullif(btrim(payload ->> 'document_name'), '') else document_name end,
    document_number = public.encrypt_field(document_number_value),
    phone = public.encrypt_field(nullif(payload ->> 'phone', '')),
    address = public.encrypt_field(nullif(payload ->> 'address', '')),
    city = nullif(payload ->> 'city', ''),
    postal_code = public.encrypt_field(nullif(payload ->> 'postal_code', '')),
    reference_entity = nullif(payload ->> 'reference_entity', ''),
    reference_contact_name = nullif(payload ->> 'reference_contact_name', ''),
    has_dependents = nullif(payload ->> 'has_dependents', '')::boolean,
    num_dependents = coalesce((payload ->> 'num_dependents')::integer, 0),
    clothing_size = nullif(payload ->> 'clothing_size', ''),
    shoe_size = nullif(payload ->> 'shoe_size', ''),
    media_consent_at = case
      when (payload ->> 'media_consent')::boolean then coalesce(media_consent_at, now())
      else null
    end,
    applicant_status = case when payload ? 'applicant_status'
      then public.encrypt_field(nullif(btrim(payload ->> 'applicant_status'), '')) else applicant_status end,
    applicant_status_details = case when payload ? 'applicant_status_details'
      then public.encrypt_field(nullif(btrim(payload ->> 'applicant_status_details'), '')) else applicant_status_details end,
    supporting_entities = case when payload ? 'supporting_entities'
      then private.text_array_answer(payload -> 'supporting_entities') else supporting_entities end,
    season_number = case when payload ? 'season_number'
      then nullif(payload ->> 'season_number', '')::smallint else season_number end,
    childcare_need = case when payload ? 'childcare_need'
      then nullif(payload ->> 'childcare_need', '') else childcare_need end,
    specific_needs = case when payload ? 'specific_needs'
      then public.encrypt_field(nullif(btrim(payload ->> 'specific_needs'), '')) else specific_needs end,
    updated_at = now()
  where id = participant_id
    and org_id = (select public.current_org_id());
  perform set_config('ramassa.trusted_profile_write', '', true);

  if not found then
    return;
  end if;

  select coalesce(jsonb_object_agg(submitted.key, entry), '{}'::jsonb)
  into changes_document
  from jsonb_each_text(payload) submitted
  cross join lateral (
    select case
      when submitted.key = any(encrypted_fields) then jsonb_build_object('changed', true)
      else jsonb_build_object(
        'old', to_jsonb(before_document ->> submitted.key),
        'new', to_jsonb(submitted.value)
      )
    end as entry
  ) built
  where before_document ? submitted.key
    and (before_document ->> submitted.key) is distinct from submitted.value;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    (select public.current_org_id()),
    actor,
    'profile.update',
    'profile',
    participant_id,
    changes_document
  );
end;
$function$;

-- 10. The RGPD register ------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.personal_data_disposition()
 RETURNS TABLE(table_name text, participant_column text, disposition text, reason text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select * from (values
    ('app_terms_signatures', 'profile_id', 'purge', 'The app terms signature and photo/video choice.'),
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
    ('app_terms_versions', null, 'not_personal', 'The organization''s app terms texts, draft and published.'),
    ('authorization_signatures', 'profile_id', 'purge', 'Her signed or paper authorizations, with her drawn signature.'),
    ('authorization_consent_events', 'profile_id', 'purge', 'Each consent she gave or withdrew.'),
    ('season_answers', 'profile_id', 'purge', 'Her registration answers, one row per season.'),
    ('walk_in_signings', null, 'retain_limited', 'A walk-in''s tablet signing until staff confirm it; purged after 60 days.'),
    ('intake_screens', null, 'not_personal', 'Registration screens staff built.'),
    ('custom_questions', null, 'not_personal', 'Questions staff added to registration.'),
    ('custom_question_options', null, 'not_personal', 'Options of those questions.'),
    ('builtin_question_overrides', null, 'not_personal', 'Staff wording for the built-in questions.'),
    ('intake_builtin_screens', null, 'not_personal', 'Staff wording of the built-in onboarding screens and which are hidden.'),
    ('intake_flow_orders', null, 'not_personal', 'The order of the onboarding screens staff arranged.'),
    ('intake_required_questions', null, 'not_personal', 'Which built-in questions staff made required or optional.'),
    ('intake_state_presets', null, 'not_personal', 'Organization presets for which questions are asked.'),
    ('custom_answers', 'profile_id', 'purge', 'Her answers to the questions staff added.'),
    ('referral_custom_answers', null, 'retain_limited', 'Extra answers sent with a referral; moved to her profile when she is invited, or purged with the referral.')
  ) as disposition(table_name, participant_column, disposition, reason);
$function$;

