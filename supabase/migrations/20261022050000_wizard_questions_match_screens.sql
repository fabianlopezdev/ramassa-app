-- The database's wizard questions are the questions a screen asks (RAPP-618).
--
-- WHY
--
-- `private.wizard_intake_questions()` listed her app language, which no wizard
-- screen asks: the language picker sets it before the wizard and the summary
-- shows it. `my_questions_to_ask()` therefore returned it, and the staff
-- preview of a new invitation could say "asked" about a question her phone
-- never shows. The code's list (`WIZARD_QUESTIONS`, the screens) never had it.
--
-- WHAT THIS MIGRATION DOES
--
--   1. The wizard list is the screens' questions, in screen order. A parity
--      test reads the block below against `WIZARD_QUESTIONS`.
--   2. `private.builtin_intake_questions()`: the wizard list plus her app
--      language, the built-in questions staff may reword. Rewording uses it.
--   3. Stored Ask / Don't ask on her app language go (they did nothing).
--   4. Her app language stays required: the app always sends it.

-- 3 first, so no stored row falls outside the new list.
delete from public.intake_question_states where question = 'preferred_language';
update public.intake_state_presets
   set states = states - 'preferred_language'
 where states ? 'preferred_language';

create or replace function private.wizard_intake_questions()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    -- wizard-intake-questions:start
    'first_name', 'last_name', 'date_of_birth', 'place_of_birth', 'nationality',
    'document', 'phone', 'address', 'city', 'postal_code',
    'reference_entity', 'reference_contact_name', 'dependents', 'clothing_size', 'shoe_size',
    'applicant_status', 'supporting_entities', 'childcare_need', 'specific_needs'
    -- wizard-intake-questions:end
  ]::text[];
$$;

create or replace function private.builtin_intake_questions()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select private.wizard_intake_questions() || array['preferred_language']::text[];
$$;

revoke all on function private.builtin_intake_questions() from public, anon, authenticated;

alter table public.builtin_question_overrides
  drop constraint builtin_question_overrides_question_check,
  add constraint builtin_question_overrides_question_check
    check (question = any (private.builtin_intake_questions()));

create or replace function public.save_builtin_question_override(p_question text, p_label jsonb, p_help jsonb, p_is_hidden boolean, p_option_overrides jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := private.require_question_builder();
  cleaned jsonb := '{}'::jsonb;
  entry record;
begin
  if not (p_question = any (private.builtin_intake_questions())) then
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
$function$;
