-- Fields and placements: the player profile layout (RAPP-649).
--
-- WHY
--
-- A staff question carried everything at once: what we want to know about her
-- (type, privacy level), where it is asked (`screen_id`, `placements[]`) and
-- how it is worded. The same piece of information could exist twice, privacy
-- was chosen on a question form, and only the app's own columns were shared
-- by her onboarding, the entity referral form and the team. Fabián approved
-- the design on 2026-10-23 (player-profile-layout-design): a FIELD is what we
-- know about her, defined once with its privacy; a SURFACE is where we ask
-- (onboarding, entity form, season); a PLACEMENT puts a field on a surface.
--
-- THE MODEL
--
--   1. `profile_sections`: the sections of her profile, seven per organization
--      (identity, contact, origin, sizes, situation, health_needs, support).
--      Staff rename and reorder them.
--   2. `profile_fields`: one row per piece of information. Built-in fields are
--      the app's own questions (`builtin_key`), with the level the database
--      fixes for their columns (RAPP-240); custom fields are what staff add.
--      Choice options stay in `custom_question_options`, because answers store
--      their ids.
--   3. `field_placements`: a field on a surface, with its order, whether it is
--      required there, and an optional wording per language. At most one
--      placement per field and surface. A field with no placement is filled in
--      by the team only.
--
-- THE MIGRATION (expand step; RAPP-656 contracts)
--
--   4. Every `custom_questions` row becomes a field with the SAME id, so
--      answers, per-player choices, referral answers, exports and the launch
--      script keep their keys. `screen_id` becomes an onboarding placement when
--      she answers it (`wizard` or `season`); `entity_form` and `season` become
--      placements on those surfaces; `staff` becomes no placement. A question
--      on a holder screen (RAPP-642) is placed on the app screen it held.
--   5. The built-in questions become built-in fields of every organization,
--      placed where the app asks them today: their wizard screen, the entity
--      referral form, and the season re-registration.
--   6. The foreign keys to `custom_questions` now point at `profile_fields`.
--   7. `custom_questions` becomes a compatibility VIEW with the old columns, in
--      the old order, with row security of the caller (`security_invoker`).
--      Every reader keeps working unchanged. INSTEAD OF triggers turn old-shape
--      writes into fields and placements, so the seed-era tests and the version
--      1 setup import keep working too.
--   8. Writers move to new functions gated by `private.require_question_builder`
--      and audited: `save_profile_section`, `reorder_profile_sections`,
--      `save_profile_field`, `archive_profile_field`, `move_profile_field`,
--      `place_field`, `remove_placement`, `reorder_placements`,
--      `save_placement`. The old writers (`save_custom_question`,
--      `archive_custom_question`, `reorder_custom_questions`,
--      `save_custom_question_required`) are thin wrappers over the same workers.
--   9. `intake_catalog` returns `sections`, `fields` and `placements`; the setup
--      export writes schema version 2 with them, and the import reads 1 and 2.
--
-- Holder screens stay until RAPP-656: the view gives a question on an app
-- screen the holder's id, which the player app of today still reads (RAPP-655
-- moves it to placements). The required list of the built-in questions stays
-- `intake_required_questions`; their placements mirror it.
--
-- Docs: https://supabase.com/docs/guides/database/postgres/row-level-security
-- (security_invoker views, forced row security, security definer functions with
-- an empty search path), https://www.postgresql.org/docs/17/trigger-definition.html
-- (INSTEAD OF triggers on views) and
-- https://www.postgresql.org/docs/17/sql-altertable.html (replacing a foreign key).

-- 1. The defaults --------------------------------------------------------------------------------------------

-- The seven sections, in the order the team reads a profile.
create or replace function private.default_profile_sections()
returns table (key text, title jsonb, sort_order integer)
language sql
immutable
set search_path = ''
as $$
  select s.key, s.title, s.sort_order::integer
    from (values
      -- profile-sections:start
      ('identity', '{"ca": "Identitat", "es": "Identidad", "en": "Identity", "ar": "الهوية", "fa": "هویت"}'::jsonb, 0),
      ('contact', '{"ca": "Contacte", "es": "Contacto", "en": "Contact", "ar": "التواصل", "fa": "تماس"}'::jsonb, 1),
      ('origin', '{"ca": "Origen", "es": "Origen", "en": "Origin", "ar": "الأصل", "fa": "خاستگاه"}'::jsonb, 2),
      ('sizes', '{"ca": "Talles", "es": "Tallas", "en": "Sizes", "ar": "المقاسات", "fa": "سایزها"}'::jsonb, 3),
      ('situation', '{"ca": "Situació", "es": "Situación", "en": "Situation", "ar": "الوضع", "fa": "وضعیت"}'::jsonb, 4),
      ('health_needs', '{"ca": "Salut i necessitats", "es": "Salud y necesidades", "en": "Health and needs", "ar": "الصحة والاحتياجات", "fa": "سلامت و نیازها"}'::jsonb, 5),
      ('support', '{"ca": "Suport", "es": "Apoyo", "en": "Support", "ar": "الدعم", "fa": "حمایت"}'::jsonb, 6)
      -- profile-sections:end
    ) as s(key, title, sort_order);
$$;

-- The section of each app screen (`private.wizard_screen_questions()`): where
-- its built-in questions, and the questions staff added to it, belong.
create or replace function private.app_screen_profile_section(p_screen text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_screen
    -- app-screen-sections:start
    when 'identity' then 'identity'
    when 'background' then 'origin'
    when 'documentation' then 'identity'
    when 'logistics' then 'contact'
    when 'equipment' then 'sizes'
    when 'season' then 'situation'
    when 'supporting-entities' then 'support'
    when 'participation-support' then 'support'
    when 'specific-needs' then 'health_needs'
    -- app-screen-sections:end
  end;
$$;

-- The built-in fields: the app's own questions, each in the section of its
-- screen, with the level the database fixes for its columns (RAPP-240,
-- RAPP-306: the encrypted columns are Sensitive, the ones behind
-- participants.view_personal Personal), and the label her wizard shows (the
-- `onboarding` translations, `INTAKE_QUESTION_LABEL_KEYS`). The type says how
-- the field reads in the profile layout; the app keeps its own controls.
create or replace function private.builtin_profile_fields()
returns table (builtin_key text, section_key text, question_type text, privacy text, label jsonb, sort_order integer)
language sql
immutable
set search_path = ''
as $$
  select f.builtin_key, f.section_key, f.question_type, f.privacy, f.label,
         (row_number() over (partition by f.section_key order by f.position) - 1)::integer
    from (values
      -- builtin-profile-fields:start
      ('first_name', 'identity', 'short_text', 'normal', '{"ca": "Nom", "es": "Nombre", "en": "First name", "ar": "الاسم", "fa": "نام"}'::jsonb, 1),
      ('last_name', 'identity', 'short_text', 'normal', '{"ca": "Cognoms", "es": "Apellidos", "en": "Last name", "ar": "اسم العائلة", "fa": "نام خانوادگی"}'::jsonb, 2),
      ('date_of_birth', 'origin', 'date', 'personal', '{"ca": "Data de naixement", "es": "Fecha de nacimiento", "en": "Date of birth", "ar": "تاريخ الميلاد", "fa": "تاریخ تولد"}'::jsonb, 3),
      ('place_of_birth', 'origin', 'search_choice', 'personal', '{"ca": "Lloc de naixement", "es": "Lugar de nacimiento", "en": "Place of birth", "ar": "مكان الميلاد", "fa": "محل تولد"}'::jsonb, 4),
      ('nationality', 'origin', 'search_choice', 'personal', '{"ca": "Nacionalitat", "es": "Nacionalidad", "en": "Nationality", "ar": "الجنسية", "fa": "ملیت"}'::jsonb, 5),
      ('document', 'identity', 'short_text', 'sensitive', '{"ca": "Tipus de document", "es": "Tipo de documento", "en": "Document type", "ar": "نوع الوثيقة", "fa": "نوع مدرک"}'::jsonb, 6),
      ('phone', 'contact', 'phone', 'sensitive', '{"ca": "Telèfon", "es": "Teléfono", "en": "Phone", "ar": "الهاتف", "fa": "تلفن"}'::jsonb, 7),
      ('address', 'contact', 'short_text', 'sensitive', '{"ca": "Adreça", "es": "Dirección", "en": "Address", "ar": "العنوان", "fa": "نشانی"}'::jsonb, 8),
      ('city', 'contact', 'search_choice', 'personal', '{"ca": "Municipi", "es": "Municipio", "en": "Municipality", "ar": "البلدية", "fa": "شهر"}'::jsonb, 9),
      ('postal_code', 'contact', 'short_text', 'sensitive', '{"ca": "Codi postal", "es": "Código postal", "en": "Postal code", "ar": "الرمز البريدي", "fa": "کد پستی"}'::jsonb, 10),
      ('reference_entity', 'contact', 'short_text', 'normal', '{"ca": "Has arribat a través d''alguna entitat?", "es": "¿Has llegado a través de alguna entidad?", "en": "Did an organization refer you?", "ar": "هل وصلتِ عن طريق جمعية أو منظمة؟", "fa": "آیا از طریق نهاد یا سازمانی معرفی شده‌اید؟"}'::jsonb, 11),
      ('reference_contact_name', 'contact', 'short_text', 'personal', '{"ca": "Persona de contacte a l''entitat", "es": "Persona de contacto en la entidad", "en": "Contact person at the organization", "ar": "الشخص المسؤول في الجهة", "fa": "فرد رابط در آن نهاد"}'::jsonb, 12),
      ('dependents', 'contact', 'yes_no', 'personal', '{"ca": "Tens persones al teu càrrec?", "es": "¿Tienes personas a tu cargo?", "en": "Do you have dependents?", "ar": "هل لديكِ أشخاص تحت رعايتك؟", "fa": "آیا کسی تحت سرپرستی شماست؟"}'::jsonb, 13),
      ('clothing_size', 'sizes', 'single_choice', 'normal', '{"ca": "Talla de roba", "es": "Talla de ropa", "en": "Clothing size", "ar": "مقاس الملابس", "fa": "سایز لباس"}'::jsonb, 14),
      ('shoe_size', 'sizes', 'single_choice', 'normal', '{"ca": "Número de peu (EU)", "es": "Número de pie (EU)", "en": "Shoe size (EU)", "ar": "مقاس الحذاء (EU)", "fa": "سایز کفش (EU)"}'::jsonb, 15),
      ('applicant_status', 'situation', 'single_choice', 'sensitive', '{"ca": "Condició per accedir al projecte", "es": "Condición para acceder al proyecto", "en": "Status for joining the project", "ar": "الوضع للانضمام إلى المشروع", "fa": "وضعیت برای پیوستن به پروژه"}'::jsonb, 16),
      ('supporting_entities', 'support', 'multiple_choice', 'personal', '{"ca": "Altres entitats o programes que li donen suport", "es": "Otras entidades o programas que le dan apoyo", "en": "Other organizations or programmes that support her", "ar": "جمعيات أو برامج أخرى تدعمها", "fa": "سازمان‌ها یا برنامه‌های دیگری که از او حمایت می‌کنند"}'::jsonb, 17),
      ('childcare_need', 'support', 'yes_no_maybe', 'personal', '{"ca": "Necessita servei de cangur durant els entrenaments?", "es": "¿Necesita servicio de canguro durante los entrenamientos?", "en": "Does she need childcare during training?", "ar": "هل تحتاجين إلى رعاية الأطفال أثناء التدريبات؟", "fa": "آیا در طول تمرین‌ها به نگهداری از کودک نیاز دارد؟"}'::jsonb, 18),
      ('specific_needs', 'health_needs', 'long_text', 'sensitive', '{"ca": "Necessitats específiques", "es": "Necesidades específicas", "en": "Specific needs", "ar": "احتياجات خاصة", "fa": "نیازهای خاص"}'::jsonb, 19)
      -- builtin-profile-fields:end
    ) as f(builtin_key, section_key, question_type, privacy, label, position);
$$;

-- The built-in fields the entity referral form asks today, in its order
-- (`createReferralSchema`).
create or replace function private.builtin_entity_form_fields()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    -- builtin-entity-form-fields:start
    'first_name', 'last_name', 'phone', 'date_of_birth', 'nationality', 'document', 'city',
    'applicant_status', 'supporting_entities', 'reference_contact_name', 'childcare_need', 'specific_needs'
    -- builtin-entity-form-fields:end
  ]::text[];
