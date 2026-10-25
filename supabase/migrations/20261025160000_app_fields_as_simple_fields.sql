-- The app's fields become simple fields with system keys (RAPP-660, D1, D4, D5).
--
-- WHY
--
-- Fabián, 2026-10-25: Dades de les jugadores decides which data Ramassà
-- gathers, the kind of answer for each and how private it is, for every field,
-- the app's own included. This is step 1 of 7 (RAPP-660 to RAPP-666): expand.
-- The app's fields get the shape a staff field has, so the next steps can move
-- their answers, writers and readers onto one model. Nothing reads the new
-- shape yet: the apps keep asking and showing the app's fields the way they do
-- today.
--
-- WHAT CHANGES
--
--   1. `profile_fields.builtin_key` becomes `system_key` (D1): a stable name a
--      feature looks up (`date_of_birth`, `nationality`, `city`...), still
--      unique per organization. It says nothing about what can be edited.
--      `kind` stays until RAPP-664 stops reading it.
--   2. The composite fields are split into simple ones (D4), each with its own
--      system key, type and privacy level:
--        document         -> document_type (one choice), document_number
--                            (short text, Sensitive), document_name (short
--                            text, shown when the type is `other`)
--        dependents       -> has_dependents (one choice, yes or no) and
--                            num_dependents (whole number 1 to 15, shown on yes)
--        applicant_status -> applicant_status (one choice) and
--                            applicant_status_details (long text, shown on other)
--        specific_needs   -> specific_needs (several choices) and
--                            specific_needs_details (long text)
--      The first part keeps the field's id, name, placements and required
--      flag; the other parts sit right after it in its section and on every
--      surface it is placed on (the entity form only where the referral form
--      asks that part). Parts are never required on a placement: the app's own
--      rule ("a number unless the type is none") stays in the app until her
--      phone renders the fields (RAPP-663).
--   3. Every app field takes the type of what it stores: `country` for her
--      nationality, `municipality` for her municipality, `item_list` for the
--      supporting organizations, short text for her place of birth (free
--      text today), one choice for the document type, the sizes and the
--      applicant status, several choices for the specific needs.
--   4. Options carry a stable `key` (D5): the string the app stores today
--      (`nie`, `other`, `S`, `38`...), unique per field. The app fields'
--      options are seeded from the enums of `schemas/onboarding.ts`,
--      `schemas/season.ts` and `schemas/support-needs.ts`, labelled with the
--      `onboarding` translations, with any wording or hiding staff set on the
--      app question (`builtin_question_overrides.option_overrides`).
--   5. `private.write_custom_answer` accepts every field but her names (D2);
--      Sensitive answers stay encrypted. Its callers still pass Ramassà
--      fields only: RAPP-661 moves the app's writers onto it.
--   6. Every function that matched fields by `builtin_key` matches them by
--      `system_key`, through the app question each system field belongs to
--      (`private.system_key_question`). The catalog and the setup file name
--      the key `system_key` and send each option's `key`; an older setup
--      file that names `builtin_key` (or the composite `document` and
--      `dependents`) still imports.
--
-- The seeded onboarding asks the same questions, on the same screens, in the
-- same order: the new parts sit next to the field they came from.
--
-- Docs: https://www.postgresql.org/docs/17/sql-altertable.html (RENAME COLUMN,
-- RENAME CONSTRAINT), https://www.postgresql.org/docs/17/sql-insert.html (ON
-- CONFLICT with a partial unique index), https://supabase.com/docs/guides/database/functions
-- (security definer functions with an empty search path).

-- 1. One key name -------------------------------------------------------------------------------------------

alter table public.profile_fields rename column builtin_key to system_key;
alter table public.profile_fields
  rename constraint profile_fields_one_builtin_per_org to profile_fields_one_system_key_per_org;
alter table public.profile_fields
  rename constraint profile_fields_builtin_key_iff_builtin to profile_fields_system_key_iff_builtin;
-- Checked again below, once the composite keys are renamed.
alter table public.profile_fields drop constraint profile_fields_builtin_key_check;

comment on column public.profile_fields.system_key is
  'A stable name features look up (date_of_birth, nationality, city...), unique per organization (RAPP-660). It decides nothing about what can be edited.';

-- 2. The app's fields ---------------------------------------------------------------------------------------

-- Every field the app starts with: its system key, the field it is a part of
-- (null for a whole field or the first part), the app question it belongs to,
-- its section, type, privacy level, name and settings.
create function private.system_profile_fields()
returns table (system_key text, part_of text, question text, section_key text, question_type text,
               privacy text, label jsonb, settings jsonb, sort_order integer)
