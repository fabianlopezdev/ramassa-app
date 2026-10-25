-- The text-keyed side tables of the app's questions move onto fields and placements (RAPP-666, D13).
--
-- WHY
--
-- Step 7 of 7 (RAPP-660 to RAPP-666). The app's questions are fields like any
-- other since RAPP-660, and staff edit every field on Dades de les jugadores
-- since RAPP-665. Four things still lived in tables keyed by the app's question
-- names, beside the fields and placements that hold the same facts for the
-- team's fields:
--
--   - `intake_question_states`: staff's Ask or Don't ask for her, per app
--     question. The team's fields keep the same choice in
--     `custom_question_states`, by field.
--   - `builtin_question_overrides`: staff wording and hiding of an app
--     question. A placement already carries a wording per surface, and a field
--     placed nowhere on her onboarding is not asked there.
--   - `intake_required_questions`: which app questions are required. The
--     placements already carried the same flag, kept in sync by
--     `private.sync_builtin_placements_required`.
--   - `private.wizard_screen_questions()`: the app screen of each question,
--     read by `place_field`, the flow order check, the screen hide switch and
--     the layout seed.
--
-- WHAT CHANGES
--
--   1. `private.system_profile_fields()` names the app screen whose own control
--      asks each field (`screen`). `place_field`, `intake_flow_order_problem`
--      and `seed_profile_layout` read it; `builtin_screen_hideable` reads the
--      required placements on the screen.
--   2. Staff's Ask or Don't ask on an app question is a `custom_question_states`
--      row of the question's first field. The wire keeps the question names:
--      `set_intake_question_states`, `participant_question_states` and
--      `my_questions_to_ask` turn them into fields.
--   3. The wording of an app question is the wording of its first field's
--      onboarding placement. Hiding it takes its fields off her onboarding and
--      her season form; showing it places them back on their own screen.
--      `save_builtin_question_override` loses its option argument (options are
--      named on the field since RAPP-665). The catalog's `overrides` list is
--      read from the placements, so the apps read it as before.
--   4. An app question is required when its first field's onboarding or
--      season placement is. `save_builtin_question_required` sets both, as
--      before; `required_intake_questions` reads them.
--   5. The setup file keeps version 3. Export writes the two old lists empty;
--      import applies an older file's lists to the placements, its option
--      wording to the field's options.
--   6. The three tables, `private.wizard_screen_questions()`,
--      `private.sync_builtin_placements_required`,
--      `private.system_field_required` and the option fold trigger are dropped.
--
-- The seeded onboarding is unchanged: same fields, screens, order, required
-- flags and wording.

-- 1. The app screen of each field ---------------------------------------------

drop function private.system_profile_fields();

