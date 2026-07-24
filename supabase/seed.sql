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
  (30, 'blanca.ribes@example.test',       'player', 'Blanca',         'Ribes',   'ca', 'Espanya',   'Vic',     null);

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
  id, org_id, role, first_name, last_name, date_of_birth, nationality,
  address, city, postal_code, phone, document_type, document_number,
  reference_entity, reference_contact_name, has_dependents, num_dependents,
  clothing_size, shoe_size, preferred_language, is_active, is_forum_banned,
  terms_accepted_at
)
select
  ('5eed0000-0000-4000-8000-' || lpad(r.ordinal::text, 12, '0'))::uuid,
  '5eed0000-0000-4000-8000-000000000000',
  r.app_role,
  r.first_name,
  r.last_name,
  make_date(1985 + (r.ordinal % 15), 1 + (r.ordinal % 12), 1 + (r.ordinal % 28)),
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
  case when r.ordinal % 7 = 0 then null else now() end
from seed_roster r
on conflict (id) do nothing;

-- Push tokens --------------------------------------------------------------------
-- Two registered devices, so a staff-side send screen has something to target
-- before any device has ever run the app (RAPP-17 registers the real ones).

insert into public.push_tokens (user_id, token, platform, device_id)
select
  ('5eed0000-0000-4000-8000-' || lpad(r.ordinal::text, 12, '0'))::uuid,
  'ExponentPushToken[seed-' || lpad(r.ordinal::text, 4, '0') || ']',
  case when r.ordinal % 2 = 0 then 'android' else 'ios' end,
  'seed-device-' || lpad(r.ordinal::text, 4, '0')
from seed_roster r
where r.ordinal in (11, 12)
on conflict (user_id, device_id) do nothing;

drop table seed_roster;

end
$seed$;