language sql
immutable
set search_path = ''
as $$
  select f.system_key, f.part_of, f.question, f.section_key, f.question_type, f.privacy, f.label,
         f.settings, (row_number() over (partition by f.section_key order by f.position) - 1)::integer
    from (values
      -- system-profile-fields:start
      ('first_name', null, 'first_name', 'identity', 'short_text', 'normal', '{"ca": "Nom", "es": "Nombre", "en": "First name", "ar": "الاسم", "fa": "نام"}'::jsonb, '{}'::jsonb, 1),
      ('last_name', null, 'last_name', 'identity', 'short_text', 'normal', '{"ca": "Cognoms", "es": "Apellidos", "en": "Last name", "ar": "اسم العائلة", "fa": "نام خانوادگی"}'::jsonb, '{}'::jsonb, 2),
      ('date_of_birth', null, 'date_of_birth', 'origin', 'date', 'personal', '{"ca": "Data de naixement", "es": "Fecha de nacimiento", "en": "Date of birth", "ar": "تاريخ الميلاد", "fa": "تاریخ تولد"}'::jsonb, '{}'::jsonb, 3),
      ('place_of_birth', null, 'place_of_birth', 'origin', 'short_text', 'personal', '{"ca": "Lloc de naixement", "es": "Lugar de nacimiento", "en": "Place of birth", "ar": "مكان الميلاد", "fa": "محل تولد"}'::jsonb, '{}'::jsonb, 4),
      ('nationality', null, 'nationality', 'origin', 'country', 'personal', '{"ca": "Nacionalitat", "es": "Nacionalidad", "en": "Nationality", "ar": "الجنسية", "fa": "ملیت"}'::jsonb, '{}'::jsonb, 5),
      ('document_type', null, 'document', 'identity', 'single_choice', 'personal', '{"ca": "Tipus de document", "es": "Tipo de documento", "en": "Document type", "ar": "نوع الوثيقة", "fa": "نوع مدرک"}'::jsonb, '{}'::jsonb, 6),
      ('document_number', 'document_type', 'document', 'identity', 'short_text', 'sensitive', '{"ca": "Número de document", "es": "Número de documento", "en": "Document number", "ar": "رقم الوثيقة", "fa": "شماره مدرک"}'::jsonb, '{}'::jsonb, 7),
      ('document_name', 'document_type', 'document', 'identity', 'short_text', 'personal', '{"ca": "Nom del document", "es": "Nombre del documento", "en": "Document name", "ar": "اسم الوثيقة", "fa": "نام مدرک"}'::jsonb, '{}'::jsonb, 8),
      ('phone', null, 'phone', 'contact', 'phone', 'sensitive', '{"ca": "Telèfon", "es": "Teléfono", "en": "Phone", "ar": "الهاتف", "fa": "تلفن"}'::jsonb, '{}'::jsonb, 9),
      ('address', null, 'address', 'contact', 'short_text', 'sensitive', '{"ca": "Adreça", "es": "Dirección", "en": "Address", "ar": "العنوان", "fa": "نشانی"}'::jsonb, '{}'::jsonb, 10),
      ('city', null, 'city', 'contact', 'municipality', 'personal', '{"ca": "Municipi", "es": "Municipio", "en": "Municipality", "ar": "البلدية", "fa": "شهر"}'::jsonb, '{}'::jsonb, 11),
      ('postal_code', null, 'postal_code', 'contact', 'short_text', 'sensitive', '{"ca": "Codi postal", "es": "Código postal", "en": "Postal code", "ar": "الرمز البريدي", "fa": "کد پستی"}'::jsonb, '{}'::jsonb, 12),
      ('reference_entity', null, 'reference_entity', 'contact', 'short_text', 'normal', '{"ca": "Has arribat a través d''alguna entitat?", "es": "¿Has llegado a través de alguna entidad?", "en": "Did an organization refer you?", "ar": "هل وصلتِ عن طريق جمعية أو منظمة؟", "fa": "آیا از طریق نهاد یا سازمانی معرفی شده‌اید؟"}'::jsonb, '{}'::jsonb, 13),
      ('reference_contact_name', null, 'reference_contact_name', 'contact', 'short_text', 'personal', '{"ca": "Persona de contacte a l''entitat", "es": "Persona de contacto en la entidad", "en": "Contact person at the organization", "ar": "الشخص المسؤول في الجهة", "fa": "فرد رابط در آن نهاد"}'::jsonb, '{}'::jsonb, 14),
      ('has_dependents', null, 'dependents', 'contact', 'single_choice', 'personal', '{"ca": "Tens persones al teu càrrec?", "es": "¿Tienes personas a tu cargo?", "en": "Do you have dependents?", "ar": "هل لديكِ أشخاص تحت رعايتك؟", "fa": "آیا کسی تحت سرپرستی شماست؟"}'::jsonb, '{}'::jsonb, 15),
      ('num_dependents', 'has_dependents', 'dependents', 'contact', 'number', 'personal', '{"ca": "Nombre de persones a càrrec", "es": "Número de personas a cargo", "en": "Number of dependents", "ar": "عدد الأشخاص المعالين", "fa": "تعداد افراد تحت تکفل"}'::jsonb, '{"integer": true, "min": 1, "max": 15}'::jsonb, 16),
      ('clothing_size', null, 'clothing_size', 'sizes', 'single_choice', 'normal', '{"ca": "Talla de roba", "es": "Talla de ropa", "en": "Clothing size", "ar": "مقاس الملابس", "fa": "سایز لباس"}'::jsonb, '{}'::jsonb, 17),
      ('shoe_size', null, 'shoe_size', 'sizes', 'single_choice', 'normal', '{"ca": "Número de peu (EU)", "es": "Número de pie (EU)", "en": "Shoe size (EU)", "ar": "مقاس الحذاء (EU)", "fa": "سایز کفش (EU)"}'::jsonb, '{}'::jsonb, 18),
      ('applicant_status', null, 'applicant_status', 'situation', 'single_choice', 'sensitive', '{"ca": "Condició per accedir al projecte", "es": "Condición para acceder al proyecto", "en": "Status for joining the project", "ar": "الوضع للانضمام إلى المشروع", "fa": "وضعیت برای پیوستن به پروژه"}'::jsonb, '{}'::jsonb, 19),
      ('applicant_status_details', 'applicant_status', 'applicant_status', 'situation', 'long_text', 'sensitive', '{"ca": "Detalls de la condició", "es": "Detalles de la condición", "en": "Status details", "ar": "تفاصيل الوضع", "fa": "جزئیات وضعیت"}'::jsonb, '{}'::jsonb, 20),
      ('supporting_entities', null, 'supporting_entities', 'support', 'item_list', 'personal', '{"ca": "Altres entitats o programes que li donen suport", "es": "Otras entidades o programas que le dan apoyo", "en": "Other organizations or programmes that support her", "ar": "جمعيات أو برامج أخرى تدعمها", "fa": "سازمان‌ها یا برنامه‌های دیگری که از او حمایت می‌کنند"}'::jsonb, '{"max_items": 20}'::jsonb, 21),
      ('childcare_need', null, 'childcare_need', 'support', 'yes_no_maybe', 'personal', '{"ca": "Necessita servei de cangur durant els entrenaments?", "es": "¿Necesita servicio de canguro durante los entrenamientos?", "en": "Does she need childcare during training?", "ar": "هل تحتاجين إلى رعاية الأطفال أثناء التدريبات؟", "fa": "آیا در طول تمرین‌ها به نگهداری از کودک نیاز دارد؟"}'::jsonb, '{}'::jsonb, 22),
      ('specific_needs', null, 'specific_needs', 'health_needs', 'multiple_choice', 'sensitive', '{"ca": "Necessitats específiques", "es": "Necesidades específicas", "en": "Specific needs", "ar": "احتياجات خاصة", "fa": "نیازهای خاص"}'::jsonb, '{}'::jsonb, 23),
      ('specific_needs_details', 'specific_needs', 'specific_needs', 'health_needs', 'long_text', 'sensitive', '{"ca": "Detalls de les necessitats específiques", "es": "Detalles de las necesidades específicas", "en": "Specific needs details", "ar": "تفاصيل الاحتياجات الخاصة", "fa": "جزئیات نیازهای خاص"}'::jsonb, '{}'::jsonb, 24)
      -- system-profile-fields:end
    ) as f(system_key, part_of, question, section_key, question_type, privacy, label, settings, position);