create function private.system_profile_fields()
 RETURNS TABLE(system_key text, part_of text, question text, section_key text, question_type text, privacy text, label jsonb, settings jsonb, sort_order integer, screen text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select f.system_key, f.part_of, f.question, f.section_key, f.question_type, f.privacy, f.label,
         f.settings, (row_number() over (partition by f.section_key order by f.position) - 1)::integer,
         f.screen
    from (values
      -- system-profile-fields:start
      ('first_name', null, 'first_name', 'identity', 'short_text', 'normal', '{"ca": "Nom", "es": "Nombre", "en": "First name", "ar": "الاسم", "fa": "نام"}'::jsonb, '{}'::jsonb, 1, 'identity'),
      ('last_name', null, 'last_name', 'identity', 'short_text', 'normal', '{"ca": "Cognoms", "es": "Apellidos", "en": "Last name", "ar": "اسم العائلة", "fa": "نام خانوادگی"}'::jsonb, '{}'::jsonb, 2, 'identity'),
      ('date_of_birth', null, 'date_of_birth', 'origin', 'date', 'personal', '{"ca": "Data de naixement", "es": "Fecha de nacimiento", "en": "Date of birth", "ar": "تاريخ الميلاد", "fa": "تاریخ تولد"}'::jsonb, '{}'::jsonb, 3, 'background'),
      ('place_of_birth', null, 'place_of_birth', 'origin', 'short_text', 'personal', '{"ca": "Lloc de naixement", "es": "Lugar de nacimiento", "en": "Place of birth", "ar": "مكان الميلاد", "fa": "محل تولد"}'::jsonb, '{}'::jsonb, 4, 'background'),
      ('nationality', null, 'nationality', 'origin', 'country', 'personal', '{"ca": "Nacionalitat", "es": "Nacionalidad", "en": "Nationality", "ar": "الجنسية", "fa": "ملیت"}'::jsonb, '{}'::jsonb, 5, 'background'),
      ('document_type', null, 'document', 'identity', 'single_choice', 'personal', '{"ca": "Tipus de document", "es": "Tipo de documento", "en": "Document type", "ar": "نوع الوثيقة", "fa": "نوع مدرک"}'::jsonb, '{}'::jsonb, 6, 'documentation'),
      ('document_number', 'document_type', 'document', 'identity', 'short_text', 'sensitive', '{"ca": "Número de document", "es": "Número de documento", "en": "Document number", "ar": "رقم الوثيقة", "fa": "شماره مدرک"}'::jsonb, '{}'::jsonb, 7, 'documentation'),
      ('document_name', 'document_type', 'document', 'identity', 'short_text', 'personal', '{"ca": "Nom del document", "es": "Nombre del documento", "en": "Document name", "ar": "اسم الوثيقة", "fa": "نام مدرک"}'::jsonb, '{}'::jsonb, 8, 'documentation'),
      ('phone', null, 'phone', 'contact', 'phone', 'sensitive', '{"ca": "Telèfon", "es": "Teléfono", "en": "Phone", "ar": "الهاتف", "fa": "تلفن"}'::jsonb, '{}'::jsonb, 9, 'logistics'),
      ('address', null, 'address', 'contact', 'short_text', 'sensitive', '{"ca": "Adreça", "es": "Dirección", "en": "Address", "ar": "العنوان", "fa": "نشانی"}'::jsonb, '{}'::jsonb, 10, 'logistics'),
      ('city', null, 'city', 'contact', 'municipality', 'personal', '{"ca": "Municipi", "es": "Municipio", "en": "Municipality", "ar": "البلدية", "fa": "شهر"}'::jsonb, '{}'::jsonb, 11, 'logistics'),
      ('postal_code', null, 'postal_code', 'contact', 'short_text', 'sensitive', '{"ca": "Codi postal", "es": "Código postal", "en": "Postal code", "ar": "الرمز البريدي", "fa": "کد پستی"}'::jsonb, '{}'::jsonb, 12, 'logistics'),
      ('reference_entity', null, 'reference_entity', 'contact', 'short_text', 'normal', '{"ca": "Has arribat a través d''alguna entitat?", "es": "¿Has llegado a través de alguna entidad?", "en": "Did an organization refer you?", "ar": "هل وصلتِ عن طريق جمعية أو منظمة؟", "fa": "آیا از طریق نهاد یا سازمانی معرفی شده‌اید؟"}'::jsonb, '{}'::jsonb, 13, 'logistics'),
      ('reference_contact_name', null, 'reference_contact_name', 'contact', 'short_text', 'personal', '{"ca": "Persona de contacte a l''entitat", "es": "Persona de contacto en la entidad", "en": "Contact person at the organization", "ar": "الشخص المسؤول في الجهة", "fa": "فرد رابط در آن نهاد"}'::jsonb, '{}'::jsonb, 14, 'logistics'),
      ('has_dependents', null, 'dependents', 'contact', 'single_choice', 'personal', '{"ca": "Tens persones al teu càrrec?", "es": "¿Tienes personas a tu cargo?", "en": "Do you have dependents?", "ar": "هل لديكِ أشخاص تحت رعايتك؟", "fa": "آیا کسی تحت سرپرستی شماست؟"}'::jsonb, '{}'::jsonb, 15, 'logistics'),
      ('num_dependents', 'has_dependents', 'dependents', 'contact', 'number', 'personal', '{"ca": "Nombre de persones a càrrec", "es": "Número de personas a cargo", "en": "Number of dependents", "ar": "عدد الأشخاص المعالين", "fa": "تعداد افراد تحت تکفل"}'::jsonb, '{"integer": true, "min": 1, "max": 15}'::jsonb, 16, 'logistics'),
      ('clothing_size', null, 'clothing_size', 'sizes', 'single_choice', 'normal', '{"ca": "Talla de roba", "es": "Talla de ropa", "en": "Clothing size", "ar": "مقاس الملابس", "fa": "سایز لباس"}'::jsonb, '{}'::jsonb, 17, 'equipment'),
      ('shoe_size', null, 'shoe_size', 'sizes', 'single_choice', 'normal', '{"ca": "Número de peu (EU)", "es": "Número de pie (EU)", "en": "Shoe size (EU)", "ar": "مقاس الحذاء (EU)", "fa": "سایز کفش (EU)"}'::jsonb, '{}'::jsonb, 18, 'equipment'),
      ('applicant_status', null, 'applicant_status', 'situation', 'single_choice', 'sensitive', '{"ca": "Condició per accedir al projecte", "es": "Condición para acceder al proyecto", "en": "Status for joining the project", "ar": "الوضع للانضمام إلى المشروع", "fa": "وضعیت برای پیوستن به پروژه"}'::jsonb, '{}'::jsonb, 19, 'season'),
      ('applicant_status_details', 'applicant_status', 'applicant_status', 'situation', 'long_text', 'sensitive', '{"ca": "Detalls de la condició", "es": "Detalles de la condición", "en": "Status details", "ar": "تفاصيل الوضع", "fa": "جزئیات وضعیت"}'::jsonb, '{}'::jsonb, 20, 'season'),
      ('supporting_entities', null, 'supporting_entities', 'support', 'item_list', 'personal', '{"ca": "Altres entitats o programes que li donen suport", "es": "Otras entidades o programas que le dan apoyo", "en": "Other organizations or programmes that support her", "ar": "جمعيات أو برامج أخرى تدعمها", "fa": "سازمان‌ها یا برنامه‌های دیگری که از او حمایت می‌کنند"}'::jsonb, '{"max_items": 20}'::jsonb, 21, 'supporting-entities'),
      ('childcare_need', null, 'childcare_need', 'support', 'yes_no_maybe', 'personal', '{"ca": "Necessita servei de cangur durant els entrenaments?", "es": "¿Necesita servicio de canguro durante los entrenamientos?", "en": "Does she need childcare during training?", "ar": "هل تحتاجين إلى رعاية الأطفال أثناء التدريبات؟", "fa": "آیا در طول تمرین‌ها به نگهداری از کودک نیاز دارد؟"}'::jsonb, '{}'::jsonb, 22, 'participation-support'),
      ('specific_needs', null, 'specific_needs', 'health_needs', 'multiple_choice', 'sensitive', '{"ca": "Necessitats específiques", "es": "Necesidades específicas", "en": "Specific needs", "ar": "احتياجات خاصة", "fa": "نیازهای خاص"}'::jsonb, '{}'::jsonb, 23, 'specific-needs'),
      ('specific_needs_details', 'specific_needs', 'specific_needs', 'health_needs', 'long_text', 'sensitive', '{"ca": "Detalls de les necessitats específiques", "es": "Detalles de las necesidades específicas", "en": "Specific needs details", "ar": "تفاصيل الاحتياجات الخاصة", "fa": "جزئیات نیازهای خاص"}'::jsonb, '{}'::jsonb, 24, 'specific-needs')
      -- system-profile-fields:end
    ) as f(system_key, part_of, question, section_key, question_type, privacy, label, settings, position, screen);
$function$;

revoke all on function private.system_profile_fields() from public, anon, authenticated;

-- A screen can be hidden while it requires nothing: none of its placements is required.
create or replace function private.builtin_screen_hideable(p_screen text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from private.system_profile_fields() s where s.screen = p_screen)
     and not exists (
       select 1 from public.field_placements p
         join public.profile_fields f on f.id = p.field_id
        where p.surface = 'onboarding' and p.screen_key = p_screen and p.required
          and not f.is_archived
          and p.org_id = coalesce((select public.current_org_id()), (select public.default_organization_id())));
$$;

-- The layout of a new organization: the app's fields where the app asks them.
create or replace function private.seed_profile_layout(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profile_sections (org_id, key, title, sort_order, is_builtin)
  select p_org_id, d.key, d.title, d.sort_order, true from private.default_profile_sections() d
  on conflict (org_id, key) do nothing;

  insert into public.profile_fields (
    org_id, section_id, kind, system_key, question_type, label, privacy, default_required, settings, sort_order)
  select p_org_id, s.id, 'builtin', b.system_key, b.question_type, b.label, b.privacy,
         b.part_of is null and b.question = any (private.default_required_intake_questions()),
         b.settings, b.sort_order
    from private.system_profile_fields() b
    join public.profile_sections s on s.org_id = p_org_id and s.key = b.section_key
  on conflict (org_id, system_key) do nothing;

  insert into public.custom_question_options (org_id, question_id, key, label, sort_order, is_archived)
  select p_org_id, f.id, o.key, o.label, o.sort_order, false
    from private.system_field_options() o
    join public.profile_fields f on f.org_id = p_org_id and f.system_key = o.system_key
  on conflict (question_id, key) where key is not null do nothing;

  -- Where the app asks them: her wizard screen, each season, the entity form.
  -- First parts only: the other parts follow them below.
  insert into public.field_placements (org_id, field_id, surface, screen_key, sort_order, required)
  select p_org_id, f.id, 'onboarding', b.screen,
         (row_number() over (partition by b.screen
                             order by array_position(private.wizard_intake_questions(), b.question)) - 1)::integer,
         b.question = any (private.default_required_intake_questions() || private.locked_required_intake_questions())
    from private.system_profile_fields() b
    join public.profile_fields f on f.org_id = p_org_id and f.system_key = b.system_key
   where b.part_of is null and b.screen is not null
  on conflict (field_id, surface) do nothing;

  insert into public.field_placements (org_id, field_id, surface, sort_order, required)
  select p_org_id, f.id, 'season', (q.position - 1)::integer,
         q.question = any (private.default_required_intake_questions())
    from unnest(private.builtin_season_fields()) with ordinality as q(question, position)
    join public.profile_fields f on f.org_id = p_org_id and f.system_key = private.question_system_key(q.question)
  on conflict (field_id, surface) do nothing;

  -- The entity form asks her name always; it requires nothing else (RAPP-300).
  insert into public.field_placements (org_id, field_id, surface, sort_order, required)
  select p_org_id, f.id, 'entity_form', (q.position - 1)::integer,
         f.system_key = any (private.entity_form_always_asked())
    from unnest(private.system_entity_form_fields()) with ordinality as q(system_key, position)
    join public.profile_fields f on f.org_id = p_org_id and f.system_key = q.system_key
   where private.question_system_key(private.system_key_question(q.system_key)) = q.system_key
  on conflict (field_id, surface) do nothing;

  perform private.place_system_field_parts(p_org_id);

  -- A part shown on one answer of its first part.
  update public.profile_fields child
     set show_when_field_id = gate.id, show_when_option_id = o.id, updated_at = now()
    from private.system_field_conditions() c
    join public.profile_fields gate on gate.org_id = p_org_id and gate.system_key = c.gate_key
    join public.custom_question_options o on o.question_id = gate.id and o.key = c.option_key
   where child.org_id = p_org_id and child.system_key = c.system_key and child.show_when_field_id is null;
end;
$$;

-- 2. Placing, hiding, wording and requiring an app question ---------------------

-- The first field of an app question in an organization.
create or replace function private.app_question_field(p_org_id uuid, p_question text)
returns public.profile_fields
language sql
stable
security definer
set search_path = ''
as $$
  select f.* from public.profile_fields f
   where f.org_id = p_org_id and f.system_key = private.question_system_key(p_question);
$$;

-- Places an app question back where the app asks it: its first field at the
-- end of its own screen, on the season form for a season question, and the
-- other parts after it.
create or replace function private.place_app_question(p_org_id uuid, p_question text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  head public.profile_fields := private.app_question_field(p_org_id, p_question);
  own_screen text := (select s.screen from private.system_profile_fields() s
                       where s.question = p_question and s.part_of is null);
begin
  if head.id is null then
    raise invalid_parameter_value using message = 'not a question of the wizard';
  end if;
  if not exists (select 1 from public.field_placements p where p.field_id = head.id and p.surface = 'onboarding') then
    insert into public.field_placements (org_id, field_id, surface, screen_key, sort_order, required)
    values (p_org_id, head.id, 'onboarding', own_screen,
            coalesce((select max(p.sort_order) + 1 from public.field_placements p
                       where p.org_id = p_org_id and p.surface = 'onboarding' and p.screen_key = own_screen), 0),
            false);
  end if;
  if p_question = any (private.builtin_season_fields())
     and not exists (select 1 from public.field_placements p where p.field_id = head.id and p.surface = 'season') then
    insert into public.field_placements (org_id, field_id, surface, sort_order, required)
    values (p_org_id, head.id, 'season',
            coalesce((select max(p.sort_order) + 1 from public.field_placements p
                       where p.org_id = p_org_id and p.surface = 'season'), 0),
            false);
  end if;
  perform private.place_system_field_parts(p_org_id);
end;
$$;

-- Hidden: none of the question's fields is on her onboarding or her season
-- form. Shown again: placed back where the app asks it.
create or replace function private.set_app_question_hidden(p_org_id uuid, p_question text, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  head public.profile_fields := private.app_question_field(p_org_id, p_question);
begin
  if head.id is null then
    raise invalid_parameter_value using message = 'not a question of the wizard';
  end if;
  if p_hidden then
    -- The parts shown on an answer of the first part go first, so no
    -- condition is ever left without its field.
    delete from public.field_placements p
     using public.profile_fields f
     where f.id = p.field_id and f.org_id = p_org_id and p.surface in ('onboarding', 'season')
       and f.show_when_field_id is not null
       and f.system_key in (select s.system_key from private.system_profile_fields() s where s.question = p_question);
    delete from public.field_placements p
     using public.profile_fields f
     where f.id = p.field_id and f.org_id = p_org_id and p.surface in ('onboarding', 'season')
       and f.system_key in (select s.system_key from private.system_profile_fields() s where s.question = p_question);
  elsif not exists (select 1 from public.field_placements p where p.field_id = head.id and p.surface = 'onboarding') then
    perform private.place_app_question(p_org_id, p_question);
  end if;
end;
$$;

-- Staff wording of an app question: the wording of its first field's onboarding placement.
create or replace function private.set_app_question_wording(
  p_org_id uuid, p_question text, p_label jsonb, p_help jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.field_placements p
     set label_override = nullif(nullif(p_label, 'null'::jsonb), '{}'::jsonb),
         help_override = nullif(nullif(p_help, 'null'::jsonb), '{}'::jsonb),
         updated_at = now()
    from public.profile_fields f
   where f.id = p.field_id and f.org_id = p_org_id and p.surface = 'onboarding'
     and f.system_key = private.question_system_key(p_question)
     and (p.label_override, p.help_override) is distinct from
         (nullif(nullif(p_label, 'null'::jsonb), '{}'::jsonb), nullif(nullif(p_help, 'null'::jsonb), '{}'::jsonb));
$$;

-- Required on her onboarding and her season form alike. A question placed
-- nowhere is placed back first, so a required question is always asked.
create or replace function private.set_app_question_required(p_org_id uuid, p_question text, p_required boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  head public.profile_fields := private.app_question_field(p_org_id, p_question);
begin
  if head.id is null then
    raise invalid_parameter_value using message = 'not a question of the wizard';
  end if;
  if p_required and not exists (
       select 1 from public.field_placements p where p.field_id = head.id and p.surface in ('onboarding', 'season')) then
    perform private.place_app_question(p_org_id, p_question);
  end if;
  update public.field_placements p
     set required = p_required, updated_at = now()
   where p.field_id = head.id and p.surface in ('onboarding', 'season') and p.required is distinct from p_required;
end;
$$;

-- An older setup file's option wording or hiding lands on the field's options.
create or replace function private.fold_app_option_overrides(p_org_id uuid, p_question text, p_overrides jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry record;
begin
  if p_overrides is null or jsonb_typeof(p_overrides) <> 'object' then
    return;
  end if;
  for entry in select key, value from jsonb_each(p_overrides) loop
    continue when jsonb_typeof(entry.value) <> 'object';
    update public.custom_question_options o
       set label = case when jsonb_typeof(entry.value -> 'label') = 'object'
                             and private.catalan_text_valid(o.label || (entry.value -> 'label'))
                        then o.label || (entry.value -> 'label') else o.label end,
           is_archived = o.is_archived or coalesce((entry.value ->> 'hidden')::boolean, false)
      from public.profile_fields f
     where f.org_id = p_org_id
       and f.system_key = private.question_system_key(p_question)
       and o.question_id = f.id and o.key = entry.key;
  end loop;
end;
$$;

revoke all on function private.app_question_field(uuid, text) from public, anon, authenticated;
revoke all on function private.place_app_question(uuid, text) from public, anon, authenticated;
revoke all on function private.set_app_question_hidden(uuid, text, boolean) from public, anon, authenticated;
revoke all on function private.set_app_question_wording(uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.set_app_question_required(uuid, text, boolean) from public, anon, authenticated;
revoke all on function private.fold_app_option_overrides(uuid, text, jsonb) from public, anon, authenticated;

-- The app questions that need an answer: her names and app language always,
-- and every question whose first field is required where it is asked.
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
   where c.question = any (private.locked_required_intake_questions())
      or exists (
        select 1 from public.field_placements p
          join public.profile_fields f on f.id = p.field_id
         where f.org_id = p_org_id and not f.is_archived
           and f.system_key = private.question_system_key(c.question)
           and p.surface in ('onboarding', 'season') and p.required);
$$;

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
  perform private.set_app_question_required(actor_org, p_question, required);
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.required_question_save', 'organization', actor_org,
          jsonb_build_object('question', p_question, 'required', required));
end;
$$;

drop function public.save_builtin_question_override(text, jsonb, jsonb, boolean, jsonb);

create function public.save_builtin_question_override(
  p_question text, p_label jsonb, p_help jsonb, p_is_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  clean_label jsonb := nullif(nullif(p_label, 'null'::jsonb), '{}'::jsonb);
  clean_help jsonb := nullif(nullif(p_help, 'null'::jsonb), '{}'::jsonb);
  hidden boolean := coalesce(p_is_hidden, false);
begin
  if not (p_question = any (private.wizard_intake_questions())) then
    raise check_violation using message = 'not a built-in question';
  end if;
  if hidden and p_question = any (private.unhideable_intake_questions()) then
    raise check_violation using message = 'the app needs this question, so it cannot be hidden';
  end if;
  if (clean_label is not null and not private.localized_text_valid(clean_label))
     or (clean_help is not null and not private.localized_text_valid(clean_help)) then
    raise check_violation using message = 'a wording is text in the five languages';
  end if;
  perform private.set_app_question_hidden(actor_org, p_question, hidden);
  perform private.set_app_question_wording(actor_org, p_question, clean_label, clean_help);
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.builtin_override', 'organization', actor_org,
          jsonb_build_object('question', p_question, 'hidden', hidden, 'reworded', clean_label is not null));
end;
$$;

revoke all on function public.save_builtin_question_override(text, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.save_builtin_question_override(text, jsonb, jsonb, boolean) to authenticated;

-- 3. Ask or Don't ask, by field -----------------------------------------------

create or replace function private.apply_intake_question_states(
  p_profile_id uuid, p_states jsonb, p_actor uuid, p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry record;
  old_state text;
  field_id uuid;
  field public.profile_fields;
  changes jsonb := '{}'::jsonb;
begin
  if p_states is null or jsonb_typeof(p_states) <> 'object' then
    raise invalid_parameter_value using message = 'question states are an object';
  end if;

  for entry in select key as question, value as state from jsonb_each_text(p_states) loop
    if entry.state is null or entry.state not in ('auto', 'ask', 'skip') then
      raise invalid_parameter_value using message = 'unknown state ' || coalesce(entry.state, 'null');
    end if;

    field := null;
    if entry.question like 'custom:%' then
      -- A Ramassà field (RAPP-643), by its id.
      if entry.question !~ '^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise invalid_parameter_value using message = 'unknown question ' || entry.question;
      end if;
      select * into field from public.profile_fields f
       where f.id = substr(entry.question, 8)::uuid and f.org_id = p_org_id and f.kind = 'custom' and not f.is_archived;
      if field.id is null then
        raise invalid_parameter_value using message = 'unknown question ' || entry.question;
      end if;
      if entry.state = 'skip' and private.field_required_for_her(field.id)
         and not exists (
           select 1 from public.custom_answers a
            where a.profile_id = p_profile_id and a.question_id = field.id)
      then
        raise check_violation
          using message = 'a required question needs an answer before it can be hidden: ' || entry.question;
      end if;
    else
      -- An app question, by name: kept on its first field (RAPP-666).
      if not (entry.question = any (private.wizard_intake_questions())) then
        raise invalid_parameter_value using message = 'unknown question ' || entry.question;
      end if;
      field := private.app_question_field(p_org_id, entry.question);
      if field.id is null then
        raise invalid_parameter_value using message = 'unknown question ' || entry.question;
      end if;
      if entry.state = 'skip'
        and entry.question = any (private.required_intake_questions(p_org_id))
        and not private.app_question_answered(p_profile_id, entry.question)
      then
        raise check_violation
          using message = 'a required question needs an answer before it can be hidden: ' || entry.question;
      end if;
    end if;
    field_id := field.id;

    select s.state into old_state from public.custom_question_states s
     where s.profile_id = p_profile_id and s.question_id = field_id;
    old_state := coalesce(old_state, 'auto');
    continue when old_state = entry.state;

    if entry.state = 'auto' then
      delete from public.custom_question_states s
       where s.profile_id = p_profile_id and s.question_id = field_id;
    else
      insert into public.custom_question_states (profile_id, org_id, question_id, state, updated_by)
      values (p_profile_id, p_org_id, field_id, entry.state, p_actor)
      on conflict (profile_id, question_id) do update
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

-- Her states as staff set them, keyed as on the wire: an app question by its
-- name, a Ramassà field as `custom:<id>`.
create or replace function public.participant_question_states(p_profile_id uuid)
returns table(question text, state text)
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
        select case when f.kind = 'custom' then 'custom:' || f.id::text
                    else private.system_key_question(f.system_key) end as question,
               s.state
          from public.custom_question_states s
          join public.profile_fields f on f.id = s.question_id
         where s.profile_id = p_profile_id
           and s.org_id = (select public.current_org_id())
      ) rows
     where rows.question is not null
     order by rows.question;
end;
$$;

create or replace function public.my_questions_to_ask()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select question.name
    from unnest(private.wizard_intake_questions()) with ordinality as question(name, position)
    left join public.profiles me on me.id = (select auth.uid())
    left join public.profile_fields f
      on f.org_id = me.org_id and f.system_key = private.question_system_key(question.name)
    left join public.custom_question_states s
      on s.profile_id = me.id and s.question_id = f.id
   where (select auth.uid()) is not null
     and (
       s.state = 'ask'
       or not private.app_question_answered((select auth.uid()), question.name) and (
         s.state is null
         or (s.state = 'skip' and question.name = any (private.required_intake_questions()))
       )
     )
   order by question.position;
$$;

-- 4. The data moves ---------------------------------------------------------------

-- Ask or Don't ask on an app question: a state of its first field.
insert into public.custom_question_states (profile_id, org_id, question_id, state, updated_at, updated_by)
select s.profile_id, s.org_id, f.id, s.state, s.updated_at, s.updated_by
  from public.intake_question_states s
  join public.profile_fields f on f.org_id = s.org_id and f.system_key = private.question_system_key(s.question)
on conflict (profile_id, question_id) do nothing;

-- The placements already follow the required list; make sure once more.
update public.field_placements p
   set required = (private.system_key_question(f.system_key) = any (private.locked_required_intake_questions())
                   or coalesce(r.is_required,
                               private.system_key_question(f.system_key) = any (private.default_required_intake_questions()))),
       updated_at = now()
  from public.profile_fields f
  left join public.intake_required_questions r
    on r.org_id = f.org_id and r.question = private.system_key_question(f.system_key)
 where f.id = p.field_id and f.kind = 'builtin' and p.surface in ('onboarding', 'season')
   and private.question_system_key(private.system_key_question(f.system_key)) = f.system_key
   and p.required is distinct from (private.system_key_question(f.system_key) = any (private.locked_required_intake_questions())
                   or coalesce(r.is_required,
                               private.system_key_question(f.system_key) = any (private.default_required_intake_questions())));

-- Staff wording of an app question: on its first field's onboarding placement,
-- where that placement has none of its own. A hide counted only while the
-- question was optional.
update public.field_placements p
   set label_override = coalesce(p.label_override, o.label),
       help_override = coalesce(p.help_override, o.help),
       updated_at = now()
  from public.builtin_question_overrides o
  join public.profile_fields f on f.org_id = o.org_id and f.system_key = private.question_system_key(o.question)
 where p.field_id = f.id and p.surface = 'onboarding'
   and (o.label is not null or o.help is not null);

select private.set_app_question_hidden(o.org_id, o.question, true)
  from public.builtin_question_overrides o
 where o.is_hidden and o.question = any (private.wizard_intake_questions())
   and not (o.question = any (private.required_intake_questions(o.org_id)));

-- 5. The old storage goes -----------------------------------------------------------

drop trigger builtin_question_overrides_fold_options on public.builtin_question_overrides;
drop function private.fold_option_overrides();
drop table public.intake_question_states;
drop table public.builtin_question_overrides;
drop table public.intake_required_questions;
drop function private.sync_builtin_placements_required(uuid);
drop function private.system_field_required(text, uuid);
drop function private.wizard_screen_questions();
-- It listed the questions an override could name; the wizard's own list does now.
drop function private.builtin_intake_questions();

-- 6. Readers and writers of the moved settings --------------------------------------

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
    -- Ramassà screens. The fields each one asks are its placements, below.
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'intro', s.intro, 'after_screen', s.after_screen,
        'sort_order', s.sort_order, 'is_archived', s.is_archived)
        order by array_position(private.intake_builtin_screens(), s.after_screen), s.sort_order, s.created_at)
        from public.intake_screens s
       where s.org_id = actor_org and (with_archived or not s.is_archived)), '[]'::jsonb),
    -- The app's questions as staff worded or hid them (RAPP-666): the wording
    -- of the question's first field on her onboarding, and hidden when that
    -- field is placed nowhere on it.
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
    -- The app terms she accepts (RAPP-613): the current published version,
    -- or the draft for a test player when there is one (RAPP-619).
    'terms', (
      select jsonb_build_object('id', v.id, 'version_number', v.version_number, 'content', v.content,
                                'is_draft', v.published_at is null)
        from private.app_terms_version_for(actor_org, (select auth.uid())) v
       where v.id is not null),
    -- The profile layout (RAPP-649): sections, fields and where each is asked.
    -- Who created a field, and whether it has answers (which fixes its
    -- privacy level), only for the people who design it.
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'key', s.key, 'title', s.title, 'sort_order', s.sort_order, 'is_builtin', s.is_builtin)
        order by s.sort_order, s.created_at)
        from public.profile_sections s where s.org_id = actor_org), '[]'::jsonb),
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'section_id', f.section_id, 'kind', f.kind, 'system_key', f.system_key,
        'question_type', f.question_type, 'label', f.label, 'help', f.help, 'privacy', f.privacy,
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
       where f.org_id = actor_org and (with_archived or not f.is_archived)), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'field_id', p.field_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'sort_order', p.sort_order, 'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.surface, p.screen_key, p.sort_order, p.created_at)
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id
       where p.org_id = actor_org and (with_archived or not f.is_archived)), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.export_onboarding_setup(p_app_commit text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  document jsonb;
begin
  if not (select private.can_design_onboarding()) or actor_org is null then
    raise insufficient_privilege using message = 'exporting the onboarding setup needs settings.organization or onboarding.design';
  end if;
  if p_app_commit is not null and p_app_commit !~ '^[0-9A-Za-z._-]{1,64}$' then
    raise check_violation using message = 'the app commit is a short version name';
  end if;

  document := jsonb_build_object(
    'format', 'ramassa.onboarding-setup',
    'schema_version', 3,
    'app_commit', p_app_commit,
    'exported_at', now(),
    -- The profile layout (RAPP-649): sections, every field with its options, and
    -- where each is asked. Version 3 (RAPP-656) carries nothing else about them.
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'key', s.key, 'title', s.title, 'sort_order', s.sort_order, 'is_builtin', s.is_builtin)
        order by s.sort_order, s.created_at, s.id)
        from public.profile_sections s where s.org_id = actor_org), '[]'::jsonb),
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'section_id', f.section_id, 'kind', f.kind, 'system_key', f.system_key,
        'question_type', f.question_type, 'label', f.label, 'help', f.help, 'privacy', f.privacy,
        'default_required', f.default_required, 'settings', f.settings,
        'show_when_field_id', f.show_when_field_id, 'show_when_option_id', f.show_when_option_id,
        'sort_order', f.sort_order, 'is_archived', f.is_archived,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'key', o.key, 'label', o.label, 'sort_order', o.sort_order, 'is_archived', o.is_archived)
            order by o.sort_order, o.id)
            from public.custom_question_options o where o.question_id = f.id), '[]'::jsonb))
        -- The app's fields by key, then Ramassà's in their order: the same
        -- setup always gives the same file.
        order by f.kind, f.system_key, f.sort_order, f.created_at, f.id)
        from public.profile_fields f where f.org_id = actor_org), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'field_id', p.field_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'sort_order', p.sort_order, 'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.surface, p.screen_key, p.sort_order, coalesce(f.system_key, f.id::text))
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id
       where p.org_id = actor_org), '[]'::jsonb),
    -- Ramassà screens, in the order of their anchors.
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'intro', s.intro,
        'after_screen', s.after_screen, 'sort_order', s.sort_order,
        'home_after_screen', s.home_after_screen, 'home_sort_order', s.home_sort_order,
        'is_archived', s.is_archived)
        order by array_position(private.intake_builtin_screens(), s.after_screen), s.sort_order, s.created_at, s.id)
        from public.intake_screens s where s.org_id = actor_org), '[]'::jsonb),
    -- The placements above carry the wording, the hiding and the required
    -- flag of the app's questions (RAPP-666). The two lists stay in the file,
    -- empty, so it is still a version 3 file; an older file may fill them.
    'builtin_question_overrides', '[]'::jsonb,
    'builtin_screens', coalesce((
      select jsonb_agg(jsonb_build_object('screen', b.screen, 'texts', b.texts, 'is_hidden', b.is_hidden)
        order by b.screen)
        from public.intake_builtin_screens b where b.org_id = actor_org), '[]'::jsonb),
    'flow_order', (select to_jsonb(f.step_order) from public.intake_flow_orders f where f.org_id = actor_org),
    'required_questions', '[]'::jsonb,
    'presets', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.name, 'states', p.states) order by p.name, p.id)
        from public.intake_state_presets p where p.org_id = actor_org), '[]'::jsonb),
    'document_step_explanation', (
      select o.document_step_explanation from public.organizations o where o.id = actor_org),
    'app_terms', jsonb_build_object(
      'published', coalesce((
        select jsonb_agg(jsonb_build_object(
          'version_number', v.version_number, 'published_at', v.published_at, 'content', v.content)
          order by v.version_number)
          from public.app_terms_versions v where v.org_id = actor_org and v.published_at is not null), '[]'::jsonb),
      'draft', (
        select jsonb_build_object('content', v.content)
          from public.app_terms_versions v where v.org_id = actor_org and v.published_at is null)),
    -- Real seasons only: a test fixture season is never moved.
    'seasons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'starts_on', s.starts_on, 'is_current', s.is_current)
        order by s.starts_on, s.name)
        from public.seasons s where s.org_id = actor_org and not s.is_test_fixture), '[]'::jsonb),
    'authorization', jsonb_build_object(
      'published', coalesce((
        select jsonb_agg(jsonb_build_object(
          'season_id', v.season_id, 'version_number', v.version_number,
          'published_at', v.published_at, 'content', v.content)
          order by s.starts_on, v.version_number)
          from public.authorization_versions v
          join public.seasons s on s.id = v.season_id and not s.is_test_fixture
         where v.org_id = actor_org and v.published_at is not null), '[]'::jsonb),
      'draft', (
        select jsonb_build_object('content', v.content)
          from public.authorization_versions v where v.org_id = actor_org and v.published_at is null))
  );

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'onboarding.export', 'organization', actor_org,
          jsonb_build_object('schema_version', 3, 'app_commit', p_app_commit,
                             'counts', private.onboarding_setup_counts(document)));
  return document;
