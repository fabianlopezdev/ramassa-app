begin;
-- Conditional follow-ups reuse the existing question types and encrypted answers (RAPP-572).
alter table public.custom_questions
  add column show_when_question_id uuid references public.custom_questions(id),
  add column show_when_option_id uuid references public.custom_question_options(id),
  add constraint custom_questions_condition_pair check (
    (show_when_question_id is null) = (show_when_option_id is null)
  ),
  add constraint custom_questions_condition_not_self check (
    show_when_question_id is null or show_when_question_id <> id
  );
create index custom_questions_condition_question_idx on public.custom_questions(show_when_question_id)
  where show_when_question_id is not null;
create index custom_questions_condition_option_idx on public.custom_questions(show_when_option_id)
  where show_when_option_id is not null;

create or replace function private.guard_custom_question_condition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  gate public.custom_questions%rowtype;
begin
  if exists (select 1 from public.custom_questions child
    where child.show_when_question_id = new.id and
      (child.org_id <> new.org_id or child.screen_id <> new.screen_id
       or not child.placements <@ new.placements or new.show_when_question_id is not null)) then
    raise check_violation using message = 'a conditional question must stay with its controlling question';
  end if;
  if new.show_when_question_id is null and new.show_when_option_id is null then return new; end if;
  select * into gate from public.custom_questions where id = new.show_when_question_id;
  if gate.id is null or gate.id = new.id or gate.org_id <> new.org_id
     or gate.screen_id <> new.screen_id or gate.question_type <> 'single_choice'
     or gate.show_when_question_id is not null or not new.placements <@ gate.placements
     or not exists (select 1 from public.custom_question_options option
       where option.id = new.show_when_option_id and option.question_id = gate.id and option.org_id = new.org_id) then
    raise check_violation using message = 'a condition needs an option of a single-choice question on the same screen and organisation';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_custom_question_condition() from public, anon, authenticated;
create trigger custom_questions_condition_guard
  before insert or update of show_when_question_id, show_when_option_id, screen_id, org_id, placements
  on public.custom_questions for each row execute function private.guard_custom_question_condition();

create or replace function public.intake_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- A woman who started on her own has no profile until she completes the
  -- wizard: she reads the default organization's questions.
  actor_org uuid := coalesce((select public.current_org_id()), (select public.default_organization_id()));
  with_archived boolean := (select public.has_permission('settings.organization'));
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
    'presets', case when (select public.has_permission('participants.view_personal')) then coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'states', p.states)
        order by p.name, p.id)
        from public.intake_state_presets p where p.org_id = actor_org), '[]'::jsonb)
      else '[]'::jsonb end
  );
end;
$$;
commit;