$$;

create function private.system_field_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(f.system_key order by f.section_key, f.sort_order), array[]::text[])
    from private.system_profile_fields() f;
$$;

-- The app question a system field belongs to (`document_number` -> `document`).
-- The question keys the required list, the per-player choices and
-- `profile_answers` still use until RAPP-666.
create function private.system_key_question(p_system_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select f.question from private.system_profile_fields() f where f.system_key = p_system_key;
$$;

-- The field that stands for an app question: the whole field, or its first part.
create function private.question_system_key(p_question text)
returns text
language sql
immutable
set search_path = ''
as $$
  select f.system_key from private.system_profile_fields() f
   where f.question = p_question and f.part_of is null;
$$;

-- A system field is required where she answers it when its question is on the
-- organization's required list. Only the field that stands for the question
-- carries it; the other parts follow the app's own rules.
create function private.system_field_required(p_system_key text, p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.system_profile_fields() f
                  where f.system_key = p_system_key and f.part_of is null
                    and f.question = any (private.required_intake_questions(p_org_id)));
$$;

-- The system fields the entity referral form can ask, in its order
-- (`createReferralSchema`): the document number and the needs' text too.
create function private.system_entity_form_fields()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    -- system-entity-form-fields:start
    'first_name', 'last_name', 'phone', 'date_of_birth', 'nationality', 'document_type', 'document_number',
    'city', 'applicant_status', 'supporting_entities', 'reference_contact_name', 'childcare_need',
    'specific_needs', 'specific_needs_details'
    -- system-entity-form-fields:end
  ]::text[];
$$;