$$;

-- The built-in fields asked again every season (RAPP-306): the season screens'.
create or replace function private.builtin_season_fields()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['applicant_status', 'supporting_entities', 'childcare_need', 'specific_needs']::text[];
$$;

-- An onboarding placement names a Ramassà screen by its id, or an app screen.
create or replace function private.is_uuid_text(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false);
$$;

revoke all on function private.default_profile_sections() from public, anon, authenticated;
revoke all on function private.app_screen_profile_section(text) from public, anon, authenticated;
revoke all on function private.builtin_profile_fields() from public, anon, authenticated;
revoke all on function private.builtin_entity_form_fields() from public, anon, authenticated;
revoke all on function private.builtin_season_fields() from public, anon, authenticated;
revoke all on function private.is_uuid_text(text) from public, anon, authenticated;

-- 2. Tables --------------------------------------------------------------------------------------------------

create table public.profile_sections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{1,64}$'),
  title jsonb not null check (private.catalan_text_valid(title)),
  sort_order integer not null default 0,
  is_builtin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_sections_one_key_per_org unique (org_id, key)
);
create index profile_sections_org_idx on public.profile_sections (org_id, sort_order);
comment on table public.profile_sections is
  'Sections of the player profile layout (RAPP-649). Staff rename and reorder them.';

create table public.profile_fields (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  section_id uuid not null references public.profile_sections (id),
  kind text not null check (kind in ('builtin', 'custom')),
  builtin_key text check (builtin_key is null or builtin_key = any (private.wizard_intake_questions())),
  question_type text not null check (question_type = any (private.custom_question_types())),
  label jsonb not null check (private.catalan_text_valid(label)),
  help jsonb check (help is null or private.localized_text_valid(help)),
  privacy text not null check (privacy in ('normal', 'personal', 'sensitive')),
  default_required boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  show_when_field_id uuid references public.profile_fields (id),
  show_when_option_id uuid references public.custom_question_options (id),
  sort_order integer not null default 0,
  -- The screen the old question builder filed it under (RAPP-307), for the
  -- compatibility view while no onboarding screen asks it. RAPP-656 drops it.
  legacy_screen_id uuid references public.intake_screens (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_fields_builtin_key_iff_builtin check ((kind = 'builtin') = (builtin_key is not null)),
  constraint profile_fields_builtin_stays check (kind = 'custom' or not is_archived),
  constraint profile_fields_settings_fit_type check (private.custom_question_settings_valid(question_type, settings)),
  constraint profile_fields_condition_pair check ((show_when_field_id is null) = (show_when_option_id is null)),
  constraint profile_fields_condition_not_self check (show_when_field_id is null or show_when_field_id <> id),
  constraint profile_fields_one_builtin_per_org unique (org_id, builtin_key)
);
create index profile_fields_org_idx on public.profile_fields (org_id);
create index profile_fields_section_idx on public.profile_fields (section_id, sort_order);
create index profile_fields_legacy_screen_idx on public.profile_fields (legacy_screen_id)
  where legacy_screen_id is not null;
create index profile_fields_condition_field_idx on public.profile_fields (show_when_field_id)
  where show_when_field_id is not null;
create index profile_fields_condition_option_idx on public.profile_fields (show_when_option_id)
  where show_when_option_id is not null;
create index profile_fields_created_by_idx on public.profile_fields (created_by) where created_by is not null;
comment on table public.profile_fields is
  'Each piece of player information, defined once with its type and privacy (RAPP-649). The id of a custom field is the id of the question it was.';

create table public.field_placements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  field_id uuid not null references public.profile_fields (id) on delete cascade,
  surface text not null check (surface in ('onboarding', 'entity_form', 'season')),
  -- An app screen (`equipment`) or a Ramassà screen's id, on onboarding only.
  screen_key text check (screen_key is null or private.is_uuid_text(screen_key) or screen_key = any (array[
    'identity', 'background', 'documentation', 'logistics', 'equipment', 'season',
    'supporting-entities', 'participation-support', 'specific-needs']::text[])),
  sort_order integer not null default 0,
  required boolean not null default false,
  label_override jsonb check (label_override is null or private.localized_text_valid(label_override)),
  help_override jsonb check (help_override is null or private.localized_text_valid(help_override)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint field_placements_screen_on_onboarding check ((surface = 'onboarding') = (screen_key is not null)),
  constraint field_placements_one_per_surface unique (field_id, surface)
);
create index field_placements_surface_idx on public.field_placements (org_id, surface, screen_key, sort_order);
comment on table public.field_placements is
  'A field on a surface: onboarding screen, entity form or season (RAPP-649). No placement: the team fills it in.';

-- Reads go through intake_catalog(); the select policies keep the team's own
-- organization in reach for direct reads, as for the builder tables they replace.
alter table public.profile_sections enable row level security;
alter table public.profile_fields enable row level security;
alter table public.field_placements enable row level security;
alter table public.profile_sections force row level security;
alter table public.profile_fields force row level security;
alter table public.field_placements force row level security;

create policy profile_sections_select_org on public.profile_sections
  for select to authenticated using (org_id = (select public.current_org_id()));
create policy profile_fields_select_org on public.profile_fields
  for select to authenticated using (org_id = (select public.current_org_id()));
create policy field_placements_select_org on public.field_placements
  for select to authenticated using (org_id = (select public.current_org_id()));

revoke all on table public.profile_sections, public.profile_fields, public.field_placements from anon, authenticated;
grant select on table public.profile_sections, public.profile_fields, public.field_placements to authenticated;

-- 3. Every organization gets the sections and the built-in fields ---------------------------------------

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
    org_id, section_id, kind, builtin_key, question_type, label, privacy, default_required, sort_order)
  select p_org_id, s.id, 'builtin', b.builtin_key, b.question_type, b.label, b.privacy,
         b.builtin_key = any (private.default_required_intake_questions()), b.sort_order
    from private.builtin_profile_fields() b
    join public.profile_sections s on s.org_id = p_org_id and s.key = b.section_key
  on conflict (org_id, builtin_key) do nothing;

  -- Where the app asks them today: her wizard screen, each season, the entity form.
  insert into public.field_placements (org_id, field_id, surface, screen_key, sort_order, required)
  select p_org_id, f.id, 'onboarding', w.screen, (q.position - 1)::integer,
         f.builtin_key = any (private.required_intake_questions(p_org_id))
    from private.wizard_screen_questions() w
    cross join lateral unnest(w.questions) with ordinality as q(question, position)
    join public.profile_fields f on f.org_id = p_org_id and f.builtin_key = q.question
  on conflict (field_id, surface) do nothing;

  insert into public.field_placements (org_id, field_id, surface, sort_order, required)
  select p_org_id, f.id, 'season', (q.position - 1)::integer,
         f.builtin_key = any (private.required_intake_questions(p_org_id))
    from unnest(private.builtin_season_fields()) with ordinality as q(question, position)
    join public.profile_fields f on f.org_id = p_org_id and f.builtin_key = q.question
  on conflict (field_id, surface) do nothing;

  -- The entity form asks her name always; it requires nothing else (RAPP-300).
  insert into public.field_placements (org_id, field_id, surface, sort_order, required)
  select p_org_id, f.id, 'entity_form', (q.position - 1)::integer,
         f.builtin_key in ('first_name', 'last_name')
    from unnest(private.builtin_entity_form_fields()) with ordinality as q(question, position)
    join public.profile_fields f on f.org_id = p_org_id and f.builtin_key = q.question
  on conflict (field_id, surface) do nothing;
