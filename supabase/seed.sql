-- Local development seed. Runs on `supabase db reset` / `supabase start` against
-- the LOCAL stack only. It never touches production (prod is provisioned via
-- `supabase db push`, which does not apply this file).
--
-- What this file is for (RAPP-18): a reset gives TDD, the dev menu (RAPP-19),
-- and the Maestro flows the SAME realistic dataset every time, so a screen can
-- be opened and judged without anyone hand-creating accounts first.
--
-- FAKE DATA ONLY. Every address is under the reserved `.test` TLD (RFC 6761) so
-- a fixture can never reach a real mailbox, and no real participant data is ever
-- committed to this repo (RGPD; SPEC § sensitive population). Seed rows carry a
-- `5eed…` UUID prefix so fixture data is recognizable at a glance and can never
-- collide with the self-contained pgTAP fixtures in `supabase/tests/`.
--
-- Names are written in their OWN SCRIPT (Arabic, Farsi, Cyrillic), never
-- transliterated: RTL mirroring and the bundled Arabic/Farsi fonts (ADR-006) can
-- only be tested honestly against real script. `packages/shared/testing/` mirrors
-- this roster for unit tests, and `tests/seed-fixtures.test.ts` fails the build
-- if the two ever drift apart.
--
-- STANDING RULE: every new table ships with seed rows and a factory in the same
-- issue. `supabase/tests/0003_seed_data_test.sql` enforces it.

-- Local-only field-encryption key. This is a throwaway value for local dev and
-- CI, NOT the production key. The production key is created once in the prod
-- project's Vault, out of band, and never committed (ADR-004 / RAPP-10). The app
-- reads whichever key exists via public.encryption_key().
-- vault.create_secret encrypts the value; a raw INSERT would not decrypt back.
select vault.create_secret(
  'local-dev-only-encryption-key-not-for-production',
  'app_encryption_key',
  'LOCAL/CI field-encryption key. Prod key is set in the prod Vault out of band.'
)
where not exists (
  select 1 from vault.secrets where name = 'app_encryption_key'
);

-- The demo tenant. Ordinal 0 of the seed namespace.
insert into public.organizations (id, name, slug, contact_email, contact_phone)
values (
  '5eed0000-0000-4000-8000-000000000000',
  'AE Ramassà',
  'ramassa',
  'laia.ferrer@example.test',
  '+34600000000'
)
on conflict (id) do nothing;

-- Event categories and events --------------------------------------------------
-- Six real category shapes, followed by one repeating training, one one-off
-- cultural outing, and one draft. The trigger materializes their occurrences.
insert into public.event_categories
  (id, org_id, name, icon, color, sort_order)
values
  (
    '5eed0000-0000-4000-8002-000000000001',
    '5eed0000-0000-4000-8000-000000000000',
    '{"ca":"Entrenaments","es":"Entrenamientos","en":"Trainings","ar":"التدريبات","fa":"تمرین‌ها"}',
    'dumbbell', 'primary', 10
  ),
  (
    '5eed0000-0000-4000-8002-000000000002',
    '5eed0000-0000-4000-8000-000000000000',
    '{"ca":"Cursos","es":"Cursos","en":"Courses","ar":"الدورات","fa":"دوره‌ها"}',
    'graduation-cap', 'secondary', 20
  ),
  (
    '5eed0000-0000-4000-8002-000000000003',
    '5eed0000-0000-4000-8000-000000000000',
    '{"ca":"Activitats culturals","es":"Actividades culturales","en":"Cultural activities","ar":"الأنشطة الثقافية","fa":"فعالیت‌های فرهنگی"}',
    'theater', 'accent', 30
  ),
  (
    '5eed0000-0000-4000-8002-000000000004',
    '5eed0000-0000-4000-8000-000000000000',
    '{"ca":"Inserció laboral","es":"Inserción laboral","en":"Job insertion","ar":"الإدماج المهني","fa":"ورود به بازار کار"}',
    'briefcase-business', 'chart-1', 40
  ),
  (
    '5eed0000-0000-4000-8002-000000000005',
    '5eed0000-0000-4000-8000-000000000000',
    '{"ca":"Cursos d''idiomes","es":"Cursos de idiomas","en":"Language courses","ar":"دورات اللغة","fa":"دوره‌های زبان"}',
    'languages', 'chart-2', 50
  ),
  (
    '5eed0000-0000-4000-8002-000000000006',
    '5eed0000-0000-4000-8000-000000000000',
    '{"ca":"Sortides","es":"Salidas","en":"Outings","ar":"الرحلات","fa":"گردش‌ها"}',
    'footprints', 'chart-3', 60
  )
on conflict (id) do nothing;