end;
$function$;

create or replace function private.apply_onboarding_setup(p_document jsonb, p_org_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  season_map jsonb := '{}'::jsonb;
  screen_map jsonb := '{}'::jsonb;
  option_map jsonb := '{}'::jsonb;
  section_map jsonb := '{}'::jsonb;
  field_map jsonb := '{}'::jsonb;
  -- A file of an older version is read as version 3 (RAPP-656).
  document jsonb := private.onboarding_setup_as_version_3(p_document, p_org_id);
  new_field uuid;
  placed_screen text;
  item record;
  option_item record;
  new_id uuid;
  new_screen uuid;
  question_count integer := 0;
  option_ties boolean;
  steps text[];
  legal jsonb := private.onboarding_setup_legal_plan(p_document);
  flow_problem text;
begin
  -- A file with nothing to import is refused, or an empty export could be
  -- imported again and again (pending fix 33).
  if private.onboarding_setup_is_empty(p_document) then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/EMPTY: the file holds no onboarding setup to import';
  end if;

  -- Ids inside the file are unique per type, or references are ambiguous.
  if (select count(*) <> count(distinct s ->> 'id') from jsonb_array_elements(document -> 'screens') s)
     or (select count(*) <> count(distinct s ->> 'id') from jsonb_array_elements(document -> 'seasons') s)
     or (select count(*) <> count(distinct s ->> 'id') from jsonb_array_elements(document -> 'sections') s)
     or (select count(*) <> count(distinct f ->> 'id') from jsonb_array_elements(document -> 'fields') f)
     or (select count(*) <> count(distinct o ->> 'id')
           from jsonb_array_elements(document -> 'fields') f, jsonb_array_elements(f -> 'options') o)
  then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: an id appears twice';
  end if;

  -- Seasons.
  for item in select value from jsonb_array_elements(p_document -> 'seasons') loop
    insert into public.seasons (org_id, name, starts_on, is_current)
    values (p_org_id, item.value ->> 'name', (item.value ->> 'starts_on')::date,
            coalesce((item.value ->> 'is_current')::boolean, false))
    returning id into new_id;
    season_map := season_map || jsonb_build_object(item.value ->> 'id', new_id);
  end loop;

  -- Ramassà screens. Fields reach them through placements, below.
  for item in select value, ordinality from jsonb_array_elements(document -> 'screens') with ordinality loop
    insert into public.intake_screens (
      org_id, title, intro, after_screen, sort_order, home_after_screen, home_sort_order, is_archived,
      created_at, updated_at)
    values (
      p_org_id, item.value -> 'title', private.json_value_or_null(item.value -> 'intro'),
      item.value ->> 'after_screen', (item.value ->> 'sort_order')::integer,
      coalesce(item.value ->> 'home_after_screen', item.value ->> 'after_screen'),
      coalesce((item.value ->> 'home_sort_order')::integer, (item.value ->> 'sort_order')::integer),
      coalesce((item.value ->> 'is_archived')::boolean, false),
      now() + item.ordinality * interval '1 microsecond', now())
    returning id into new_screen;
    screen_map := screen_map || jsonb_build_object(item.value ->> 'id', new_screen);
  end loop;

  -- The profile layout (RAPP-649): built-in sections and fields by their key,
  -- the others new; then where each is asked; then conditions.
  for item in select value from jsonb_array_elements(document -> 'sections') loop
    new_id := null;
    if coalesce((item.value ->> 'is_builtin')::boolean, false) then
      update public.profile_sections
         set title = item.value -> 'title', sort_order = (item.value ->> 'sort_order')::integer, updated_at = now()
       where org_id = p_org_id and key = item.value ->> 'key' and is_builtin
      returning id into new_id;
    end if;
    if new_id is null then
      new_id := gen_random_uuid();
      insert into public.profile_sections (id, org_id, key, title, sort_order)
      values (new_id, p_org_id, 'custom_' || replace(new_id::text, '-', ''), item.value -> 'title',
              (item.value ->> 'sort_order')::integer);
    end if;
    section_map := section_map || jsonb_build_object(item.value ->> 'id', new_id);
  end loop;

  for item in select value, ordinality from jsonb_array_elements(document -> 'fields') with ordinality loop
    if section_map ->> (item.value ->> 'section_id') is null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a question names a section that is not in the file';
    end if;
    if item.value ->> 'kind' = 'builtin' then
      update public.profile_fields
         set label = item.value -> 'label', help = private.json_value_or_null(item.value -> 'help'),
             section_id = (section_map ->> (item.value ->> 'section_id'))::uuid,
             sort_order = (item.value ->> 'sort_order')::integer, updated_at = now()
       where org_id = p_org_id and system_key = private.setup_system_key(item.value)
      returning id into new_field;
      if new_field is null then
        raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: an app question this app does not know';
      end if;
      -- Its options are the app's: a condition in the file finds them by key.
      for option_item in select value from jsonb_array_elements(item.value -> 'options') loop
        select o.id into new_id from public.custom_question_options o
         where o.question_id = new_field and o.key = option_item.value ->> 'key';
        if new_id is not null then
          option_map := option_map || jsonb_build_object(option_item.value ->> 'id', new_id);
        end if;
      end loop;
    else
      question_count := question_count + 1;
      insert into public.profile_fields (
        org_id, section_id, kind, question_type, label, help, privacy, default_required, settings,
        sort_order, created_by, is_archived, created_at, updated_at)
      values (
        p_org_id, (section_map ->> (item.value ->> 'section_id'))::uuid, 'custom', item.value ->> 'question_type',
        item.value -> 'label', private.json_value_or_null(item.value -> 'help'), item.value ->> 'privacy',
        coalesce((item.value ->> 'default_required')::boolean, false),
        coalesce(private.json_value_or_null(item.value -> 'settings'), '{}'::jsonb),
        (item.value ->> 'sort_order')::integer,
        p_actor, coalesce((item.value ->> 'is_archived')::boolean, false),
        now() + question_count * interval '1 microsecond', now())
      returning id into new_field;
      select count(*) <> count(distinct o ->> 'sort_order') into option_ties
        from jsonb_array_elements(item.value -> 'options') o;
      for option_item in select value, ordinality from jsonb_array_elements(item.value -> 'options') with ordinality loop
        insert into public.custom_question_options (org_id, question_id, label, sort_order, is_archived)
        values (p_org_id, new_field, option_item.value -> 'label',
                case when option_ties then option_item.ordinality::integer - 1
                     else (option_item.value ->> 'sort_order')::integer end,
                coalesce((option_item.value ->> 'is_archived')::boolean, false))
        returning id into new_id;
        option_map := option_map || jsonb_build_object(option_item.value ->> 'id', new_id);
      end loop;
    end if;
    field_map := field_map || jsonb_build_object(item.value ->> 'id', new_field);
  end loop;

  -- The built-in fields the file names are placed as the file says. A file
  -- converted from version 1 names none, so theirs stay as they are.
  -- The parts of a split field go with their first part, and the parts shown
  -- on a condition go first, so no condition is left without its field.
  delete from public.field_placements p
   using public.profile_fields f
   where f.id = p.field_id and f.org_id = p_org_id and f.kind = 'builtin'
     and f.show_when_field_id is not null
     and private.question_system_key(private.system_key_question(f.system_key))
         in (select private.question_system_key(private.system_key_question(private.setup_system_key(b)))
               from jsonb_array_elements(document -> 'fields') b where b ->> 'kind' = 'builtin');
  delete from public.field_placements p
   using public.profile_fields f
   where f.id = p.field_id and f.org_id = p_org_id and f.kind = 'builtin'
     and private.question_system_key(private.system_key_question(f.system_key))
         in (select private.question_system_key(private.system_key_question(private.setup_system_key(b)))
               from jsonb_array_elements(document -> 'fields') b where b ->> 'kind' = 'builtin');
  for item in select value from jsonb_array_elements(document -> 'placements') loop
    if field_map ->> (item.value ->> 'field_id') is null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a placement names a question that is not in the file';
    end if;
    placed_screen := private.json_value_or_null(item.value -> 'screen_key') #>> '{}';
    if private.is_uuid_text(placed_screen) then
      placed_screen := screen_map ->> placed_screen;
      if placed_screen is null then
        raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a placement names a screen that is not in the file';
      end if;
    end if;
    insert into public.field_placements (
      org_id, field_id, surface, screen_key, sort_order, required, label_override, help_override)
    values (
      p_org_id, (field_map ->> (item.value ->> 'field_id'))::uuid, item.value ->> 'surface', placed_screen,
      (item.value ->> 'sort_order')::integer, coalesce((item.value ->> 'required')::boolean, false),
      private.json_value_or_null(item.value -> 'label_override'),
      private.json_value_or_null(item.value -> 'help_override'));
  end loop;
  -- A file from before the split places the first parts only.
  perform private.place_system_field_parts(p_org_id);

  for item in
    select value from jsonb_array_elements(document -> 'fields')
     where private.json_value_or_null(value -> 'show_when_field_id') is not null
  loop
    if field_map ->> (item.value ->> 'show_when_field_id') is null
       or option_map ->> (item.value ->> 'show_when_option_id') is null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a condition names a question or option that is not in the file';
    end if;
    update public.profile_fields
       set show_when_field_id = (field_map ->> (item.value ->> 'show_when_field_id'))::uuid,
           show_when_option_id = (option_map ->> (item.value ->> 'show_when_option_id'))::uuid
     where id = (field_map ->> (item.value ->> 'id'))::uuid;
  end loop;

  -- An older file's required list, then its wording, hiding and option
  -- changes of the app's questions, land on their fields and placements
  -- (RAPP-666). A hide counts only while the question is optional.
  for item in select value from jsonb_array_elements(p_document -> 'required_questions') loop
    if not (item.value ->> 'question' = any (private.wizard_intake_questions())) then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a required question this app does not know';
    end if;
    if jsonb_typeof(item.value -> 'is_required') is distinct from 'boolean' then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: the file is incomplete or damaged';
    end if;
    continue when item.value ->> 'question' = any (private.locked_required_intake_questions());
    perform private.set_app_question_required(p_org_id, item.value ->> 'question', (item.value ->> 'is_required')::boolean);
  end loop;
  for item in select value from jsonb_array_elements(p_document -> 'builtin_question_overrides') loop
    if not (item.value ->> 'question' = any (private.wizard_intake_questions())) then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a change to an app question this app does not know';
    end if;
    perform private.fold_app_option_overrides(
      p_org_id, item.value ->> 'question', private.json_value_or_null(item.value -> 'option_overrides'));
    if coalesce((item.value ->> 'is_hidden')::boolean, false)
       and not (item.value ->> 'question' = any (private.required_intake_questions(p_org_id))) then
      perform private.set_app_question_hidden(p_org_id, item.value ->> 'question', true);
    end if;
    perform private.set_app_question_wording(
      p_org_id, item.value ->> 'question',
      private.json_value_or_null(item.value -> 'label'), private.json_value_or_null(item.value -> 'help'));
  end loop;

  -- The app screens' wording.
  insert into public.intake_builtin_screens (org_id, screen, texts, is_hidden, updated_by)
  select p_org_id, b ->> 'screen', coalesce(private.json_value_or_null(b -> 'texts'), '{}'::jsonb),
         coalesce((b ->> 'is_hidden')::boolean, false), p_actor
    from jsonb_array_elements(p_document -> 'builtin_screens') b;

  -- The flow order, staff screens remapped.
  if jsonb_typeof(document -> 'flow_order') = 'array' then
    select array_agg(
             case when step.value like 'custom:%' then 'custom:' || (screen_map ->> substr(step.value, 8))
                  else step.value end
             order by step.ordinality)
      into steps
      from jsonb_array_elements_text(document -> 'flow_order') with ordinality as step(value, ordinality);
    -- The same checks as save_intake_flow_order (pending fix 31), on the
    -- screens just created with the file's archived flags.
    flow_problem := private.intake_flow_order_problem(p_org_id, coalesce(steps, array[]::text[]));
    if flow_problem is not null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: ' || case flow_problem
        when 'too_many' then 'the flow order has more than 200 steps'
        when 'repeated' then 'the flow order names a step twice'
        when 'fixed_end' then 'the summary, the terms and the authorization always end the onboarding'
        when 'archived_screen' then 'the flow order names an archived screen'
        else 'the flow order names a step that is not in the file' end;
    end if;
    if cardinality(steps) > 0 then
      insert into public.intake_flow_orders (org_id, step_order, updated_by) values (p_org_id, steps, p_actor);
    end if;
  end if;

  -- Presets and the document step note.
  if exists (
    select 1 from jsonb_array_elements(p_document -> 'presets') p
     where jsonb_typeof(p -> 'states') is distinct from 'object'
        or exists (select 1 from jsonb_each_text(p -> 'states') entry
                    where not (entry.key = any (private.wizard_intake_questions()))
                       or entry.value not in ('ask', 'skip'))
  ) then
    raise check_violation using message = 'ONBOARDING_SETUP/MALFORMED: a preset sets ask or skip on wizard questions';
  end if;
  insert into public.intake_state_presets (org_id, name, states, created_by)
  select p_org_id, btrim(p ->> 'name'), p -> 'states', p_actor
    from jsonb_array_elements(p_document -> 'presets') p;

  update public.organizations
     set document_step_explanation = private.json_value_or_null(p_document -> 'document_step_explanation')
   where id = p_org_id;

  -- The legal texts: drafts only, through the draft functions that validate them.
  if (legal -> 'app_terms' ->> 'imported')::boolean then
    perform public.save_app_terms_draft(legal -> 'app_terms' -> 'content');
  end if;
  if (legal -> 'authorization' ->> 'imported')::boolean then
    perform public.save_authorization_draft(legal -> 'authorization' -> 'content');
  end if;

  return jsonb_build_object(
    'counts', private.onboarding_setup_import_counts(p_document),
    'legal', jsonb_build_object(
      'app_terms', (legal -> 'app_terms') - 'content',
      'authorization', (legal -> 'authorization') - 'content'));
end;
$function$;

create or replace function private.onboarding_setup_blockers(p_org_id uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(array_agg(blocker.code order by blocker.ordinal), array[]::text[])
    from (values
      (1, 'screens', exists (select 1 from public.intake_screens where org_id = p_org_id)),
      (2, 'questions', exists (select 1 from public.profile_fields where org_id = p_org_id and kind = 'custom')),
      -- Staff wording on an app question (RAPP-666: on its placements).
      (3, 'builtin_question_overrides', exists (
         select 1 from public.field_placements p
           join public.profile_fields f on f.id = p.field_id and f.kind = 'builtin'
          where p.org_id = p_org_id and (p.label_override is not null or p.help_override is not null))),
      (4, 'builtin_screens', exists (select 1 from public.intake_builtin_screens where org_id = p_org_id)),
      (5, 'flow_order', exists (select 1 from public.intake_flow_orders where org_id = p_org_id)),
      -- An app question made required or optional (RAPP-666: on its placements).
      (6, 'required_questions', exists (
         select 1 from unnest(private.wizard_intake_questions()) q(question)
          where (q.question = any (private.required_intake_questions(p_org_id)))
                <> (q.question = any (private.default_required_intake_questions()
                                      || private.locked_required_intake_questions())))),
      (7, 'presets', exists (select 1 from public.intake_state_presets where org_id = p_org_id)),
      (8, 'document_step_explanation', exists (select 1 from public.organizations
                                                where id = p_org_id and document_step_explanation is not null)),
      (9, 'app_terms', exists (select 1 from public.app_terms_versions v
                                where v.org_id = p_org_id
                                  and (v.version_number is distinct from 1
                                       or v.content <> private.app_terms_version_one()))),
      (10, 'seasons', exists (select 1 from public.seasons where org_id = p_org_id and not is_test_fixture)),
      (11, 'authorization', exists (select 1 from public.authorization_versions where org_id = p_org_id))
    ) as blocker(ordinal, code, present)
   where blocker.present;
$function$;

create or replace function private.onboarding_setup_problem(p_state text, p_message text, p_constraint text, p_table text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_message like 'ONBOARDING_SETUP/%' then p_message
    when nullif(p_constraint, '') is not null or (p_state like '23%' and nullif(p_table, '') is not null) then
      'ONBOARDING_SETUP/REFUSED_VALUE: ' || case p_table
        when 'intake_screens' then 'a screen'
        when 'profile_fields' then 'a question'
        when 'field_placements' then 'where a question is asked'
        when 'profile_sections' then 'a section of the player profile'
        when 'custom_question_options' then 'an answer option'
        when 'intake_builtin_screens' then 'the wording of an app screen'
        when 'intake_flow_orders' then 'the screen order'
        when 'intake_state_presets' then 'a preset'
        when 'organizations' then 'the document step note'
        when 'seasons' then 'a season'
        when 'app_terms_versions' then 'the app terms'
        when 'authorization_versions' then 'the authorization'
        else 'a part' end
      || ' in the file has a value this app does not accept. Download the file again from an app at the same version.'
    when p_state like '22%' then
      'ONBOARDING_SETUP/MALFORMED: a value in the file has the wrong form (a date, a number or an id). Download the file again from an app at the same version.'
    else p_message
  end;
$function$;

create or replace function public.place_field(p_field_id uuid, p_surface text, p_screen_key text DEFAULT NULL::text, p_required boolean DEFAULT NULL::boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := private.require_question_builder();
  field public.profile_fields;
  saved_id uuid;
begin
  select * into field from public.profile_fields where id = p_field_id and org_id = actor_org and not is_archived;
  if field.id is null then
    raise no_data_found using message = 'no such question';
  end if;
  if p_surface is null or p_surface not in ('onboarding', 'entity_form', 'season') then
    raise check_violation using message = 'a field is placed on onboarding, the entity form or the season';
  end if;
  -- Her names live on her account: her identity screen and the entity form ask them.
  if private.is_name_field(field)
     and not (p_surface = 'entity_form' or (p_surface = 'onboarding' and p_screen_key = 'identity')) then
    raise check_violation using message = 'her names are asked on her identity screen';
  end if;
  if p_surface = 'onboarding' then
    if p_screen_key is null or not (
         exists (select 1 from private.system_profile_fields() s where s.screen = p_screen_key)
         or (private.is_uuid_text(p_screen_key)
             and exists (select 1 from public.intake_screens s
                          where s.id = p_screen_key::uuid and s.org_id = actor_org
                            and not s.is_archived))) then
      raise no_data_found using message = 'no such screen';
    end if;
  elsif p_screen_key is not null then
    raise check_violation using message = 'only an onboarding placement names a screen';
  end if;
  if field.question_type in ('file_upload', 'signature') and p_surface = 'entity_form' then
    raise check_violation using message = 'a file or a signature is asked of her only';
  end if;
  if exists (select 1 from public.field_placements where field_id = p_field_id and surface = p_surface) then
    raise unique_violation using message = 'the field is already asked there';
  end if;

  insert into public.field_placements (org_id, field_id, surface, screen_key, sort_order, required)
  values (actor_org, p_field_id, p_surface, p_screen_key,
          coalesce((select max(p.sort_order) + 1 from public.field_placements p
                     where p.org_id = actor_org and p.surface = p_surface
                       and p.screen_key is not distinct from p_screen_key), 0),
          coalesce(p_required, field.default_required))
  returning id into saved_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.field_place', 'profile_field', p_field_id,
          jsonb_build_object('placement_id', saved_id, 'surface', p_surface, 'screen', p_screen_key));
  return saved_id;
end;
$function$;

create or replace function private.intake_flow_order_problem(p_org_id uuid, p_steps text[])
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with step as (
    select value, case when value ~ '^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                       then substr(value, 8)::uuid end as screen_id
      from unnest(coalesce(p_steps, array[]::text[])) value
  )
  select case
    when (select count(*) from step) > 200 then 'too_many'
    when exists (select 1 from step where value is null) then 'unknown_step'
    when (select count(distinct value) from step) <> (select count(*) from step) then 'repeated'
    when exists (select 1 from step
                  where value = any (array['summary', 'terms-intro', 'terms', 'authorization'])) then 'fixed_end'
    when exists (select 1 from step
                  where not exists (select 1 from private.system_profile_fields() s where s.screen = step.value)
                    and not exists (select 1 from public.intake_screens i
                                     where i.id = step.screen_id and i.org_id = p_org_id)) then 'unknown_step'
    when exists (select 1 from step
                   join public.intake_screens i on i.id = step.screen_id and i.org_id = p_org_id
                  where i.is_archived) then 'archived_screen'
  end;
$function$;

create or replace function public.save_placement(p_placement_id uuid, p_required boolean, p_label_override jsonb DEFAULT NULL::jsonb, p_help_override jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := private.require_question_builder();
  placement public.field_placements;
  field public.profile_fields;
  clean_label jsonb := nullif(nullif(p_label_override, 'null'::jsonb), '{}'::jsonb);
  clean_help jsonb := nullif(nullif(p_help_override, 'null'::jsonb), '{}'::jsonb);
  new_required boolean;
begin
  select p.* into placement from public.field_placements p where p.id = p_placement_id and p.org_id = actor_org;
  if placement.id is null then
    raise no_data_found using message = 'no such placement';
  end if;
  select * into field from public.profile_fields where id = placement.field_id;
  if (clean_label is not null and not private.localized_text_valid(clean_label))
     or (clean_help is not null and not private.localized_text_valid(clean_help)) then
    raise check_violation using message = 'a wording is text in the five languages';
  end if;
  new_required := coalesce(p_required, placement.required);
  if field.kind = 'builtin' and placement.surface <> 'entity_form' then
    -- The field that stands for an app question carries its required flag,
    -- on her onboarding and her season form alike; the other parts of a
    -- split field follow the app's own rules.
    if private.question_system_key(private.system_key_question(field.system_key)) = field.system_key then
      if new_required is distinct from placement.required then
        perform public.save_builtin_question_required(private.system_key_question(field.system_key), new_required);
      end if;
      select p.required into new_required from public.field_placements p where p.id = p_placement_id;
    else
      new_required := false;
    end if;
  end if;
  if placement.surface = 'entity_form' and field.system_key = any (private.entity_form_always_asked()) then
    new_required := true;
  end if;
  update public.field_placements
     set required = new_required, label_override = clean_label, help_override = clean_help, updated_at = now()
   where id = p_placement_id;
  -- The field names only: the wording is in the row.
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.placement_save', 'profile_field', placement.field_id,
          jsonb_build_object('placement_id', p_placement_id, 'surface', placement.surface,
                             'required', new_required,
                             'label_override', coalesce((select jsonb_agg(k order by k) from jsonb_object_keys(clean_label) k), '[]'::jsonb),
                             'help_override', coalesce((select jsonb_agg(k order by k) from jsonb_object_keys(clean_help) k), '[]'::jsonb)));
end;
$function$;

create or replace function private.referral_private_fields(p_referral_id uuid)
 RETURNS TABLE(referred_phone text, referred_email text, notes text, intake_answers jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    public.decrypt_field(referral.referred_phone),
    public.decrypt_field(referral.referred_email),
    public.decrypt_field(referral.notes),
    -- Her season count only (RAPP-666): her answers are by field, each read at
    -- its field's level.
    nullif(public.decrypt_field(referral.intake_answers), '')::jsonb
  from public.entity_referrals as referral
  where referral.id = p_referral_id
    and referral.org_id = (select public.current_org_id())
    and (
      referral.collaborating_entity_id = (select public.current_collaborating_entity_id())
      or (select public.has_permission('referrals.manage'))
    );
$function$;

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
    ('profile_answers', 'profile_id', 'purge', 'Which intake questions were answered, and by whom, until RAPP-666 drops them. Anonymizing deletes them.'),
    ('seasons', null, 'not_personal', 'The organization''s seasons.'),
    ('authorization_versions', null, 'not_personal', 'The organization''s published authorization texts.'),
    ('app_terms_versions', null, 'not_personal', 'The organization''s app terms texts, draft and published.'),
    ('authorization_signatures', 'profile_id', 'purge', 'Her signed or paper authorizations, with her drawn signature.'),
    ('authorization_consent_events', 'profile_id', 'purge', 'Each consent she gave or withdrew.'),
    ('season_answers', 'profile_id', 'purge', 'Her registration answers, one row per season, until RAPP-666 drops them. Anonymizing deletes them.'),
    ('walk_in_signings', null, 'retain_limited', 'A walk-in''s tablet signing until staff confirm it; purged after 60 days.'),
    ('intake_screens', null, 'not_personal', 'Registration screens staff built.'),
    ('profile_sections', null, 'not_personal', 'Sections of the player profile layout.'),
    ('profile_fields', null, 'not_personal', 'The pieces of information the profile holds, and who created each.'),
    ('field_placements', null, 'not_personal', 'Where each piece of information is asked.'),
    ('custom_question_options', null, 'not_personal', 'Options of those questions.'),
    ('intake_builtin_screens', null, 'not_personal', 'Staff wording of the built-in onboarding screens and which are hidden.'),
    ('intake_flow_orders', null, 'not_personal', 'The order of the onboarding screens staff arranged.'),
    ('intake_state_presets', null, 'not_personal', 'Organization presets for which questions are asked.'),
    ('custom_answers', 'profile_id', 'purge', 'Every answer of her record, the app''s fields and the team''s. Anonymizing deletes them all and keeps only her birth year.'),
    ('referral_custom_answers', null, 'retain_limited', 'Extra answers sent with a referral; moved to her profile when she is invited, or purged with the referral.'),
    ('custom_question_states', 'profile_id', 'purge', 'Which fields staff chose to ask or not ask her, the app''s and the team''s.'),
    ('participant_search_documents', 'profile_id', 'purge', 'Her names and her Normal and Personal text answers, indexed for the participants search.'),
    ('staff_notifications', null, 'not_personal', 'The team''s bell: one row per team member; names render live from the source row and params hold no personal value.')
  ) as disposition(table_name, participant_column, disposition, reason);
$function$;