-- The options of the app's choice fields: the stored string as the key, the
-- `onboarding` translation as the label.
create function private.system_field_options()
returns table (system_key text, key text, label jsonb, sort_order integer)
language sql
immutable
set search_path = ''
as $$
  select o.system_key, o.key, o.label,
         (row_number() over (partition by o.system_key order by o.position) - 1)::integer
    from (values
      -- system-field-options:start
      ('document_type', 'nie', '{"ca": "NIE", "es": "NIE", "en": "NIE", "ar": "NIE", "fa": "NIE"}'::jsonb, 1),
      ('document_type', 'passport', '{"ca": "Passaport", "es": "Pasaporte", "en": "Passport", "ar": "جواز سفر", "fa": "گذرنامه"}'::jsonb, 2),
      ('document_type', 'other', '{"ca": "Un altre", "es": "Otro", "en": "Other", "ar": "أخرى", "fa": "دیگر"}'::jsonb, 3),
      ('document_type', 'none', '{"ca": "No en tinc", "es": "No tengo", "en": "I don''t have one", "ar": "ليس لدي", "fa": "ندارم"}'::jsonb, 4),
      ('has_dependents', 'yes', '{"ca": "Sí", "es": "Sí", "en": "Yes", "ar": "نعم", "fa": "بله"}'::jsonb, 5),
      ('has_dependents', 'no', '{"ca": "No", "es": "No", "en": "No", "ar": "لا", "fa": "نه"}'::jsonb, 6),
      ('clothing_size', 'XS', '{"ca": "XS", "es": "XS", "en": "XS", "ar": "XS", "fa": "XS"}'::jsonb, 7),
      ('clothing_size', 'S', '{"ca": "S", "es": "S", "en": "S", "ar": "S", "fa": "S"}'::jsonb, 8),
      ('clothing_size', 'M', '{"ca": "M", "es": "M", "en": "M", "ar": "M", "fa": "M"}'::jsonb, 9),
      ('clothing_size', 'L', '{"ca": "L", "es": "L", "en": "L", "ar": "L", "fa": "L"}'::jsonb, 10),
      ('clothing_size', 'XL', '{"ca": "XL", "es": "XL", "en": "XL", "ar": "XL", "fa": "XL"}'::jsonb, 11),
      ('clothing_size', 'XXL', '{"ca": "XXL", "es": "XXL", "en": "XXL", "ar": "XXL", "fa": "XXL"}'::jsonb, 12),
      ('shoe_size', '34', '{"ca": "34", "es": "34", "en": "34", "ar": "34", "fa": "34"}'::jsonb, 13),
      ('shoe_size', '35', '{"ca": "35", "es": "35", "en": "35", "ar": "35", "fa": "35"}'::jsonb, 14),
      ('shoe_size', '36', '{"ca": "36", "es": "36", "en": "36", "ar": "36", "fa": "36"}'::jsonb, 15),
      ('shoe_size', '37', '{"ca": "37", "es": "37", "en": "37", "ar": "37", "fa": "37"}'::jsonb, 16),
      ('shoe_size', '38', '{"ca": "38", "es": "38", "en": "38", "ar": "38", "fa": "38"}'::jsonb, 17),
      ('shoe_size', '39', '{"ca": "39", "es": "39", "en": "39", "ar": "39", "fa": "39"}'::jsonb, 18),
      ('shoe_size', '40', '{"ca": "40", "es": "40", "en": "40", "ar": "40", "fa": "40"}'::jsonb, 19),
      ('shoe_size', '41', '{"ca": "41", "es": "41", "en": "41", "ar": "41", "fa": "41"}'::jsonb, 20),
      ('shoe_size', '42', '{"ca": "42", "es": "42", "en": "42", "ar": "42", "fa": "42"}'::jsonb, 21),
      ('shoe_size', '43', '{"ca": "43", "es": "43", "en": "43", "ar": "43", "fa": "43"}'::jsonb, 22),
      ('shoe_size', '44', '{"ca": "44", "es": "44", "en": "44", "ar": "44", "fa": "44"}'::jsonb, 23),
      ('shoe_size', '45', '{"ca": "45", "es": "45", "en": "45", "ar": "45", "fa": "45"}'::jsonb, 24),
      ('shoe_size', '46', '{"ca": "46", "es": "46", "en": "46", "ar": "46", "fa": "46"}'::jsonb, 25),
      ('applicant_status', 'asylum_seeker', '{"ca": "Sol·licitant d''asil", "es": "Solicitante de asilo", "en": "Asylum seeker", "ar": "طالبة لجوء", "fa": "پناه‌جو"}'::jsonb, 26),
      ('applicant_status', 'refugee', '{"ca": "Persona refugiada", "es": "Persona refugiada", "en": "Refugee", "ar": "لاجئة", "fa": "پناهنده"}'::jsonb, 27),
      ('applicant_status', 'migrant', '{"ca": "Persona migrada", "es": "Persona migrante", "en": "Migrant", "ar": "مهاجرة", "fa": "مهاجر"}'::jsonb, 28),
      ('applicant_status', 'other', '{"ca": "Altres", "es": "Otros", "en": "Other", "ar": "غير ذلك", "fa": "سایر"}'::jsonb, 29),
      ('applicant_status', 'prefer_not_to_say', '{"ca": "Prefereixo no contestar", "es": "Prefiero no contestar", "en": "Prefer not to say", "ar": "أفضّل عدم الإجابة", "fa": "ترجیح می‌دهم پاسخ ندهم"}'::jsonb, 30),
      ('specific_needs', 'accessibility', '{"ca": "Accessibilitat", "es": "Accesibilidad", "en": "Accessibility", "ar": "إمكانية الوصول", "fa": "دسترس‌پذیری"}'::jsonb, 31),
      ('specific_needs', 'health', '{"ca": "Salut", "es": "Salud", "en": "Health", "ar": "الصحة", "fa": "سلامت"}'::jsonb, 32),
      ('specific_needs', 'communication', '{"ca": "Comunicació", "es": "Comunicación", "en": "Communication", "ar": "التواصل", "fa": "ارتباط"}'::jsonb, 33),
      ('specific_needs', 'wellbeing', '{"ca": "Benestar", "es": "Bienestar", "en": "Wellbeing", "ar": "الرفاه النفسي", "fa": "بهزیستی"}'::jsonb, 34),
      ('specific_needs', 'other', '{"ca": "Una altra circumstància", "es": "Otra circunstancia", "en": "Other circumstances", "ar": "ظروف أخرى", "fa": "شرایط دیگر"}'::jsonb, 35),
      ('specific_needs', 'none', '{"ca": "No necessito cap suport específic", "es": "No necesito ningún apoyo específico", "en": "I do not need any specific support", "ar": "لا أحتاج إلى دعم محدد", "fa": "به حمایت خاصی نیاز ندارم"}'::jsonb, 36)
      -- system-field-options:end
    ) as o(system_key, key, label, position);
$$;

-- A part shown only on one answer of its first part (D4).
create function private.system_field_conditions()
returns table (system_key text, gate_key text, option_key text)
language sql
immutable
set search_path = ''
as $$
  select c.system_key, c.gate_key, c.option_key
    from (values
      ('document_name', 'document_type', 'other'),
      ('num_dependents', 'has_dependents', 'yes'),
      ('applicant_status_details', 'applicant_status', 'other')
    ) as c(system_key, gate_key, option_key);
$$;