insert into public.events (
  id,
  org_id,
  category_id,
  title,
  description,
  location,
  location_url,
  starts_at,
  ends_at,
  recurrence_rule,
  max_participants,
  signup_mode,
  status,
  published_at,
  created_by,
  created_at
)
values
  (
    '5eed0000-0000-4000-8003-000000000001',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8002-000000000001',
    '{"ca":"Entrenament setmanal","es":"Entrenamiento semanal","en":"Weekly training","ar":"تدريب أسبوعي","fa":"تمرین هفتگی"}',
    '{"ca":"Sessió oberta de futbol i preparació física.","es":"Sesión abierta de fútbol y preparación física.","en":"Open football and fitness session.","ar":"جلسة مفتوحة لكرة القدم واللياقة البدنية.","fa":"جلسه آزاد فوتبال و آمادگی جسمانی."}',
    'Camp Municipal de Vic',
    'https://maps.google.com/?q=Camp+Municipal+de+Vic',
    (date_trunc('day', now() at time zone 'Europe/Madrid') + interval '3 days 18 hours') at time zone 'Europe/Madrid',
    (date_trunc('day', now() at time zone 'Europe/Madrid') + interval '3 days 19 hours 30 minutes') at time zone 'Europe/Madrid',
    'FREQ=WEEKLY;INTERVAL=1;COUNT=6',
    24,
    'confirm',
    'published',
    now() - interval '1 day',
    null,
    now() - interval '1 day'
  ),
  (
    '5eed0000-0000-4000-8003-000000000002',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8002-000000000003',
    '{"ca":"Visita al Museu Episcopal","es":"Visita al Museo Episcopal","en":"Episcopal Museum visit","ar":"زيارة المتحف الأسقفي","fa":"بازدید از موزه اسقفی"}',
    '{"ca":"Sortida cultural amb trobada davant del museu.","es":"Salida cultural con encuentro delante del museo.","en":"Cultural outing meeting outside the museum.","ar":"رحلة ثقافية مع لقاء أمام المتحف.","fa":"گردش فرهنگی با قرار جلوی موزه."}',
    'Museu Episcopal de Vic',
    'https://maps.google.com/?q=Museu+Episcopal+de+Vic',
    (date_trunc('day', now() at time zone 'Europe/Madrid') + interval '10 days 11 hours') at time zone 'Europe/Madrid',
    (date_trunc('day', now() at time zone 'Europe/Madrid') + interval '10 days 13 hours') at time zone 'Europe/Madrid',
    null,
    20,
    'interest',
    'published',
    now() - interval '1 day',
    null,
    now() - interval '12 hours'
  ),
  (
    '5eed0000-0000-4000-8003-000000000003',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8002-000000000005',
    '{"ca":"Taller de conversa"}',
    null,
    'Local de Ramassà',
    null,
    (date_trunc('day', now() at time zone 'Europe/Madrid') + interval '14 days 17 hours') at time zone 'Europe/Madrid',
    null,
    null,
    null,
    'none',
    'draft',
    null,
    null,
    now() - interval '2 hours'
  ),
  (
    '5eed0000-0000-4000-8003-000000000004',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8002-000000000002',
    '{"ca":"Taller de primers auxilis","es":"Taller de primeros auxilios","en":"First aid workshop","ar":"ورشة الإسعافات الأولية","fa":"کارگاه کمک‌های اولیه"}',
    '{"ca":"Taller pràctic amb places limitades.","es":"Taller práctico con plazas limitadas.","en":"Practical workshop with limited places.","ar":"ورشة عملية بأماكن محدودة.","fa":"کارگاه عملی با ظرفیت محدود."}',
    'Local de Ramassà',
    'https://maps.google.com/?q=Ramassa+Vic',
    (date_trunc('day', now() at time zone 'Europe/Madrid') + interval '7 days 16 hours') at time zone 'Europe/Madrid',
    (date_trunc('day', now() at time zone 'Europe/Madrid') + interval '7 days 18 hours') at time zone 'Europe/Madrid',
    null,
    1,
    'confirm',
    'published',
    now() - interval '1 day',
    null,
    now() - interval '6 hours'
  )
on conflict (id) do nothing;

