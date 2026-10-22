-- Built-in onboarding screens editable, and one flow order (RAPP-612).
--
-- WHY
--
-- The title, intro and buttons of every built-in wizard screen were bundled
-- strings, and the screen order was fixed in code (`fullOrder`). Ramassà staff
-- now word every built-in screen in the admin, in five languages, arrange all
-- screens (built-in and their own) in one list, and hide a built-in screen
-- none of whose questions is required.
--
-- WHAT THIS MIGRATION DOES
--
--   1. `private.wizard_screen_questions()`: each built-in question screen with
--      the questions it asks, in the app's own order (a parity test reads the
--      block against `WIZARD_SCREEN_QUESTIONS`). The screens staff may move are
--      these; the summary, the terms introduction and the terms always end the
--      wizard, and the season authorization follows it (legal), so none of
--      them is ever moved or hidden.
--   2. `private.builtin_screen_text_fields()`: the fields staff may word per
--      screen (a parity test reads it against `screenTextFields`). The terms
--      screens take their title and intro from the app terms version
--      (RAPP-613), so only their help line and buttons are worded here.
--      Validation messages stay in the app.
--   3. `public.intake_builtin_screens`: per organization and screen, the
--      wording (any language, empty falls back to the bundled text) and the
--      hide switch. A hide takes effect only while none of the screen's
--      questions is required (`private.builtin_screen_hideable`, which reads
--      the one required list, `private.required_intake_questions()`, through
--      `private.unhideable_intake_questions()`; RAPP-611 makes it data).
--   4. `public.intake_flow_orders`: per organization, the movable steps in
--      order, built-in screen names and `custom:<screen id>`. A step left out
--      keeps its place after the step it followed. Saving the order also moves
--      each staff screen's anchor (`after_screen`) to the built-in step before
--      it, so the question builder groups it where it now shows; moving a staff
--      screen in the question builder takes it out of the stored order.
--   5. `save_builtin_screen` and `save_intake_flow_order` for onboarding
--      designers (`private.can_design_onboarding`), every write audited with
--      the field names and never the text.
--   6. `intake_catalog()` carries both, so her phone still reads everything in
--      one call per onboarding session.
--
-- Docs: https://supabase.com/docs/guides/database/postgres/row-level-security
-- (RLS on every table, security definer functions with an empty search path)
-- and https://www.postgresql.org/docs/current/functions-array.html (`&&`,
-- `array_position`, `unnest ... with ordinality`).

-- 1. The screens -----------------------------------------------------------------------------------------

create or replace function private.wizard_screen_questions()
returns table (screen text, questions text[])
language sql
immutable
set search_path = ''
as $$
  select s.screen, s.questions
    from (values
      -- wizard-screen-questions:start
      ('identity', array['first_name', 'last_name']),
      ('background', array['date_of_birth', 'place_of_birth', 'nationality']),
      ('documentation', array['document']),
      ('logistics', array['phone', 'address', 'city', 'postal_code', 'reference_entity', 'reference_contact_name', 'dependents']),
      ('equipment', array['clothing_size', 'shoe_size']),
      ('season', array['applicant_status']),
      ('supporting-entities', array['supporting_entities']),
      ('participation-support', array['childcare_need']),
      ('specific-needs', array['specific_needs'])
      -- wizard-screen-questions:end
    ) as s(screen, questions);
$$;

-- The built-in screen each movable step belongs to in the question builder's
-- anchors (`private.intake_builtin_screens()`).
create or replace function private.flow_step_anchor(p_step text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_step = any (array['identity', 'background', 'documentation', 'logistics', 'season']) then p_step
    when p_step = 'equipment' then 'logistics'
    when p_step = any (array['supporting-entities', 'participation-support', 'specific-needs']) then 'season'
  end;
$$;

create or replace function private.builtin_screen_text_fields(p_screen text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select f.fields
    from (values
      -- builtin-screen-text-fields:start
      ('identity', array['title', 'intro', 'help', 'continue_label']),
      ('background', array['title', 'intro', 'help', 'continue_label']),
      ('documentation', array['title', 'intro', 'help', 'continue_label']),
      ('documentation-details', array['title', 'intro', 'help', 'continue_label']),
      ('logistics', array['title', 'intro', 'help', 'continue_label']),
      ('equipment', array['title', 'intro', 'help', 'continue_label']),
      ('season', array['title', 'intro', 'help', 'continue_label']),
      ('applicant-status-details', array['title', 'intro', 'help', 'continue_label']),
      ('supporting-entities', array['title', 'intro', 'help', 'continue_label']),
      ('participation-support', array['title', 'intro', 'help', 'continue_label']),
      ('specific-needs', array['title', 'intro', 'help', 'continue_label']),
      ('specific-needs-details', array['title', 'intro', 'help', 'continue_label']),
      ('summary', array['title', 'intro', 'help', 'continue_label']),
      ('terms-intro', array['help', 'continue_label']),
      ('terms', array['help', 'continue_label', 'decline_label'])
      -- builtin-screen-text-fields:end
    ) as f(screen, fields)
   where f.screen = p_screen;
$$;

-- Staff wording: only the screen's own fields, each localized text of at most
-- 2000 characters per language.
create or replace function private.builtin_screen_texts_valid(p_screen text, p_texts jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_texts) = 'object'
    and private.builtin_screen_text_fields(p_screen) is not null
    and not exists (
      select 1 from jsonb_each(p_texts) entry
       where not (entry.key = any (private.builtin_screen_text_fields(p_screen)))
          or case when private.localized_text_valid(entry.value)
                  then exists (select 1 from jsonb_each_text(entry.value) language
                                where length(language.value) > 2000)
                  else true end),
    false);
$$;

-- A built-in screen hides only when none of its questions is required. It
-- reads the one required list, so a question made required later shows its
-- screen again.
create or replace function private.builtin_screen_hideable(p_screen text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select not (s.questions && private.unhideable_intake_questions())
      from private.wizard_screen_questions() s
     where s.screen = p_screen), false);