-- A setup file names an app field by `system_key`, or by `builtin_key` when it
-- was exported before RAPP-660, with the two composite questions by their old
-- name.
create function private.setup_system_key(p_field jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case coalesce(p_field ->> 'system_key', p_field ->> 'builtin_key')
           when 'document' then 'document_type'
           when 'dependents' then 'has_dependents'
           else coalesce(p_field ->> 'system_key', p_field ->> 'builtin_key') end;
$$;

revoke all on function private.system_profile_fields() from public, anon, authenticated;
revoke all on function private.system_field_keys() from public, anon, authenticated;
revoke all on function private.system_key_question(text) from public, anon, authenticated;
revoke all on function private.question_system_key(text) from public, anon, authenticated;
revoke all on function private.system_field_required(text, uuid) from public, anon, authenticated;
revoke all on function private.system_entity_form_fields() from public, anon, authenticated;
revoke all on function private.system_field_options() from public, anon, authenticated;
revoke all on function private.system_field_conditions() from public, anon, authenticated;
revoke all on function private.setup_system_key(jsonb) from public, anon, authenticated;

-- The question-keyed lists these replace.
drop function private.builtin_profile_fields();
drop function private.builtin_entity_form_fields();

-- 3. Option keys --------------------------------------------------------------------------------------------

alter table public.custom_question_options
  add column key text check (key is null or key ~ '^[A-Za-z0-9_]{1,64}$');
create unique index custom_question_options_one_key_per_field
  on public.custom_question_options (question_id, key) where key is not null;
comment on column public.custom_question_options.key is
  'A stable name for the option (the string the app stored: nie, other, S, 38...), unique per field; null for an option staff wrote (RAPP-660).';

-- 4. Placing the parts of a split field ---------------------------------------------------------------------

-- Every part of a split field goes on each surface its first part is placed
-- on (the entity form only when the referral form asks that part), right
-- after the fields of the same question already there. Idempotent.
create function private.place_system_field_parts(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  part record;
  spot record;
  after_order integer;
begin
  for part in
    select f.id, f.system_key, s.part_of, s.question
      from private.system_profile_fields() s
      join public.profile_fields f on f.org_id = p_org_id and f.system_key = s.system_key
     where s.part_of is not null
     order by s.question, s.sort_order
  loop
    for spot in
      select p.surface, p.screen_key
        from public.field_placements p
        join public.profile_fields head on head.id = p.field_id
       where head.org_id = p_org_id and head.system_key = part.part_of
         and (p.surface <> 'entity_form' or part.system_key = any (private.system_entity_form_fields()))
         and not exists (select 1 from public.field_placements mine
                          where mine.field_id = part.id and mine.surface = p.surface)
    loop
      select max(p.sort_order) into after_order
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id
       where p.org_id = p_org_id and p.surface = spot.surface
         and p.screen_key is not distinct from spot.screen_key
         and private.system_key_question(f.system_key) = part.question;
      update public.field_placements
         set sort_order = sort_order + 1, updated_at = now()
       where org_id = p_org_id and surface = spot.surface
         and screen_key is not distinct from spot.screen_key and sort_order > after_order;
      insert into public.field_placements (org_id, field_id, surface, screen_key, sort_order, required)
      values (p_org_id, part.id, spot.surface, spot.screen_key, after_order + 1, false);
    end loop;
  end loop;
end;
$$;
revoke all on function private.place_system_field_parts(uuid) from public, anon, authenticated;

-- 5. Every organization: the fields, their options, placements and conditions -------------------------------

-- Idempotent: what exists stays as staff left it.
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

  -- The options, with the wording or hiding staff gave the app question.
  insert into public.custom_question_options (org_id, question_id, key, label, sort_order, is_archived)
  select p_org_id, f.id, o.key,
         o.label || case when jsonb_typeof(o_override.value -> 'label') = 'object'
                         then o_override.value -> 'label' else '{}'::jsonb end,
         o.sort_order, coalesce((o_override.value ->> 'hidden')::boolean, false)
    from private.system_field_options() o
    join public.profile_fields f on f.org_id = p_org_id and f.system_key = o.system_key
    left join public.builtin_question_overrides q
      on q.org_id = p_org_id and q.question = private.system_key_question(o.system_key)
    left join lateral (select q.option_overrides -> o.key as value) o_override on true
  on conflict (question_id, key) where key is not null do nothing;

  -- Where the app asks them today: her wizard screen, each season, the entity form.
  insert into public.field_placements (org_id, field_id, surface, screen_key, sort_order, required)
  select p_org_id, f.id, 'onboarding', w.screen, (q.position - 1)::integer,
         private.system_field_required(f.system_key, p_org_id)
    from private.wizard_screen_questions() w
    cross join lateral unnest(w.questions) with ordinality as q(question, position)
    join public.profile_fields f on f.org_id = p_org_id and f.system_key = private.question_system_key(q.question)
  on conflict (field_id, surface) do nothing;

  insert into public.field_placements (org_id, field_id, surface, sort_order, required)
  select p_org_id, f.id, 'season', (q.position - 1)::integer,
         private.system_field_required(f.system_key, p_org_id)
    from unnest(private.builtin_season_fields()) with ordinality as q(question, position)
    join public.profile_fields f on f.org_id = p_org_id and f.system_key = private.question_system_key(q.question)
  on conflict (field_id, surface) do nothing;

  -- The entity form asks her name always; it requires nothing else (RAPP-300).
  -- Its first parts only: the other parts follow them below.
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
revoke all on function private.seed_profile_layout(uuid) from public, anon, authenticated;

-- The organizations that exist: the composite fields keep their id as their
-- first part, every app field takes its type, the other parts are added next
-- to their first part in its section, then the seed adds what is missing.
update public.profile_fields set system_key = 'document_type', updated_at = now()
 where system_key = 'document';
update public.profile_fields set system_key = 'has_dependents', updated_at = now()
 where system_key = 'dependents';
update public.profile_fields f
   set question_type = s.question_type, privacy = s.privacy, settings = s.settings, updated_at = now()
  from private.system_profile_fields() s
 where f.system_key = s.system_key
   and (f.question_type, f.privacy, f.settings) is distinct from (s.question_type, s.privacy, s.settings);

alter table public.profile_fields add constraint profile_fields_system_key_check
  check (system_key is null or system_key = any (private.system_field_keys()));

do $$
declare
  org record;
  part record;
  head_section uuid;
  after_order integer;
begin
  for org in select o.id from public.organizations o loop
    for part in
      select s.* from private.system_profile_fields() s
       where s.part_of is not null
         and not exists (select 1 from public.profile_fields f
                          where f.org_id = org.id and f.system_key = s.system_key)
       order by s.question, s.sort_order
    loop
      select h.section_id into head_section from public.profile_fields h
       where h.org_id = org.id and h.system_key = part.part_of;
      continue when head_section is null;
      select max(f.sort_order) into after_order from public.profile_fields f
       where f.org_id = org.id and f.section_id = head_section
         and private.system_key_question(f.system_key) = part.question;
      update public.profile_fields
         set sort_order = sort_order + 1, updated_at = now()
       where section_id = head_section and sort_order > after_order;
      insert into public.profile_fields (
        org_id, section_id, kind, system_key, question_type, label, privacy, default_required, settings, sort_order)
      values (org.id, head_section, 'builtin', part.system_key, part.question_type, part.label, part.privacy,
              false, part.settings, after_order + 1);
    end loop;
    perform private.seed_profile_layout(org.id);
  end loop;
end;
$$;

-- 6. The functions that matched fields by builtin_key ---------------------------------------------------------

-- The catalog names the key system_key and sends each option's key.
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
    -- Ramassà screens. The fields each one asks are its placements, below.
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'intro', s.intro, 'after_screen', s.after_screen,
        'sort_order', s.sort_order, 'is_archived', s.is_archived)
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

-- The required list reaches the field that stands for each question.
CREATE OR REPLACE FUNCTION private.sync_builtin_placements_required(p_org_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  update public.field_placements p
     set required = private.system_field_required(f.system_key, p_org_id), updated_at = now()
    from public.profile_fields f
   where f.id = p.field_id and f.org_id = p_org_id and f.kind = 'builtin'
     and p.surface in ('onboarding', 'season')
     and p.required is distinct from private.system_field_required(f.system_key, p_org_id);
$function$;

-- Who gave each app answer, read at the level of the fields of its question.
CREATE OR REPLACE FUNCTION public.participant_profile_answers(p_profile_id uuid)
 RETURNS TABLE(question text, source text, answered_at timestamp with time zone, answered_by_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := (select public.current_org_id());
  sees_personal boolean := (select private.participant_permission(p_profile_id, 'participants.view_personal'));
  sees_sensitive boolean := (select private.participant_permission(p_profile_id, 'participants.view_sensitive'));
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view')) then
    raise insufficient_privilege using message = 'her answers need participants.view';
  end if;
  return query
  select a.question, a.source, a.answered_at,
         private.answer_author_name(a.answered_by, a.source, actor_org)
    from public.profile_answers a
    -- A question split into several fields reads at its strictest level, as
    -- the composite field did (the document is Sensitive for its number).
    left join lateral (
      select case when bool_or(pf.privacy = 'sensitive') then 'sensitive'
                  when bool_or(pf.privacy = 'personal') then 'personal'
                  when bool_or(pf.privacy = 'normal') then 'normal' end as privacy
        from public.profile_fields pf
       where pf.org_id = a.org_id and private.system_key_question(pf.system_key) = a.question) f on true
   where a.profile_id = p_profile_id
     and a.org_id = actor_org
     and (coalesce(f.privacy, 'normal') = 'normal'
          or (f.privacy = 'personal' and sees_personal)
          or (f.privacy = 'sensitive' and sees_sensitive))
   order by a.question;
end;
$function$;

-- Where each system field's answer travels in the referral payload.
drop function private.entity_form_payload_key(text);
create function private.entity_form_payload_key(p_system_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_system_key
    when 'first_name' then 'firstName'
    when 'last_name' then 'lastName'
    when 'phone' then 'phone'
    when 'date_of_birth' then 'dateOfBirth'
    when 'nationality' then 'nationality'
    when 'document_type' then 'documentType'
    when 'document_number' then 'documentNumber'
    when 'city' then 'city'
    when 'applicant_status' then 'applicantStatus'
    when 'supporting_entities' then 'supportingEntities'
    when 'reference_contact_name' then 'referenceContactName'
    when 'childcare_need' then 'childcareNeed'
    when 'specific_needs' then 'specificNeeds'
  end;
$$;
revoke all on function private.entity_form_payload_key(text) from public, anon, authenticated;

-- The referral form checks its required app fields by system key.
CREATE OR REPLACE FUNCTION private.check_entity_form_required(p_referral entity_referrals, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  item record;
  payload_key text;
  is_missing boolean;
begin
  for item in
    select f.id, f.kind, f.system_key, f.show_when_field_id, f.show_when_option_id
      from public.field_placements p
      join public.profile_fields f on f.id = p.field_id
     where p.org_id = p_referral.org_id and p.surface = 'entity_form' and p.required
       and not f.is_archived
  loop
    if item.kind = 'builtin' then
      payload_key := private.entity_form_payload_key(item.system_key);
      is_missing := payload_key is not null
        and private.custom_answer_is_empty(p_payload -> payload_key);
    else
      -- A condition that does not apply asks nothing.
      if item.show_when_field_id is not null
         and (p_payload -> 'fields' ->> item.show_when_field_id::text)
             is distinct from item.show_when_option_id::text then
        continue;
      end if;
      is_missing := not exists (
        select 1 from public.referral_custom_answers r
         where r.referral_id = p_referral.id and r.question_id = item.id);
    end if;
    if is_missing then
      raise check_violation using message = 'a required field of the referral form is missing';
    end if;
  end loop;
end;
$function$;

-- An app field goes on the entity form when the referral form asks it.
CREATE OR REPLACE FUNCTION public.place_field(p_field_id uuid, p_surface text, p_screen_key text DEFAULT NULL::text, p_required boolean DEFAULT NULL::boolean)
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
  if field.kind = 'builtin' and p_surface <> 'entity_form' then
    raise check_violation using message = 'the app asks a built-in field on its own screen';
  end if;
  if p_surface = 'onboarding' then
    if p_screen_key is null or not (
         exists (select 1 from private.wizard_screen_questions() w where w.screen = p_screen_key)
         or (private.is_uuid_text(p_screen_key)
             and exists (select 1 from public.intake_screens s
                          where s.id = p_screen_key::uuid and s.org_id = actor_org
                            and not s.is_archived))) then
      raise no_data_found using message = 'no such screen';
    end if;
  elsif p_screen_key is not null then
    raise check_violation using message = 'only an onboarding placement names a screen';
  end if;
  if field.kind = 'builtin' and p_surface = 'entity_form'
     and not (field.system_key = any (private.system_entity_form_fields())) then
    raise check_violation using message = 'the entity form does not ask this built-in field';
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

-- Her names never leave the entity form.
CREATE OR REPLACE FUNCTION public.remove_placement(p_placement_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := private.require_question_builder();
  placement public.field_placements;
begin
  select p.* into placement from public.field_placements p where p.id = p_placement_id and p.org_id = actor_org;
  if placement.id is null then
    raise no_data_found using message = 'no such placement';
  end if;
  if placement.surface <> 'entity_form'
     and exists (select 1 from public.profile_fields where id = placement.field_id and kind = 'builtin') then
    raise check_violation using message = 'the app asks a built-in field on its own screen';
  end if;
  -- A referral names her: the entity form always asks her names (RAPP-652).
  if placement.surface = 'entity_form'
     and exists (select 1 from public.profile_fields where id = placement.field_id
                    and system_key = any (private.entity_form_always_asked())) then
    raise check_violation using message = 'the entity form always asks her names';
  end if;
  delete from public.field_placements where id = p_placement_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.placement_remove', 'profile_field', placement.field_id,
          jsonb_build_object('placement_id', p_placement_id, 'surface', placement.surface,
                             'screen', placement.screen_key));
end;
$function$;

-- The required switch of an app field saves its question's flag.
CREATE OR REPLACE FUNCTION public.save_placement(p_placement_id uuid, p_required boolean, p_label_override jsonb DEFAULT NULL::jsonb, p_help_override jsonb DEFAULT NULL::jsonb)
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
    -- The field that stands for an app question carries its required flag;
    -- the other parts of a split field follow the app's own rules.
    if new_required is distinct from placement.required
       and private.question_system_key(private.system_key_question(field.system_key)) = field.system_key then
      perform public.save_builtin_question_required(private.system_key_question(field.system_key), new_required);
    end if;
    new_required := private.system_field_required(field.system_key, actor_org);
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

-- The setup file names the key system_key and carries each option's key.
CREATE OR REPLACE FUNCTION public.export_onboarding_setup(p_app_commit text DEFAULT NULL::text)
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
    'builtin_question_overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question', o.question, 'label', o.label, 'help', o.help, 'is_hidden', o.is_hidden,
        'option_overrides', o.option_overrides) order by o.question)
        from public.builtin_question_overrides o where o.org_id = actor_org), '[]'::jsonb),
    'builtin_screens', coalesce((
      select jsonb_agg(jsonb_build_object('screen', b.screen, 'texts', b.texts, 'is_hidden', b.is_hidden)
        order by b.screen)
        from public.intake_builtin_screens b where b.org_id = actor_org), '[]'::jsonb),
    'flow_order', (select to_jsonb(f.step_order) from public.intake_flow_orders f where f.org_id = actor_org),
    'required_questions', coalesce((
      select jsonb_agg(jsonb_build_object('question', r.question, 'is_required', r.is_required)
        order by r.question)
        from public.intake_required_questions r where r.org_id = actor_org), '[]'::jsonb),
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

-- An older setup file read as version 3 names no system key for its questions.
CREATE OR REPLACE FUNCTION private.onboarding_setup_as_version_3(p_document jsonb, p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  version integer := (p_document ->> 'schema_version')::integer;
  holders jsonb;
  converted jsonb;
begin
  if version = 3 then
    return p_document;
  end if;
  select coalesce(jsonb_object_agg(s ->> 'id', s ->> 'builtin_screen'), '{}'::jsonb) into holders
    from jsonb_array_elements(p_document -> 'screens') s
   where nullif(s ->> 'builtin_screen', '') is not null;

  converted := p_document || jsonb_build_object(
    'schema_version', 3,
    'screens', coalesce((
      select jsonb_agg(s - 'questions' - 'builtin_screen' order by ordinality)
        from jsonb_array_elements(p_document -> 'screens') with ordinality as listed(s, ordinality)
       where not holders ? (s ->> 'id')), '[]'::jsonb),
    'flow_order', case when jsonb_typeof(p_document -> 'flow_order') = 'array' then coalesce((
      select jsonb_agg(step order by ordinality)
        from jsonb_array_elements_text(p_document -> 'flow_order') with ordinality as listed(step, ordinality)
       where not (step like 'custom:%' and holders ? substr(step, 8))), '[]'::jsonb)
      else p_document -> 'flow_order' end);

  if version = 2 then
    return converted || jsonb_build_object('fields', coalesce((
      select jsonb_agg(f - 'legacy_screen_id' order by ordinality)
        from jsonb_array_elements(p_document -> 'fields') with ordinality as listed(f, ordinality)), '[]'::jsonb));
  end if;

  -- Version 1.
  return converted || (
    with question as (
      select q, s ->> 'id' as screen_id, holders ->> (s ->> 'id') as app_screen,
             coalesce((s ->> 'is_archived')::boolean, false) as screen_archived,
             array(select jsonb_array_elements_text(private.json_array_or_empty(q -> 'placements'))) as places,
             row_number() over (order by screen_order, question_order) as position
        from jsonb_array_elements(p_document -> 'screens') with ordinality as screens(s, screen_order),
             jsonb_array_elements(s -> 'questions') with ordinality as questions(q, question_order)
    ),
    section as (
      select sec.id, sec.key, sec.title, sec.sort_order
        from public.profile_sections sec where sec.org_id = p_org_id and sec.is_builtin
    ),
    placement as (
      select q ->> 'id' as field_id, 'onboarding' as surface, coalesce(app_screen, screen_id) as screen_key,
             q -> 'sort_order' as sort_order, coalesce((q ->> 'is_required')::boolean, false) as required
        from question
       where places && array['wizard', 'season']::text[] and not screen_archived
      union all
      select q ->> 'id', 'entity_form', null, q -> 'sort_order', false
        from question where 'entity_form' = any (places)
      union all
      select q ->> 'id', 'season', null, q -> 'sort_order', coalesce((q ->> 'is_required')::boolean, false)
        from question where 'season' = any (places)
    )
    select jsonb_build_object(
      'sections', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', section.id, 'key', section.key, 'title', section.title, 'sort_order', section.sort_order,
          'is_builtin', true) order by section.sort_order)
          from section), '[]'::jsonb),
      'fields', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', q ->> 'id',
          'section_id', (select section.id from section
                          where section.key = coalesce(private.app_screen_profile_section(app_screen), 'support')),
          'kind', 'custom', 'system_key', null,
          'question_type', q -> 'question_type', 'label', q -> 'label', 'help', q -> 'help',
          'privacy', q -> 'privacy', 'default_required', coalesce((q ->> 'is_required')::boolean, false),
          'settings', q -> 'settings',
          'show_when_field_id', q -> 'show_when_question_id', 'show_when_option_id', q -> 'show_when_option_id',
          'sort_order', 1000 + position, 'is_archived', coalesce((q ->> 'is_archived')::boolean, false),
          'options', private.json_array_or_empty(q -> 'options')) order by position)
          from question), '[]'::jsonb),
      'placements', coalesce((
        select jsonb_agg(jsonb_build_object(
          'field_id', field_id, 'surface', surface, 'screen_key', screen_key,
          'sort_order', sort_order, 'required', required,
          'label_override', null, 'help_override', null))
          from placement), '[]'::jsonb)));