end;
$$;
revoke all on function private.seed_profile_layout(uuid) from public, anon, authenticated;

create or replace function private.seed_profile_layout_for_new_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_profile_layout(new.id);
  return new;
end;
$$;
revoke all on function private.seed_profile_layout_for_new_org() from public, anon, authenticated;

create trigger organizations_seed_profile_layout
  after insert on public.organizations
  for each row execute function private.seed_profile_layout_for_new_org();

select private.seed_profile_layout(o.id) from public.organizations o;

-- 4. Every question becomes a field, with the same id ---------------------------------------------------

-- A question on a holder screen belongs to the app screen's section; one on a
-- Ramassà screen to Support (nothing in a screen's name says more).
insert into public.profile_fields (
  id, org_id, section_id, kind, question_type, label, help, privacy, default_required, settings,
  sort_order, legacy_screen_id, created_by, is_archived, created_at, updated_at)
select q.id, q.org_id, sec.id, 'custom', q.question_type, q.label, q.help, q.privacy, q.is_required,
       q.settings,
       (coalesce((select max(b.sort_order) + 1 from public.profile_fields b
                   where b.section_id = sec.id and b.kind = 'builtin'), 0)
        + row_number() over (partition by sec.id
                             order by array_position(private.intake_builtin_screens(), s.after_screen),
                                      s.sort_order, s.created_at, q.sort_order, q.created_at) - 1)::integer,
       q.screen_id,
       -- Who created it, as the audit log recorded it.
       (select a.actor_id from public.audit_log a
         where a.target_id = q.id and a.action = 'intake.question_save'
           and a.changes ->> 'created' = 'true'
           and exists (select 1 from public.profiles p where p.id = a.actor_id)
         order by a.created_at limit 1),
       q.is_archived, q.created_at, q.updated_at
  from public.custom_questions q
  join public.intake_screens s on s.id = q.screen_id
  join public.profile_sections sec
    on sec.org_id = q.org_id
   and sec.key = coalesce(private.app_screen_profile_section(s.builtin_screen), 'support');

-- Her onboarding: a question she answers (wizard, or every season) on its screen,
-- or on the app screen its holder stood for.
insert into public.field_placements (org_id, field_id, surface, screen_key, sort_order, required, created_at)
select q.org_id, q.id, 'onboarding', coalesce(s.builtin_screen, s.id::text), q.sort_order, q.is_required,
       q.created_at
  from public.custom_questions q
  join public.intake_screens s on s.id = q.screen_id
 where q.placements && array['wizard', 'season']::text[];

-- The entity form never required an answer (RAPP-611).
insert into public.field_placements (org_id, field_id, surface, sort_order, required, created_at)
select q.org_id, q.id, 'entity_form', q.sort_order, false, q.created_at
  from public.custom_questions q
 where 'entity_form' = any (q.placements);

insert into public.field_placements (org_id, field_id, surface, sort_order, required, created_at)
select q.org_id, q.id, 'season', q.sort_order, q.is_required, q.created_at
  from public.custom_questions q
 where 'season' = any (q.placements);

-- Conditions, once every field exists.
update public.profile_fields f
   set show_when_field_id = q.show_when_question_id, show_when_option_id = q.show_when_option_id
  from public.custom_questions q
 where q.id = f.id and q.show_when_question_id is not null;

-- 5. Foreign keys move to the fields (same ids, no data changes) ----------------------------------------

alter table public.custom_question_options
  drop constraint custom_question_options_question_id_fkey,
  add constraint custom_question_options_question_id_fkey
    foreign key (question_id) references public.profile_fields (id) on delete cascade;
alter table public.custom_answers
  drop constraint custom_answers_question_id_fkey,
  add constraint custom_answers_question_id_fkey
    foreign key (question_id) references public.profile_fields (id) on delete cascade;
alter table public.referral_custom_answers
  drop constraint referral_custom_answers_question_id_fkey,
  add constraint referral_custom_answers_question_id_fkey
    foreign key (question_id) references public.profile_fields (id) on delete cascade;
alter table public.custom_question_states
  drop constraint custom_question_states_question_id_fkey,
  add constraint custom_question_states_question_id_fkey
    foreign key (question_id) references public.profile_fields (id) on delete cascade;

-- 6. The old table goes; the view takes its name ---------------------------------------------------------

-- These three take a question row; they come back below on the view's row type.
drop function private.custom_answer_valid(public.custom_questions, jsonb);
drop function private.custom_answer_text(public.custom_questions, jsonb);
drop function private.write_custom_answer(uuid, public.custom_questions, jsonb, text);
drop table public.custom_questions;
drop function private.guard_custom_question_condition();

-- The old columns, in the old order, from fields and placements. A question on
-- an app screen shows under that screen's holder (RAPP-642) while one is live.
create view public.custom_questions
with (security_invoker = true)
as
select f.id,
       f.org_id,
       coalesce(
         case when onboarding.screen_key is null then null
              -- Inline: the caller's rights apply here, and private functions are not hers.
              when onboarding.screen_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then onboarding.screen_key::uuid
              else (select h.id from public.intake_screens h
                     where h.org_id = f.org_id and h.builtin_screen = onboarding.screen_key
                       and not h.is_archived) end,
         f.legacy_screen_id) as screen_id,
       f.question_type,
       f.label,
       f.help,
       f.privacy,
       case when onboarding.id is null and entity.id is null and season.id is null then array['staff']::text[]
            else array_remove(array[
                   case when onboarding.id is not null then 'wizard' end,
                   case when entity.id is not null then 'entity_form' end,
                   case when season.id is not null then 'season' end], null) end as placements,
       coalesce(onboarding.sort_order, entity.sort_order, season.sort_order, f.sort_order) as sort_order,
       f.is_archived,
       f.created_at,
       f.updated_at,
       f.show_when_field_id as show_when_question_id,
       f.show_when_option_id,
       f.settings,
       coalesce(onboarding.required, season.required, f.default_required) as is_required
  from public.profile_fields f
  left join public.field_placements onboarding on onboarding.field_id = f.id and onboarding.surface = 'onboarding'
  left join public.field_placements entity on entity.field_id = f.id and entity.surface = 'entity_form'
  left join public.field_placements season on season.field_id = f.id and season.surface = 'season'
 where f.kind = 'custom';

comment on view public.custom_questions is
  'Compatibility view of the custom fields in the old question shape (RAPP-649). RAPP-656 removes it.';

-- What an insert that leaves them out gets, as the table gave.
alter view public.custom_questions alter column id set default gen_random_uuid();
alter view public.custom_questions alter column settings set default '{}'::jsonb;
alter view public.custom_questions alter column sort_order set default 0;
alter view public.custom_questions alter column is_archived set default false;
alter view public.custom_questions alter column is_required set default false;
alter view public.custom_questions alter column created_at set default now();
alter view public.custom_questions alter column updated_at set default now();

revoke all on table public.custom_questions from anon, authenticated;
grant select on table public.custom_questions to authenticated;

-- The three row helpers, unchanged, on the view's row type.
CREATE OR REPLACE FUNCTION private.custom_answer_valid(p_question public.custom_questions, p_value jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select private.custom_answer_value_valid(
    p_question.question_type, p_question.settings, p_value,
    array(select o.id::text from public.custom_question_options o
           where o.question_id = p_question.id and not o.is_archived));
$function$;

CREATE OR REPLACE FUNCTION private.custom_answer_text(p_question public.custom_questions, p_value jsonb)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select case
    when p_question.question_type in ('single_choice', 'multiple_choice', 'search_choice') then (
      select string_agg(
               coalesce(o.label ->> 'ca', chosen.id)
                 || case when o.is_archived then ' (arxivada)' else '' end,
               '; ' order by o.sort_order)
        from (select jsonb_array_elements_text(
                       case when jsonb_typeof(p_value) = 'array' then p_value
                            else jsonb_build_array(p_value) end) as id) chosen
        left join public.custom_question_options o
          on o.id::text = chosen.id and o.question_id = p_question.id)
    when p_question.question_type in ('yes_no_maybe', 'yes_no') then
      case p_value #>> '{}' when 'yes' then 'Sí' when 'no' then 'No' when 'maybe' then 'Potser'
                            else p_value #>> '{}' end
    when p_question.question_type = 'date' and jsonb_typeof(p_value) = 'string' then
      to_char((p_value #>> '{}')::date, 'DD/MM/YYYY')
    when p_question.question_type = 'item_list' and jsonb_typeof(p_value) = 'array' then (
      select string_agg(item, '; ' order by position)
        from jsonb_array_elements_text(p_value) with ordinality as listed(item, position))
    when p_question.question_type = 'consent' then
      case when p_value = 'true'::jsonb then 'Sí' else 'No' end
    when p_question.question_type = 'signature' then 'Signat'
    when p_question.question_type = 'file_upload' then 'Fitxer: ' || coalesce(p_value ->> 'name', '')
    else p_value #>> '{}'
  end;
$function$;

CREATE OR REPLACE FUNCTION private.write_custom_answer(p_profile_id uuid, p_question public.custom_questions, p_value jsonb, p_source text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  season uuid := case when 'season' = any (p_question.placements)
                      then private.current_season_id(p_question.org_id) end;
  key uuid := coalesce(season, '00000000-0000-0000-0000-000000000000'::uuid);
  is_empty boolean := private.custom_answer_is_empty(p_value);
  stored jsonb := private.custom_answer_tidied(p_question.question_type, p_value);
begin
  if p_question.question_type in ('file_upload', 'signature') and p_source <> 'player'
     and not private.is_test_player(p_profile_id) then
    raise insufficient_privilege using message = 'a file or a signature is hers to give';
  end if;
  -- With no current season there is nowhere to keep a seasonal answer. Her
  -- registration never stops on it; staff are told.
  if 'season' = any (p_question.placements) and season is null then
    if p_source = 'player' then
      return;
    end if;
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
  -- Her file lives in her own private folder of her organization.
  if p_question.question_type = 'file_upload'
     and (split_part(stored ->> 'key', '/', 1) <> p_question.org_id::text
          or split_part(stored ->> 'key', '/', 3) <> p_profile_id::text) then
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
$function$;

revoke all on function private.custom_answer_valid(public.custom_questions, jsonb) from public, anon, authenticated;
revoke all on function private.custom_answer_text(public.custom_questions, jsonb) from public, anon, authenticated;
revoke all on function private.write_custom_answer(uuid, public.custom_questions, jsonb, text)
  from public, anon, authenticated;

-- 7. Conditions stay with their controlling field ------------------------------------------------------------

-- A conditional field follows a single-choice field of the same organization,
-- and is placed only where that field is placed (the old rule: on the same
-- screen, and only where it shows).
create or replace function private.guard_profile_field_condition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  gate public.profile_fields%rowtype;
begin
  if exists (select 1 from public.profile_fields child
              where child.show_when_field_id = new.id
                and (child.org_id <> new.org_id or new.show_when_field_id is not null)) then
    raise check_violation using message = 'a conditional question must stay with its controlling question';
  end if;
  if new.show_when_field_id is null and new.show_when_option_id is null then
    return new;
  end if;
  select * into gate from public.profile_fields where id = new.show_when_field_id;
  if gate.id is null or gate.id = new.id or gate.org_id <> new.org_id
     or gate.question_type <> 'single_choice' or gate.show_when_field_id is not null
     or not exists (select 1 from public.custom_question_options option
                     where option.id = new.show_when_option_id and option.question_id = gate.id
                       and option.org_id = new.org_id)
     or exists (select 1 from public.field_placements mine
                 where mine.field_id = new.id
                   and not exists (select 1 from public.field_placements theirs
                                    where theirs.field_id = gate.id and theirs.surface = mine.surface
                                      and theirs.screen_key is not distinct from mine.screen_key)) then
    raise check_violation using message = 'a condition needs an option of a single-choice question on the same screen and organisation';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_profile_field_condition() from public, anon, authenticated;

create trigger profile_fields_condition_guard
  before insert or update of show_when_field_id, show_when_option_id, org_id on public.profile_fields
  for each row execute function private.guard_profile_field_condition();

-- A placement belongs to its field's organization; a conditional field's
-- placement needs its controlling field there; the controlling field's
-- placement stays while a conditional one depends on it.
create or replace function private.guard_field_placement()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  field public.profile_fields%rowtype;
begin
  if tg_op in ('UPDATE', 'DELETE')
     and (tg_op = 'DELETE' or old.surface is distinct from new.surface
          or old.screen_key is distinct from new.screen_key)
     and exists (select 1 from public.profile_fields child
                   join public.field_placements theirs on theirs.field_id = child.id
                  where child.show_when_field_id = old.field_id
                    and theirs.surface = old.surface
                    and theirs.screen_key is not distinct from old.screen_key)
     -- A field that is being deleted takes its conditions' placements along.
     and exists (select 1 from public.profile_fields f where f.id = old.field_id) then
    raise check_violation using message = 'a conditional question must stay with its controlling question';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  select * into field from public.profile_fields where id = new.field_id;
  if field.org_id is distinct from new.org_id then
    raise check_violation using message = 'a placement belongs to its field''s organization';
  end if;
  if field.show_when_field_id is not null
     and not exists (select 1 from public.field_placements theirs
                      where theirs.field_id = field.show_when_field_id and theirs.surface = new.surface
                        and theirs.screen_key is not distinct from new.screen_key) then
    raise check_violation using message = 'a condition needs an option of a single-choice question on the same screen and organisation';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_field_placement() from public, anon, authenticated;

create trigger field_placements_guard
  before insert or update or delete on public.field_placements
  for each row execute function private.guard_field_placement();

-- 8. The old question shape, written as fields and placements ------------------------------------------------

-- The old `placements[]` must name at least one of the four places, and a file
-- or a signature is asked of her only (the old table checks).
create or replace function private.check_legacy_placements(p_type text, p_placements text[])
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if coalesce(cardinality(p_placements), 0) = 0
     or not (p_placements <@ array['wizard', 'entity_form', 'season', 'staff']::text[]) then
    raise check_violation using message = 'a question shows in the wizard, the entity form, each season or to staff';
  end if;
  if p_type in ('file_upload', 'signature') and not (p_placements <@ array['wizard', 'season']::text[]) then
    raise check_violation using message = 'a file or a signature is asked of her only';
  end if;
end;
$$;
revoke all on function private.check_legacy_placements(text, text[]) from public, anon, authenticated;

-- Makes a field's placements say what an old-shape question said: on her
-- onboarding (its screen, or the app screen its holder stands for) when she
-- answers it, on the entity form, each season. `staff` alone is no placement.
create or replace function private.apply_legacy_question_shape(
  p_field_id uuid,
  p_screen_id uuid,
  p_placements text[],
  p_sort_order integer,
  p_required boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  field_org uuid := (select org_id from public.profile_fields where id = p_field_id);
  screen public.intake_screens;
begin
  select * into screen from public.intake_screens where id = p_screen_id and org_id = field_org;
  if screen.id is null then
    raise foreign_key_violation using message = 'no such screen';
  end if;

  if p_placements && array['wizard', 'season']::text[] then
    insert into public.field_placements (org_id, field_id, surface, screen_key, sort_order, required)
    values (field_org, p_field_id, 'onboarding', coalesce(screen.builtin_screen, screen.id::text),
            p_sort_order, p_required)
    on conflict (field_id, surface) do update
      set screen_key = excluded.screen_key, sort_order = excluded.sort_order, required = excluded.required,
          updated_at = now();
  else
    delete from public.field_placements where field_id = p_field_id and surface = 'onboarding';
  end if;

  if 'entity_form' = any (p_placements) then
    insert into public.field_placements (org_id, field_id, surface, sort_order, required)
    values (field_org, p_field_id, 'entity_form', p_sort_order, false)
    on conflict (field_id, surface) do update set sort_order = excluded.sort_order, updated_at = now();
  else
    delete from public.field_placements where field_id = p_field_id and surface = 'entity_form';
  end if;

  if 'season' = any (p_placements) then
    insert into public.field_placements (org_id, field_id, surface, sort_order, required)
    values (field_org, p_field_id, 'season', p_sort_order, p_required)
    on conflict (field_id, surface) do update
      set sort_order = excluded.sort_order, required = excluded.required, updated_at = now();
  else
    delete from public.field_placements where field_id = p_field_id and surface = 'season';
  end if;

  update public.profile_fields
     set legacy_screen_id = p_screen_id, default_required = p_required
   where id = p_field_id
     and (legacy_screen_id is distinct from p_screen_id or default_required is distinct from p_required);
end;
$$;
revoke all on function private.apply_legacy_question_shape(uuid, uuid, text[], integer, boolean)
  from public, anon, authenticated;

-- The section an old-shape question lands in: its holder's app screen, else Support.
create or replace function private.legacy_question_section(p_screen_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select sec.id
    from public.intake_screens s
    join public.profile_sections sec
      on sec.org_id = s.org_id
     and sec.key = coalesce(private.app_screen_profile_section(s.builtin_screen), 'support')
   where s.id = p_screen_id;
$$;
revoke all on function private.legacy_question_section(uuid) from public, anon, authenticated;

-- Writes through the view (the seed-era tests, the version 1 import). Only the
-- database owner writes it: `authenticated` holds select alone.
create or replace function private.write_custom_questions_view()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid;
begin
  if tg_op = 'DELETE' then
    delete from public.profile_fields where id = old.id and kind = 'custom';
    if not found then
      return null;
    end if;
    return old;
  end if;

  perform private.check_legacy_placements(new.question_type, new.placements);
  if not exists (select 1 from public.intake_screens where id = new.screen_id and org_id = new.org_id) then
    raise foreign_key_violation using message = 'no such screen';
  end if;

  if tg_op = 'INSERT' then
    saved_id := coalesce(new.id, gen_random_uuid());
    insert into public.profile_fields (
      id, org_id, section_id, kind, question_type, label, help, privacy, default_required, settings,
      show_when_field_id, show_when_option_id, sort_order, legacy_screen_id, is_archived, created_at, updated_at)
    values (
      saved_id, new.org_id, private.legacy_question_section(new.screen_id), 'custom', new.question_type,
      new.label, new.help, new.privacy, coalesce(new.is_required, false), coalesce(new.settings, '{}'::jsonb),
      new.show_when_question_id, new.show_when_option_id,
      coalesce((select max(f.sort_order) + 1 from public.profile_fields f
                 where f.section_id = private.legacy_question_section(new.screen_id)), 0),
      new.screen_id, coalesce(new.is_archived, false), coalesce(new.created_at, now()),
      coalesce(new.updated_at, now()));
    new.id := saved_id;
  else
    update public.profile_fields
       set org_id = new.org_id, question_type = new.question_type, label = new.label, help = new.help,
           privacy = new.privacy, settings = coalesce(new.settings, '{}'::jsonb),
           show_when_field_id = new.show_when_question_id, show_when_option_id = new.show_when_option_id,
           is_archived = coalesce(new.is_archived, false), created_at = coalesce(new.created_at, created_at),
           updated_at = case when new.updated_at is distinct from old.updated_at then new.updated_at else now() end
     where id = old.id and kind = 'custom';
    if not found then
      return null;
    end if;
    saved_id := old.id;
  end if;

  perform private.apply_legacy_question_shape(
    saved_id, new.screen_id, new.placements, coalesce(new.sort_order, 0), coalesce(new.is_required, false));
  return new;
end;
$$;
revoke all on function private.write_custom_questions_view() from public, anon, authenticated;

create trigger custom_questions_write
  instead of insert or update or delete on public.custom_questions
  for each row execute function private.write_custom_questions_view();

-- 9. The workers -----------------------------------------------------------------------------------------------

-- Whether anything was answered for a field: her answers, or a referral's.
create or replace function private.field_has_answers(p_field_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.custom_answers a where a.question_id = p_field_id)
      or exists (select 1 from public.referral_custom_answers r where r.question_id = p_field_id);
$$;
revoke all on function private.field_has_answers(uuid) from public, anon, authenticated;

-- Creates or changes a field and its options. p_options: [{id?: uuid, label:
-- localized text}] in order; an option left out is archived and its answers
-- keep it. A built-in field changes only its name, help and section. The type
-- never changes; the privacy level is fixed once anything was answered, or
-- always when `p_privacy_never_changes` (the old question builder's rule).
-- Returns the field id. Callers check the permission and write the audit row.
create or replace function private.write_profile_field(
  p_org_id uuid,
  p_id uuid,
  p_section_id uuid,
  p_type text,
  p_label jsonb,
  p_help jsonb,
  p_privacy text,
  p_default_required boolean,
  p_options jsonb,
  p_settings jsonb,
  p_privacy_never_changes boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.profile_fields;
  saved_id uuid;
  is_choice boolean := p_type in ('single_choice', 'multiple_choice', 'search_choice');
  clean_settings jsonb := coalesce(nullif(p_settings, 'null'::jsonb), '{}'::jsonb);
  options jsonb := coalesce(nullif(p_options, 'null'::jsonb), '[]'::jsonb);
  option_item jsonb;
  position_index integer := 0;
  kept_ids uuid[] := '{}';
  option_id uuid;
  creator uuid := (select auth.uid());
begin
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
    if existing.question_type <> p_type then
      raise check_violation using message = 'the type of a question never changes';
    end if;
    if existing.privacy <> p_privacy then
      if p_privacy_never_changes or existing.kind = 'builtin' then
        raise check_violation using message = 'the privacy level of a question never changes';
      end if;
      if private.field_has_answers(existing.id) then
        raise check_violation using message = 'the privacy level of a field is fixed once it has answers';
      end if;
    end if;
    if existing.kind = 'builtin' then
      if jsonb_array_length(options) > 0
         or coalesce(p_default_required, existing.default_required) <> existing.default_required then
        raise check_violation using message = 'a built-in field keeps its options and its required default';
      end if;
      update public.profile_fields
         set label = p_label, help = nullif(p_help, 'null'::jsonb),
             section_id = coalesce(p_section_id, section_id),
             sort_order = case when p_section_id is null or p_section_id = section_id then sort_order
                               else coalesce((select max(f.sort_order) + 1 from public.profile_fields f
                                               where f.section_id = p_section_id), 0) end,
             updated_at = now()
       where id = p_id;
      return p_id;
    end if;
  end if;

  if not (p_type = any (private.custom_question_types())) then
    raise check_violation using message = 'not a question type';
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

  if p_id is null then
    if p_section_id is null then
      raise no_data_found using message = 'no such section';
    end if;
    insert into public.profile_fields (
      org_id, section_id, kind, question_type, label, help, privacy, default_required, settings,
      sort_order, created_by)
    values (
      p_org_id, p_section_id, 'custom', p_type, p_label, nullif(p_help, 'null'::jsonb), p_privacy,
      coalesce(p_default_required, false), clean_settings,
      coalesce((select max(f.sort_order) + 1 from public.profile_fields f where f.section_id = p_section_id), 0),
      case when exists (select 1 from public.profiles where id = creator) then creator end)
    returning id into saved_id;
  else
    update public.profile_fields
       set label = p_label, help = nullif(p_help, 'null'::jsonb), privacy = p_privacy,
           settings = clean_settings, default_required = coalesce(p_default_required, default_required),
           section_id = coalesce(p_section_id, section_id),
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

  return saved_id;
end;
$$;
revoke all on function private.write_profile_field(uuid, uuid, uuid, text, jsonb, jsonb, text, boolean, jsonb, jsonb, boolean)
  from public, anon, authenticated;

-- The built-in placements on her onboarding and each season follow the one
-- required list of the built-in questions (RAPP-611).
create or replace function private.sync_builtin_placements_required(p_org_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.field_placements p
     set required = f.builtin_key = any (private.required_intake_questions(p_org_id)), updated_at = now()
    from public.profile_fields f
   where f.id = p.field_id and f.org_id = p_org_id and f.kind = 'builtin'
     and p.surface in ('onboarding', 'season')
     and p.required is distinct from (f.builtin_key = any (private.required_intake_questions(p_org_id)));
$$;
revoke all on function private.sync_builtin_placements_required(uuid) from public, anon, authenticated;

-- 10. Sections ----------------------------------------------------------------------------------------------------

-- Creates a section (p_id null) or renames one, built-in ones included.
create or replace function public.save_profile_section(p_id uuid, p_title jsonb)
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
    raise check_violation using message = 'a section needs a title in Catalan';
  end if;
  if p_id is null then
    saved_id := gen_random_uuid();
    insert into public.profile_sections (id, org_id, key, title, sort_order)
    values (saved_id, actor_org, 'custom_' || replace(saved_id::text, '-', ''), p_title,
            coalesce((select max(sort_order) + 1 from public.profile_sections where org_id = actor_org), 0));
  else
    update public.profile_sections set title = p_title, updated_at = now()
     where id = p_id and org_id = actor_org
    returning id into saved_id;
    if saved_id is null then
      raise no_data_found using message = 'no such section';
    end if;
  end if;
  -- The fact only: the title is in the row.
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.section_save', 'profile_section', saved_id,
          jsonb_build_object('created', p_id is null));
  return saved_id;
end;
$$;

-- The sections in the order given; a section left out keeps its place after them.
create or replace function public.reorder_profile_sections(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
begin
  update public.profile_sections s
     set sort_order = coalesce(array_position(p_ids, s.id) - 1,
                               cardinality(p_ids) + s.sort_order), updated_at = now()
   where s.org_id = actor_org;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.sections_reorder', 'organization', actor_org,
          jsonb_build_object('order', to_jsonb(p_ids)));
end;
$$;

-- 11. Fields --------------------------------------------------------------------------------------------------

-- Creates (p_id null) or changes a field of the profile layout. Nothing about
-- where it is asked: placements do that.
create or replace function public.save_profile_field(
  p_id uuid,
  p_section_id uuid,
  p_type text,
  p_label jsonb,
  p_help jsonb,
  p_privacy text,
  p_default_required boolean default false,
  p_options jsonb default '[]'::jsonb,
  p_settings jsonb default '{}'::jsonb
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
  saved_id := private.write_profile_field(
    actor_org, p_id, p_section_id, p_type, p_label, p_help, p_privacy, p_default_required,
    p_options, p_settings, false);
  -- The shape only: names and help are in the row.
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.field_save', 'profile_field', saved_id,
          jsonb_build_object('created', p_id is null, 'type', p_type, 'privacy', p_privacy,
                             'default_required', coalesce(p_default_required, false),
                             'options', (select count(*) from public.custom_question_options o
                                          where o.question_id = saved_id and not o.is_archived),
                             'settings', coalesce(nullif(p_settings, 'null'::jsonb), '{}'::jsonb)));
  return saved_id;
end;
$$;

-- Archives a custom field: no surface asks it any more; its answers stay. A
-- built-in field is never archived.
create or replace function private.archive_field(p_org_id uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profile_fields set is_archived = true, updated_at = now()
   where id = p_id and org_id = p_org_id and kind = 'custom';
  if not found then
    raise no_data_found using message = 'no such question';
  end if;
end;
$$;
revoke all on function private.archive_field(uuid, uuid) from public, anon, authenticated;

create or replace function public.archive_profile_field(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
begin
  perform private.archive_field(actor_org, p_id);
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.field_archive', 'profile_field', p_id, '{}'::jsonb);
end;
$$;

-- Moves a field to a section, in the order given: p_ids is the target
-- section's fields in their new order, the moved one included.
create or replace function public.move_profile_field(p_id uuid, p_section_id uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
begin
  if not exists (select 1 from public.profile_sections where id = p_section_id and org_id = actor_org) then
    raise no_data_found using message = 'no such section';
  end if;
  if not (p_id = any (coalesce(p_ids, '{}'))) then
    raise check_violation using message = 'the new order names the moved field';
  end if;
  update public.profile_fields set section_id = p_section_id, updated_at = now()
   where id = p_id and org_id = actor_org;
  if not found then
    raise no_data_found using message = 'no such question';
  end if;
  update public.profile_fields f
     set sort_order = coalesce(array_position(p_ids, f.id) - 1, cardinality(p_ids) + f.sort_order),
         updated_at = now()
   where f.org_id = actor_org and f.section_id = p_section_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.field_move', 'profile_field', p_id,
          jsonb_build_object('section_id', p_section_id, 'order', to_jsonb(p_ids)));
end;
$$;

-- 12. Placements --------------------------------------------------------------------------------------------------

-- Puts a field on a surface: on her onboarding at a screen (an app screen or a
-- live Ramassà screen), on the entity form or each season. It starts at the end,
-- required as the field's default. The app asks a built-in field on its own
-- screen and its season form: only the entity form placement of a built-in
-- field is staff's to change. Returns the placement id.
create or replace function public.place_field(
  p_field_id uuid,
  p_surface text,
  p_screen_key text default null,
  p_required boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
                            and s.builtin_screen is null and not s.is_archived))) then
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
$$;

-- Takes a field off a surface. The field and its answers stay.
create or replace function public.remove_placement(p_placement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
  delete from public.field_placements where id = p_placement_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.placement_remove', 'profile_field', placement.field_id,
          jsonb_build_object('placement_id', p_placement_id, 'surface', placement.surface,
                             'screen', placement.screen_key));
end;
$$;

-- The order of the placements on one surface (and screen, for onboarding).
create or replace function public.reorder_placements(p_surface text, p_screen_key text, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
begin
  update public.field_placements p
     set sort_order = array_position(p_ids, p.id) - 1, updated_at = now()
   where p.org_id = actor_org and p.surface = p_surface
     and p.screen_key is not distinct from p_screen_key and p.id = any (p_ids);
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.placements_reorder', 'organization', actor_org,
          jsonb_build_object('surface', p_surface, 'screen', p_screen_key, 'order', to_jsonb(p_ids)));
end;
$$;

-- Required on this surface, and the wording for her (or the entity) per
-- language; null or an empty object leaves the field's own name. A built-in
-- field's required switch on onboarding and the season is the one required
-- list (`save_builtin_question_required`): her name and app language stay required.
create or replace function public.save_placement(
  p_placement_id uuid,
  p_required boolean,
  p_label_override jsonb default null,
  p_help_override jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
    if new_required is distinct from placement.required then
      perform public.save_builtin_question_required(field.builtin_key, new_required);
    end if;
    new_required := field.builtin_key = any (private.required_intake_questions(actor_org));
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
$$;

revoke all on function public.save_profile_section(uuid, jsonb) from public, anon;
revoke all on function public.reorder_profile_sections(uuid[]) from public, anon;
revoke all on function public.save_profile_field(uuid, uuid, text, jsonb, jsonb, text, boolean, jsonb, jsonb) from public, anon;
revoke all on function public.archive_profile_field(uuid) from public, anon;
revoke all on function public.move_profile_field(uuid, uuid, uuid[]) from public, anon;
revoke all on function public.place_field(uuid, text, text, boolean) from public, anon;
revoke all on function public.remove_placement(uuid) from public, anon;
revoke all on function public.reorder_placements(text, text, uuid[]) from public, anon;
revoke all on function public.save_placement(uuid, boolean, jsonb, jsonb) from public, anon;
grant execute on function public.save_profile_section(uuid, jsonb), public.reorder_profile_sections(uuid[]),
  public.save_profile_field(uuid, uuid, text, jsonb, jsonb, text, boolean, jsonb, jsonb),
  public.archive_profile_field(uuid), public.move_profile_field(uuid, uuid, uuid[]),
  public.place_field(uuid, text, text, boolean), public.remove_placement(uuid),
  public.reorder_placements(text, text, uuid[]), public.save_placement(uuid, boolean, jsonb, jsonb)
  to authenticated;

-- 13. The old writers, now thin wrappers ----------------------------------------------------------------

-- The question builder of RAPP-307 and RAPP-642, unchanged for its callers:
-- the same arguments, checks, messages and audit rows. A new question lands in
-- the section of its screen.
create or replace function public.save_custom_question(
  p_id uuid,
  p_screen_id uuid,
  p_type text,
  p_label jsonb,
  p_help jsonb,
  p_privacy text,
  p_placements text[],
  p_options jsonb default '[]'::jsonb,
  p_settings jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  current_row public.custom_questions;
  saved_id uuid;
  position_on_screen integer;
begin
  if not exists (select 1 from public.intake_screens
                  where id = p_screen_id and org_id = actor_org and not is_archived) then
    raise no_data_found using message = 'no such screen';
  end if;
  if not (p_type = any (private.custom_question_types())) then
    raise check_violation using message = 'not a question type';
  end if;
  perform private.check_legacy_placements(p_type, p_placements);

  if p_id is not null then
    select * into current_row from public.custom_questions where id = p_id and org_id = actor_org;
  end if;
  position_on_screen := case
    when current_row.id is not null then current_row.sort_order
    else coalesce((select max(q.sort_order) + 1 from public.custom_questions q where q.screen_id = p_screen_id), 0)
  end;

  saved_id := private.write_profile_field(
    actor_org, p_id, case when p_id is null then private.legacy_question_section(p_screen_id) end,
    p_type, p_label, p_help, p_privacy, null, p_options, p_settings, true);
  perform private.apply_legacy_question_shape(
    saved_id, p_screen_id, p_placements, position_on_screen, coalesce(current_row.is_required, false));

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.question_save', 'custom_question', saved_id,
          jsonb_build_object('created', p_id is null, 'type', p_type, 'privacy', p_privacy,
                             'placements', to_jsonb(p_placements),
                             'options', (select count(*) from public.custom_question_options o
                                          where o.question_id = saved_id and not o.is_archived),
                             'settings', coalesce(nullif(p_settings, 'null'::jsonb), '{}'::jsonb)));
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
  perform private.archive_field(actor_org, p_id);
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.question_archive', 'custom_question', p_id, '{}'::jsonb);
end;
$$;

-- The order on one screen: every placement of those questions takes it, as the
-- one `sort_order` of the old question did.
create or replace function public.reorder_custom_questions(p_screen_id uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
begin
  update public.field_placements p
     set sort_order = array_position(p_ids, p.field_id) - 1, updated_at = now()
   where p.org_id = actor_org and p.field_id = any (p_ids)
     and p.field_id in (select q.id from public.custom_questions q
                         where q.org_id = actor_org and q.screen_id = p_screen_id);
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.questions_reorder', 'intake_screen', p_screen_id,
          jsonb_build_object('order', to_jsonb(p_ids)));
end;
$$;

-- Required where she answers it: her onboarding and each season.
create or replace function public.save_custom_question_required(p_id uuid, p_is_required boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  question public.custom_questions;
  new_required boolean := coalesce(p_is_required, false);
begin
  select * into question from public.custom_questions
   where id = p_id and org_id = actor_org and not is_archived;
  if question.id is null then
    raise no_data_found using message = 'no such question';
  end if;
  if new_required and not (question.placements && array['wizard', 'season']::text[]) then
    raise check_violation using message = 'only a question she answers herself can be required';
  end if;
  update public.profile_fields set default_required = new_required, updated_at = now() where id = p_id;
  update public.field_placements set required = new_required, updated_at = now()
   where field_id = p_id and surface in ('onboarding', 'season');
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.custom_required_save', 'custom_question', p_id,
          jsonb_build_object('required', new_required));
end;
$$;

-- Archiving a Ramassà screen archives the questions filed under it, as before.
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
  update public.profile_fields set is_archived = true, updated_at = now()
   where id in (select q.id from public.custom_questions q where q.screen_id = p_id and not q.is_archived);
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.screen_archive', 'intake_screen', p_id, '{}'::jsonb);
end;
$$;

-- The built-in required list, now mirrored on the built-in placements.
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
  perform private.sync_builtin_placements_required(actor_org);
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.required_question_save', 'organization', actor_org,
          jsonb_build_object('question', p_question, 'required', required));
end;
$$;

-- An app screen with a required field placed on it always shows (RAPP-642),
-- now read from the placements.
create or replace function private.builtin_screen_hideable(p_screen text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select not (s.questions && private.unhideable_intake_questions())
      from private.wizard_screen_questions() s
     where s.screen = p_screen), false)
     and not exists (
       select 1 from public.field_placements p
         join public.profile_fields f on f.id = p.field_id
        where p.surface = 'onboarding' and p.screen_key = p_screen and p.required
          and f.kind = 'custom' and not f.is_archived
          and p.org_id = coalesce((select public.current_org_id()), (select public.default_organization_id())));
$$;

-- 14. The catalog carries the layout ----------------------------------------------------------------------------

create or replace function public.intake_catalog()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
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
        -- Added questions of an app screen (RAPP-642): never a step of its own.
        'builtin_screen', s.builtin_screen,
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
        'id', f.id, 'section_id', f.section_id, 'kind', f.kind, 'builtin_key', f.builtin_key,
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
            'id', o.id, 'label', o.label, 'sort_order', o.sort_order, 'is_archived', o.is_archived)
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

-- 15. The setup file carries the layout (schema version 2) ---------------------------------------------------

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
    'schema_version', 2,
    'app_commit', p_app_commit,
    'exported_at', now(),
    -- The profile layout (RAPP-649): sections, every field with its options, and
    -- where each is asked. The screens below keep the old question shape.
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'key', s.key, 'title', s.title, 'sort_order', s.sort_order, 'is_builtin', s.is_builtin)
        order by s.sort_order, s.created_at, s.id)
        from public.profile_sections s where s.org_id = actor_org), '[]'::jsonb),
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'section_id', f.section_id, 'kind', f.kind, 'builtin_key', f.builtin_key,
        'question_type', f.question_type, 'label', f.label, 'help', f.help, 'privacy', f.privacy,
        'default_required', f.default_required, 'settings', f.settings,
        'show_when_field_id', f.show_when_field_id, 'show_when_option_id', f.show_when_option_id,
        'sort_order', f.sort_order, 'is_archived', f.is_archived, 'legacy_screen_id', f.legacy_screen_id,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'label', o.label, 'sort_order', o.sort_order, 'is_archived', o.is_archived)
            order by o.sort_order, o.id)
            from public.custom_question_options o where o.question_id = f.id), '[]'::jsonb))
        order by f.sort_order, f.created_at, f.id)
        from public.profile_fields f where f.org_id = actor_org), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'field_id', p.field_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'sort_order', p.sort_order, 'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.surface, p.screen_key, p.sort_order, p.field_id)
        from public.field_placements p where p.org_id = actor_org), '[]'::jsonb),
    -- Staff screens, in the order the question builder lists them.
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'intro', s.intro,
        'after_screen', s.after_screen, 'sort_order', s.sort_order,
        'home_after_screen', s.home_after_screen, 'home_sort_order', s.home_sort_order,
        'is_archived', s.is_archived, 'builtin_screen', s.builtin_screen,
        'questions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', q.id, 'question_type', q.question_type, 'label', q.label, 'help', q.help,
            'privacy', q.privacy, 'placements', to_jsonb(q.placements), 'settings', q.settings,
            'is_required', q.is_required, 'sort_order', q.sort_order, 'is_archived', q.is_archived,
            'show_when_question_id', q.show_when_question_id, 'show_when_option_id', q.show_when_option_id,
            'options', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', o.id, 'label', o.label, 'sort_order', o.sort_order, 'is_archived', o.is_archived)
                order by o.sort_order, o.id)
                from public.custom_question_options o where o.question_id = q.id), '[]'::jsonb))
            order by q.sort_order, q.created_at, q.id)
            from public.custom_questions q where q.screen_id = s.id), '[]'::jsonb))
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
          jsonb_build_object('schema_version', 2, 'app_commit', p_app_commit,
                             'counts', private.onboarding_setup_counts(document)));
  return document;