$$;

revoke all on function private.wizard_screen_questions() from public, anon, authenticated;
revoke all on function private.flow_step_anchor(text) from public, anon, authenticated;
revoke all on function private.builtin_screen_text_fields(text) from public, anon, authenticated;
revoke all on function private.builtin_screen_texts_valid(text, jsonb) from public, anon, authenticated;
revoke all on function private.builtin_screen_hideable(text) from public, anon, authenticated;

-- 2. Tables ----------------------------------------------------------------------------------------------

create table public.intake_builtin_screens (
  org_id uuid not null references public.organizations (id) on delete cascade,
  screen text not null check (private.builtin_screen_text_fields(screen) is not null),
  -- {field: localized text}; a language left out shows the bundled text.
  texts jsonb not null default '{}'::jsonb check (private.builtin_screen_texts_valid(screen, texts)),
  is_hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  primary key (org_id, screen),
  -- The summary, the terms and the detail screens always show (legal, and a
  -- detail screen belongs to its question screen).
  constraint intake_builtin_screens_only_question_screens_hide
    check (not is_hidden or screen = any (array['documentation', 'season', 'supporting-entities',
      'participation-support', 'specific-needs', 'identity', 'background', 'logistics', 'equipment']))
);
comment on table public.intake_builtin_screens is
  'Staff wording of the built-in onboarding screens and their hide switch (RAPP-612). Validation messages stay in the app.';

create table public.intake_flow_orders (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  -- Built-in screen names and custom:<intake_screens.id>, in order.
  step_order text[] not null check (cardinality(step_order) between 1 and 200),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
comment on table public.intake_flow_orders is
  'The onboarding screens in the order staff arranged them (RAPP-612). The summary and the terms always end it.';

-- Reads go through intake_catalog(); the select policies keep the team's own
-- organization in reach for direct reads, as for the other builder tables.
alter table public.intake_builtin_screens enable row level security;
alter table public.intake_flow_orders enable row level security;
create policy intake_builtin_screens_select_org on public.intake_builtin_screens
  for select to authenticated using (org_id = (select public.current_org_id()));
create policy intake_flow_orders_select_org on public.intake_flow_orders
  for select to authenticated using (org_id = (select public.current_org_id()));
revoke all on table public.intake_builtin_screens, public.intake_flow_orders from anon, authenticated;
grant select on table public.intake_builtin_screens, public.intake_flow_orders to authenticated;

-- 3. Staff -----------------------------------------------------------------------------------------------

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
  -- The field names only: the text is in the row.
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.builtin_screen_save', 'organization', actor_org,
          jsonb_build_object('screen', p_screen, 'hidden', hidden,
                             'fields', (select coalesce(jsonb_agg(field order by field), '[]'::jsonb)
                                          from jsonb_object_keys(texts) field)));
end;
$$;