-- The roster -------------------------------------------------------------------
-- Written once into a temporary table, then read three times (auth.users, the
-- email identities, profiles). A temp table beats repeating twenty-five people
-- across three INSERT statements, and it disappears with the seeding session.
--
-- Ordinals 1-5 are staff/admin/entity, 11-30 the participants; the gap keeps a
-- role readable straight off a UUID while debugging. Everything not listed here
-- (phone, sizes, dependents, document) is DERIVED from the ordinal below, by the
-- same formulas `packages/shared/testing/factories.ts` uses.
--
-- The whole roster block is ONE `do` statement on purpose. The Supabase CLI
-- parses the entire seed file before it executes any of it, so a later statement
-- cannot reference a temp table an earlier statement creates ("relation
-- seed_roster does not exist"). Inside a plpgsql block each statement is parsed
-- when it runs, which is exactly what this needs.

do $seed$
begin

create temporary table seed_roster (
  ordinal int primary key,
  email text not null,
  app_role text not null,
  first_name text not null,
  last_name text not null,
  preferred_language text not null,
  nationality text not null,
  city text not null,
  -- Set only for entity accounts, which represent a person AT a referring
  -- entity. NULL means "derive from the ordinal" (participants).
  own_reference_entity text
);

insert into seed_roster (ordinal, email, app_role, first_name, last_name, preferred_language, nationality, city, own_reference_entity) values
  -- Staff, admin, and the two social-entity contacts.
  (1,  'laia.ferrer@example.test',        'admin',  'Laia',    'Ferrer', 'ca', 'Espanya', 'Vic',     null),
  (2,  'marta.puig@example.test',         'staff',  'Marta',   'Puig',   'ca', 'Espanya', 'Vic',     null),
  (3,  'nuria.serra@example.test',        'staff',  'Núria',   'Serra',  'ca', 'Espanya', 'Manlleu', null),
  (4,  'silvia.bosch@example.test',       'entity', 'Sílvia',  'Bosch',  'ca', 'Espanya', 'Vic',     'Creu Roja Osona'),
  (5,  'jordi.camps@example.test',        'entity', 'Jordi',   'Camps',  'es', 'Espanya', 'Vic',     'CEAR Catalunya'),
  -- Participants: Arabic script.
  (11, 'amina.alhassan@example.test',     'player', 'أمينة',   'الحسن',      'ar', 'Síria',     'Vic',     null),
  (12, 'fatima.zahra@example.test',       'player', 'فاطمة',   'الزهراء',    'ar', 'Marroc',    'Manlleu', null),
  (13, 'mariam.benali@example.test',      'player', 'مريم',    'بن علي',     'ar', 'Tunísia',   'Vic',     null),
  (14, 'zeinab.haddad@example.test',      'player', 'زينب',    'حداد',       'ar', 'Síria',     'Torelló', null),
  (15, 'souad.almansouri@example.test',   'player', 'سعاد',    'المنصوري',   'ar', 'Marroc',    'Manlleu', null),
  -- Participants: Farsi script.
  (16, 'zahra.rezaei@example.test',       'player', 'زهرا',    'رضایی',      'fa', 'Afganistan', 'Vic',         null),
  (17, 'fereshteh.ahmadi@example.test',   'player', 'فرشته',   'احمدی',      'fa', 'Afganistan', 'Roda de Ter', null),
  (18, 'samira.karimi@example.test',      'player', 'سمیرا',   'کریمی',      'fa', 'Iran',       'Vic',         null),
  (19, 'ruqiya.hosseini@example.test',    'player', 'رقیه',    'حسینی',      'fa', 'Afganistan', 'Manlleu',     null),
  -- Participants: Ukrainian arrivals. The program serves them, but Ukrainian is
  -- not one of the five app languages (ADR-006), so they use Spanish or English.
  (20, 'oksana.kovalchuk@example.test',    'player', 'Оксана',  'Ковальчук',  'es', 'Ucraïna', 'Vic',     null),
  (21, 'iryna.melnyk@example.test',        'player', 'Ірина',   'Мельник',    'en', 'Ucraïna', 'Torelló', null),
  (22, 'nataliia.shevchenko@example.test', 'player', 'Наталія', 'Шевченко',   'es', 'Ucraïna', 'Vic',     null),
  (23, 'yuliia.bondarenko@example.test',   'player', 'Юлія',    'Бондаренко', 'en', 'Ucraïna', 'Manlleu', null),
  -- Participants: Latin American and Sub-Saharan arrivals, plus a local player.
  (24, 'maria.rojas@example.test',        'player', 'María Fernanda', 'Rojas',   'es', 'Colòmbia',  'Vic',     null),
  (25, 'yolanda.quispe@example.test',     'player', 'Yolanda',        'Quispe',  'es', 'Perú',      'Manlleu', null),
  (26, 'rosa.mamani@example.test',        'player', 'Rosa',           'Mamani',  'es', 'Bolívia',   'Vic',     null),
  (27, 'daniela.ortega@example.test',     'player', 'Daniela',        'Ortega',  'ca', 'Veneçuela', 'Torelló', null),
  (28, 'aissatou.diallo@example.test',    'player', 'Aissatou',       'Diallo',  'es', 'Senegal',   'Vic',     null),
  (29, 'fatoumata.camara@example.test',   'player', 'Fatoumata',      'Camara',  'ca', 'Gàmbia',    'Manlleu', null),
  -- The no-email case (RAPP-25). Her address was GENERATED by
  -- `create_participant_account` rather than chosen, is unroutable by RFC 2606
  -- because she has no inbox to route to, and marks her as the one roster
  -- account whose password staff can reset. Without her, the reset screen is a
  -- screen nobody can open in the dev app.
  (30, 'blanca.k4m9@ramassa.invalid',    'player', 'Blanca',         'Ribes',   'ca', 'Espanya',   'Vic',     null);

-- Auth accounts ------------------------------------------------------------------
-- Seeded profiles are useless if nobody can sign in as them: the dev menu and the
-- Maestro flows log in with these. Every account shares one local-only password
-- (`ramassa-dev-password`) via the admin-created fallback path (ADR-005), and is
-- pre-confirmed so no inbox round trip is needed.
--
-- The empty-string token columns are deliberate: GoTrue scans them as strings and
-- errors on NULL. `raw_user_meta_data` stays empty because it is user-editable and
-- must never carry anything an authorization decision reads.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000',
  ('5eed0000-0000-4000-8000-' || lpad(r.ordinal::text, 12, '0'))::uuid,
  'authenticated',
  'authenticated',
  r.email,
  extensions.crypt('ramassa-dev-password', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  '', '', '', '', '', ''
from seed_roster r
on conflict (id) do nothing;

-- The email identity. Without it Supabase Auth cannot resolve the address to the
-- user, so a password login fails even though auth.users holds the hash.
insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select
  u.id::text,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  now(),
  now(),
  now()
from auth.users u
join seed_roster r on r.email = u.email
on conflict (provider_id, provider) do nothing;

-- Profiles -----------------------------------------------------------------------
-- The RGPD-sensitive columns go through public.encrypt_field, the same helper the
-- app uses (ADR-004), so a detail view exercises real decryption instead of
-- reading plaintext that a broken decrypt would still render.
--
-- A handful of rows are deliberately imperfect: three accounts never accepted the
-- terms, two participants are deactivated, one is forum-banned, and five hold no
-- identity document, four of them participants (the just-arrived case). A
-- uniformly happy dataset hides exactly the screens that break.

insert into public.profiles (
  id, org_id, role, first_name, last_name, date_of_birth, place_of_birth, nationality,
  address, city, postal_code, phone, document_type, document_number,
  reference_entity, reference_contact_name, has_dependents, num_dependents,
  clothing_size, shoe_size, preferred_language, is_active, is_forum_banned,
  terms_accepted_at, auth_method
)
select
  ('5eed0000-0000-4000-8000-' || lpad(r.ordinal::text, 12, '0'))::uuid,
  '5eed0000-0000-4000-8000-000000000000',
  r.app_role,
  r.first_name,
  r.last_name,
  make_date(1985 + (r.ordinal % 15), 1 + (r.ordinal % 12), 1 + (r.ordinal % 28)),
  -- Where she was born, in the script she writes it in. Required at intake
  -- since 2026-07-31 (RAPP-21), so a roster of NULLs would leave the staff edit
  -- form (RAPP-24) unable to save ANY seeded participant without inventing a
  -- birthplace first: the form re-validates the same rule the wizard applies.
  --
  -- Two participants keep a NULL on purpose. Profiles created before the field
  -- existed carry one, and that case has its own behaviour (staff must supply
  -- it before they can save anything else); a uniformly complete dataset would
  -- hide it, exactly as the deactivated and undocumented rows exist to stop
  -- their screens hiding.
  case when r.ordinal % 11 = 0 then null else
    case r.nationality
      when 'Síria'      then 'حلب'
      when 'Marroc'     then 'الرباط'
      when 'Tunísia'    then 'تونس'
      when 'Afganistan' then 'کابل'
      when 'Iran'       then 'تهران'
      when 'Ucraïna'    then 'Київ'
      when 'Colòmbia'   then 'Medellín'
      when 'Perú'       then 'Cusco'
      when 'Bolívia'    then 'Oruro'
      when 'Veneçuela'  then 'Maracaibo'
      when 'Senegal'    then 'Dakar'
      when 'Gàmbia'     then 'Banjul'
      else 'Vic'
    end
  end,
  r.nationality,
  public.encrypt_field('Carrer de Prova, ' || r.ordinal),
  r.city,
  public.encrypt_field(
    case r.city
      when 'Vic' then '08500'
      when 'Manlleu' then '08560'
      when 'Torelló' then '08570'
      when 'Roda de Ter' then '08510'
      else '08500'
    end
  ),
  public.encrypt_field('+346' || lpad(r.ordinal::text, 8, '0')),
  case when r.ordinal % 5 = 0 then 'none' else 'nie' end,
  case when r.ordinal % 5 = 0 then null
       else public.encrypt_field('Y' || lpad(r.ordinal::text, 7, '0') || 'Z') end,
  coalesce(
    r.own_reference_entity,
    case r.ordinal % 3 when 0 then 'Creu Roja Osona' when 1 then 'CEAR Catalunya' else null end
  ),
  case when r.own_reference_entity is not null then null
       else case r.ordinal % 3 when 0 then 'Sílvia Bosch' when 1 then 'Jordi Camps' else null end end,
  r.ordinal % 3 = 0,
  case when r.ordinal % 3 = 0 then 1 + (r.ordinal % 4) else 0 end,
  (array['S', 'M', 'L', 'XL'])[1 + (r.ordinal % 4)],
  (36 + (r.ordinal % 6))::text,
  r.preferred_language,
  r.ordinal % 13 <> 0,
  r.ordinal % 17 = 0,
  case when r.ordinal % 7 = 0 then null else now() end,
  case when r.email like '%@ramassa.invalid' then 'admin_created' else 'magic_link' end
from seed_roster r
on conflict (id) do nothing;

-- Push tokens --------------------------------------------------------------------
-- Two registered devices, so a staff-side send screen has something to target
-- before any device has ever run the app (RAPP-17 registers the real ones).

insert into public.push_tokens (id, user_id, token, platform, device_id)
select
  ('5eed0000-0000-4000-8000-' || lpad((900 + r.ordinal)::text, 12, '0'))::uuid,
  ('5eed0000-0000-4000-8000-' || lpad(r.ordinal::text, 12, '0'))::uuid,
  'ExponentPushToken[seed-' || lpad(r.ordinal::text, 4, '0') || ']',
  case when r.ordinal % 2 = 0 then 'android' else 'ios' end,
  'seed-device-' || lpad(r.ordinal::text, 4, '0')
from seed_roster r
where r.ordinal in (11, 12)
on conflict (user_id, device_id) do nothing;

-- The wizard's test account (RAPP-21) -----------------------------------------------
-- An auth user with NO profile row: the exact state of every brand-new player,
-- which nothing else in the seeds provides (the roster all has profiles). The
-- onboarding gate, the wizard flows and their captures all sign in as this
-- account; completing the wizard locally creates its profile, and the next
-- `db reset` removes it again, so the capture is reproducible forever.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, reauthentication_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '5eed0000-0000-4000-8000-000000000099',
  'authenticated',
  'authenticated',
  'onboarding@example.test',
  extensions.crypt('ramassa-dev-password', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now(), '', '', '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
values (
  '5eed0000-0000-4000-8000-000000000099',
  '5eed0000-0000-4000-8000-000000000099',
  jsonb_build_object('sub', '5eed0000-0000-4000-8000-000000000099', 'email', 'onboarding@example.test'),
  'email',
  now(), now(), now()
)
on conflict (provider_id, provider) do nothing;

-- Terms acceptances ----------------------------------------------------------------
-- The consent EVENT behind each seeded player's `terms_accepted_at` (RAPP-21).
-- Seeded in the language that player actually reads, because the whole point of
-- the record is which text in which language someone agreed to.

insert into public.terms_acceptances (profile_id, terms_version, locale_shown)
select
  ('5eed0000-0000-4000-8000-' || lpad(r.ordinal::text, 12, '0'))::uuid,
  '2026-07-01',
  r.preferred_language
from seed_roster r
where r.app_role = 'player'
on conflict do nothing;

-- Deletion requests ----------------------------------------------------------------
-- One open RGPD erasure request (RAPP-22), so the staff queue that resolves them
-- (RAPP-26) has something to show before anyone files one by hand, and so the
-- participant-side "we received your request" state is reachable in the dev app.
-- Deliberately ONE, and deliberately open: a resolved request proves nothing
-- about the screen that has to display a pending one.

insert into public.deletion_requests (profile_id, reason, state)
select
  ('5eed0000-0000-4000-8000-' || lpad(r.ordinal::text, 12, '0'))::uuid,
  'Ja no puc venir a entrenar i prefereixo que esborreu les meves dades.',
  'open'
from seed_roster r
where r.app_role = 'player'
order by r.ordinal
limit 1
on conflict do nothing;

-- Staff notes ------------------------------------------------------------------------
-- The team's working record about a participant (RAPP-24), so the detail screen
-- opens with a real thread rather than an empty box, and so the append-only
-- behaviour is visible in the dev app before anyone types a note.
--
-- Two notes by two DIFFERENT staff members: the whole point of storing an author
-- is that a thread reads as a conversation between colleagues, and a single-author
-- fixture would let a broken author column look fine.
--
-- Written about Amina (ordinal 11), deliberately not about the participants the
-- pgTAP suite drives, so a test can count what its own transaction did.

insert into public.participant_notes (profile_id, author_id, body, created_at)
values
  (
    '5eed0000-0000-4000-8000-000000000011',
    '5eed0000-0000-4000-8000-000000000002',
    'Ha començat el curs de català als matins. Millor proposar-li els entrenaments de tarda.',
    now() - interval '9 days'
  ),
  (
    '5eed0000-0000-4000-8000-000000000011',
    '5eed0000-0000-4000-8000-000000000003',
    'Confirmat amb ella per telèfon: pot venir dimarts i dijous. Li hem donat samarreta i pantalons.',
    now() - interval '2 days'
  )
on conflict do nothing;

-- The access audit -----------------------------------------------------------------------
-- Two earlier staff consultations of the same participant (RAPP-24), so the audit
-- table is never empty and the shape of an entry is visible in Studio without
-- anyone having to open the screen first.
--
-- View entries carry no `changes`, which is correct: nothing changed. The values
-- of encrypted columns are never recorded here, by design (ADR-004), so there is
-- no fixture that could teach anyone otherwise.

insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes, created_at)
values
  (
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8000-000000000002',
    'profile.view_sensitive',
    'profile',
    '5eed0000-0000-4000-8000-000000000011',
    null,
    now() - interval '9 days'
  ),
  (
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8000-000000000003',
    'profile.update',
    'profile',
    '5eed0000-0000-4000-8000-000000000011',
    '{"city": {"old": "Manlleu", "new": "Vic"}, "phone": {"changed": true}}'::jsonb,
    now() - interval '2 days'
  )
on conflict do nothing;

-- Invites -----------------------------------------------------------------------------
-- Two invitations (RAPP-25), so the staff invite list is not an empty screen and
-- both states it has to render are reachable in the dev app.
--
-- The PENDING one is addressed to the seeded onboarding account, which has an
-- auth user and deliberately no profile: signing in as her and opening the
-- wizard is exactly how the referring-entity prefill gets exercised by hand.
-- The SPENT one shows what an invitation looks like after it has done its job.

insert into public.invites (org_id, email, reference_entity, invited_by, expires_at, accepted_at, accepted_by)
values
  (
    '5eed0000-0000-4000-8000-000000000000',
    'onboarding@example.test',
    'Creu Roja Osona',
    '5eed0000-0000-4000-8000-000000000002',
    now() + interval '30 days',
    null,
    null
  ),
  (
    '5eed0000-0000-4000-8000-000000000000',
    'iryna.melnyk@example.test',
    'CEAR Catalunya',
    '5eed0000-0000-4000-8000-000000000003',
    now() + interval '30 days',
    now() - interval '12 days',
    '5eed0000-0000-4000-8000-000000000021'
  )
on conflict do nothing;

drop table seed_roster;

end
$seed$;

-- Player event signup states (RAPP-34) --------------------------------------------
-- Three states make the happy path, interest path, and at-capacity path reachable
-- without editing Studio. Signups belong to the event series, not one occurrence.
insert into public.event_signups (id, org_id, event_id, player_id, state, created_at)
values
  (
    '5eed0000-0000-4000-8006-000000000001',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8003-000000000001',
    '5eed0000-0000-4000-8000-000000000011',
    'cancelled',
    now() - interval '1 day'
  ),
  (
    '5eed0000-0000-4000-8006-000000000002',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8003-000000000002',
    '5eed0000-0000-4000-8000-000000000012',
    'interested',
    now() - interval '12 hours'
  ),
  (
    '5eed0000-0000-4000-8006-000000000003',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8003-000000000004',
    '5eed0000-0000-4000-8000-000000000013',
    'confirmed',
    now() - interval '6 hours'
  )
on conflict (id) do nothing;

-- Equipment deliveries (RAPP-27) -------------------------------------------------------
--
-- Two participants rather than one, and three items with two different staff
-- handing them over, so a screen grouping by participant, by item or by deliverer
-- has something real to group. One row deliberately has no size (a water bottle),
-- because the column is nullable on purpose and a fixture set where it is always
-- present would let a broken "sizeless item" path look fine.
--
-- About Blanca (ordinal 30) and Daniela (27), NOT about the participants the
-- pgTAP suite drives, so a test can count what its own transaction did.

insert into public.equipment_deliveries (profile_id, item, size, delivered_on, delivered_by, note)
values
  (
    '5eed0000-0000-4000-8000-000000000030',
    'boots', '38', current_date - 21,
    '5eed0000-0000-4000-8000-000000000002',
    null
  ),
  (
    '5eed0000-0000-4000-8000-000000000030',
    'jersey', 'M', current_date - 21,
    '5eed0000-0000-4000-8000-000000000002',
    null
  ),
  (
    '5eed0000-0000-4000-8000-000000000027',
    'water_bottle', null, current_date - 5,
    '5eed0000-0000-4000-8000-000000000003',
    'Segona ampolla, la primera es va perdre al camp.'
  )
on conflict do nothing;
-- Announcements -----------------------------------------------------------------
-- One row for every list lifecycle, plus two currently visible rows whose pin
-- order is meaningful. Published rows are complete in all five languages.
insert into public.announcements
  (id, org_id, category, title, body, image_url, image_alt, is_pinned, status,
   published_at, expires_at, created_by, created_at)
values
  (
    '5eed0000-0000-4000-8001-000000000001',
    '5eed0000-0000-4000-8000-000000000000',
    'training',
    '{"ca":"Canvi d''horari","es":"Cambio de horario","en":"Schedule change","ar":"تغيير الموعد","fa":"تغییر برنامه"}',
    '{"ca":"Esborrany pendent de revisió."}'::jsonb,
    null,
    null,
    false,
    'draft',
    null,
    null,
    '5eed0000-0000-4000-8000-000000000002',
    now() - interval '4 days'
  ),
  (
    '5eed0000-0000-4000-8001-000000000002',
    '5eed0000-0000-4000-8000-000000000000',
    'urgent',
    '{"ca":"Entrenament cancel·lat","es":"Entrenamiento cancelado","en":"Training cancelled","ar":"تم إلغاء التدريب","fa":"تمرین لغو شد"}',
    '{"ca":"La pluja ha deixat el camp impracticable.","es":"La lluvia ha dejado el campo impracticable.","en":"Rain has made the pitch unplayable.","ar":"جعل المطر الملعب غير صالح للعب.","fa":"باران زمین را غیرقابل بازی کرده است."}',
    null,
    null,
    true,
    'published',
    now() - interval '2 hours',
    now() + interval '1 day',
    '5eed0000-0000-4000-8000-000000000002',
    now() - interval '2 hours'
  ),
  (
    '5eed0000-0000-4000-8001-000000000003',
    '5eed0000-0000-4000-8000-000000000000',
    'social',
    '{"ca":"Trobada de famílies","es":"Encuentro de familias","en":"Family gathering","ar":"لقاء العائلات","fa":"گردهمایی خانواده‌ها"}',
    '{"ca":"Dissabte compartirem un dinar al club.","es":"El sábado compartiremos una comida en el club.","en":"We will share lunch at the club on Saturday.","ar":"سنتناول الغداء معًا في النادي يوم السبت.","fa":"شنبه در باشگاه ناهار را با هم صرف می‌کنیم."}',
    null,
    null,
    false,
    'published',
    now() - interval '1 day',
    null,
    '5eed0000-0000-4000-8000-000000000002',
    now() - interval '1 day'
  ),
  (
    '5eed0000-0000-4000-8001-000000000004',
    '5eed0000-0000-4000-8000-000000000000',
    'info',
    '{"ca":"Reunió de temporada","es":"Reunión de temporada","en":"Season meeting","ar":"اجتماع الموسم","fa":"جلسه فصل"}',
    '{"ca":"Aquest avís es publicarà la setmana vinent.","es":"Este aviso se publicará la próxima semana.","en":"This notice will publish next week.","ar":"سيُنشر هذا الإعلان الأسبوع المقبل.","fa":"این اطلاعیه هفته آینده منتشر می‌شود."}',
    null,
    null,
    false,
    'published',
    now() + interval '7 days',
    null,
    '5eed0000-0000-4000-8000-000000000002',
    now() - interval '1 hour'
  ),
  (
    '5eed0000-0000-4000-8001-000000000005',
    '5eed0000-0000-4000-8000-000000000000',
    'info',
    '{"ca":"Avís anterior","es":"Aviso anterior","en":"Previous notice","ar":"إعلان سابق","fa":"اطلاعیه قبلی"}',
    '{"ca":"Aquest avís ja ha caducat.","es":"Este aviso ya ha caducado.","en":"This notice has expired.","ar":"انتهت صلاحية هذا الإعلان.","fa":"این اطلاعیه منقضی شده است."}',
    null,
    null,
    false,
    'published',
    now() - interval '8 days',
    now() - interval '1 day',
    '5eed0000-0000-4000-8000-000000000002',
    now() - interval '8 days'
  )
on conflict (id) do nothing;

-- Push delivery pipeline ---------------------------------------------------------
-- One terminal fixture keeps the durable receipt state inspectable without a
-- live Expo send. The publication id is normalized so the shared factories can
-- build the same rows deterministically.
update public.push_publications
set
  state = 'complete',
  recipient_count = 0,
  sent_count = 0,
  delivered_count = 0,
  failed_count = 0,
  completed_at = now() - interval '1 hour'
where state <> 'complete';

update public.push_publications
set
  id = '5eed0000-0000-4000-8007-000000000001',
  state = 'complete',
  recipient_count = 1,
  sent_count = 1,
  delivered_count = 1,
  completed_at = now() - interval '1 hour'
where content_type = 'announcement'
  and content_id = '5eed0000-0000-4000-8001-000000000002';

insert into public.push_deliveries (
  id, org_id, publication_id, push_token_id, recipient_id, language, state,
  attempt_count, receipt_attempt_count, expo_ticket_id, ticketed_at,
  next_attempt_at, completed_at, created_at, updated_at
)
select
  '5eed0000-0000-4000-8008-000000000001',
  publication.org_id,
  publication.id,
  push_token.id,
  push_token.user_id,
  'ar',
  'delivered',
  1,
  1,
  'seed-ticket-delivered',
  now() - interval '1 hour 15 minutes',
  now() - interval '1 hour 15 minutes',
  now() - interval '1 hour',
  now() - interval '1 hour 20 minutes',
  now() - interval '1 hour'
from public.push_tokens as push_token
join public.push_publications as publication
  on publication.id = '5eed0000-0000-4000-8007-000000000001'
where push_token.user_id = '5eed0000-0000-4000-8000-000000000011'
on conflict (id) do nothing;

-- The event rows are inserted before the auth roster so their category and
-- occurrence fixtures are available immediately. Attach the seeded staff
-- author now that profiles exist.
update public.events
set created_by = '5eed0000-0000-4000-8000-000000000002'
where id in (
  '5eed0000-0000-4000-8003-000000000001',
  '5eed0000-0000-4000-8003-000000000002',
  '5eed0000-0000-4000-8003-000000000003'
);

-- Knowledge base ---------------------------------------------------------------
insert into public.knowledge_categories (id, org_id, name, slug, icon, sort_order)
values
  (
    '5eed0000-0000-4000-8004-000000000001',
    '5eed0000-0000-4000-8000-000000000000',
    '{"ca":"Drets i asil","es":"Derechos y asilo","en":"Rights and asylum","ar":"الحقوق واللجوء","fa":"حقوق و پناهندگی"}',
    'rights-asylum', 'scale', 10
  ),
  (
    '5eed0000-0000-4000-8004-000000000002',
    '5eed0000-0000-4000-8000-000000000000',
    '{"ca":"Alfabetització digital","es":"Alfabetización digital","en":"Digital literacy","ar":"المهارات الرقمية","fa":"سواد دیجیتال"}',
    'digital-literacy', 'laptop', 20
  ),
  (
    '5eed0000-0000-4000-8004-000000000003',
    '5eed0000-0000-4000-8000-000000000000',
    '{"ca":"Igualtat de gènere","es":"Igualdad de género","en":"Gender equality","ar":"المساواة بين الجنسين","fa":"برابری جنسیتی"}',
    'gender-equality', 'venus', 30
  ),
  (
    '5eed0000-0000-4000-8004-000000000004',
    '5eed0000-0000-4000-8000-000000000000',
    '{"ca":"Recursos generals","es":"Recursos generales","en":"General resources","ar":"موارد عامة","fa":"منابع عمومی"}',
    'general-resources', 'book-open', 40
  )
on conflict (id) do nothing;

insert into public.knowledge_articles
  (id, org_id, category_id, title, body, video_url, content_type, is_published,
   published_at, created_by, created_at)
values (
  '5eed0000-0000-4000-8005-000000000001',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8004-000000000002',
  '{"ca":"Protegeix el teu compte","es":"Protege tu cuenta","en":"Protect your account","ar":"احمي حسابك","fa":"از حساب خود محافظت کنید"}',
  '{"ca":[{"type":"paragraph","text":"Tres passos per protegir el teu compte."},{"type":"step","title":"Activa un codi segur","text":"No comparteixis mai el codi d’accés.","imageUrl":null,"imageAlt":null}],"es":[{"type":"paragraph","text":"Tres pasos para proteger tu cuenta."},{"type":"step","title":"Activa un código seguro","text":"No compartas nunca el código de acceso.","imageUrl":null,"imageAlt":null}],"en":[{"type":"paragraph","text":"Three steps to protect your account."},{"type":"step","title":"Use a secure code","text":"Never share your access code.","imageUrl":null,"imageAlt":null}],"ar":[{"type":"paragraph","text":"ثلاث خطوات لحماية حسابك."},{"type":"step","title":"استخدمي رمزاً آمناً","text":"لا تشاركي رمز الدخول أبداً.","imageUrl":null,"imageAlt":null}],"fa":[{"type":"paragraph","text":"سه گام برای محافظت از حساب شما."},{"type":"step","title":"از یک کد امن استفاده کنید","text":"هرگز کد ورود خود را به اشتراک نگذارید.","imageUrl":null,"imageAlt":null}]}'::jsonb,
  'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  'tutorial', true, now() - interval '2 days',
  '5eed0000-0000-4000-8000-000000000002', now() - interval '2 days'
);

insert into public.knowledge_articles
  (id, org_id, category_id, title, body, content_type, story_status, author_id,
   is_published, created_by, created_at)
values (
  '5eed0000-0000-4000-8005-000000000002',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8004-000000000004',
  '{"ca":"Quan vaig arribar a l’equip"}',
  '{"ca":[{"type":"paragraph","text":"El primer dia estava nerviosa, però les companyes em van rebre amb una abraçada."}]}'::jsonb,
  'participant_story', 'submitted',
  '5eed0000-0000-4000-8000-000000000026', false,
  '5eed0000-0000-4000-8000-000000000026', now() - interval '1 day'
)
on conflict (id) do nothing;

insert into public.knowledge_articles
  (id, org_id, category_id, title, body, content_type, story_status, author_id,
   is_published, published_at, created_by, created_at)
values
  (
    '5eed0000-0000-4000-8005-000000000003',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8004-000000000004',
    '{"ca":"El futbol em va donar confiança","es":"El fútbol me dio confianza","en":"Football gave me confidence","ar":"منحتني كرة القدم الثقة","fa":"فوتبال به من اعتماد به نفس داد"}',
    '{"ca":[{"type":"paragraph","text":"Ara em sento part de l’equip."}],"es":[{"type":"paragraph","text":"Ahora me siento parte del equipo."}],"en":[{"type":"paragraph","text":"Now I feel part of the team."}],"ar":[{"type":"paragraph","text":"أشعر الآن أنني جزء من الفريق."}],"fa":[{"type":"paragraph","text":"حالا احساس می‌کنم بخشی از تیم هستم."}]}'::jsonb,
    'participant_story', 'published',
    '5eed0000-0000-4000-8000-000000000027', true, now() - interval '3 days',
    '5eed0000-0000-4000-8000-000000000027', now() - interval '4 days'
  ),
  (
    '5eed0000-0000-4000-8005-000000000004',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8004-000000000004',
    '{"ca":"Una història que no es publicarà"}',
    '{"ca":[{"type":"paragraph","text":"Aquest exemple mostra una història descartada."}]}'::jsonb,
    'participant_story', 'rejected',
    '5eed0000-0000-4000-8000-000000000028', false, null,
    '5eed0000-0000-4000-8000-000000000028', now() - interval '5 days'
  )
on conflict (id) do nothing;