end;
$function$;

CREATE OR REPLACE FUNCTION private.check_onboarding_setup_document(p_document jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
begin
  if p_document is null or jsonb_typeof(p_document) <> 'object'
     or p_document ->> 'format' is distinct from 'ramassa.onboarding-setup' then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/NOT_A_SETUP: this file is not an onboarding setup export';
  end if;
  -- "1" as a string is not version 1 of something else (pending fix 33).
  if jsonb_typeof(p_document -> 'schema_version') is distinct from 'number' then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: schema_version must be the number 1 or 2';
  end if;
  -- Version 2 adds the profile layout (RAPP-649); version 1 still imports.
  if (p_document ->> 'schema_version') not in ('1', '2') then
    raise invalid_parameter_value using message = format(
      'ONBOARDING_SETUP/UNKNOWN_SCHEMA_VERSION: this file uses onboarding setup schema version %s; this app reads versions 1 and 2. Export it again from an app at the same version.',
      coalesce(p_document ->> 'schema_version', 'none'));
  end if;
  if octet_length(p_document::text) > 5000000 then
    raise program_limit_exceeded using message = 'ONBOARDING_SETUP/TOO_LARGE: the file is larger than 5 MB';
  end if;
  if jsonb_typeof(p_document -> 'screens') is distinct from 'array'
     or jsonb_typeof(p_document -> 'builtin_question_overrides') is distinct from 'array'
     or jsonb_typeof(p_document -> 'builtin_screens') is distinct from 'array'
     or jsonb_typeof(p_document -> 'required_questions') is distinct from 'array'
     or jsonb_typeof(p_document -> 'presets') is distinct from 'array'
     or jsonb_typeof(p_document -> 'seasons') is distinct from 'array'
     or jsonb_typeof(p_document -> 'flow_order') not in ('array', 'null')
     or jsonb_typeof(p_document -> 'app_terms') is distinct from 'object'
     or jsonb_typeof(p_document -> 'app_terms' -> 'published') is distinct from 'array'
     or jsonb_typeof(p_document -> 'authorization') is distinct from 'object'
     or jsonb_typeof(p_document -> 'authorization' -> 'published') is distinct from 'array'
     or exists (select 1 from jsonb_array_elements(p_document -> 'screens') s
                 where jsonb_typeof(s) <> 'object' or jsonb_typeof(s -> 'questions') is distinct from 'array'
                    or exists (select 1 from jsonb_array_elements(s -> 'questions') q
                                where jsonb_typeof(q) <> 'object'
                                   or jsonb_typeof(q -> 'options') is distinct from 'array'))
     or ((p_document ->> 'schema_version') = '2' and (
           jsonb_typeof(p_document -> 'sections') is distinct from 'array'
           or jsonb_typeof(p_document -> 'fields') is distinct from 'array'
           or jsonb_typeof(p_document -> 'placements') is distinct from 'array'
           or exists (select 1 from jsonb_array_elements(p_document -> 'fields') f
                       where jsonb_typeof(f) <> 'object' or jsonb_typeof(f -> 'options') is distinct from 'array')
           or exists (select 1 from jsonb_array_elements(p_document -> 'placements') p
                       where jsonb_typeof(p) <> 'object')))
  then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: the file is incomplete or damaged';
  end if;
  if (select count(*) filter (where (s ->> 'is_current')::boolean)
        from jsonb_array_elements(p_document -> 'seasons') s) > 1 then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: more than one current season';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.onboarding_setup_problem(p_state text, p_message text, p_constraint text, p_table text)
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
        when 'custom_questions' then 'a question'
        when 'profile_fields' then 'a question'
        when 'field_placements' then 'where a question is asked'
        when 'profile_sections' then 'a section of the player profile'
        when 'custom_question_options' then 'an answer option'
        when 'builtin_question_overrides' then 'a change to an app question'
        when 'intake_builtin_screens' then 'the wording of an app screen'
        when 'intake_flow_orders' then 'the screen order'
        when 'intake_required_questions' then 'the list of required questions'
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

CREATE OR REPLACE FUNCTION private.apply_onboarding_setup(p_document jsonb, p_org_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  season_map jsonb := '{}'::jsonb;
  screen_map jsonb := '{}'::jsonb;
  question_map jsonb := '{}'::jsonb;
  option_map jsonb := '{}'::jsonb;
  section_map jsonb := '{}'::jsonb;
  field_map jsonb := '{}'::jsonb;
  document_version integer := (p_document ->> 'schema_version')::integer;
  new_field uuid;
  placed_screen text;
  item record;
  question record;
  option_item record;
  new_id uuid;
  new_screen uuid;
  new_question uuid;
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
  if (select count(*) <> count(distinct s ->> 'id') from jsonb_array_elements(p_document -> 'screens') s)
     or (select count(*) <> count(distinct q ->> 'id')
           from jsonb_array_elements(p_document -> 'screens') s, jsonb_array_elements(s -> 'questions') q)
     or (select count(*) <> count(distinct o ->> 'id')
           from jsonb_array_elements(p_document -> 'screens') s, jsonb_array_elements(s -> 'questions') q,
                jsonb_array_elements(q -> 'options') o)
     or (select count(*) <> count(distinct s ->> 'id') from jsonb_array_elements(p_document -> 'seasons') s)
     or (document_version >= 2 and (
           (select count(*) <> count(distinct s ->> 'id') from jsonb_array_elements(p_document -> 'sections') s)
           or (select count(*) <> count(distinct f ->> 'id') from jsonb_array_elements(p_document -> 'fields') f)
           or (select count(*) <> count(distinct o ->> 'id')
                 from jsonb_array_elements(p_document -> 'fields') f, jsonb_array_elements(f -> 'options') o)))
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

  -- Screens, questions and options.
  for item in select value, ordinality from jsonb_array_elements(p_document -> 'screens') with ordinality loop
    insert into public.intake_screens (
      org_id, title, intro, after_screen, sort_order, home_after_screen, home_sort_order, is_archived,
      builtin_screen, created_at, updated_at)
    values (
      p_org_id, item.value -> 'title', private.json_value_or_null(item.value -> 'intro'),
      item.value ->> 'after_screen', (item.value ->> 'sort_order')::integer,
      coalesce(item.value ->> 'home_after_screen', item.value ->> 'after_screen'),
      coalesce((item.value ->> 'home_sort_order')::integer, (item.value ->> 'sort_order')::integer),
      coalesce((item.value ->> 'is_archived')::boolean, false),
      -- Absent in a file from before RAPP-642: a screen of its own.
      nullif(private.json_value_or_null(item.value -> 'builtin_screen') #>> '{}', ''),
      now() + item.ordinality * interval '1 microsecond', now())
    returning id into new_screen;
    screen_map := screen_map || jsonb_build_object(item.value ->> 'id', new_screen);

    -- A version 2 file brings its questions as fields, below.
    for question in select value, ordinality from jsonb_array_elements(item.value -> 'questions') with ordinality
                     where document_version = 1 loop
      question_count := question_count + 1;
      insert into public.custom_questions (
        org_id, screen_id, question_type, label, help, privacy, placements, settings, is_required,
        sort_order, is_archived, created_at, updated_at)
      values (
        p_org_id, new_screen, question.value ->> 'question_type', question.value -> 'label',
        private.json_value_or_null(question.value -> 'help'), question.value ->> 'privacy',
        array(select jsonb_array_elements_text(private.json_array_or_empty(question.value -> 'placements'))),
        coalesce(private.json_value_or_null(question.value -> 'settings'), '{}'::jsonb),
        coalesce((question.value ->> 'is_required')::boolean, false),
        (question.value ->> 'sort_order')::integer, coalesce((question.value ->> 'is_archived')::boolean, false),
        now() + question_count * interval '1 microsecond', now())
      returning id into new_question;
      question_map := question_map || jsonb_build_object(question.value ->> 'id', new_question);

      -- Options are ordered by sort order alone: equal places get the file's order.
      select count(*) <> count(distinct o ->> 'sort_order') into option_ties
        from jsonb_array_elements(question.value -> 'options') o;
      for option_item in select value, ordinality from jsonb_array_elements(question.value -> 'options') with ordinality loop
        insert into public.custom_question_options (org_id, question_id, label, sort_order, is_archived)
        values (p_org_id, new_question, option_item.value -> 'label',
                case when option_ties then option_item.ordinality::integer - 1
                     else (option_item.value ->> 'sort_order')::integer end,
                coalesce((option_item.value ->> 'is_archived')::boolean, false))
        returning id into new_id;
        option_map := option_map || jsonb_build_object(option_item.value ->> 'id', new_id);
      end loop;
    end loop;
  end loop;

  -- Show-when, once every question and option exists.
  for question in
    select q.value from jsonb_array_elements(p_document -> 'screens') s, jsonb_array_elements(s -> 'questions') q
     where private.json_value_or_null(q.value -> 'show_when_question_id') is not null
       and document_version = 1
  loop
    if question_map ->> (question.value ->> 'show_when_question_id') is null
       or option_map ->> (question.value ->> 'show_when_option_id') is null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a condition names a question or option that is not in the file';
    end if;
    update public.custom_questions
       set show_when_question_id = (question_map ->> (question.value ->> 'show_when_question_id'))::uuid,
           show_when_option_id = (option_map ->> (question.value ->> 'show_when_option_id'))::uuid
     where id = (question_map ->> (question.value ->> 'id'))::uuid;
  end loop;

  -- The profile layout (RAPP-649, version 2): built-in sections and fields by
  -- their key, the others new; then where each is asked; then conditions.
  if document_version >= 2 then
    for item in select value from jsonb_array_elements(p_document -> 'sections') loop
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

    for item in select value, ordinality from jsonb_array_elements(p_document -> 'fields') with ordinality loop
      if section_map ->> (item.value ->> 'section_id') is null then
        raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a question names a section that is not in the file';
      end if;
      if item.value ->> 'kind' = 'builtin' then
        update public.profile_fields
           set label = item.value -> 'label', help = private.json_value_or_null(item.value -> 'help'),
               section_id = (section_map ->> (item.value ->> 'section_id'))::uuid,
               sort_order = (item.value ->> 'sort_order')::integer, updated_at = now()
         where org_id = p_org_id and builtin_key = item.value ->> 'builtin_key'
        returning id into new_field;
        if new_field is null then
          raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: an app question this app does not know';
        end if;
      else
        question_count := question_count + 1;
        insert into public.profile_fields (
          org_id, section_id, kind, question_type, label, help, privacy, default_required, settings,
          sort_order, legacy_screen_id, created_by, is_archived, created_at, updated_at)
        values (
          p_org_id, (section_map ->> (item.value ->> 'section_id'))::uuid, 'custom', item.value ->> 'question_type',
          item.value -> 'label', private.json_value_or_null(item.value -> 'help'), item.value ->> 'privacy',
          coalesce((item.value ->> 'default_required')::boolean, false),
          coalesce(private.json_value_or_null(item.value -> 'settings'), '{}'::jsonb),
          (item.value ->> 'sort_order')::integer,
          (screen_map ->> (private.json_value_or_null(item.value -> 'legacy_screen_id') #>> '{}'))::uuid,
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

    -- The built-in fields are placed as the file says.
    delete from public.field_placements p
     using public.profile_fields f
     where f.id = p.field_id and f.org_id = p_org_id and f.kind = 'builtin';
    for item in select value from jsonb_array_elements(p_document -> 'placements') loop
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

    for item in
      select value from jsonb_array_elements(p_document -> 'fields')
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
  end if;

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
  if jsonb_typeof(p_document -> 'flow_order') = 'array' then
    select array_agg(
             case when step.value like 'custom:%' then 'custom:' || (screen_map ->> substr(step.value, 8))
                  else step.value end
             order by step.ordinality)
      into steps
      from jsonb_array_elements_text(p_document -> 'flow_order') with ordinality as step(value, ordinality);
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

-- 16. The import records the file's version; the RGPD register lists the new tables -------------------------

CREATE OR REPLACE FUNCTION public.import_onboarding_setup(p_document jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  blockers text[];
  report jsonb;
  failed_state text;
  failed_message text;
  failed_constraint text;
  failed_table text;
  clear_message text;
begin
  if not (select public.has_permission('settings.organization')) or actor_org is null then
    raise insufficient_privilege using message = 'importing the onboarding setup needs settings.organization';
  end if;
  perform private.check_onboarding_setup_document(p_document);
  -- One import at a time per organization.
  perform 1 from public.organizations where id = actor_org for update;
  blockers := private.onboarding_setup_blockers(actor_org);
  if cardinality(blockers) > 0 then
    raise object_not_in_prerequisite_state using message = format(
      'ONBOARDING_SETUP/NOT_EMPTY: this organization already has onboarding settings (%s)',
      array_to_string(blockers, ', '));
  end if;
  begin
    report := private.apply_onboarding_setup(p_document, actor_org, actor);
  exception when others then
    -- The preview's clear sentence, never a table or constraint name.
    get stacked diagnostics failed_state = returned_sqlstate, failed_message = message_text,
                            failed_constraint = constraint_name, failed_table = table_name;
    clear_message := private.onboarding_setup_problem(failed_state, failed_message, failed_constraint, failed_table);
    if clear_message is distinct from failed_message then
      raise invalid_parameter_value using message = clear_message;
    end if;
    raise;
  end;
  report := report || jsonb_build_object('warnings', private.onboarding_setup_warnings(p_document));
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'onboarding.import', 'organization', actor_org,
          jsonb_build_object('schema_version', (p_document ->> 'schema_version')::integer, 'app_commit', p_document ->> 'app_commit',
                             'counts', report -> 'counts', 'legal', report -> 'legal'));
  return report;
end;
$function$;

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
    ('profile_sections', null, 'not_personal', 'Sections of the player profile layout.'),
    ('profile_fields', null, 'not_personal', 'The pieces of information the profile holds, and who created each.'),
    ('field_placements', null, 'not_personal', 'Where each piece of information is asked.'),
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