-- Removes staff screens from the stored order: the question builder moved them.
create or replace function private.drop_from_intake_flow_order(p_org_id uuid, p_screen_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.intake_flow_orders f
     set step_order = array(
           select step from unnest(f.step_order) with ordinality as o(step, step_position)
            where not (step = any (select 'custom:' || id::text from unnest(p_screen_ids) id))
            order by step_position)
   where f.org_id = p_org_id;
  delete from public.intake_flow_orders where org_id = p_org_id and cardinality(step_order) = 0;
$$;
revoke all on function private.drop_from_intake_flow_order(uuid, uuid[]) from public, anon, authenticated;

create or replace function public.save_intake_flow_order(p_order text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  steps text[] := coalesce(p_order, array[]::text[]);
  anchor text := 'identity';
  entry record;
begin
  if cardinality(steps) > 200 then
    raise check_violation using message = 'too many steps';
  end if;
  if (select count(distinct step) from unnest(steps) step) <> cardinality(steps) then
    raise check_violation using message = 'each step appears once';
  end if;
  if exists (select 1 from unnest(steps) step
              where step = any (array['summary', 'terms-intro', 'terms', 'authorization'])) then
    raise check_violation using message = 'the summary, the terms and the authorization always end the onboarding';
  end if;
  if exists (
    select 1 from unnest(steps) step
     where not exists (select 1 from private.wizard_screen_questions() s where s.screen = step)
       and not (step ~ '^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                and exists (select 1 from public.intake_screens i
                             where i.id = substr(step, 8)::uuid and i.org_id = actor_org
                               and not i.is_archived))) then
    raise check_violation using message = 'not a step of this onboarding';
  end if;

  if cardinality(steps) = 0 then
    delete from public.intake_flow_orders where org_id = actor_org;
  else
    insert into public.intake_flow_orders (org_id, step_order, updated_at, updated_by)
    values (actor_org, steps, now(), (select auth.uid()))
    on conflict (org_id) do update
      set step_order = excluded.step_order, updated_at = now(), updated_by = excluded.updated_by;
    -- Each staff screen is anchored to the built-in step before it, so the
    -- question builder lists it where it shows.
    for entry in select step, step_position from unnest(steps) with ordinality as o(step, step_position) loop
      if entry.step like 'custom:%' then
        update public.intake_screens
           set after_screen = anchor, sort_order = entry.step_position::integer, updated_at = now()
         where id = substr(entry.step, 8)::uuid and org_id = actor_org;
      else
        anchor := private.flow_step_anchor(entry.step);
      end if;
    end loop;
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.flow_reorder', 'organization', actor_org,
          jsonb_build_object('order', to_jsonb(steps)));
end;
$$;

-- The question builder moves a staff screen: it leaves the stored order and
-- shows after its new step. Otherwise unchanged from RAPP-307.
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
  previous_anchor text;
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
    select after_screen into previous_anchor from public.intake_screens
     where id = p_id and org_id = actor_org;
    update public.intake_screens
       set title = p_title, intro = nullif(p_intro, 'null'::jsonb), after_screen = p_after_screen,
           updated_at = now()
     where id = p_id and org_id = actor_org
    returning id into saved_id;
    if saved_id is null then
      raise no_data_found using message = 'no such screen';
    end if;
    if previous_anchor is distinct from p_after_screen then
      perform private.drop_from_intake_flow_order(actor_org, array[saved_id]);
    end if;
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.screen_save', 'intake_screen', saved_id,
          jsonb_build_object('after_screen', p_after_screen, 'created', p_id is null));
  return saved_id;
end;
$$;

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
  perform private.drop_from_intake_flow_order(actor_org, p_ids);
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.screens_reorder', 'organization', actor_org,
          jsonb_build_object('after_screen', p_after_screen, 'order', to_jsonb(p_ids)));
end;
$$;

revoke all on function public.save_builtin_screen(text, jsonb, boolean) from public, anon;
revoke all on function public.save_intake_flow_order(text[]) from public, anon;
grant execute on function public.save_builtin_screen(text, jsonb, boolean) to authenticated;
grant execute on function public.save_intake_flow_order(text[]) to authenticated;

-- 4. Her app: the one catalog call -----------------------------------------------------------------------

create or replace function public.intake_catalog()
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
            'is_archived', q.is_archived,
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
        'question', o.question, 'label', o.label, 'help', o.help, 'is_hidden', o.is_hidden,
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
    -- The app terms she accepts (RAPP-613): the current published version.
    'terms', (
      select jsonb_build_object('id', v.id, 'version_number', v.version_number, 'content', v.content)
        from private.current_app_terms_version(actor_org) v
       where v.id is not null)
  );
end;
$function$;

-- 5. The RGPD register -----------------------------------------------------------------------------------

create or replace function public.personal_data_disposition()
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
    ('intake_state_presets', null, 'not_personal', 'Organization presets for which questions are asked.'),
    ('custom_answers', 'profile_id', 'purge', 'Her answers to the questions staff added.'),
    ('referral_custom_answers', null, 'retain_limited', 'Extra answers sent with a referral; moved to her profile when she is invited, or purged with the referral.')
  ) as disposition(table_name, participant_column, disposition, reason);
$function$;