end;
$function$;

-- The setup import finds app fields by system key, older files included.
CREATE OR REPLACE FUNCTION private.apply_onboarding_setup(p_document jsonb, p_org_id uuid, p_actor uuid)
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

  -- Built-in questions and screens.
  insert into public.builtin_question_overrides (org_id, question, label, help, is_hidden, option_overrides, updated_by)
  select p_org_id, o ->> 'question', private.json_value_or_null(o -> 'label'), private.json_value_or_null(o -> 'help'),
         coalesce((o ->> 'is_hidden')::boolean, false),
         coalesce(private.json_value_or_null(o -> 'option_overrides'), '{}'::jsonb), p_actor
    from jsonb_array_elements(p_document -> 'builtin_question_overrides') o;

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

  -- The required list, presets and the document step note.
  insert into public.intake_required_questions (org_id, question, is_required, updated_by)
  select p_org_id, r ->> 'question', (r ->> 'is_required')::boolean, p_actor
    from jsonb_array_elements(p_document -> 'required_questions') r;
  -- The built-in placements follow the required list (RAPP-649).
  perform private.sync_builtin_placements_required(p_org_id);

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

-- Every field answers here but her names (D2).
CREATE OR REPLACE FUNCTION private.write_custom_answer(p_profile_id uuid, p_field profile_fields, p_value jsonb, p_source text, p_answered_by uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  is_seasonal boolean := private.field_is_seasonal(p_field.id);
  season uuid := case when is_seasonal then private.current_season_id(p_field.org_id) end;
  key uuid := coalesce(season, '00000000-0000-0000-0000-000000000000'::uuid);
  is_empty boolean := private.custom_answer_is_empty(p_value);
  stored jsonb := private.custom_answer_tidied(p_field.question_type, p_value);
  -- Her own answers name nobody; a staff write with no name given is the
  -- signed-in team member's.
  author uuid := case
    when p_source = 'player' then null
    when p_source = 'staff' then coalesce(p_answered_by, (select auth.uid()))
    else p_answered_by
  end;
begin
  -- Her names stay on her account (D2): chat, lists, invites and erasure read them there.
  if p_field.system_key in ('first_name', 'last_name') then
    raise check_violation using message = 'her names stay on her account';
  end if;
  if p_field.question_type in ('file_upload', 'signature') and p_source <> 'player'
     and not private.is_test_player(p_profile_id) then
    raise insufficient_privilege using message = 'a file or a signature is hers to give';
  end if;
  -- With no current season there is nowhere to keep a seasonal answer. Her
  -- registration never stops on it; staff are told.
  if is_seasonal and season is null then
    if p_source = 'player' then
      return;
    end if;
    raise check_violation using message = 'a seasonal question needs a current season';
  end if;
  if is_empty then
    delete from public.custom_answers
     where profile_id = p_profile_id and question_id = p_field.id and season_key = key;
    return;
  end if;
  if not private.custom_answer_valid(p_field, stored) then
    raise check_violation using message = 'the answer does not fit the question';
  end if;
  -- Her file lives in her own private folder of her organization.
  if p_field.question_type = 'file_upload'
     and (split_part(stored ->> 'key', '/', 1) <> p_field.org_id::text
          or split_part(stored ->> 'key', '/', 3) <> p_profile_id::text) then
    raise check_violation using message = 'the answer does not fit the question';
  end if;
  insert into public.custom_answers (
    profile_id, question_id, season_key, season_id, org_id, value, value_encrypted, source,
    answered_by, answered_at)
  values (
    p_profile_id, p_field.id, key, season, p_field.org_id,
    case when p_field.privacy = 'sensitive' then null else stored end,
    case when p_field.privacy = 'sensitive' then public.encrypt_field(stored::text) end,
    p_source, author, now())
  on conflict (profile_id, question_id, season_key) do update
    set value = excluded.value, value_encrypted = excluded.value_encrypted,
        source = excluded.source, answered_by = excluded.answered_by, answered_at = now();
end;
$function$;
