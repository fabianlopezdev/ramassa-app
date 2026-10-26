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

begin;

-- The demo tenant. Ordinal 0 of the seed namespace. It carries Ramassà's own
-- navy and logo, so a reset does not undo the branding set in the admin
-- (RAPP-551). The logo object lives in the media worker's local R2 store, so
-- on a machine without it the language screen simply shows no logo.
insert into public.organizations (
  id, name, slug, contact_email, contact_phone, primary_color, logo_url
)
values (
  '5eed0000-0000-4000-8000-000000000000',
  'AE Ramassà',
  'ramassa',
  'laia.ferrer@example.test',
  '+34600000000',
  '#001F60',
  '5eed0000-0000-4000-8000-000000000000/organization-branding/5eed0000-0000-4000-8000-000000000001/2026/10/f19b4d81325241d0aab592f872705bbc.png'
)
on conflict (id) do nothing;

-- No default explanatory paragraph below the document intro (RAPP-561).
-- The dashboard can still supply a custom organization explanation.
update public.organizations set document_step_explanation = null
where id = '5eed0000-0000-4000-8000-000000000000';

-- Stable social-entity tenants (RAPP-55). These rows precede profiles because
-- every entity-role profile must carry a durable membership foreign key.
insert into public.collaborating_entities (id, org_id, name)
values
  (
    '5eed0000-0000-4000-8030-000000000001',
    '5eed0000-0000-4000-8000-000000000000',
    'Creu Roja Osona'
  ),
  (
    '5eed0000-0000-4000-8030-000000000002',
    '5eed0000-0000-4000-8000-000000000000',
    'CEAR Catalunya'
  )
on conflict (id) do nothing;

-- Services directory ------------------------------------------------------------
-- The category JSON is the database copy of packages/shared/services/definitions.ts.
-- Runtime code turns the same field shape into form controls, Zod validation,
-- and JSONB containment filters. The database validates every service against it.
insert into public.service_categories
  (id, org_id, name, slug, icon, color, sort_order, metadata_schema)
values
  (
    '5eed0000-0000-4000-8009-000000000001',
    '5eed0000-0000-4000-8000-000000000000',
    '{"ca":"Allotjament","es":"Alojamiento","en":"Housing","ar":"السكن","fa":"مسکن"}',
    'housing', 'house', 'primary', 10,
    $schema${"fields":[{"key":"housing_type","label":{"ca":"Tipus d’allotjament","es":"Tipo de alojamiento","en":"Housing type","ar":"نوع السكن","fa":"نوع مسکن"},"type":"select","required":true,"filterable":true,"options":["room","shared_flat","apartment","emergency_shelter","social_housing"]},{"key":"duration","label":{"ca":"Durada","es":"Duración","en":"Duration","ar":"المدة","fa":"مدت"},"type":"select","required":true,"filterable":true,"options":["temporary","long_term","emergency"]},{"key":"deposit_required","label":{"ca":"Cal dipòsit","es":"Requiere depósito","en":"Deposit required","ar":"يتطلب وديعة","fa":"نیاز به ودیعه"},"type":"boolean","required":true,"filterable":true},{"key":"deposit_amount","label":{"ca":"Import del dipòsit","es":"Importe del depósito","en":"Deposit amount","ar":"مبلغ الوديعة","fa":"مبلغ ودیعه"},"type":"number","required":false,"filterable":false,"minimum":0},{"key":"for_whom","label":{"ca":"Per a qui","es":"Para quién","en":"For whom","ar":"لمن","fa":"برای چه کسی"},"type":"select","required":true,"filterable":true,"options":["women_only","families","singles","any"]},{"key":"restrictions","label":{"ca":"Restriccions","es":"Restricciones","en":"Restrictions","ar":"القيود","fa":"محدودیت‌ها"},"type":"text","required":false,"filterable":false}]}$schema$::jsonb
  ),
  (
    '5eed0000-0000-4000-8009-000000000002',
    '5eed0000-0000-4000-8000-000000000000',
    '{"ca":"Cursos d''idiomes","es":"Cursos de idiomas","en":"Language Courses","ar":"دورات اللغة","fa":"دوره‌های زبان"}',
    'language-courses', 'languages', 'secondary', 20,
    $schema${"fields":[{"key":"language_taught","label":{"ca":"Idioma","es":"Idioma","en":"Language taught","ar":"اللغة","fa":"زبان"},"type":"select","required":true,"filterable":true,"options":["catalan","spanish","english","other"]},{"key":"level","label":{"ca":"Nivell","es":"Nivel","en":"Level","ar":"المستوى","fa":"سطح"},"type":"select","required":true,"filterable":true,"options":["beginner","intermediate","advanced","all_levels"]},{"key":"modality","label":{"ca":"Modalitat","es":"Modalidad","en":"Modality","ar":"طريقة الدراسة","fa":"شیوه برگزاری"},"type":"select","required":true,"filterable":true,"options":["in_person","online","hybrid"]},{"key":"registration_deadline","label":{"ca":"Data límit","es":"Fecha límite","en":"Registration deadline","ar":"آخر موعد للتسجيل","fa":"مهلت ثبت‌نام"},"type":"date","required":false,"filterable":false}]}$schema$::jsonb
  ),
  (
    '5eed0000-0000-4000-8009-000000000003',
    '5eed0000-0000-4000-8000-000000000000',
    '{"ca":"Inserció laboral","es":"Inserción laboral","en":"Job Insertion","ar":"الاندماج المهني","fa":"ورود به بازار کار"}',
    'job-insertion', 'briefcase-business', 'primary', 30,
    $schema${"fields":[{"key":"job_type","label":{"ca":"Tipus de recurs","es":"Tipo de recurso","en":"Job resource type","ar":"نوع المورد","fa":"نوع منبع شغلی"},"type":"select","required":true,"filterable":true,"options":["job_offer","training","cv_workshop","interview_prep","internship"]},{"key":"sector","label":{"ca":"Sector","es":"Sector","en":"Sector","ar":"القطاع","fa":"بخش"},"type":"select","required":true,"filterable":true,"options":["hospitality","care","cleaning","retail","admin","other"]},{"key":"requirements","label":{"ca":"Requisits","es":"Requisitos","en":"Requirements","ar":"المتطلبات","fa":"شرایط"},"type":"text","required":false,"filterable":false},{"key":"language_required","label":{"ca":"Idioma requerit","es":"Idioma requerido","en":"Language required","ar":"اللغة المطلوبة","fa":"زبان مورد نیاز"},"type":"select","required":false,"filterable":true,"options":["catalan","spanish","english","none"]}]}$schema$::jsonb
  ),
  (
    '5eed0000-0000-4000-8009-000000000004',
    '5eed0000-0000-4000-8000-000000000000',
    '{"ca":"Assessoria jurídica","es":"Asesoría jurídica","en":"Legal Aid","ar":"المساعدة القانونية","fa":"کمک حقوقی"}',
    'legal-aid', 'scale', 'secondary', 40,
    $schema${"fields":[{"key":"legal_type","label":{"ca":"Tipus d’assessoria","es":"Tipo de asesoría","en":"Legal aid type","ar":"نوع المساعدة","fa":"نوع کمک حقوقی"},"type":"select","required":true,"filterable":true,"options":["asylum","residency","family_reunification","labor_rights","gender_violence","general"]},{"key":"languages_available","label":{"ca":"Idiomes disponibles","es":"Idiomas disponibles","en":"Languages available","ar":"اللغات المتاحة","fa":"زبان‌های موجود"},"type":"string-array","required":true,"filterable":true,"options":["ca","es","en","ar","fa"]},{"key":"appointment_required","label":{"ca":"Cal cita","es":"Requiere cita","en":"Appointment required","ar":"يتطلب موعداً","fa":"نیاز به وقت قبلی"},"type":"boolean","required":true,"filterable":true}]}$schema$::jsonb
  ),
  (
    '5eed0000-0000-4000-8009-000000000005',
    '5eed0000-0000-4000-8000-000000000000',
    '{"ca":"Salut","es":"Salud","en":"Health","ar":"الصحة","fa":"سلامت"}',
    'health', 'heart-pulse', 'primary', 50,
    $schema${"fields":[{"key":"health_type","label":{"ca":"Tipus d’atenció","es":"Tipo de atención","en":"Health service type","ar":"نوع الرعاية","fa":"نوع خدمات سلامت"},"type":"select","required":true,"filterable":true,"options":["medical","dental","mental_health","reproductive","emergency"]},{"key":"health_card_required","label":{"ca":"Cal targeta sanitària","es":"Requiere tarjeta sanitaria","en":"Health card required","ar":"تتطلب بطاقة صحية","fa":"نیاز به کارت سلامت"},"type":"boolean","required":true,"filterable":true},{"key":"languages_available","label":{"ca":"Idiomes disponibles","es":"Idiomas disponibles","en":"Languages available","ar":"اللغات المتاحة","fa":"زبان‌های موجود"},"type":"string-array","required":true,"filterable":true,"options":["ca","es","en","ar","fa"]},{"key":"appointment_required","label":{"ca":"Cal cita","es":"Requiere cita","en":"Appointment required","ar":"يتطلب موعداً","fa":"نیاز به وقت قبلی"},"type":"boolean","required":true,"filterable":true}]}$schema$::jsonb
  ),
  (
    '5eed0000-0000-4000-8009-000000000006',
    '5eed0000-0000-4000-8000-000000000000',
    '{"ca":"Formació","es":"Formación","en":"Training","ar":"التدريب","fa":"آموزش"}',
    'training', 'graduation-cap', 'secondary', 60,
    $schema${"fields":[{"key":"training_type","label":{"ca":"Tipus de formació","es":"Tipo de formación","en":"Training type","ar":"نوع التدريب","fa":"نوع آموزش"},"type":"select","required":true,"filterable":true,"options":["digital_literacy","professional","certificate"]},{"key":"modality","label":{"ca":"Modalitat","es":"Modalidad","en":"Modality","ar":"طريقة الدراسة","fa":"شیوه برگزاری"},"type":"select","required":true,"filterable":true,"options":["in_person","online","hybrid"]},{"key":"requirements","label":{"ca":"Requisits","es":"Requisitos","en":"Requirements","ar":"المتطلبات","fa":"شرایط"},"type":"text","required":false,"filterable":false},{"key":"registration_deadline","label":{"ca":"Data límit","es":"Fecha límite","en":"Registration deadline","ar":"آخر موعد للتسجيل","fa":"مهلت ثبت‌نام"},"type":"date","required":false,"filterable":false}]}$schema$::jsonb
  ),
  (
    '5eed0000-0000-4000-8009-000000000007',
    '5eed0000-0000-4000-8000-000000000000',
    '{"ca":"Oci i cultura","es":"Ocio y cultura","en":"Leisure & Culture","ar":"الترفيه والثقافة","fa":"تفریح و فرهنگ"}',
    'leisure-culture', 'tickets', 'primary', 70,
    $schema${"fields":[{"key":"activity_type","label":{"ca":"Tipus d’activitat","es":"Tipo de actividad","en":"Activity type","ar":"نوع النشاط","fa":"نوع فعالیت"},"type":"select","required":true,"filterable":true,"options":["sports","cultural","social","trips"]},{"key":"family_friendly","label":{"ca":"Per a famílies","es":"Para familias","en":"Family friendly","ar":"مناسب للعائلات","fa":"مناسب خانواده"},"type":"boolean","required":true,"filterable":true},{"key":"age_restriction","label":{"ca":"Edat mínima","es":"Edad mínima","en":"Minimum age","ar":"الحد الأدنى للعمر","fa":"حداقل سن"},"type":"number","required":false,"filterable":true,"minimum":0}]}$schema$::jsonb
  ),
  (
    '5eed0000-0000-4000-8009-000000000008',
    '5eed0000-0000-4000-8000-000000000000',
    '{"ca":"Tràmits","es":"Trámites","en":"Documentation & Administrative","ar":"الوثائق والإجراءات","fa":"مدارک و امور اداری"}',
    'documentation', 'file-text', 'secondary', 80,
    $schema${"fields":[{"key":"document_type","label":{"ca":"Tipus de tràmit","es":"Tipo de trámite","en":"Document type","ar":"نوع الإجراء","fa":"نوع مدرک"},"type":"select","required":true,"filterable":true,"options":["empadronament","nie","tie","health_card","social_services","other"]},{"key":"appointment_required","label":{"ca":"Cal cita","es":"Requiere cita","en":"Appointment required","ar":"يتطلب موعداً","fa":"نیاز به وقت قبلی"},"type":"boolean","required":true,"filterable":true},{"key":"documents_needed","label":{"ca":"Documents necessaris","es":"Documentos necesarios","en":"Documents needed","ar":"المستندات المطلوبة","fa":"مدارک مورد نیاز"},"type":"text","required":false,"filterable":false},{"key":"languages_available","label":{"ca":"Idiomes disponibles","es":"Idiomas disponibles","en":"Languages available","ar":"اللغات المتاحة","fa":"زبان‌های موجود"},"type":"string-array","required":true,"filterable":true,"options":["ca","es","en","ar","fa"]},{"key":"processing_time","label":{"ca":"Temps de tramitació","es":"Tiempo de tramitación","en":"Processing time","ar":"مدة المعالجة","fa":"زمان پردازش"},"type":"text","required":false,"filterable":false}]}$schema$::jsonb
  )
on conflict (id) do nothing;

insert into public.services (
  id, org_id, category_id, title, provider_name, location, zone,
  cost_type, cost_amount, cost_details, contact_name, contact_phone,
  contact_email, contact_role, schedule, external_url, availability,
  metadata, status, published_at, expires_at, submitted_by, created_by,
  reviewed_by, reviewed_at, rejection_reason, created_at
)
values
  (
    '5eed0000-0000-4000-800a-000000000001',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8009-000000000001',
    '{"ca":"Mediació per trobar una habitació"}',
    'Creu Roja Osona', 'Vic', 'Osona', 'free', null, null,
    'Sílvia Bosch', '+34938850000', 'silvia.bosch@example.test', 'Tècnica social',
    'Amb cita prèvia', 'https://example.test/habitatge', 'available',
    '{"housing_type":"room","duration":"temporary","deposit_required":false,"for_whom":"women_only"}',
    'pending', null, null,
    '5eed0000-0000-4000-8000-000000000004',
    '5eed0000-0000-4000-8000-000000000004',
    null, null, null, now() - interval '2 days'
  ),
  (
    '5eed0000-0000-4000-800a-000000000002',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8009-000000000001',
    '{"ca":"Pis temporal sense confirmar"}',
    'Entitat col·laboradora', 'Manlleu', 'Osona', 'subsidized', 180, null,
    'Jordi Camps', '+34938850001', 'jordi.camps@example.test', 'Referent',
    'Matins', 'https://example.test/pis', 'waiting_list',
    '{"housing_type":"apartment","duration":"temporary","deposit_required":true,"deposit_amount":300,"for_whom":"families"}',
    'rejected', null, null,
    '5eed0000-0000-4000-8000-000000000005',
    '5eed0000-0000-4000-8000-000000000005',
    '5eed0000-0000-4000-8000-000000000002', now() - interval '1 day',
    'Cal confirmar la disponibilitat abans de publicar.', now() - interval '3 days'
  ),
  (
    '5eed0000-0000-4000-800a-000000000003',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8009-000000000001',
    '{"ca":"Habitació compartida per a dones","es":"Habitación compartida para mujeres","en":"Shared room for women","ar":"غرفة مشتركة للنساء","fa":"اتاق مشترک برای زنان"}',
    'Fundació Habitat3', 'Vic', 'Osona', 'subsidized', 120, 'Subministraments inclosos',
    'Anna Serra', '+34938851000', 'silvia.bosch@example.test', 'Coordinació d’habitatge',
    'De dilluns a divendres, de 9 a 14 h', 'https://example.test/habitacio-vic', 'available',
    '{"housing_type":"shared_flat","duration":"long_term","deposit_required":true,"deposit_amount":250,"for_whom":"women_only","restrictions":"Cal empadronament"}',
    'published', now() - interval '10 days', null, null,
    '5eed0000-0000-4000-8000-000000000002', null, null, null, now() - interval '12 days'
  ),
  (
    '5eed0000-0000-4000-800a-000000000004',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8009-000000000002',
    '{"ca":"Català inicial a Vic","es":"Catalán inicial en Vic","en":"Beginner Catalan in Vic","ar":"اللغة الكتالانية للمبتدئات في فيك","fa":"کاتالان مقدماتی در ویک"}',
    'CNL Osona', 'Vic', 'Osona', 'free', null, null,
    'Recepció CNL', '+34938852000', 'marta.puig@example.test', 'Inscripcions',
    'Dimarts i dijous, de 10 a 12 h', 'https://example.test/catala-inicial', 'available',
    '{"language_taught":"catalan","level":"beginner","modality":"in_person","registration_deadline":"2026-09-15"}',
    'published', now() - interval '5 days', null, null,
    '5eed0000-0000-4000-8000-000000000002', null, null, null, now() - interval '6 days'
  ),
  (
    '5eed0000-0000-4000-800a-000000000005',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8009-000000000002',
    '{"ca":"Castellà en línia","es":"Español en línea","en":"Online Spanish","ar":"الإسبانية عبر الإنترنت","fa":"اسپانیایی آنلاین"}',
    'Aula Oberta', null, 'Online', 'free', null, null,
    'Equip docent', null, 'laia.ferrer@example.test', null,
    'Dilluns i dimecres, de 18 a 19.30 h', 'https://example.test/castella-online', 'available',
    '{"language_taught":"spanish","level":"all_levels","modality":"online"}',
    'published', now() - interval '3 days', now() + interval '90 days', null,
    '5eed0000-0000-4000-8000-000000000002', null, null, null, now() - interval '4 days'
  ),
  (
    '5eed0000-0000-4000-800a-000000000006',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8009-000000000002',
    '{"ca":"Conversa en anglès"}',
    'Biblioteca de Vic', 'Vic', 'Osona', 'free', null, null,
    null, null, null, null, 'Divendres a la tarda', null, 'available',
    '{"language_taught":"english","level":"intermediate","modality":"in_person"}',
    'draft', null, null, null,
    '5eed0000-0000-4000-8000-000000000002', null, null, null, now() - interval '1 day'
  ),
  (
    '5eed0000-0000-4000-800a-000000000007',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8009-000000000003',
    '{"ca":"Taller de currículum","es":"Taller de currículum","en":"CV workshop","ar":"ورشة السيرة الذاتية","fa":"کارگاه رزومه"}',
    'Osona Acció Social', 'Vic', 'Osona', 'free', null, null,
    'Laia Pons', '+34938853000', 'jordi.camps@example.test', 'Orientadora laboral',
    'Dimecres, de 10 a 12 h', 'https://example.test/taller-cv', 'available',
    '{"job_type":"cv_workshop","sector":"admin","requirements":"Portar un currículum actual","language_required":"catalan"}',
    'published', now() - interval '7 days', null, null,
    '5eed0000-0000-4000-8000-000000000003', null, null, null, now() - interval '8 days'
  ),
  (
    '5eed0000-0000-4000-800a-000000000008',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8009-000000000003',
    '{"ca":"Pràctiques en comerç","es":"Prácticas en comercio","en":"Retail internship","ar":"تدريب في متجر","fa":"کارآموزی فروشگاه"}',
    'Cambra d’Osona', 'Manlleu', 'Osona', 'paid', 650, 'Beca mensual',
    'Marc Vila', '+34938853001', 'marta.puig@example.test', 'Prospecció',
    'Jornada de matí', 'https://example.test/practiques-comerc', 'waiting_list',
    '{"job_type":"internship","sector":"retail","requirements":"Disponibilitat de matins","language_required":"spanish"}',
    'published', now() - interval '2 days', now() + interval '45 days', null,
    '5eed0000-0000-4000-8000-000000000003', null, null, null, now() - interval '3 days'
  ),
  (
    '5eed0000-0000-4000-800a-000000000009',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8009-000000000004',
    '{"ca":"Orientació d’estrangeria","es":"Orientación de extranjería","en":"Immigration guidance","ar":"إرشاد شؤون الهجرة","fa":"راهنمایی مهاجرت"}',
    'CITE Osona', 'Vic', 'Osona', 'free', null, null,
    'Núria Soler', '+34938854000', 'jordi.camps@example.test', 'Advocada',
    'Amb cita prèvia', 'https://example.test/estrangeria', 'by_appointment',
    '{"legal_type":"residency","languages_available":["ca","es","ar"],"appointment_required":true}',
    'published', now() - interval '20 days', null, null,
    '5eed0000-0000-4000-8000-000000000002', null, null, null, now() - interval '21 days'
  ),
  (
    '5eed0000-0000-4000-800a-000000000010',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8009-000000000004',
    '{"ca":"Assessorament en asil","es":"Asesoramiento en asilo","en":"Asylum advice","ar":"استشارة اللجوء","fa":"مشاوره پناهندگی"}',
    'CEAR Catalunya', 'Barcelona', 'Barcelona', 'free', null, null,
    'Equip jurídic', '+34930000010', 'silvia.bosch@example.test', null,
    'De dilluns a dijous', 'https://example.test/asil', 'by_appointment',
    '{"legal_type":"asylum","languages_available":["ca","es","en","ar","fa"],"appointment_required":true}',
    'published', now() + interval '7 days', null, null,
    '5eed0000-0000-4000-8000-000000000002', null, null, null, now() - interval '1 day'
  ),
  (
    '5eed0000-0000-4000-800a-000000000011',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8009-000000000004',
    '{"ca":"Consulta sobre reagrupament familiar"}',
    'Entitat col·laboradora', 'Vic', 'Osona', 'free', null, null,
    'Jordi Camps', '+34938854001', 'jordi.camps@example.test', null,
    'Amb cita prèvia', null, 'by_appointment',
    '{"legal_type":"family_reunification","languages_available":["ca","es"],"appointment_required":true}',
    'approved', null, null,
    '5eed0000-0000-4000-8000-000000000004',
    '5eed0000-0000-4000-8000-000000000004',
    '5eed0000-0000-4000-8000-000000000002', now() - interval '3 hours', null,
    now() - interval '2 days'
  ),
  (
    '5eed0000-0000-4000-800a-000000000012',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8009-000000000005',
    '{"ca":"Suport psicològic per a dones","es":"Apoyo psicológico para mujeres","en":"Psychological support for women","ar":"دعم نفسي للنساء","fa":"حمایت روانی برای زنان"}',
    'SIAD Osona', 'Vic', 'Osona', 'free', null, null,
    'Acollida SIAD', '+34938855000', 'laia.ferrer@example.test', null,
    'Amb cita prèvia', 'https://example.test/suport-psicologic', 'by_appointment',
    '{"health_type":"mental_health","health_card_required":false,"languages_available":["ca","es","fa"],"appointment_required":true}',
    'published', now() - interval '30 days', null, null,
    '5eed0000-0000-4000-8000-000000000002', null, null, null, now() - interval '31 days'
  ),
  (
    '5eed0000-0000-4000-800a-000000000013',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8009-000000000005',
    '{"ca":"Odontologia social","es":"Odontología social","en":"Social dental care","ar":"رعاية الأسنان الاجتماعية","fa":"دندانپزشکی اجتماعی"}',
    'Clínica Solidària', 'Manlleu', 'Osona', 'subsidized', 25, 'Preu per visita',
    'Recepció', '+34938855001', 'marta.puig@example.test', null,
    'Dilluns i dimecres', 'https://example.test/dental', 'waiting_list',
    '{"health_type":"dental","health_card_required":true,"languages_available":["ca","es"],"appointment_required":true}',
    'published', now() - interval '12 days', now() + interval '60 days', null,
    '5eed0000-0000-4000-8000-000000000002', null, null, null, now() - interval '13 days'
  ),
  (
    '5eed0000-0000-4000-800a-000000000014',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8009-000000000006',
    '{"ca":"Competències digitals bàsiques","es":"Competencias digitales básicas","en":"Basic digital skills","ar":"المهارات الرقمية الأساسية","fa":"مهارت‌های دیجیتال پایه"}',
    'Punt Òmnia', 'Vic', 'Osona', 'free', null, null,
    'Dinamització Òmnia', '+34938856000', 'marta.puig@example.test', null,
    'Dilluns, de 16 a 18 h', 'https://example.test/competencies-digitals', 'available',
    '{"training_type":"digital_literacy","modality":"in_person","requirements":"Portar el telèfon mòbil","registration_deadline":"2026-10-01"}',
    'published', now() - interval '4 days', null, null,
    '5eed0000-0000-4000-8000-000000000003', null, null, null, now() - interval '5 days'
  ),
  (
    '5eed0000-0000-4000-800a-000000000015',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8009-000000000006',
    '{"ca":"Certificat de manipulació d’aliments","es":"Certificado de manipulación de alimentos","en":"Food handling certificate","ar":"شهادة تداول الأغذية","fa":"گواهی کار با مواد غذایی"}',
    'Aula Professional', 'Online', 'Online', 'paid', 18, null,
    'Inscripcions', null, 'jordi.camps@example.test', null,
    'Accés lliure durant dues setmanes', 'https://example.test/manipulacio-aliments', 'available',
    '{"training_type":"certificate","modality":"online","requirements":"Correu electrònic actiu"}',
    'published', now() - interval '9 days', null, null,
    '5eed0000-0000-4000-8000-000000000003', null, null, null, now() - interval '10 days'
  ),
  (
    '5eed0000-0000-4000-800a-000000000016',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8009-000000000007',
    '{"ca":"Futbol obert per a famílies","es":"Fútbol abierto para familias","en":"Open football for families","ar":"كرة القدم المفتوحة للعائلات","fa":"فوتبال آزاد برای خانواده‌ها"}',
    'AE Ramassà', 'Camp Municipal de Vic', 'Osona', 'free', null, null,
    'Coordinació Ramassà', '+34938857000', 'laia.ferrer@example.test', null,
    'Dissabtes, de 10 a 12 h', 'https://example.test/futbol-families', 'available',
    '{"activity_type":"sports","family_friendly":true}',
    'published', now() - interval '40 days', null, null,
    '5eed0000-0000-4000-8000-000000000002', null, null, null, now() - interval '41 days'
  ),
  (
    '5eed0000-0000-4000-800a-000000000017',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8009-000000000007',
    '{"ca":"Sortida al Museu Episcopal","es":"Visita al Museo Episcopal","en":"Episcopal Museum visit","ar":"زيارة المتحف الأسقفي","fa":"بازدید از موزه اسقفی"}',
    'Museu Episcopal de Vic', 'Vic', 'Osona', 'subsidized', 3, 'Infants gratuït',
    'Educació', '+34938857001', 'marta.puig@example.test', null,
    'Diumenge, de 11 a 13 h', 'https://example.test/visita-museu', 'available',
    '{"activity_type":"cultural","family_friendly":true,"age_restriction":6}',
    'published', now() - interval '1 day', now() + interval '20 days', null,
    '5eed0000-0000-4000-8000-000000000002', null, null, null, now() - interval '2 days'
  ),
  (
    '5eed0000-0000-4000-800a-000000000018',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8009-000000000008',
    '{"ca":"Acompanyament per empadronar-se","es":"Acompañamiento para empadronarse","en":"Municipal registration support","ar":"دعم التسجيل البلدي","fa":"کمک برای ثبت شهرداری"}',
    'Ajuntament de Vic', 'Oficina d’Atenció Ciutadana', 'Osona', 'free', null, null,
    'OAC Vic', '+34938858000', 'jordi.camps@example.test', null,
    'De dilluns a divendres, de 9 a 14 h', 'https://example.test/empadronament', 'by_appointment',
    '{"document_type":"empadronament","appointment_required":true,"documents_needed":"Passaport i contracte de lloguer","languages_available":["ca","es"],"processing_time":"Dues setmanes"}',
    'published', now() - interval '15 days', null, null,
    '5eed0000-0000-4000-8000-000000000002', null, null, null, now() - interval '16 days'
  ),
  (
    '5eed0000-0000-4000-800a-000000000019',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8009-000000000008',
    '{"ca":"Primera sol·licitud de TIE","es":"Primera solicitud de TIE","en":"First TIE application","ar":"طلب بطاقة الإقامة لأول مرة","fa":"درخواست اولیه کارت اقامت"}',
    'Servei d’Acollida', 'Vic', 'Osona', 'free', null, null,
    'Punt d’acollida', '+34938858001', 'silvia.bosch@example.test', null,
    'Dimarts i dijous', 'https://example.test/tie', 'by_appointment',
    '{"document_type":"tie","appointment_required":true,"documents_needed":"Resolució favorable, passaport i fotografia","languages_available":["ca","es","ar"],"processing_time":"Entre quatre i sis setmanes"}',
    'published', now() - interval '6 days', now() - interval '1 day', null,
    '5eed0000-0000-4000-8000-000000000002', null, null, null, now() - interval '7 days'
  )
on conflict (id) do nothing;

insert into public.service_images (id, org_id, service_id, url, alt_text, position)
values
  (
    '5eed0000-0000-4000-800b-000000000001',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-800a-000000000003',
    'org/services/housing/shared-room.webp',
    '{"ca":"Habitació doble amb llum natural","es":"Habitación doble con luz natural","en":"Twin room with natural light","ar":"غرفة مزدوجة بإضاءة طبيعية","fa":"اتاق دو نفره با نور طبیعی"}',
    0
  ),
  (
    '5eed0000-0000-4000-800b-000000000002',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-800a-000000000016',
    'org/services/leisure/family-football.webp',
    '{"ca":"Jugadores i famílies al camp de futbol","es":"Jugadoras y familias en el campo","en":"Players and families on the football pitch","ar":"لاعبات وعائلات في ملعب كرة القدم","fa":"بازیکنان و خانواده‌ها در زمین فوتبال"}',
    0
  )
on conflict (id) do nothing;

insert into public.service_interests (id, org_id, service_id, user_id, created_at)
values (
  '5eed0000-0000-4000-800c-000000000001',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-800a-000000000004',
  '5eed0000-0000-4000-8000-000000000012',
  now() - interval '1 day'
)
on conflict (id) do nothing;

insert into public.service_submission_comments (
  id, org_id, service_id, author_id, author_role, body, is_internal, created_at
)
values
  (
    '5eed0000-0000-4000-800d-000000000001',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-800a-000000000011',
    '5eed0000-0000-4000-8000-000000000004',
    'entity',
    'Quan es publicarà el servei?',
    false,
    now() - interval '2 hours'
  ),
  (
    '5eed0000-0000-4000-800d-000000000002',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-800a-000000000011',
    '5eed0000-0000-4000-8000-000000000002',
    'staff',
    'Confirmar la data amb coordinació abans de respondre.',
    true,
    now() - interval '1 hour'
  )
on conflict (id) do nothing;

insert into public.service_submission_notifications (
  id, org_id, service_id, kind, created_by, created_at, previous_service, current_service
)
values (
  '5eed0000-0000-4000-800e-000000000001',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-800a-000000000011',
  'published_edit',
  '5eed0000-0000-4000-8000-000000000004',
  now() - interval '3 hours',
  -- The trigger always records both snapshots; the review screens diff them.
  '{"schedule": "Dimarts de 10 a 13 h", "contact_phone": "+34938850000"}'::jsonb,
  '{"schedule": "Dimarts i dijous de 10 a 13 h", "contact_phone": "+34938850011"}'::jsonb
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
  ),
  (
    '5eed0000-0000-4000-8003-000000000005',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8002-000000000001',
    '{"ca":"Sessió d''entrenament d''avui","es":"Sesión de entrenamiento de hoy","en":"Today''s training session","ar":"جلسة تدريب اليوم","fa":"جلسهٔ تمرین امروز"}',
    '{"ca":"Sessió preparada per practicar el registre d''assistència al camp.","es":"Sesión preparada para practicar el registro de asistencia en el campo.","en":"A session ready for field attendance practice.","ar":"جلسة جاهزة لتسجيل الحضور في الملعب.","fa":"جلسه‌ای آماده برای ثبت حضور در زمین."}',
    'Camp Municipal de Vic',
    'https://maps.google.com/?q=Camp+Municipal+de+Vic',
    (date_trunc('day', now() at time zone 'Europe/Madrid') + interval '18 hours') at time zone 'Europe/Madrid',
    (date_trunc('day', now() at time zone 'Europe/Madrid') + interval '19 hours 30 minutes') at time zone 'Europe/Madrid',
    null,
    24,
    'confirm',
    'published',
    now() - interval '1 day',
    null,
    now() - interval '1 day'
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
  (30, 'blanca.ribes@example.test',      'player', 'Blanca',         'Ribes',   'ca', 'Espanya',   'Vic',     null);

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
-- A profile holds her names and her account settings (ADR-031, D2). Everything
-- else she answers is an answer by field, written below.
--
-- A handful of rows are deliberately imperfect: three accounts never accepted the
-- terms, two participants are deactivated, one is forum-banned, and four
-- participants hold no identity document (the just-arrived case). A uniformly
-- happy dataset hides exactly the screens that break.

insert into public.profiles (
  id, org_id, role, first_name, last_name, collaborating_entity_id,
  preferred_language, is_active, is_forum_banned, terms_accepted_at
)
select
  ('5eed0000-0000-4000-8000-' || lpad(r.ordinal::text, 12, '0'))::uuid,
  '5eed0000-0000-4000-8000-000000000000',
  r.app_role,
  r.first_name,
  r.last_name,
  case r.ordinal
    when 4 then '5eed0000-0000-4000-8030-000000000001'::uuid
    when 5 then '5eed0000-0000-4000-8030-000000000002'::uuid
    else null
  end,
  r.preferred_language,
  r.ordinal % 13 <> 0,
  r.ordinal % 17 = 0,
  case when r.ordinal % 7 = 0 then null else now() end
from seed_roster r
on conflict (id) do nothing;

-- Her answers, by field (ADR-031) ------------------------------------------------
-- Written the way the app's writers write them: through
-- `private.write_custom_answer`, so a Sensitive answer (phone, address, postal
-- code, document number) is stored with public.encrypt_field (ADR-004) and a
-- detail view exercises real decryption. A choice is given by its option key.
-- Only players carry a participant record; the team's own profiles hold none.

create function pg_temp.seed_app_answer(
  p_profile_id uuid, p_system_key text, p_value jsonb, p_source text, p_answered_by uuid default null)
returns void
language plpgsql
as $$
declare
  field public.profile_fields;
  stored jsonb := p_value;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return;
  end if;
  select * into field from public.profile_fields f
   where f.org_id = '5eed0000-0000-4000-8000-000000000000' and f.system_key = p_system_key;
  if field.question_type in ('single_choice', 'search_choice') then
    select to_jsonb(o.id::text) into stored from public.custom_question_options o
     where o.question_id = field.id and o.key = p_value #>> '{}';
  elsif field.question_type = 'multiple_choice' then
    select jsonb_agg(o.id::text order by o.sort_order) into stored from public.custom_question_options o
     where o.question_id = field.id and o.key in (select jsonb_array_elements_text(p_value));
  end if;
  if stored is null then
    raise exception 'seed: % has no option %', p_system_key, p_value;
  end if;
  perform private.write_custom_answer(p_profile_id, field, stored, p_source, p_answered_by);
end;
$$;

-- The same answers for a referral, encrypted as every referral answer is.
create function pg_temp.seed_referral_answer(p_referral_id uuid, p_system_key text, p_value jsonb)
returns void
language plpgsql
as $$
declare
  field public.profile_fields;
  stored jsonb := p_value;
begin
  select * into field from public.profile_fields f
   where f.org_id = '5eed0000-0000-4000-8000-000000000000' and f.system_key = p_system_key;
  if field.question_type in ('single_choice', 'search_choice') then
    select to_jsonb(o.id::text) into stored from public.custom_question_options o
     where o.question_id = field.id and o.key = p_value #>> '{}';
  elsif field.question_type = 'multiple_choice' then
    select jsonb_agg(o.id::text order by o.sort_order) into stored from public.custom_question_options o
     where o.question_id = field.id and o.key in (select jsonb_array_elements_text(p_value));
  end if;
  insert into public.referral_custom_answers (referral_id, question_id, org_id, value_encrypted)
  values (p_referral_id, field.id, field.org_id, public.encrypt_field(stored::text))
  on conflict do nothing;
end;
$$;

perform pg_temp.seed_app_answer(player.id, answer.system_key, answer.value, 'player')
from (
  select r.*, ('5eed0000-0000-4000-8000-' || lpad(r.ordinal::text, 12, '0'))::uuid as id,
         coalesce(
           r.own_reference_entity,
           case r.ordinal % 3 when 0 then 'Creu Roja Osona' when 1 then 'CEAR Catalunya' else null end
         ) as reference_entity
    from seed_roster r
   where r.app_role = 'player'
) player
cross join lateral (values
  ('date_of_birth', to_jsonb(make_date(1985 + (player.ordinal % 15), 1 + (player.ordinal % 12), 1 + (player.ordinal % 28))::text)),
  -- Where she was born, in the script she writes it in. Two participants have
  -- none on purpose: a profile from before the field existed, whose staff edit
  -- must supply it first.
  ('place_of_birth', case when player.ordinal % 11 = 0 then null else to_jsonb(
    case player.nationality
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
    end) end),
  ('nationality', to_jsonb(player.nationality)),
  ('address', to_jsonb('Carrer de Prova, ' || player.ordinal)),
  ('city', to_jsonb(player.city)),
  ('postal_code', to_jsonb(
    case player.city
      when 'Vic' then '08500'
      when 'Manlleu' then '08560'
      when 'Torelló' then '08570'
      when 'Roda de Ter' then '08510'
      else '08500'
    end)),
  ('phone', to_jsonb('+346' || lpad(player.ordinal::text, 8, '0'))),
  ('document_type', to_jsonb(case when player.ordinal % 5 = 0 then 'none' else 'nie' end)),
  ('document_number', case when player.ordinal % 5 = 0 then null
                           else to_jsonb('Y' || lpad(player.ordinal::text, 7, '0') || 'Z') end),
  ('reference_entity', to_jsonb(player.reference_entity)),
  ('reference_contact_name', case player.ordinal % 3 when 0 then '"Sílvia Bosch"'::jsonb
                                                     when 1 then '"Jordi Camps"'::jsonb end),
  ('has_dependents', to_jsonb(case when player.ordinal % 3 = 0 then 'yes' else 'no' end)),
  ('num_dependents', case when player.ordinal % 3 = 0 then to_jsonb(1 + (player.ordinal % 4)) end),
  ('clothing_size', to_jsonb((array['S', 'M', 'L', 'XL'])[1 + (player.ordinal % 4)])),
  ('shoe_size', to_jsonb((36 + (player.ordinal % 6))::text))
) as answer(system_key, value);

-- Entity referrals and encrypted participant updates (RAPP-54) -----------------
-- Creu Roja has one pending and three linked referrals. Its linked denominator
-- reaches the privacy threshold. CEAR has one linked referral and stays below it.

insert into public.entity_referrals (
  id,
  org_id,
  entity_user_id,
  collaborating_entity_id,
  referred_profile_id,
  assigned_staff_id,
  referred_first_name,
  referred_last_name,
  referred_phone,
  referred_email,
  documentation_status,
  notes,
  status,
  created_at,
  updated_at
)
values
  (
    '5eed0000-0000-4000-8010-000000000001',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8000-000000000004',
    '5eed0000-0000-4000-8030-000000000001',
    null,
    null,
    'Amina',
    'Referral',
    public.encrypt_field('+34930005401'),
    public.encrypt_field(concat('amina.referral', '@', 'example.test')),
    'in_progress',
    public.encrypt_field('Pendent de primera entrevista.'),
    'pending',
    now() - interval '2 days',
    now() - interval '2 days'
  ),
  (
    '5eed0000-0000-4000-8010-000000000002',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8000-000000000004',
    '5eed0000-0000-4000-8030-000000000001',
    '5eed0000-0000-4000-8000-000000000011',
    '5eed0000-0000-4000-8000-000000000002',
    'أمينة',
    'الحسن',
    public.encrypt_field('+34600000011'),
    public.encrypt_field('amina.alhassan@example.test'),
    'complete',
    public.encrypt_field('Derivació completada per Creu Roja Osona.'),
    'active',
    now() - interval '30 days',
    now() - interval '3 days'
  ),
  (
    '5eed0000-0000-4000-8010-000000000003',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8000-000000000005',
    '5eed0000-0000-4000-8030-000000000002',
    '5eed0000-0000-4000-8000-000000000012',
    '5eed0000-0000-4000-8000-000000000003',
    'فاطمة',
    'الزهراء',
    public.encrypt_field('+34600000012'),
    public.encrypt_field('fatima.zahra@example.test'),
    'complete',
    public.encrypt_field('Derivació completada per CEAR Catalunya.'),
    'active',
    now() - interval '20 days',
    now() - interval '2 days'
  ),
  (
    '5eed0000-0000-4000-8010-000000000004',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8000-000000000004',
    '5eed0000-0000-4000-8030-000000000001',
    '5eed0000-0000-4000-8000-000000000013',
    '5eed0000-0000-4000-8000-000000000002',
    'مريم',
    'بن علي',
    public.encrypt_field('+34600000013'),
    public.encrypt_field('mariam.benali@example.test'),
    'complete',
    public.encrypt_field('Derivació completada per Creu Roja Osona.'),
    'inactive',
    now() - interval '60 days',
    now() - interval '4 days'
  ),
  (
    '5eed0000-0000-4000-8010-000000000005',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8000-000000000004',
    '5eed0000-0000-4000-8030-000000000001',
    '5eed0000-0000-4000-8000-000000000014',
    '5eed0000-0000-4000-8000-000000000002',
    'زينب',
    'حداد',
    public.encrypt_field('+34600000014'),
    public.encrypt_field('zeinab.haddad@example.test'),
    'complete',
    public.encrypt_field('Derivació completada per Creu Roja Osona.'),
    'active',
    now() - interval '90 days',
    now() - interval '5 days'
  )
on conflict (id) do nothing;

-- The pending referral carries the season registration answers and the
-- entity's consent (RAPP-303), so accepting it fills her profile. Its answers
-- are by field (ADR-031); its blob keeps only her season count.
update public.entity_referrals
set
  intake_answers = public.encrypt_field(jsonb_build_object('season_number', 2)::text),
  consent_confirmed_at = now() - interval '2 days',
  consent_confirmed_by = '5eed0000-0000-4000-8000-000000000004'
where id = '5eed0000-0000-4000-8010-000000000001';

perform pg_temp.seed_referral_answer('5eed0000-0000-4000-8010-000000000001', answer.system_key, answer.value)
from (values
  ('date_of_birth', '"1996-02-20"'::jsonb),
  ('nationality', '"Marroc"'),
  ('document_type', '"none"'),
  ('city', '"Vic"'),
  ('phone', '"+34930005401"'),
  ('applicant_status', '"migrant"'),
  ('supporting_entities', '["Càritas Vic"]'),
  ('reference_contact_name', '"Sílvia Bosch"'),
  ('childcare_need', '"yes"'),
  ('specific_needs', '["other"]'),
  ('specific_needs_details', '"Prefereix entrenar a la tarda."')
) as answer(system_key, value);

-- The phone each linked referral was sent with.
perform pg_temp.seed_referral_answer(referral.id, 'phone', to_jsonb(referral.phone))
from (values
  ('5eed0000-0000-4000-8010-000000000002'::uuid, '+34600000011'),
  ('5eed0000-0000-4000-8010-000000000003'::uuid, '+34600000012'),
  ('5eed0000-0000-4000-8010-000000000004'::uuid, '+34600000013'),
  ('5eed0000-0000-4000-8010-000000000005'::uuid, '+34600000014')
) as referral(id, phone);

insert into public.entity_invitations (
  id, org_id, collaborating_entity_id, email, profile_id, invited_by,
  expires_at, accepted_at, created_at
)
values (
  '5eed0000-0000-4000-8040-000000000001',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8030-000000000001',
  'silvia.bosch@example.test',
  '5eed0000-0000-4000-8000-000000000004',
  '5eed0000-0000-4000-8000-000000000001',
  now() + interval '30 days',
  now() - interval '10 days',
  now() - interval '10 days'
)
on conflict (id) do nothing;

insert into public.referral_updates (
  id, org_id, referral_id, author_id, update_type, content, created_at
)
values (
  '5eed0000-0000-4000-8020-000000000001',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8010-000000000002',
  '5eed0000-0000-4000-8000-000000000004',
  'housing',
  public.encrypt_field('La situació d’habitatge ha canviat.'),
  now() - interval '3 days'
)
on conflict (id) do nothing;

-- Push tokens --------------------------------------------------------------------
-- Insert fixture devices after referral updates. The referral update trigger may
-- dispatch immediately, and seeded Expo tokens must not be pruned before QA uses
-- them to prove a later recipient-specific delivery.

insert into public.push_tokens (id, user_id, token, platform, device_id)
select
  ('5eed0000-0000-4000-8000-' || lpad((900 + r.ordinal)::text, 12, '0'))::uuid,
  ('5eed0000-0000-4000-8000-' || lpad(r.ordinal::text, 12, '0'))::uuid,
  'ExponentPushToken[seed-' || lpad(r.ordinal::text, 4, '0') || ']',
  case when r.ordinal % 2 = 0 then 'android' else 'ios' end,
  'seed-device-' || lpad(r.ordinal::text, 4, '0')
from seed_roster r
where r.ordinal in (1, 2, 3) or r.app_role = 'player'
on conflict (user_id, device_id) do nothing;

-- Targeted notification fixtures (RAPP-59) -------------------------------------
-- One reusable reminder and one group with one active player per supported
-- language make exact audience and locale QA reproducible after every reset.

insert into public.notification_templates (
  id, org_id, name, category, title, body, created_by
)
values (
  '5eed0000-0000-4000-8033-000000000001',
  '5eed0000-0000-4000-8000-000000000000',
  'Entrenament setmanal',
  'engagement',
  '{"ca":"Recordatori de l’entrenament setmanal","es":"Recordatorio del entrenamiento semanal","en":"Weekly training reminder","ar":"تذكير بالتدريب الأسبوعي","fa":"یادآوری تمرین هفتگی"}'::jsonb,
  '{"ca":"Recorda que aquesta tarda tenim entrenament.","es":"Recuerda que esta tarde tenemos entrenamiento.","en":"Remember that training is this afternoon.","ar":"تذكّري أن التدريب سيكون بعد ظهر اليوم.","fa":"یادت باشد تمرین امروز بعدازظهر است."}'::jsonb,
  '5eed0000-0000-4000-8000-000000000002'
)
on conflict (id) do nothing;

insert into public.custom_notification_groups (id, org_id, name, created_by)
values (
  '5eed0000-0000-4000-8034-000000000001',
  '5eed0000-0000-4000-8000-000000000000',
  'Grup setmanal multilingüe',
  '5eed0000-0000-4000-8000-000000000002'
)
on conflict (id) do nothing;

insert into public.custom_notification_group_members (org_id, group_id, participant_id)
select
  '5eed0000-0000-4000-8000-000000000000'::uuid,
  '5eed0000-0000-4000-8034-000000000001'::uuid,
  member_id
from unnest(array[
  '5eed0000-0000-4000-8000-000000000011'::uuid,
  '5eed0000-0000-4000-8000-000000000016'::uuid,
  '5eed0000-0000-4000-8000-000000000020'::uuid,
  '5eed0000-0000-4000-8000-000000000023'::uuid,
  '5eed0000-0000-4000-8000-000000000027'::uuid
]) as member_id
on conflict (group_id, participant_id) do nothing;

insert into public.targeted_notification_sends (
  id, org_id, template_id, title, body, audience_kind, audience_config,
  recipient_count, sent_by, created_at
)
values (
  '5eed0000-0000-4000-8035-000000000001',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8033-000000000001',
  '{"ca":"Recordatori de l’entrenament setmanal","es":"Recordatorio del entrenamiento semanal","en":"Weekly training reminder","ar":"تذكير بالتدريب الأسبوعي","fa":"یادآوری تمرین هفتگی"}'::jsonb,
  '{"ca":"Recorda que aquesta tarda tenim entrenament.","es":"Recuerda que esta tarde tenemos entrenamiento.","en":"Remember that training is this afternoon.","ar":"تذكّري أن التدريب سيكون بعد ظهر اليوم.","fa":"یادت باشد تمرین امروز بعدازظهر است."}'::jsonb,
  'custom_group',
  '{"custom_group_id":"5eed0000-0000-4000-8034-000000000001"}'::jsonb,
  5,
  '5eed0000-0000-4000-8000-000000000002',
  now() - interval '7 days'
)
on conflict (id) do nothing;

insert into public.push_publications (
  id, org_id, content_type, content_id, scheduled_for, state,
  recipient_count, sent_count, delivered_count, failed_count, completed_at
)
values (
  '5eed0000-0000-4000-8036-000000000001',
  '5eed0000-0000-4000-8000-000000000000',
  'targeted_notification',
  '5eed0000-0000-4000-8035-000000000001',
  now() - interval '7 days',
  'complete',
  5,
  5,
  5,
  0,
  now() - interval '7 days'
)
on conflict (content_type, content_id) do nothing;

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

-- The invited test account (RAPP-300) ------------------------------------------------
-- A woman whose profile staff created with her account: role 'invited', no
-- consent yet, and some questions answered by staff. Signing in as her shows
-- the wizard asking only the rest, then the summary and the terms. Completing
-- it locally makes her a player; the next `db reset` restores this state.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, reauthentication_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '5eed0000-0000-4000-8000-000000000098',
  'authenticated',
  'authenticated',
  'invited@example.test',
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
  '5eed0000-0000-4000-8000-000000000098',
  '5eed0000-0000-4000-8000-000000000098',
  jsonb_build_object('sub', '5eed0000-0000-4000-8000-000000000098', 'email', 'invited@example.test'),
  'email',
  now(), now(), now()
)
on conflict (provider_id, provider) do nothing;

insert into public.profiles (id, org_id, role, first_name, last_name, preferred_language)
values (
  '5eed0000-0000-4000-8000-000000000098',
  '5eed0000-0000-4000-8000-000000000000',
  'invited',
  'Mariam',
  'Keita',
  'ca'
)
on conflict (id) do nothing;

-- What staff filled in before she joined: answers by field, given by the team.
perform pg_temp.seed_app_answer('5eed0000-0000-4000-8000-000000000098', answer.system_key, answer.value, 'staff',
                               '5eed0000-0000-4000-8000-000000000002')
from (values
  ('date_of_birth', '"1999-03-14"'::jsonb),
  ('nationality', '"Mali"'),
  ('reference_entity', '"Creu Roja Osona"'),
  ('clothing_size', '"M"')
) as answer(system_key, value);

-- Staff choices for her wizard (RAPP-301), on the fields: she reviews the
-- clothing size staff entered, and she is not asked her phone.
insert into public.custom_question_states (profile_id, org_id, question_id, state)
select '5eed0000-0000-4000-8000-000000000098', f.org_id, f.id, choice.state
from (values ('clothing_size', 'ask'), ('phone', 'skip')) as choice(system_key, state)
join public.profile_fields f
  on f.org_id = '5eed0000-0000-4000-8000-000000000000' and f.system_key = choice.system_key
on conflict (profile_id, question_id) do nothing;

-- The participation authorization (RAPP-304) -----------------------------------
-- The 2026/27 season and version 1 of Ramassà's authorization: the text of the
-- paper form with complete CA/ES/EN/AR/FA translations (RAPP-586),
-- consecutive section numbers and reserved test email addresses.
-- Every seeded player signed it on paper in September, except Наталія (...022),
-- who has not signed yet and so meets the authorization gate. The first player
-- signed in the app, with a drawn signature and her consents.

insert into public.seasons (id, org_id, name, starts_on, is_current)
values ('5eed0000-0000-4000-8040-000000000001', '5eed0000-0000-4000-8000-000000000000',
        '2026/27', '2026-09-01', true)
on conflict (org_id, name) where not is_test_fixture do nothing;

insert into public.authorization_versions (id, org_id, season_id, version_number, content, published_at, published_by)
values (
  '5eed0000-0000-4000-8041-000000000001',
  '5eed0000-0000-4000-8000-000000000000',
  (select id from public.seasons where org_id = '5eed0000-0000-4000-8000-000000000000' and name = '2026/27'),
  1,
  -- The addresses are written with [at] so they are not read as seeded accounts.
  replace($auth${
  "title": {
    "ca": "Autorització de participació, tractament de dades i compromís amb el codi de conducta. Temporada 2026/2027",
    "es": "Autorización de participación, tratamiento de datos y compromiso con el código de conducta. Temporada 2026/2027",
    "en": "Authorization for participation, data processing and commitment to the code of conduct. 2026/2027 season",
    "ar": "الموافقة على المشاركة ومعالجة البيانات والالتزام بمدونة السلوك. موسم 2026/2027",
    "fa": "اجازه شرکت در برنامه، پردازش داده‌ها و تعهد به آیین‌نامه رفتار. فصل 2026/2027"
  },
  "sections": [
    {
      "key": "medical",
      "title": {
        "ca": "1. Dades mèdiques",
        "es": "1. Datos médicos",
        "en": "1. Medical information",
        "ar": "1. البيانات الطبية",
        "fa": "1. اطلاعات پزشکی"
      },
      "body": {
        "ca": "En fer constar aquestes dades, la participant accepta de manera expressa el tractament de les seves dades de salut, que són necessàries per poder participar de manera segura en el Projecte. Si no les vol fer constar, no podrà participar en el Programa.\n\nSi no tens cap malaltia, al·lèrgia, discapacitat, lesió o tractament mèdic rellevant, respon NO.\n\nAE Ramassà es reserva el dret de denegar la participació en una activitat concreta si una malaltia, lesió o incapacitat impedeix a la persona participar-hi amb seguretat.",
        "es": "Al hacer constar estos datos, la participante acepta de forma expresa el tratamiento de sus datos de salud, siendo estos necesarios para poder participar de forma segura en el Proyecto. En caso de no querer hacerlos constar, no podrá participar en el Programa.\n\nSi no sufres ninguna enfermedad, alergia, discapacidad, lesión o tratamiento médico relevante, responde NO.\n\nAE Ramassà se reserva el derecho a denegar la participación en una actividad concreta si una enfermedad, lesión o incapacidad impide a la persona participar con seguridad.",
        "en": "By providing this information, the participant expressly agrees to the processing of her health data, which is necessary to participate safely in the Project. If she does not wish to provide it, she will not be able to participate in the Programme.\n\nIf you do not have any relevant illness, allergy, disability, injury or medical treatment, answer NO.\n\nAE Ramassà reserves the right to refuse participation in a particular activity if an illness, injury or incapacity prevents the person from participating safely.",
        "ar": "بتقديم هذه البيانات، توافق المشاركة صراحةً على معالجة بياناتها الصحية، وهي ضرورية للمشاركة بأمان في المشروع. وإذا لم ترغب في تقديمها، فلن تتمكن من المشاركة في البرنامج.\n\nإذا لم يكن لديكِ أي مرض أو حساسية أو إعاقة أو إصابة أو علاج طبي ذي صلة، فأجيبي بلا.\n\nتحتفظ AE Ramassà بالحق في رفض مشاركة شخص في نشاط معين إذا كان المرض أو الإصابة أو العجز يمنعه من المشاركة بأمان.",
        "fa": "با ارائه این اطلاعات، شرکت‌کننده به‌صراحت با پردازش داده‌های مربوط به سلامت خود موافقت می‌کند. این داده‌ها برای شرکت ایمن در پروژه ضروری هستند. اگر نخواهد این اطلاعات را ارائه دهد، نمی‌تواند در برنامه شرکت کند.\n\nاگر بیماری، حساسیت، معلولیت، آسیب‌دیدگی یا درمان پزشکی مرتبطی ندارید، پاسخ «خیر» بدهید.\n\nAE Ramassà این حق را برای خود محفوظ می‌دارد که اگر بیماری، آسیب‌دیدگی یا ناتوانی مانع شرکت ایمن فرد در یک فعالیت مشخص شود، اجازه شرکت در آن فعالیت را ندهد."
      }
    },
    {
      "key": "insurance",
      "title": {
        "ca": "2. Assegurança",
        "es": "2. Seguro",
        "en": "2. Insurance",
        "ar": "2. التأمين",
        "fa": "2. بیمه"
      },
      "body": {
        "ca": "AE Ramassà declara que té contractada una pòlissa de responsabilitat civil per al desenvolupament del programa, així com una pòlissa d'accidents per a la persona participant. S'entén per accident la lesió corporal derivada d'una causa violenta, sobtada, externa i aliena a la intencionalitat de la persona assegurada; en queden excloses les patologies preexistents o d'origen aliè a l'activitat.",
        "es": "AE Ramassà declara tener contratada una póliza de responsabilidad civil para el desarrollo del programa, así como una póliza de accidentes para la persona participante. Se entiende por accidente la lesión corporal derivada de una causa violenta, repentina, externa y ajena a la intencionalidad de la persona asegurada; quedan excluidas las patologías preexistentes o de origen ajeno a la actividad.",
        "en": "AE Ramassà declares that it holds public liability insurance for the delivery of the programme, as well as accident insurance for the participant. An accident means bodily injury resulting from a violent, sudden, external cause beyond the insured person's intention; pre-existing conditions and conditions unrelated to the activity are excluded.",
        "ar": "تعلن AE Ramassà أنها أبرمت وثيقة تأمين للمسؤولية المدنية لتسيير البرنامج، ووثيقة تأمين ضد الحوادث للمشاركة. ويُقصد بالحادث الإصابة الجسدية الناتجة عن سبب عنيف ومفاجئ وخارجي وغير متعمد من الشخص المؤمَّن عليه؛ وتُستثنى الحالات المرضية الموجودة مسبقًا أو غير المرتبطة بالنشاط.",
        "fa": "AE Ramassà اعلام می‌کند که برای اجرای برنامه، بیمه مسئولیت مدنی و برای شرکت‌کننده، بیمه حوادث دارد. منظور از حادثه، آسیب جسمی ناشی از علتی شدید، ناگهانی، خارجی و خارج از قصد فرد بیمه‌شده است؛ بیماری‌های از قبل موجود یا عوارضی که منشأ آن‌ها به فعالیت مربوط نیست، تحت پوشش نیستند."
      }
    },
    {
      "key": "participation",
      "title": {
        "ca": "3. Autorització de participació",
        "es": "3. Autorización de participación",
        "en": "3. Authorization to participate",
        "ar": "3. الموافقة على المشاركة",
        "fa": "3. اجازه شرکت در برنامه"
      },
      "body": {
        "ca": "Amb la signatura d'aquest document, jo, la persona signant, AUTORITZO DE MANERA EXPRESSA I VOLUNTÀRIA la meva participació en les activitats del Projecte i DECLARO, sota la meva responsabilitat, que la informació aportada és certa.",
        "es": "Con la firma de este documento, yo, la persona firmante, AUTORIZO EXPRESA Y VOLUNTARIAMENTE mi participación en las actividades del Proyecto, y DECLARO, bajo mi responsabilidad, que la información aportada es cierta.",
        "en": "By signing this document, I, the signatory, EXPRESSLY AND VOLUNTARILY AUTHORIZE my participation in the Project's activities and DECLARE, under my own responsibility, that the information provided is true.",
        "ar": "بتوقيعي على هذه الوثيقة، أوافق، أنا الموقِّعة، صراحةً وبمحض إرادتي على مشاركتي في أنشطة المشروع، وأُقرّ، تحت مسؤوليتي، بأن المعلومات المقدَّمة صحيحة.",
        "fa": "با امضای این سند، من، امضاکننده، به‌صراحت و داوطلبانه اجازه شرکت خود در فعالیت‌های پروژه را می‌دهم و با مسئولیت خود اعلام می‌کنم که اطلاعات ارائه‌شده صحیح است."
      }
    },
    {
      "key": "data_processing",
      "title": {
        "ca": "4. Tractament de dades de caràcter personal",
        "es": "4. Tratamiento de datos de carácter personal",
        "en": "4. Processing of personal data",
        "ar": "4. معالجة البيانات الشخصية",
        "fa": "4. پردازش داده‌های شخصی"
      },
      "body": {
        "ca": "Responsable del tractament: Associació Esportiva Ramassà, amb domicili a Carretera de Ribes 4, Despatx 105, 08520 Les Franqueses del Vallès, en compliment del RGPD (UE) 2016/679, la LOPDGDD 3/2018 i la LSSICE.\n\nLes teves dades es tractaran per gestionar la teva inscripció i participació en el Projecte, comunicar-te qualsevol incidència o canvi i complir les obligacions legals i d'assegurances derivades de la teva participació (inclosa la comunicació a la companyia asseguradora en cas d'accident). També es podran tractar, únicament si ho autoritzes de manera expressa marcant la casella corresponent, per enviar-te el butlletí, comunicacions informatives, invitacions o enquestes, i per incloure't en grups de missatgeria instantània de l'equip.\n\nAE Ramassà, com a entitat amb projecció internacional, pot comptar amb proveïdors que prestin serveis des de fora de la UE/EEE; en aquest cas es garantiran les salvaguardes exigides per la normativa (clàusules contractuals tipus o altres d'equivalents).\n\nLes teves dades es conservaran durant el temps necessari per complir la finalitat per a la qual es van recollir i les obligacions legals aplicables. Pots exercir en qualsevol moment els drets d'accés, rectificació, supressió, oposició, limitació i portabilitat escrivint a dades[at]example.test, adjuntant un document que acrediti la teva identitat, o adreçar-te al president d'AE Ramassà (presidencia[at]example.test) per a qualsevol dubte sobre el tractament de les teves dades. També pots presentar una reclamació davant l'Agència Espanyola de Protecció de Dades (www.agpd.es).",
        "es": "Responsable del tratamiento: Associació Esportiva Ramassà, con domicilio en Carretera de Ribes 4, Despatx 105, 08520 Les Franqueses del Vallès, en cumplimiento del RGPD (UE) 2016/679, la LOPDGDD 3/2018 y la LSSICE.\n\nTus datos se tratarán para gestionar tu inscripción y participación en el Proyecto, comunicarte cualquier incidencia o cambio, y cumplir con las obligaciones legales y aseguradoras derivadas de tu participación (incluida la comunicación a la compañía de seguros en caso de accidente). Podrán tratarse también, únicamente si lo autorizas de forma expresa marcando la casilla correspondiente, para el envío de la newsletter, comunicaciones informativas, invitaciones o encuestas, y para incluirte en grupos de mensajería instantánea del equipo.\n\nAE Ramassà, como entidad con proyección internacional, puede contar con proveedores que presten servicios desde fuera de la UE/EEE; en tal caso se garantizarán las salvaguardas exigidas por la normativa (cláusulas contractuales tipo u otras equivalentes).\n\nTus datos se conservarán durante el tiempo necesario para cumplir con la finalidad para la que se recogieron y con las obligaciones legales aplicables. Puedes ejercer en cualquier momento los derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a dades[at]example.test, adjuntando un documento que acredite tu identidad, o dirigirte al Presidente de AE Ramassà (presidencia[at]example.test) para cualquier duda sobre el tratamiento de tus datos. También puedes presentar una reclamación ante la Agencia Española de Protección de Datos (www.agpd.es).",
        "en": "Data controller: Associació Esportiva Ramassà, with its address at Carretera de Ribes 4, Despatx 105, 08520 Les Franqueses del Vallès, in compliance with the GDPR (EU) 2016/679, the LOPDGDD 3/2018 and the LSSICE.\n\nYour data will be processed to manage your registration and participation in the Project, inform you of any incident or change, and meet the legal and insurance obligations arising from your participation (including communication with the insurance company in the event of an accident). It may also be processed, only if you expressly authorize it by ticking the corresponding box, to send you newsletters, information, invitations or surveys, and to include you in the team's instant messaging groups.\n\nAs an organization with an international presence, AE Ramassà may use providers that deliver services from outside the EU/EEA; in such cases, the safeguards required by law will be ensured (standard contractual clauses or other equivalent measures).\n\nYour data will be kept for as long as necessary to fulfil the purpose for which it was collected and the applicable legal obligations. You may exercise your rights of access, rectification, erasure, objection, restriction and portability at any time by writing to dades[at]example.test and attaching a document proving your identity. You may also contact the President of AE Ramassà (presidencia[at]example.test) with any questions about the processing of your data. You may also lodge a complaint with the Spanish Data Protection Agency (www.agpd.es).",
        "ar": "الجهة المسؤولة عن معالجة البيانات: Associació Esportiva Ramassà، وعنوانها Carretera de Ribes 4, Despatx 105, 08520 Les Franqueses del Vallès، امتثالًا للائحة العامة لحماية البيانات (الاتحاد الأوروبي) 2016/679، والقانون العضوي الإسباني لحماية البيانات وضمان الحقوق الرقمية LOPDGDD 3/2018، وقانون خدمات مجتمع المعلومات والتجارة الإلكترونية LSSICE.\n\nستُعالَج بياناتكِ لإدارة تسجيلكِ ومشاركتكِ في المشروع، وإبلاغكِ بأي حادث أو تغيير، والوفاء بالالتزامات القانونية والتأمينية الناشئة عن مشاركتكِ (بما في ذلك التواصل مع شركة التأمين في حال وقوع حادث). ويمكن أيضًا معالجتها، فقط إذا وافقتِ صراحةً بوضع علامة في المربع المقابل، لإرسال النشرة الإخبارية والمعلومات والدعوات أو الاستبيانات، ولإضافتكِ إلى مجموعات المراسلة الفورية الخاصة بالفريق.\n\nنظرًا إلى الطابع الدولي لأنشطة AE Ramassà، فقد تستعين بمقدِّمي خدمات يعملون من خارج الاتحاد الأوروبي/المنطقة الاقتصادية الأوروبية؛ وفي هذه الحالة، ستُضمَن التدابير الوقائية التي تفرضها التشريعات (البنود التعاقدية القياسية أو تدابير أخرى مكافئة).\n\nستُحفَظ بياناتكِ للمدة اللازمة لتحقيق الغرض الذي جُمعت من أجله والوفاء بالالتزامات القانونية المعمول بها. يمكنكِ في أي وقت ممارسة حقوقكِ في الوصول إلى البيانات وتصحيحها ومحوها والاعتراض على معالجتها وتقييد معالجتها ونقلها، وذلك بمراسلة dades[at]example.test وإرفاق وثيقة تثبت هويتكِ. ويمكنكِ أيضًا التواصل مع رئيس AE Ramassà عبر presidencia[at]example.test بشأن أي سؤال عن معالجة بياناتكِ. كما يمكنكِ تقديم شكوى إلى الوكالة الإسبانية لحماية البيانات (www.agpd.es).",
        "fa": "مسئول پردازش داده‌ها: Associació Esportiva Ramassà، به نشانی Carretera de Ribes 4, Despatx 105, 08520 Les Franqueses del Vallès، مطابق با مقررات عمومی حفاظت از داده‌ها (اتحادیه اروپا) 2016/679، قانون LOPDGDD 3/2018 و قانون LSSICE.\n\nداده‌های شما برای مدیریت ثبت‌نام و شرکت شما در پروژه، اطلاع‌رسانی درباره هر رویداد یا تغییر، و انجام تعهدات قانونی و بیمه‌ای ناشی از مشارکت شما پردازش می‌شوند (از جمله ارتباط با شرکت بیمه در صورت وقوع حادثه). همچنین، فقط در صورتی که با علامت زدن کادر مربوط به‌صراحت اجازه دهید، این داده‌ها می‌توانند برای ارسال خبرنامه، اطلاعیه‌ها، دعوت‌نامه‌ها یا نظرسنجی‌ها و افزودن شما به گروه‌های پیام‌رسانی فوری تیم پردازش شوند.\n\nAE Ramassà به‌عنوان نهادی با فعالیت بین‌المللی ممکن است از ارائه‌دهندگانی استفاده کند که از خارج از اتحادیه اروپا/منطقه اقتصادی اروپا خدمات ارائه می‌دهند؛ در این صورت، تضمین‌های لازم طبق مقررات فراهم می‌شود (شروط قراردادی استاندارد یا تدابیر معادل دیگر).\n\nداده‌های شما تا زمانی که برای تحقق هدف جمع‌آوری آن‌ها و انجام تعهدات قانونی مربوط لازم باشد، نگهداری می‌شوند. می‌توانید در هر زمان حقوق خود در زمینه دسترسی، اصلاح، حذف، اعتراض، محدود کردن پردازش و انتقال‌پذیری داده‌ها را از طریق ارسال ایمیل به dades[at]example.test همراه با مدرکی برای اثبات هویتتان اعمال کنید. برای هر پرسش درباره پردازش داده‌های خود نیز می‌توانید با رئیس AE Ramassà از طریق presidencia[at]example.test تماس بگیرید. همچنین می‌توانید به آژانس حفاظت از داده‌های اسپانیا (www.agpd.es) شکایت کنید."
      }
    },
    {
      "key": "images",
      "title": {
        "ca": "5. Autorització per a la captació i l’ús d’imatges",
        "es": "5. Autorización para la toma y uso de imágenes",
        "en": "5. Authorization to capture and use images",
        "ar": "5. الموافقة على التقاط الصور واستخدامها",
        "fa": "5. اجازه تهیه و استفاده از تصویر"
      },
      "body": {
        "ca": "La Guia de Temporada explica que sempre se't demana permís abans de fer-te una foto o un vídeo, i que pots dir que no en qualsevol moment i sense conseqüències. Aquest apartat recull els termes legals d'aquesta mateixa autorització.\n\nMarcant la casella corresponent, AUTORITZO AE Ramassà, per si mateixa o a través de tercers autoritzats, a:\n• Fer fotografies, gravacions, reportatges fotogràfics, audiovisuals i/o sonors de les activitats del Projecte en què participo.\n• Captar la meva imatge, veu i nom durant la meva assistència i participació en el Projecte.\n• Utilitzar i, si escau, cedir a tercers, amb finalitats publicitàries, promocionals i divulgatives del Projecte i d'AE Ramassà, els continguts on aparegui, a través de qualsevol mitjà (web, xarxes socials, premsa, exposicions), sense que això generi dret a cap compensació econòmica.\n\nAquests usos exclouen sempre qualsevol utilització que pugui atemptar contra el dret a l'honor, la intimitat personal i familiar i la pròpia imatge, en els termes de la Llei orgànica 1/1982.\n\nGaranties addicionals de protecció (Política de Protecció, secc. 8.6 i 9.1):\n• Les imatges han de presentar les persones de manera respectuosa i no s'utilitzaran mai de manera sexualitzada ni d'una manera que et mostri en una situació de vulnerabilitat.\n• Els peus de foto, noms de fitxer o descripcions no revelaran mai el teu estatus migratori, d'asil, la teva orientació sexual o identitat de gènere, llevat que ho autoritzis de manera expressa i per separat.\n• Pots retirar aquest consentiment en qualsevol moment, sense haver de justificar-ho i sense que això afecti la teva participació en el Projecte, escrivint a femeni[at]example.test.",
        "es": "La Guía de Temporada explica cómo se pide siempre tu permiso antes de tomarte una foto o vídeo, y que puedes decir que no en cualquier momento y sin consecuencias. Este apartado recoge los términos legales de esa misma autorización.\n\nMarcando la casilla correspondiente, AUTORIZO a AE Ramassà, por sí misma o a través de terceros autorizados, a:\n• Tomar fotografías, grabaciones, reportajes fotográficos, audiovisuales y/o sonoros de las actividades del Proyecto en las que participo.\n• Captar mi imagen, voz y nombre durante mi asistencia y participación en el Proyecto.\n• Utilizar y, en su caso, ceder a terceros, con fines publicitarios, promocionales y divulgativos del Proyecto y de AE Ramassà, los contenidos donde aparezca, a través de cualquier medio (web, redes sociales, prensa, exposiciones), sin que ello genere derecho a compensación económica.\n\nEstos usos se realizan siempre con la excepción de cualquier utilización que pudiera atentar contra el derecho al honor, la intimidad personal y familiar y la propia imagen, en los términos de la Ley Orgánica 1/1982.\n\nGarantías adicionales de protección (Política de Protección, secc. 8.6 y 9.1):\n• Las imágenes deben presentar a las personas de forma respetuosa y nunca se utilizarán de forma sexualizada ni de un modo que te muestre en una situación de vulnerabilidad.\n• Los pies de foto, nombres de archivo o descripciones no revelarán nunca tu estatus migratorio, de asilo, tu orientación sexual o identidad de género, salvo que tú lo autorices expresamente y por separado.\n• Puedes retirar este consentimiento en cualquier momento, sin necesidad de justificarlo y sin que ello afecte a tu participación en el Proyecto, escribiendo a femeni[at]example.test.",
        "en": "The Season Guide explains that your permission is always requested before a photo or video is taken of you, and that you can say no at any time without consequences. This section sets out the legal terms of that same authorization.\n\nBy ticking the corresponding box, I AUTHORIZE AE Ramassà, either directly or through authorized third parties, to:\n• Take photographs, recordings, photographic reports and audiovisual and/or audio recordings of the Project activities in which I participate.\n• Capture my image, voice and name during my attendance and participation in the Project.\n• Use and, where applicable, transfer to third parties, for advertising, promotional and awareness-raising purposes relating to the Project and AE Ramassà, content in which I appear, through any medium (websites, social media, press, exhibitions), without this giving rise to any right to financial compensation.\n\nThese uses always exclude any use that could infringe the right to honour, personal and family privacy, or one's own image, under the terms of Organic Law 1/1982.\n\nAdditional protection safeguards (Protection Policy, sections 8.6 and 9.1):\n• Images must portray people respectfully and must never be used in a sexualized way or in a way that shows you in a vulnerable situation.\n• Captions, file names or descriptions must never reveal your immigration or asylum status, sexual orientation or gender identity, unless you expressly authorize this separately.\n• You may withdraw this consent at any time, without having to give a reason and without affecting your participation in the Project, by writing to femeni[at]example.test.",
        "ar": "يوضح دليل الموسم أنه يُطلَب إذنكِ دائمًا قبل التقاط صورة أو مقطع فيديو لكِ، وأنه يمكنكِ الرفض في أي وقت دون أي عواقب. ويبيّن هذا القسم الشروط القانونية لهذه الموافقة نفسها.\n\nبوضع علامة في المربع المقابل، أوافق على أن تقوم AE Ramassà، بنفسها أو من خلال أطراف ثالثة مخوَّلة، بما يلي:\n• التقاط الصور والتسجيلات والتقارير المصوَّرة والتسجيلات السمعية والبصرية و/أو الصوتية لأنشطة المشروع التي أشارك فيها.\n• تسجيل صورتي وصوتي واسمي أثناء حضوري ومشاركتي في المشروع.\n• استخدام المحتوى الذي أظهر فيه، ونقله إلى أطراف ثالثة عند الاقتضاء، لأغراض الإعلان والترويج والتعريف بالمشروع وبـ AE Ramassà، عبر أي وسيلة (المواقع الإلكترونية وشبكات التواصل الاجتماعي والصحافة والمعارض)، دون أن ينشأ عن ذلك أي حق في تعويض مالي.\n\nتُستثنى دائمًا من هذه الاستخدامات أي طريقة قد تمس الحق في الشرف أو الخصوصية الشخصية والعائلية أو الحق في الصورة الشخصية، وفقًا لأحكام القانون العضوي الإسباني 1/1982.\n\nضمانات حماية إضافية (سياسة الحماية، القسمان 8.6 و9.1):\n• يجب أن تُظهِر الصور الأشخاص باحترام، وألّا تُستخدَم مطلقًا بطريقة ذات طابع جنسي أو بطريقة تُظهركِ في وضع ضعف.\n• يجب ألّا تكشف التعليقات على الصور أو أسماء الملفات أو الأوصاف عن وضعكِ المتعلق بالهجرة أو اللجوء أو ميولكِ الجنسية أو هويتكِ الجندرية، إلا إذا وافقتِ على ذلك صراحةً وبشكل منفصل.\n• يمكنكِ سحب هذه الموافقة في أي وقت دون الحاجة إلى تقديم مبرر، ودون أن يؤثر ذلك على مشاركتكِ في المشروع، وذلك بمراسلة femeni[at]example.test.",
        "fa": "راهنمای فصل توضیح می‌دهد که پیش از گرفتن عکس یا ویدئو از شما همیشه اجازه‌تان خواسته می‌شود و می‌توانید در هر زمان، بدون هیچ پیامدی، مخالفت کنید. این بخش شرایط حقوقی همان اجازه را بیان می‌کند.\n\nبا علامت زدن کادر مربوط، به AE Ramassà اجازه می‌دهم که مستقیماً یا از طریق اشخاص ثالث مجاز:\n• از فعالیت‌های پروژه که در آن‌ها شرکت می‌کنم، عکس، ضبط، گزارش تصویری، محتوای دیداری‌شنیداری و/یا صوتی تهیه کند.\n• تصویر، صدا و نام مرا هنگام حضور و شرکت در پروژه ثبت کند.\n• محتوایی را که در آن دیده می‌شوم، برای اهداف تبلیغاتی، ترویجی و اطلاع‌رسانی درباره پروژه و AE Ramassà، از طریق هر رسانه‌ای (وب‌سایت، شبکه‌های اجتماعی، مطبوعات، نمایشگاه‌ها) استفاده کند و در صورت لزوم در اختیار اشخاص ثالث قرار دهد، بدون اینکه این کار حقی برای دریافت جبران مالی ایجاد کند.\n\nاین استفاده‌ها همواره هرگونه استفاده‌ای را که ممکن است به حق حیثیت، حریم خصوصی شخصی و خانوادگی و حق بر تصویر شخصی لطمه بزند، طبق قانون ارگانیک 1/1982، مستثنا می‌کنند.\n\nتضمین‌های تکمیلی حفاظت (سیاست حفاظت، بخش‌های 8.6 و 9.1):\n• تصاویر باید افراد را محترمانه نشان دهند و هرگز نباید به‌صورت جنسی‌شده یا به شکلی که شما را در وضعیت آسیب‌پذیر نشان دهد استفاده شوند.\n• زیرنویس عکس‌ها، نام فایل‌ها یا توضیحات هرگز نباید وضعیت مهاجرت یا پناهندگی، گرایش جنسی یا هویت جنسیتی شما را آشکار کنند، مگر اینکه به‌صراحت و به‌طور جداگانه اجازه دهید.\n• می‌توانید در هر زمان، بدون نیاز به ارائه دلیل و بدون تأثیر بر شرکت شما در پروژه، با ارسال ایمیل به femeni[at]example.test این رضایت را پس بگیرید."
      }
    },
    {
      "key": "obligations",
      "title": {
        "ca": "6. Obligacions de la participant",
        "es": "6. Obligaciones de la participante",
        "en": "6. Participant’s obligations",
        "ar": "6. التزامات المشاركة",
        "fa": "6. تعهدات شرکت‌کننده"
      },
      "body": {
        "ca": "Amb la signatura d'aquest document, ENTENC, ACCEPTO i EM COMPROMETO a respectar:\n• Els principis i valors d'AE Ramassà i del Projecte, així com les normes i els reglaments de les activitats (regles del joc, competició, joc net, etc.).\n• Les instruccions i decisions de l'equip de coordinació del Projecte.\n• El bon ús dels espais on es desenvolupen les activitats.\n• El Reglament per a la prevenció de la violència en espectacles esportius: no introduir begudes alcohòliques, armes o objectes que es puguin utilitzar com a bengales o focs artificials; no exhibir pancartes, símbols o llegendes que incitin a la violència; i no participar sota els efectes de l'alcohol, estupefaents o substàncies anàlogues. Qualsevol sanció derivada de l'incompliment d'aquest punt serà assumida per la persona signant.\n• El Codi de Conducta d'AE Ramassà, recollit a l'apartat 7 d'aquest mateix document, inclòs el compromís de no-discriminació.",
        "es": "Con la firma de este documento, ENTIENDO, ACEPTO y ME COMPROMETO a respetar:\n• Los principios y valores de AE Ramassà y del Proyecto, así como las normas y reglamentos de las actividades (reglas del juego, competición, fair play, etc.).\n• Las instrucciones y decisiones del equipo de coordinación del Proyecto.\n• El buen uso de los espacios donde se desarrollan las actividades.\n• El Reglamento para la prevención de la violencia en espectáculos deportivos: no introducir bebidas alcohólicas, armas u objetos susceptibles de ser usados como bengalas o fuegos de artificio; no exhibir pancartas, símbolos o leyendas que inciten a la violencia; y no participar bajo los efectos del alcohol, estupefacientes o sustancias análogas. Cualquier sanción derivada del incumplimiento de este punto será asumida por la persona firmante.\n• El Código de Conducta de AE Ramassà, recogido en el apartado 7 de este mismo documento, incluido el compromiso de no discriminación.",
        "en": "By signing this document, I UNDERSTAND, ACCEPT and COMMIT to respecting:\n• The principles and values of AE Ramassà and the Project, and the rules and regulations of the activities (rules of play, competition, fair play, etc.).\n• The instructions and decisions of the Project's coordination team.\n• The proper use of the spaces where the activities take place.\n• The Regulations for the prevention of violence at sporting events: do not bring alcoholic drinks, weapons or objects that could be used as flares or fireworks; do not display banners, symbols or slogans that incite violence; and do not participate under the influence of alcohol, narcotics or similar substances. Any penalty arising from failure to comply with this point will be borne by the signatory.\n• AE Ramassà's Code of Conduct, set out in section 7 of this document, including the commitment to non-discrimination.",
        "ar": "بتوقيعي على هذه الوثيقة، أفهم وأقبل وألتزم باحترام ما يلي:\n• مبادئ وقيم AE Ramassà والمشروع، وقواعد الأنشطة ولوائحها (قواعد اللعب والمنافسة واللعب النظيف، وما إلى ذلك).\n• تعليمات وقرارات فريق تنسيق المشروع.\n• الاستخدام السليم للأماكن التي تُقام فيها الأنشطة.\n• لائحة منع العنف في الفعاليات الرياضية: عدم إدخال المشروبات الكحولية أو الأسلحة أو الأشياء التي يمكن استخدامها كشعلات أو ألعاب نارية؛ وعدم عرض لافتات أو رموز أو شعارات تحرّض على العنف؛ وعدم المشاركة تحت تأثير الكحول أو المخدرات أو مواد مماثلة. وتتحمل الموقِّعة أي عقوبة ناتجة عن مخالفة هذا البند.\n• مدونة السلوك الخاصة بـ AE Ramassà، الواردة في القسم 7 من هذه الوثيقة، بما في ذلك الالتزام بعدم التمييز.",
        "fa": "با امضای این سند، موارد زیر را درک می‌کنم، می‌پذیرم و متعهد به رعایت آن‌ها می‌شوم:\n• اصول و ارزش‌های AE Ramassà و پروژه، و نیز قوانین و مقررات فعالیت‌ها (قواعد بازی، مسابقه، بازی جوانمردانه و غیره).\n• دستورالعمل‌ها و تصمیم‌های تیم هماهنگی پروژه.\n• استفاده درست از فضاهایی که فعالیت‌ها در آن‌ها برگزار می‌شوند.\n• مقررات پیشگیری از خشونت در رویدادهای ورزشی: وارد نکردن نوشیدنی‌های الکلی، سلاح یا اشیایی که می‌توان از آن‌ها به‌عنوان منور یا وسایل آتش‌بازی استفاده کرد؛ نمایش ندادن بنرها، نمادها یا شعارهایی که به خشونت تحریک می‌کنند؛ و شرکت نکردن تحت تأثیر الکل، مواد مخدر یا مواد مشابه. هرگونه مجازات ناشی از رعایت نکردن این بند بر عهده امضاکننده خواهد بود.\n• آیین‌نامه رفتار AE Ramassà، که در بخش 7 همین سند آمده است، از جمله تعهد به عدم تبعیض."
      }
    },
    {
      "key": "conduct",
      "title": {
        "ca": "7. Compromís amb el Codi de Conducta i la Política de Protecció",
        "es": "7. Compromiso con el Código de Conducta y la Política de Protección",
        "en": "7. Commitment to the Code of Conduct and Protection Policy",
        "ar": "7. الالتزام بمدونة السلوك وسياسة الحماية",
        "fa": "7. تعهد به آیین‌نامه رفتار و سیاست حفاظت"
      },
      "body": {
        "ca": "AE Ramassà manté una política de tolerància zero davant l'assetjament, l'abús, l'explotació, la discriminació, el tracte desigual, la coacció o la negligència, amb una atenció especial a les persones en situació de vulnerabilitat, incloses les dones, les persones refugiades i les persones LGBTQI+.\n\nEm comprometo a:\n• Tractar totes les persones de l'equip amb respecte, independentment de la seva ètnia, color, gènere, idioma, religió, ideologia, nacionalitat, origen social, discapacitat o orientació sexual.\n• No adoptar mai un llenguatge o comportament assetjador, abusiu, sexualment provocatiu, humiliant o culturalment inapropiat envers cap companya, entrenador/a, voluntari/ària o membre del Club.\n• Deixar que cada persona defineixi per si mateixa la proximitat física, verbal i emocional amb què se sent còmoda, i respectar la mateixa decisió de les altres.\n• Fer servir els noms i pronoms correctes de les meves companyes, i no revelar l'orientació sexual, la identitat de gènere o l'estatus migratori o d'asil de ningú sense el seu consentiment explícit.\n• No consumir alcohol ni substàncies il·legals durant les activitats del Projecte.\n• Informar immediatament de qualsevol preocupació sobre la meva seguretat o benestar, o el d'una companya, seguint el procediment descrit a continuació.",
        "es": "AE Ramassà mantiene una política de tolerancia cero frente al acoso, el abuso, la explotación, la discriminación, el trato desigual, la coacción o la negligencia, con especial atención a las personas en situación de vulnerabilidad, incluidas las mujeres, las personas refugiadas y las personas LGBTQI+.\n\nMe comprometo a:\n• Tratar a todas las personas del equipo con respeto, independientemente de su etnia, color, género, idioma, religión, ideología, nacionalidad, origen social, discapacidad u orientación sexual.\n• No adoptar nunca un lenguaje o comportamiento acosador, abusivo, sexualmente provocativo, humillante o culturalmente inapropiado hacia ninguna compañera, entrenador/a, voluntario/a o miembro del Club.\n• Dejar que cada persona defina por sí misma la cercanía física, verbal y emocional con la que se siente cómoda, y respetar la misma decisión de las demás.\n• Usar los nombres y pronombres correctos de mis compañeras, y no revelar la orientación sexual, identidad de género o estatus migratorio o de asilo de nadie sin su consentimiento explícito.\n• No consumir alcohol ni sustancias ilegales durante las actividades del Proyecto.\n• Informar de inmediato de cualquier preocupación sobre mi seguridad o bienestar, o el de una compañera, siguiendo el procedimiento descrito a continuación.",
        "en": "AE Ramassà maintains a zero-tolerance policy towards harassment, abuse, exploitation, discrimination, unequal treatment, coercion or neglect, with particular attention to people in vulnerable situations, including women, refugees and LGBTQI+ people.\n\nI commit to:\n• Treat everyone on the team with respect, regardless of ethnicity, colour, gender, language, religion, ideology, nationality, social background, disability or sexual orientation.\n• Never use harassing, abusive, sexually provocative, humiliating or culturally inappropriate language or behaviour towards any teammate, coach, volunteer or Club member.\n• Allow each person to define for themselves the physical, verbal and emotional closeness they feel comfortable with, and respect others' decisions in the same way.\n• Use my teammates' correct names and pronouns, and not disclose anyone's sexual orientation, gender identity, immigration or asylum status without their explicit consent.\n• Not consume alcohol or illegal substances during Project activities.\n• Immediately report any concern about my safety or wellbeing, or that of a teammate, following the procedure described below.",
        "ar": "تتبع AE Ramassà سياسة عدم التسامح مطلقًا مع التحرش أو الإساءة أو الاستغلال أو التمييز أو المعاملة غير المتكافئة أو الإكراه أو الإهمال، مع إيلاء اهتمام خاص للأشخاص في أوضاع ضعف، بمن فيهم النساء واللاجئون وأفراد مجتمع LGBTQI+.\n\nألتزم بما يلي:\n• معاملة جميع أفراد الفريق باحترام، بغض النظر عن العِرق أو اللون أو النوع الاجتماعي أو اللغة أو الدين أو الفكر أو الجنسية أو الخلفية الاجتماعية أو الإعاقة أو الميول الجنسية.\n• عدم استخدام لغة أو سلوك ينطوي على تحرش أو إساءة أو استفزاز جنسي أو إذلال أو عدم ملاءمة ثقافية تجاه أي زميلة أو مدرِّب أو مدرِّبة أو متطوِّع أو متطوِّعة أو عضو في النادي.\n• ترك كل شخص يحدد بنفسه مستوى القرب الجسدي واللفظي والعاطفي الذي يشعر معه بالراحة، واحترام قرارات الآخرين بالطريقة نفسها.\n• استخدام الأسماء والضمائر الصحيحة لزميلاتي، وعدم الكشف عن الميول الجنسية أو الهوية الجندرية أو وضع الهجرة أو اللجوء لأي شخص دون موافقته الصريحة.\n• عدم تناول الكحول أو المواد غير المشروعة أثناء أنشطة المشروع.\n• الإبلاغ فورًا عن أي مخاوف تتعلق بسلامتي أو رفاهي أو بسلامة إحدى زميلاتي أو رفاهها، باتباع الإجراء الموضح أدناه.",
        "fa": "AE Ramassà در برابر آزار، سوءاستفاده، بهره‌کشی، تبعیض، رفتار نابرابر، اجبار یا غفلت، سیاست عدم تحمل مطلق دارد و به افراد در وضعیت آسیب‌پذیر، از جمله زنان، پناهندگان و افراد LGBTQI+، توجه ویژه می‌کند.\n\nمتعهد می‌شوم که:\n• با همه افراد تیم، فارغ از قومیت، رنگ پوست، جنسیت، زبان، دین، ایدئولوژی، ملیت، پیشینه اجتماعی، معلولیت یا گرایش جنسی، با احترام رفتار کنم.\n• هرگز در برابر هیچ هم‌تیمی، مربی، داوطلب یا عضو باشگاه از گفتار یا رفتار آزاردهنده، توهین‌آمیز، تحریک‌کننده جنسی، تحقیرآمیز یا نامناسب از نظر فرهنگی استفاده نکنم.\n• اجازه دهم هر فرد خودش میزان نزدیکی جسمی، کلامی و عاطفی‌ای را که با آن راحت است تعیین کند و به تصمیم دیگران نیز به همان صورت احترام بگذارم.\n• از نام‌ها و ضمیرهای درست هم‌تیمی‌هایم استفاده کنم و گرایش جنسی، هویت جنسیتی یا وضعیت مهاجرت یا پناهندگی هیچ‌کس را بدون رضایت صریح او فاش نکنم.\n• هنگام فعالیت‌های پروژه الکل یا مواد غیرقانونی مصرف نکنم.\n• هرگونه نگرانی درباره ایمنی یا بهزیستی خود یا یکی از هم‌تیمی‌هایم را فوراً طبق روشی که در ادامه آمده است گزارش کنم."
      }
    },
    {
      "key": "report",
      "title": {
        "ca": "8. Com i a qui comunicar una preocupació",
        "es": "8. Cómo y a quién reportar una preocupación",
        "en": "8. How and to whom to report a concern",
        "ar": "8. كيف وإلى من تُبلَّغ المخاوف",
        "fa": "8. چگونه و به چه کسی نگرانی را گزارش کنیم"
      },
      "body": {
        "ca": "La persona delegada de Protecció del Projecte encara s'ha de confirmar. Mentrestant, qualsevol incomoditat, por, sensació d'inseguretat o incompliment d'aquest Codi es pot comunicar directament i de manera confidencial a qualsevol d'aquestes dues adreces de correu:\n• femeni[at]example.test\n• proteccio[at]example.test\n• En cas d'emergència o perill immediat, truca al 112.\n\nTota la informació compartida es tractarà de manera confidencial i es compartirà únicament amb qui sigui estrictament necessari per poder ajudar-te. Comunicar una preocupació de bona fe no tindrà mai conseqüències negatives per a tu ni per al teu lloc a l'equip, encara que finalment la preocupació no es confirmi.",
        "es": "La persona Delegada de Protección del Proyecto está aún por confirmarse. Mientras tanto, cualquier incomodidad, miedo, sensación de inseguridad, o cualquier incumplimiento de este Código puede comunicarse directamente y de forma confidencial a cualquiera de estos dos correos:\n• femeni[at]example.test\n• proteccio[at]example.test\n• En caso de emergencia o peligro inmediato, llama al 112.\n\nToda la información compartida se tratará de forma confidencial, compartiéndose únicamente con quien sea estrictamente necesario para poder ayudarte. Comunicar una preocupación de buena fe nunca tendrá consecuencias negativas para ti ni para tu lugar en el equipo, aunque finalmente la preocupación no se confirme.",
        "en": "The Project's designated Protection Officer has yet to be confirmed. In the meantime, any discomfort, fear, feeling of insecurity or breach of this Code can be reported directly and confidentially to either of these two email addresses:\n• femeni[at]example.test\n• proteccio[at]example.test\n• In an emergency or immediate danger, call 112.\n\nAll information shared will be treated confidentially and shared only with those strictly necessary to help you. Reporting a concern in good faith will never have negative consequences for you or your place on the team, even if the concern is ultimately not confirmed.",
        "ar": "لم يُؤكَّد بعد اسم الشخص المكلَّف بالحماية في المشروع. وفي هذه الأثناء، يمكن الإبلاغ مباشرةً وبسرية عن أي انزعاج أو خوف أو شعور بعدم الأمان أو أي مخالفة لهذه المدونة، عبر أيٍّ من عنوانَي البريد الإلكتروني التاليين:\n• femeni[at]example.test\n• proteccio[at]example.test\n• في حال الطوارئ أو الخطر الفوري، اتصلي بالرقم 112.\n\nستُعامَل جميع المعلومات المقدَّمة بسرية، ولن تُشارَك إلا مع من يلزم إطلاعهم عليها لمساعدتكِ. ولن تترتب على الإبلاغ عن مخاوف بحسن نية أي عواقب سلبية عليكِ أو على مكانكِ في الفريق، حتى إذا لم تُؤكَّد هذه المخاوف في النهاية.",
        "fa": "فرد مسئول حفاظت در پروژه هنوز تعیین قطعی نشده است. تا آن زمان، هرگونه ناراحتی، ترس، احساس ناامنی یا نقض این آیین‌نامه را می‌توان به‌صورت مستقیم و محرمانه به یکی از این دو نشانی ایمیل گزارش کرد:\n• femeni[at]example.test\n• proteccio[at]example.test\n• در وضعیت اضطراری یا خطر فوری، با شماره 112 تماس بگیرید.\n\nتمام اطلاعات ارائه‌شده محرمانه تلقی می‌شوند و فقط با کسانی به اشتراک گذاشته می‌شوند که اطلاع آن‌ها برای کمک به شما کاملاً ضروری باشد. گزارش یک نگرانی با حسن نیت هرگز پیامد منفی برای شما یا جایگاهتان در تیم نخواهد داشت، حتی اگر در نهایت آن نگرانی تأیید نشود."
      }
    },
    {
      "key": "declaration",
      "title": {
        "ca": "9. Declaració i signatura",
        "es": "9. Declaración y firma",
        "en": "9. Declaration and signature",
        "ar": "9. الإقرار والتوقيع",
        "fa": "9. اظهار و امضا"
      },
      "body": {
        "ca": "Amb la signatura d'aquest document, declaro que he llegit, comprès i acceptat de manera voluntària i expressa el contingut íntegre d'aquest formulari, inclosos el tractament de les meves dades personals, l'autorització d'imatge, les meves obligacions com a participant i el meu compromís amb el Codi de Conducta i la Política de Protecció d'AE Ramassà.",
        "es": "Con la firma de este documento, declaro haber leído, comprendido y aceptado de manera voluntaria y expresa el contenido íntegro de este formulario, incluidos el tratamiento de mis datos personales, la autorización de imagen, mis obligaciones como participante y mi compromiso con el Código de Conducta y la Política de Protección de AE Ramassà.",
        "en": "By signing this document, I declare that I have read, understood and voluntarily and expressly accepted the entire contents of this form, including the processing of my personal data, image authorization, my obligations as a participant and my commitment to AE Ramassà's Code of Conduct and Protection Policy.",
        "ar": "بتوقيعي على هذه الوثيقة، أُقرّ بأنني قرأت وفهمت وقبلت طوعًا وبشكل صريح كامل محتوى هذا النموذج، بما في ذلك معالجة بياناتي الشخصية، والموافقة المتعلقة بالصور، والتزاماتي بصفتي مشاركة، والتزامي بمدونة السلوك وسياسة الحماية الخاصة بـ AE Ramassà.",
        "fa": "با امضای این سند، اعلام می‌کنم که تمام محتوای این فرم را خوانده‌ام، درک کرده‌ام و داوطلبانه و به‌صراحت پذیرفته‌ام؛ از جمله پردازش داده‌های شخصی‌ام، اجازه مربوط به تصویر، تعهداتم به‌عنوان شرکت‌کننده و تعهدم به آیین‌نامه رفتار و سیاست حفاظت AE Ramassà."
      }
    }
  ],
  "consents": {
    "participation": {
      "required": true,
      "position": 0,
      "label": {
        "ca": "Autoritzo la meva participació en les activitats del Projecte i declaro que la informació aportada és certa.",
        "es": "Autorizo mi participación en las actividades del Proyecto y declaro que la información aportada es cierta.",
        "en": "I authorize my participation in the Project’s activities and declare that the information provided is true.",
        "ar": "أوافق على مشاركتي في أنشطة المشروع، وأُقرّ بأن المعلومات المقدَّمة صحيحة.",
        "fa": "اجازه شرکت خود در فعالیت‌های پروژه را می‌دهم و اعلام می‌کنم که اطلاعات ارائه‌شده صحیح است."
      }
    },
    "data_processing": {
      "required": true,
      "position": 1,
      "label": {
        "ca": "Accepto el tractament de les meves dades personals segons l’apartat 4.",
        "es": "Acepto el tratamiento de mis datos personales según el apartado 4.",
        "en": "I agree to the processing of my personal data as set out in section 4.",
        "ar": "أوافق على معالجة بياناتي الشخصية وفقًا للقسم 4.",
        "fa": "با پردازش داده‌های شخصی‌ام طبق بخش 4 موافقم."
      }
    },
    "code_of_conduct": {
      "required": true,
      "position": 2,
      "label": {
        "ca": "He rebut i comprès la Guia de Temporada, la Política de Protecció (safeguarding) i el Codi de Conducta d’AE Ramassà, i em comprometo a respectar-los.",
        "es": "He recibido y comprendido la Guía de Temporada, la Política de Protección (safeguarding) y el Código de Conducta de AE Ramassà, y me comprometo a respetarlos.",
        "en": "I have received and understood the Season Guide, Protection Policy (safeguarding) and AE Ramassà’s Code of Conduct, and I commit to respecting them.",
        "ar": "استلمت وفهمت دليل الموسم وسياسة الحماية (safeguarding) ومدونة السلوك الخاصة بـ AE Ramassà، وألتزم باحترامها.",
        "fa": "راهنمای فصل، سیاست حفاظت (safeguarding) و آیین‌نامه رفتار AE Ramassà را دریافت کرده‌ام و فهمیده‌ام و متعهد به رعایت آن‌ها هستم."
      }
    },
    "health_data": {
      "required": true,
      "position": 3,
      "label": {
        "ca": "Accepto de manera expressa el tractament de les meves dades de salut, necessàries per participar de manera segura en el Projecte.",
        "es": "Acepto de forma expresa el tratamiento de mis datos de salud, necesarios para participar de forma segura en el Proyecto.",
        "en": "I expressly agree to the processing of my health data, which is necessary to participate safely in the Project.",
        "ar": "أوافق صراحةً على معالجة بياناتي الصحية، وهي ضرورية للمشاركة بأمان في المشروع.",
        "fa": "به‌صراحت با پردازش داده‌های مربوط به سلامتم، که برای شرکت ایمن در پروژه ضروری است، موافقم."
      }
    },
    "image_rights": {
      "required": false,
      "position": 4,
      "label": {
        "ca": "Autoritzo la cessió dels meus drets d’imatge segons els termes de l’apartat 5.",
        "es": "Autorizo la cesión de mis derechos de imagen, según los términos del apartado 5.",
        "en": "I authorize the transfer of my image rights under the terms of section 5.",
        "ar": "أوافق على منح حقوق استخدام صورتي وفقًا لشروط القسم 5.",
        "fa": "طبق شرایط بخش 5، اجازه واگذاری حقوق استفاده از تصویرم را می‌دهم."
      }
    },
    "newsletter": {
      "required": false,
      "position": 5,
      "label": {
        "ca": "Accepto rebre informació d’AE Ramassà per mitjans electrònics, telèfon o correu postal (butlletí, invitacions, enquestes).",
        "es": "Acepto recibir información de AE Ramassà por medios electrónicos, teléfono o correo postal (newsletter, invitaciones, encuestas).",
        "en": "I agree to receive information from AE Ramassà by electronic means, telephone or post (newsletters, invitations, surveys).",
        "ar": "أوافق على تلقي معلومات من AE Ramassà عبر الوسائل الإلكترونية أو الهاتف أو البريد العادي (النشرات الإخبارية والدعوات والاستبيانات).",
        "fa": "با دریافت اطلاعات از AE Ramassà از طریق وسایل الکترونیکی، تلفن یا پست (خبرنامه، دعوت‌نامه‌ها، نظرسنجی‌ها) موافقم."
      }
    },
    "messaging_groups": {
      "required": false,
      "position": 6,
      "label": {
        "ca": "Accepto que AE Ramassà m’inclogui en grups de missatgeria instantània de l’equip per facilitar la comunicació amb les meves companyes i l’equip tècnic.",
        "es": "Acepto que AE Ramassà me incluya en grupos de mensajería instantánea del equipo, con el fin de facilitar la comunicación con mis compañeras y el equipo técnico.",
        "en": "I agree to AE Ramassà including me in the team’s instant messaging groups to facilitate communication with my teammates and the technical team.",
        "ar": "أوافق على إضافتي من قِبل AE Ramassà إلى مجموعات المراسلة الفورية الخاصة بالفريق، لتسهيل التواصل مع زميلاتي والفريق الفني.",
        "fa": "موافقم که AE Ramassà مرا به گروه‌های پیام‌رسانی فوری تیم اضافه کند تا ارتباط با هم‌تیمی‌هایم و تیم فنی آسان‌تر شود."
      }
    }
  },
  "attachments": [],
  "questions": {
    "health": {
      "asked": true,
      "required": true,
      "privacy": "health",
      "texts": {}
    },
    "emergency_contact": {
      "asked": true,
      "required": false,
      "privacy": "personal",
      "texts": {}
    }
  },
  "texts": {}
}$auth$, '[at]', '@')::jsonb,
  '2026-09-01 09:00:00+02',
  '5eed0000-0000-4000-8000-000000000001'
)
on conflict (id) do nothing;

insert into public.authorization_signatures (org_id, profile_id, season_id, method, paper_signed_on, recorded_by, signed_at)
select p.org_id, p.id,
       (select id from public.seasons where org_id = p.org_id and name = '2026/27'),
       'paper', date '2026-09-15', '5eed0000-0000-4000-8000-000000000002', timestamptz '2026-09-15 19:00:00+02'
  from public.profiles p
 where p.role = 'player'
   and p.id not in ('5eed0000-0000-4000-8000-000000000022', '5eed0000-0000-4000-8000-000000000011');

insert into public.authorization_signatures
  (id, org_id, profile_id, season_id, version_id, method, language, device, signed_at, signature)
values (
  '5eed0000-0000-4000-8042-000000000011',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8000-000000000011',
  (select id from public.seasons where org_id = '5eed0000-0000-4000-8000-000000000000' and name = '2026/27'),
  '5eed0000-0000-4000-8041-000000000001',
  'app', 'ar', 'iPhone', timestamptz '2026-09-20 18:30:00+02',
  '[[[120,620],[200,480],[290,560],[380,410],[470,590],[560,450]],[[640,520],[760,500],[880,540]]]'::jsonb
)
on conflict (id) do nothing;

insert into public.consent_events (org_id, profile_id, signature_id, consent_key, granted, method, decided_at)
select '5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-000000000011',
       '5eed0000-0000-4000-8042-000000000011', consent.key, consent.granted, 'app',
       timestamptz '2026-09-20 18:30:00+02'
  from (values ('participation', true), ('data_processing', true), ('code_of_conduct', true),
               ('health_data', true), ('image_rights', false), ('newsletter', true),
               ('messaging_groups', true)) as consent(key, granted);

-- Her health answer and her emergency contact, as answers to the
-- authorization's fields (RAPP-698).
perform private.write_custom_answer('5eed0000-0000-4000-8000-000000000011',
         private.authorization_field('5eed0000-0000-4000-8000-000000000000', d.key), d.value, 'player', null)
  from (values ('health_info', '"No"'::jsonb), ('emergency_contact_name', '"Layla Al-Hassan"'::jsonb),
               ('emergency_contact_relation', '"Germana"'::jsonb),
               ('emergency_contact_phone', '"+34600000099"'::jsonb)) as d(key, value);

-- A walk-in signed on a coach's tablet at the first training (RAPP-305): a new
-- woman with only her name, waiting for staff to confirm her with her email.
insert into public.walk_in_signings
  (id, org_id, first_name, last_name, version_id, payload, signed_at, collected_by)
values (
  '5eed0000-0000-4000-8043-000000000001',
  '5eed0000-0000-4000-8000-000000000000',
  'Salma', 'Idrissi',
  '5eed0000-0000-4000-8041-000000000001',
  public.encrypt_field(jsonb_build_object(
    'consents', jsonb_build_object('participation', true, 'data_processing', true,
                                   'code_of_conduct', true, 'health_data', true,
                                   'image_rights', false, 'newsletter', false, 'messaging_groups', true),
    'health_info', 'No', 'unable_to_draw', true, 'language', 'ar', 'device', 'iPad')::text),
  timestamptz '2026-09-15 19:10:00+02',
  '5eed0000-0000-4000-8000-000000000002'
)
on conflict (id) do nothing;

-- The staff question builder (RAPP-307, RAPP-570) -----------------------------------
-- One topic per player step: travel, discovery, participation barriers.
-- Question IDs stay stable so existing answers and referral links remain valid.
insert into public.intake_screens (id, org_id, title, intro, after_screen, sort_order)
values
  ('5eed0000-0000-4000-8044-000000000001', '5eed0000-0000-4000-8000-000000000000',
   '{"ca":"Com arribes als entrenaments","es":"Cómo llegas a los entrenamientos","en":"How you get to training","ar":"كيف تصلين إلى التدريبات","fa":"چگونه به تمرین می‌آیید"}'::jsonb,
   '{"ca":"Ens ajuda a organitzar els desplaçaments.","es":"Nos ayuda a organizar los desplazamientos.","en":"This helps us organise travel to training.","ar":"يساعدنا هذا على تنظيم التنقل إلى التدريبات.","fa":"این اطلاعات به ما کمک می‌کند رفت‌وآمد به تمرین را هماهنگ کنیم."}'::jsonb, 'logistics', 0),
  ('5eed0000-0000-4000-8044-000000000002', '5eed0000-0000-4000-8000-000000000000',
   '{"ca":"El teu primer contacte amb Ramassà","es":"Tu primer contacto con Ramassà","en":"Finding Ramassà","ar":"تعرّفكِ على راماسا","fa":"آشنایی با راماسا"}'::jsonb,
   null, 'logistics', 1),
  ('5eed0000-0000-4000-8044-000000000003', '5eed0000-0000-4000-8000-000000000000',
   '{"ca":"Participació als entrenaments","es":"Participación en los entrenamientos","en":"Taking part in training","ar":"المشاركة في التدريبات","fa":"شرکت در تمرین‌ها"}'::jsonb,
   null, 'logistics', 2)
on conflict (id) do nothing;

-- The fields Ramassà added (RAPP-649): the seeded organization's Support
-- section, then where each is asked. The fourth is filled in by the team only.
insert into public.profile_fields
  (id, org_id, section_id, kind, question_type, label, help, privacy, sort_order)
select v.id::uuid, '5eed0000-0000-4000-8000-000000000000', s.id, 'custom', v.question_type, v.label::jsonb,
       null, v.privacy, v.sort_order
  from (values
  ('5eed0000-0000-4000-8045-000000000001', 'yes_no_maybe',
   '{"ca":"Vens amb transport públic?","es":"¿Vienes en transporte público?","en":"Do you come by public transport?","ar":"هل تأتين بالمواصلات العامة؟","fa":"آیا با حمل و نقل عمومی می‌آیید؟"}',
   'normal', 100),
  ('5eed0000-0000-4000-8045-000000000002', 'single_choice',
   '{"ca":"Com et vas assabentar de Ramassà?","es":"¿Cómo te enteraste de Ramassà?","en":"How did you hear about Ramassà?","ar":"كيف سمعتِ عن راماسا؟","fa":"چطور با راماسا آشنا شدید؟"}',
   'normal', 101),
  ('5eed0000-0000-4000-8045-000000000003', 'long_text',
   '{"ca":"Què et dificulta venir als entrenaments?","es":"¿Qué te dificulta venir a los entrenamientos?","en":"What makes it difficult for you to attend training?","ar":"ما الذي يصعّب عليكِ الحضور إلى التدريبات؟","fa":"چه چیزی آمدن شما به تمرین را دشوار می‌کند؟"}',
   'sensitive', 103),
  ('5eed0000-0000-4000-8045-000000000004', 'short_text',
   '{"ca":"Parada de metro més propera"}',
   'personal', 104),
  ('5eed0000-0000-4000-8045-000000000005', 'single_choice',
   '{"ca":"Hi ha res que dificulti venir aquesta temporada?","es":"¿Hay algo que te dificulte venir esta temporada?","en":"Is anything making it hard to come this season?","ar":"هل هناك ما يصعّب عليكِ الحضور هذا الموسم؟","fa":"آیا چیزی آمدن شما را در این فصل دشوار می‌کند؟"}',
   'sensitive', 102)
  ) as v(id, question_type, label, privacy, sort_order)
  join public.profile_sections s
    on s.org_id = '5eed0000-0000-4000-8000-000000000000' and s.key = 'support'
on conflict (id) do nothing;

-- Her onboarding asks the first three and the fifth on their screens; the
-- entity form asks the first; the third and the fifth come back every season.
insert into public.field_placements (org_id, field_id, surface, screen_key, sort_order)
values
  ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8045-000000000001', 'onboarding',
   '5eed0000-0000-4000-8044-000000000001', 0),
  ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8045-000000000002', 'onboarding',
   '5eed0000-0000-4000-8044-000000000002', 0),
  ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8045-000000000003', 'onboarding',
   '5eed0000-0000-4000-8044-000000000003', 1),
  ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8045-000000000005', 'onboarding',
   '5eed0000-0000-4000-8044-000000000003', 0),
  ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8045-000000000001', 'entity_form', null, 0),
  ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8045-000000000003', 'season', null, 1),
  ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8045-000000000005', 'season', null, 0)
on conflict (field_id, surface, custom_form_id) do nothing;

insert into public.custom_question_options (id, org_id, question_id, label, sort_order, is_archived)
values
  ('5eed0000-0000-4000-8046-000000000001', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8045-000000000002', '{"ca":"Una entitat","es":"Una entidad","en":"An organisation","ar":"جمعية أو منظمة","fa":"یک نهاد یا سازمان"}'::jsonb, 0, false),
  ('5eed0000-0000-4000-8046-000000000002', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8045-000000000002', '{"ca":"Xarxes socials","es":"Redes sociales","en":"Social media","ar":"وسائل التواصل الاجتماعي","fa":"شبکه‌های اجتماعی"}'::jsonb, 1, false),
  ('5eed0000-0000-4000-8046-000000000003', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8045-000000000002', '{"ca":"Un cartell","es":"Un cartel","en":"A poster","ar":"ملصق","fa":"یک پوستر"}'::jsonb, 2, true),
  ('5eed0000-0000-4000-8046-000000000004', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8045-000000000005', '{"ca":"Sí","es":"Sí","en":"Yes","ar":"نعم","fa":"بله"}'::jsonb, 0, false),
  ('5eed0000-0000-4000-8046-000000000005', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8045-000000000005', '{"ca":"No","es":"No","en":"No","ar":"لا","fa":"خیر"}'::jsonb, 1, false)
on conflict (id) do nothing;

-- Conditional participation follow-up, with existing encrypted answers retained (RAPP-572).
update public.profile_fields
   set show_when_field_id='5eed0000-0000-4000-8045-000000000005', show_when_option_id='5eed0000-0000-4000-8046-000000000004'
 where id='5eed0000-0000-4000-8045-000000000003' and org_id='5eed0000-0000-4000-8000-000000000000';

-- Staff's choice on a Ramassà field for the invited woman (RAPP-643): asked
-- even if answered. She has not answered it, so her wizard is unchanged.
insert into public.custom_question_states (profile_id, org_id, question_id, state)
values ('5eed0000-0000-4000-8000-000000000098', '5eed0000-0000-4000-8000-000000000000',
        '5eed0000-0000-4000-8045-000000000001', 'ask')
on conflict (profile_id, question_id) do nothing;

insert into public.custom_answers
  (profile_id, question_id, season_key, season_id, org_id, value, value_encrypted, source)
values
  ('5eed0000-0000-4000-8000-000000000011', '5eed0000-0000-4000-8045-000000000001',
   '00000000-0000-0000-0000-000000000000', null, '5eed0000-0000-4000-8000-000000000000',
   '"yes"'::jsonb, null, 'player'),
  ('5eed0000-0000-4000-8000-000000000011', '5eed0000-0000-4000-8045-000000000002',
   '00000000-0000-0000-0000-000000000000', null, '5eed0000-0000-4000-8000-000000000000',
   '"5eed0000-0000-4000-8046-000000000003"'::jsonb, null, 'player'),
  ('5eed0000-0000-4000-8000-000000000011', '5eed0000-0000-4000-8045-000000000003',
   '5eed0000-0000-4000-8040-000000000001', '5eed0000-0000-4000-8040-000000000001',
   '5eed0000-0000-4000-8000-000000000000',
   null, public.encrypt_field('"Treballo els dijous a la tarda."'), 'player')
on conflict do nothing;

-- The pending referral of Amina answered the referral-form question.
insert into public.referral_custom_answers (referral_id, question_id, org_id, value_encrypted)
values ('5eed0000-0000-4000-8010-000000000001', '5eed0000-0000-4000-8045-000000000001',
        '5eed0000-0000-4000-8000-000000000000', public.encrypt_field('"maybe"'))
on conflict do nothing;

-- Staff wording of an app question: on its field's onboarding placement.
update public.field_placements p
   set label_override = '{"ca":"Quina entitat t''acompanya?","es":"¿Qué entidad te acompaña?","en":"Which organization supports you?"}'::jsonb
  from public.profile_fields f
 where f.id = p.field_id and p.surface = 'onboarding'
   and f.org_id = '5eed0000-0000-4000-8000-000000000000' and f.system_key = 'reference_entity';

-- Built-in screen wording and the flow order (RAPP-612). The order is the app's
-- own, with the three staff screens after the equipment step, so the seeded
-- wizard reads as before; the summary carries one help line in three languages
-- (Arabic and Farsi show the bundled text).
insert into public.intake_builtin_screens (org_id, screen, texts)
values ('5eed0000-0000-4000-8000-000000000000', 'summary',
        '{"help":{"ca":"Pots canviar qualsevol resposta abans d''acceptar els termes.","es":"Puedes cambiar cualquier respuesta antes de aceptar los términos.","en":"You can change any answer before you accept the terms."}}'::jsonb)
on conflict do nothing;

insert into public.intake_flow_orders (org_id, step_order)
values ('5eed0000-0000-4000-8000-000000000000',
        array['identity', 'background', 'documentation', 'logistics', 'equipment',
              'custom:5eed0000-0000-4000-8044-000000000001',
              'custom:5eed0000-0000-4000-8044-000000000002',
              'custom:5eed0000-0000-4000-8044-000000000003',
              'season', 'supporting-entities', 'participation-support', 'specific-needs'])
on conflict do nothing;

-- A screen saved as a Nova versió long ago (RAPP-697): every seeded player
-- joined after it, so nobody has a review pending.
insert into public.onboarding_screen_versions (org_id, screen_key, changed_at)
values ('5eed0000-0000-4000-8000-000000000000', 'equipment', '2026-01-15 09:00:00+00')
on conflict do nothing;

insert into public.intake_state_presets (id, org_id, name, states)
values ('5eed0000-0000-4000-8047-000000000001', '5eed0000-0000-4000-8000-000000000000',
        'Només talles', '{"clothing_size":"ask","shoe_size":"ask"}'::jsonb)
on conflict (id) do nothing;

-- Terms acceptances ----------------------------------------------------------------
-- The consent EVENT behind each seeded player's `terms_accepted_at` (RAPP-21).
-- Seeded in the language that player actually reads, because the whole point of
-- the record is which text in which language someone agreed to.

-- Accepted before app terms signatures existed (RAPP-584), so the signed-acceptance
-- gate (RAPP-613) lets them in, as the deploy migration does for real players.
-- Player ...011 also gets a signature row below.
insert into public.terms_acceptances (profile_id, terms_version, locale_shown, accepted_before_signatures)
select
  ('5eed0000-0000-4000-8000-' || lpad(r.ordinal::text, 12, '0'))::uuid,
  '2026-07-01',
  r.preferred_language,
  true
from seed_roster r
where r.app_role = 'player'
on conflict do nothing;

-- Synthetic app-terms signature, distinct from season authorization signatures.
insert into public.app_terms_signatures
  (acceptance_id, profile_id, org_id, signature, unable_to_draw, media_consent, device)
select t.id, p.id, p.org_id, '[[[100,200],[300,400]]]'::jsonb,
       false, p.media_consent_at is not null, 'synthetic-seed'
from public.terms_acceptances t
join public.profiles p on p.id = t.profile_id
where p.id = '5eed0000-0000-4000-8000-000000000011'
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
-- Three invitations (RAPP-25), so the staff invite list is not an empty screen and
-- both states it has to render are reachable in the dev app. The third belongs to
-- the invited test account (RAPP-300), whose profile staff created with it.
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
    'invited@example.test',
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

-- Community forum board (RAPP-50) -------------------------------------------------
insert into public.forum_categories (id, org_id, name, slug, icon, color, sort_order)
values
  (
    '5eed0000-0000-4000-8006-000000000001',
    '5eed0000-0000-4000-8000-000000000000',
    '{"ca":"Habitatge","es":"Vivienda","en":"Housing","ar":"السكن","fa":"مسکن"}',
    'housing', 'house', 'primary', 10
  ),
  (
    '5eed0000-0000-4000-8006-000000000002',
    '5eed0000-0000-4000-8000-000000000000',
    '{"ca":"Feina","es":"Empleo","en":"Jobs","ar":"العمل","fa":"کار"}',
    'jobs', 'briefcase', 'secondary', 20
  ),
  (
    '5eed0000-0000-4000-8006-000000000003',
    '5eed0000-0000-4000-8000-000000000000',
    '{"ca":"Recomanacions","es":"Recomendaciones","en":"Recommendations","ar":"توصيات","fa":"پیشنهادها"}',
    'recommendations', 'lightbulb', 'info', 30
  ),
  (
    '5eed0000-0000-4000-8006-000000000004',
    '5eed0000-0000-4000-8000-000000000000',
    '{"ca":"General","es":"General","en":"General","ar":"عام","fa":"عمومی"}',
    'general', 'bubble', 'neutral', 40
  )
on conflict (id) do nothing;

insert into public.forum_posts (
  id, org_id, category_id, author_id, author_first_name, content, is_pinned, created_at
)
values
  (
    '5eed0000-0000-4000-8010-000000000001',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8006-000000000002',
    '5eed0000-0000-4000-8000-000000000011',
    'pending',
    'Busco feina de cuina a Vic. Algú coneix un lloc?',
    true,
    now() - interval '2 days'
  ),
  (
    '5eed0000-0000-4000-8010-000000000002',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8006-000000000001',
    '5eed0000-0000-4000-8000-000000000012',
    'pending',
    'أبحث عن habitació a prop del centre de Vic.',
    false,
    now() - interval '6 hours'
  )
on conflict (id) do nothing;

insert into public.forum_replies (
  id, org_id, post_id, author_id, author_first_name, content, created_at
)
values
  (
    '5eed0000-0000-4000-8010-000000000011',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8010-000000000001',
    '5eed0000-0000-4000-8000-000000000012',
    'pending',
    'Conec un restaurant que busca ajuda. T envio el contacte.',
    now() - interval '1 day'
  ),
  (
    '5eed0000-0000-4000-8010-000000000012',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8010-000000000002',
    '5eed0000-0000-4000-8000-000000000011',
    'pending',
    'يمكنني أن أسأل una amiga que viu al centre.',
    now() - interval '2 hours'
  )
on conflict (id) do nothing;

-- Forum moderation (RAPP-51) ----------------------------------------------------
-- One pending flag makes the staff queue and notification path reachable after
-- every reset without hiding the post from the player board.
set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000012","role":"authenticated", "aal": "aal2"}';
insert into public.forum_flags (
  id, org_id, flagger_id, target_type, post_id, reason, comment, created_at
) values (
  '5eed0000-0000-4000-8012-000000000099',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8000-000000000012',
  'post',
  '5eed0000-0000-4000-8010-000000000001',
  'harassment',
  'Em fa sentir insegura.',
  now() - interval '1 hour'
)
on conflict (id) do nothing;
reset role;
update public.push_deliveries as delivery
set
  state = 'delivered',
  attempt_count = 1,
  receipt_attempt_count = 1,
  expo_ticket_id = 'seed-forum-ticket-' || delivery.id::text,
  ticketed_at = now() - interval '45 minutes',
  next_attempt_at = now() - interval '1 hour',
  completed_at = now() - interval '30 minutes',
  updated_at = now() - interval '30 minutes'
from public.push_publications as publication
where publication.id = delivery.publication_id
  and publication.content_type = 'forum_flag';
update public.push_publications as publication
set
  state = 'complete',
  recipient_count = counts.recipient_count,
  sent_count = counts.recipient_count,
  delivered_count = counts.recipient_count,
  failed_count = 0,
  completed_at = now() - interval '30 minutes'
from (
  select delivery.publication_id, count(*)::integer as recipient_count
  from public.push_deliveries as delivery
  group by delivery.publication_id
) as counts
where publication.id = counts.publication_id
  and publication.content_type = 'forum_flag';

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
    '5eed0000-0000-4000-8000-000000000014',
    'confirmed',
    now() - interval '6 hours'
  ),
  (
    '5eed0000-0000-4000-8006-000000000004',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8003-000000000005',
    '5eed0000-0000-4000-8000-000000000011',
    'confirmed',
    now() - interval '3 hours'
  ),
  (
    '5eed0000-0000-4000-8006-000000000005',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8003-000000000005',
    '5eed0000-0000-4000-8000-000000000012',
    'confirmed',
    now() - interval '2 hours'
  ),
  (
    '5eed0000-0000-4000-8006-000000000006',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8003-000000000005',
    '5eed0000-0000-4000-8000-000000000013',
    'confirmed',
    now() - interval '1 hour'
  )
on conflict (id) do nothing;

-- Attendance (RAPP-38) -------------------------------------------------------------
-- Today's sheet starts with all three visible states and the first upcoming
-- weekly occurrence is complete. That makes in-progress, complete, and empty
-- overview states reachable after every reset, while the field screen remains
-- safe to tap through during offline/realtime QA.
select set_config(
  'request.jwt.claims',
  '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated", "aal": "aal2"}',
  false
);

insert into public.attendance (occurrence_id, player_id, status, marked_at)
select
  occurrence.id,
  fixture.player_id,
  fixture.status,
  now() - interval '30 minutes'
from public.event_occurrences as occurrence
cross join (
  values
    ('5eed0000-0000-4000-8000-000000000011'::uuid, 'present'),
    ('5eed0000-0000-4000-8000-000000000012'::uuid, 'absent'),
    ('5eed0000-0000-4000-8000-000000000013'::uuid, 'excused')
) as fixture(player_id, status)
where occurrence.event_id = '5eed0000-0000-4000-8003-000000000005'
on conflict (occurrence_id, player_id) do nothing;

insert into public.attendance (occurrence_id, player_id, status, marked_at)
select
  occurrence.id,
  participant.id,
  case (right(participant.id::text, 1)::integer % 3)
    when 0 then 'present'
    when 1 then 'absent'
    else 'excused'
  end,
  now() - interval '1 hour'
from public.event_occurrences as occurrence
cross join public.profiles as participant
where occurrence.id = (
    select first_occurrence.id
    from public.event_occurrences as first_occurrence
    where first_occurrence.event_id = '5eed0000-0000-4000-8003-000000000001'
    order by first_occurrence.starts_at
    limit 1
  )
  and participant.role = 'player'
  and participant.is_active
on conflict (occurrence_id, player_id) do nothing;

select set_config('request.jwt.claims', '{}', false);

-- Material stock (RAPP-248) --------------------------------------------------------------
--
-- One donated arrival a month ago, so stock starts above zero and the handovers
-- below come out of it. Boots 36 to 42, jerseys and shorts S to L, balls: enough
-- for a stock screen and a handover to show real numbers, and one size (boots
-- 43) left at nothing so an empty size is reachable too.

-- Default values for donated items (RAPP-250), as someone with equipment.items
-- would set them in the item editor: enough to see a donation pre-filled.
update public.equipment_item_types set default_value_cents = value.cents
from (values ('boots', 2500), ('jersey', 1200), ('shorts', 800), ('ball', 1500), ('water_bottle', 300))
  as value (key, cents)
where equipment_item_types.org_id = '5eed0000-0000-4000-8000-000000000000'
  and equipment_item_types.key = value.key;

-- A custom item (RAPP-253): training bibs, counted team equipment, named in all
-- five languages, with two in stock from a sponsor's bag.
insert into public.equipment_item_types
  (id, org_id, key, name, kind, sizes, default_value_cents, is_builtin)
values (
  '5eed0000-0000-4000-8000-000000000b01', '5eed0000-0000-4000-8000-000000000000', 'custom_bibs',
  '{"ca": "Petos", "es": "Petos", "en": "Bibs", "ar": "صدريات تدريب", "fa": "جلیقه تمرین"}'::jsonb,
  'team_equipment', '{}', 300, false
);

-- The arrival itself (RAPP-250): a donation from a local club, with one photo
-- of the boxes. The photo row points at no stored object; the stock folder is
-- served only after the database check, and a missing object is a plain 404.
insert into public.equipment_arrivals
  (id, org_id, received_at, received_by, source, source_name, problems)
values (
  '5eed0000-0000-4000-8000-000000000a01', '5eed0000-0000-4000-8000-000000000000',
  now() - interval '30 days', '5eed0000-0000-4000-8000-000000000002',
  'donation', 'CF Vic', 'Two jerseys size M with a torn seam.'
);

insert into public.equipment_arrival_photos (arrival_id, org_id, object_key, kind)
values (
  '5eed0000-0000-4000-8000-000000000a01', '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8000-000000000000/stock/5eed0000-0000-4000-8000-000000000002/2026/09/00000000000000000000000000000a01.jpg',
  'goods'
);

insert into public.stock_movements (org_id, item_type_id, size, quantity, kind, arrival_id, unit_value_cents, recorded_by, occurred_at, reason)
select
  item_type.org_id, item_type.id, arrival.size, arrival.quantity, 'arrival',
  '5eed0000-0000-4000-8000-000000000a01', item_type.default_value_cents,
  '5eed0000-0000-4000-8000-000000000002', now() - interval '30 days', 'Seed donation'
from (values
  ('boots', '36', 4), ('boots', '37', 4), ('boots', '38', 4), ('boots', '39', 4),
  ('boots', '40', 4), ('boots', '41', 3), ('boots', '42', 3),
  ('jersey', 'S', 6), ('jersey', 'M', 6), ('jersey', 'L', 6),
  ('shorts', 'S', 6), ('shorts', 'M', 6), ('shorts', 'L', 6),
  ('water_bottle', null, 10),
  ('ball', null, 12)
) as arrival (item_key, size, quantity)
join public.equipment_item_types item_type
  on item_type.org_id = '5eed0000-0000-4000-8000-000000000000' and item_type.key = arrival.item_key;

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

-- Stock counts (RAPP-251) -------------------------------------------------------------
--
-- Balls were counted last month and matched the ledger, so this month's small
-- count is still due and asks for an item that was never counted.

insert into public.stock_counts (org_id, item_type_id, counted_by, counted_at, lines)
select org_id, id, '5eed0000-0000-4000-8000-000000000002', now() - interval '45 days',
  '[{"size": null, "expected": 12, "counted": 12}]'::jsonb
from public.equipment_item_types
where org_id = '5eed0000-0000-4000-8000-000000000000' and key = 'ball';

-- Staff checkouts (RAPP-252) ----------------------------------------------------------
--
-- Núria took six balls to a tournament five days ago and they were due back
-- two days ago, so Today shows an overdue checkout.

insert into public.staff_checkouts
  (id, org_id, item_type_id, quantity, checked_out_to, checked_out_by, checked_out_at, expected_return_on, note)
select '5eed0000-0000-4000-8000-000000000c01', org_id, id, 6,
  '5eed0000-0000-4000-8000-000000000003', '5eed0000-0000-4000-8000-000000000002',
  now() - interval '5 days', current_date - 2, 'Tournament in Girona.'
from public.equipment_item_types
where org_id = '5eed0000-0000-4000-8000-000000000000' and key = 'ball';

insert into public.stock_movements (org_id, item_type_id, quantity, kind, checkout_id, recorded_by, occurred_at)
select org_id, id, -6, 'checkout', '5eed0000-0000-4000-8000-000000000c01',
  '5eed0000-0000-4000-8000-000000000002', now() - interval '5 days'
from public.equipment_item_types
where org_id = '5eed0000-0000-4000-8000-000000000000' and key = 'ball';

-- Photo handoffs (RAPP-254) ------------------------------------------------------------
--
-- One finished request from last week: Laia, who keeps the internal documents,
-- photographed a signed form with her phone. Its document row is not seeded,
-- so the handoff has no result.

insert into public.photo_handoffs
  (org_id, requested_by, target, document_name, created_at, expires_at, completed_at)
values (
  '5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-000000000001',
  'internal_document', 'Signed attendance form', now() - interval '7 days',
  now() - interval '7 days' + interval '10 minutes', now() - interval '7 days' + interval '2 minutes'
);

-- Stock alerts (RAPP-249) --------------------------------------------------------------
--
-- Shorts XL never arrived, so handing a pair to Blanca took the size below zero
-- and opened the alert that Today shows to whoever counts stock.

insert into public.equipment_deliveries (profile_id, item, size, delivered_on, delivered_by, note)
values (
  '5eed0000-0000-4000-8000-000000000030',
  'shorts', 'XL', current_date - 2,
  '5eed0000-0000-4000-8000-000000000003',
  null
);

insert into public.stock_alerts (org_id, item_type_id, size, opened_at)
select org_id, id, 'XL', now() - interval '2 days'
from public.equipment_item_types
where org_id = '5eed0000-0000-4000-8000-000000000000' and key = 'shorts';
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
  '5eed0000-0000-4000-8003-000000000003',
  '5eed0000-0000-4000-8003-000000000004',
  '5eed0000-0000-4000-8003-000000000005'
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

-- Direct messaging (RAPP-47) ---------------------------------------------------
-- One player thread and one entity thread make both client surfaces reachable
-- after every reset. The player starts with one unread staff reply so badge and
-- read-state QA do not depend on creating data by hand.
insert into public.conversations (
  id, org_id, user_id, assigned_staff_id, created_at
)
values
  (
    '5eed0000-0000-4000-800c-000000000001',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8000-000000000011',
    '5eed0000-0000-4000-8000-000000000002',
    now() - interval '2 hours'
  ),
  (
    '5eed0000-0000-4000-800c-000000000002',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8000-000000000004',
    null,
    now() - interval '90 minutes'
  )
on conflict (id) do nothing;

insert into public.conversation_assignment_history (
  id,
  org_id,
  conversation_id,
  user_id,
  changed_by,
  previous_staff_id,
  assigned_staff_id,
  created_at
)
values (
  '5eed0000-0000-4000-800e-000000000001',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-800c-000000000001',
  '5eed0000-0000-4000-8000-000000000011',
  '5eed0000-0000-4000-8000-000000000002',
  null,
  '5eed0000-0000-4000-8000-000000000002',
  now() - interval '2 hours'
)
on conflict (id) do nothing;

-- Seed fixtures must not enqueue real delivery work. The trigger is exercised
-- by pgTAP and runtime QA with synthetic tokens, then restored immediately.
alter table public.messages disable trigger messages_enqueue_push;

insert into public.messages (
  id, org_id, conversation_id, sender_id, content, created_at
)
values
  (
    '5eed0000-0000-4000-800d-000000000001',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-800c-000000000001',
    '5eed0000-0000-4000-8000-000000000011',
    'rapp47-seed-player-message',
    now() - interval '2 hours'
  ),
  (
    '5eed0000-0000-4000-800d-000000000002',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-800c-000000000001',
    '5eed0000-0000-4000-8000-000000000002',
    'rapp47-seed-staff-reply',
    now() - interval '1 hour'
  ),
  (
    '5eed0000-0000-4000-800d-000000000003',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-800c-000000000002',
    '5eed0000-0000-4000-8000-000000000004',
    'rapp47-seed-entity-message',
    now() - interval '90 minutes'
  )
on conflict (id) do nothing;

alter table public.messages enable trigger messages_enqueue_push;

insert into public.media_items (
  id, org_id, uploaded_by, uploader_first_name, file_url, thumbnail_url,
  file_type, file_size, caption, privacy_level,
  consent_acknowledged_at, consent_version, created_at, updated_at
)
values (
  '5eed0000-0000-4000-8014-000000000001',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8000-000000000011',
  'Amina',
  '5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000011/2026/08/11111111111111111111111111111111.jpg',
  '5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000011/2026/08/22222222222222222222222222222222.jpg',
  'image', 640000, 'Entrenament de dimarts', 'community',
  now() - interval '1 day', 'gallery-consent-v1', now() - interval '1 day', now() - interval '1 day'
)
on conflict (id) do nothing;

insert into public.conversation_read_states (
  org_id, conversation_id, user_id, last_read_message_id, read_at
)
values
  (
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-800c-000000000001',
    '5eed0000-0000-4000-8000-000000000011',
    '5eed0000-0000-4000-800d-000000000001',
    now() - interval '2 hours'
  ),
  (
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-800c-000000000002',
    '5eed0000-0000-4000-8000-000000000004',
    '5eed0000-0000-4000-800d-000000000003',
    now() - interval '90 minutes'
  )
on conflict (conversation_id, user_id) do nothing;

-- Private mentoring (RAPP-57) -------------------------------------------------
-- One scheduled request makes both the player's private calendar item and the
-- staff scheduling queue reachable after every reset. Sensitive prose remains
-- encrypted at rest, exactly as it is for a request created through the RPC.
insert into public.mentoring_requests (
  id,
  org_id,
  player_id,
  topic,
  topic_detail_encrypted,
  preferred_date,
  preferred_time,
  status,
  scheduled_at,
  assigned_staff_id,
  staff_notes_encrypted,
  created_at,
  updated_at
)
values (
  '5eed0000-0000-4000-8015-000000000001',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8000-000000000011',
  'labor_orientation',
  public.encrypt_field('M’agradaria revisar el meu currículum.'),
  current_date + 4,
  '10:30'::time,
  'scheduled',
  now() + interval '5 days',
  '5eed0000-0000-4000-8000-000000000002',
  public.encrypt_field('Portar exemples de currículums.'),
  now() - interval '1 day',
  now() - interval '2 hours'
)
on conflict (id) do nothing;

insert into public.mentoring_notification_events (
  id,
  org_id,
  request_id,
  recipient_id,
  kind,
  created_at
)
values (
  '5eed0000-0000-4000-8016-000000000001',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8015-000000000001',
  '5eed0000-0000-4000-8000-000000000011',
  'scheduled',
  now() - interval '2 hours'
)
on conflict (id) do nothing;

-- Typed feedback (RAPP-58) ---------------------------------------------------
-- A visible in-progress item keeps the player history and staff inbox reachable
-- after every reset. Feedback prose uses the same field encryption boundary as
-- production-created submissions.
insert into public.feedback_submissions (
  id,
  org_id,
  author_id,
  type,
  content_encrypted,
  status,
  created_at,
  updated_at
)
values (
  '5eed0000-0000-4000-8017-000000000001',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8000-000000000011',
  'activity_proposal',
  public.encrypt_field('M’agradaria una activitat de conversa en català.'),
  'in_progress',
  now() - interval '12 hours',
  now() - interval '2 hours'
)
on conflict (id) do nothing;

-- Surveys and attributed encrypted responses (RAPP-60) -----------------------
-- The open fixture exercises every visual response type in all supported languages.
insert into public.surveys (
  id, org_id, event_id, title, published_at, closes_at,
  audience_kind, audience_config, created_by, created_at, updated_at
)
values
  (
    '5eed0000-0000-4000-8040-000000000001',
    '5eed0000-0000-4000-8000-000000000000',
    null,
    '{"ca":"La teva opinió sobre la formació","es":"Tu opinión sobre la formación","en":"Your training feedback","ar":"رأيك في التدريب","fa":"نظر شما درباره آموزش"}'::jsonb,
    now() - interval '1 day',
    now() + interval '30 days',
    'all',
    '{}'::jsonb,
    '5eed0000-0000-4000-8000-000000000001',
    now() - interval '1 day',
    now() - interval '1 day'
  ),
  (
    '5eed0000-0000-4000-8040-000000000002',
    '5eed0000-0000-4000-8000-000000000000',
    null,
    '{"ca":"Enquesta programada","es":"Encuesta programada","en":"Scheduled survey","ar":"استبيان مجدول","fa":"نظرسنجی برنامه ریزی شده"}'::jsonb,
    now() + interval '2 days',
    now() + interval '12 days',
    'all',
    '{}'::jsonb,
    '5eed0000-0000-4000-8000-000000000001',
    now(),
    now()
  ),
  (
    '5eed0000-0000-4000-8040-000000000003',
    '5eed0000-0000-4000-8000-000000000000',
    null,
    '{"ca":"Enquesta tancada","es":"Encuesta cerrada","en":"Closed survey","ar":"استبيان مغلق","fa":"نظرسنجی بسته"}'::jsonb,
    now() - interval '12 days',
    now() - interval '2 days',
    'all',
    '{}'::jsonb,
    '5eed0000-0000-4000-8000-000000000001',
    now() - interval '12 days',
    now() - interval '2 days'
  )
on conflict (id) do nothing;

insert into public.survey_questions (
  id, org_id, survey_id, prompt, question_type, options, required, sort_order
)
values
  (
    '5eed0000-0000-4000-8041-000000000001',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8040-000000000001',
    '{"ca":"Com valores la formació?","es":"¿Cómo valoras la formación?","en":"How do you rate the training?","ar":"كيف تقيمين التدريب؟","fa":"به آموزش چه امتیازی می دهید؟"}'::jsonb,
    'rating', null, true, 10
  ),
  (
    '5eed0000-0000-4000-8041-000000000002',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8040-000000000001',
    '{"ca":"Què t’ha ajudat més?","es":"¿Qué te ha ayudado más?","en":"What helped you most?","ar":"ما الذي ساعدك أكثر؟","fa":"چه چیزی بیشتر به شما کمک کرد؟"}'::jsonb,
    'multiple_choice',
    '[{"id":"training","label":{"ca":"Formació","es":"Formación","en":"Training","ar":"التدريب","fa":"آموزش"}},{"id":"support","label":{"ca":"Acompanyament","es":"Acompañamiento","en":"Support","ar":"الدعم","fa":"پشتیبانی"}}]'::jsonb,
    true, 20
  ),
  (
    '5eed0000-0000-4000-8041-000000000003',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8040-000000000001',
    '{"ca":"Recomanaries aquesta activitat?","es":"¿Recomendarías esta actividad?","en":"Would you recommend this activity?","ar":"هل توصي بهذا النشاط؟","fa":"آیا این فعالیت را پیشنهاد می کنید؟"}'::jsonb,
    'yes_no', null, true, 30
  ),
  (
    '5eed0000-0000-4000-8041-000000000004',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8040-000000000001',
    '{"ca":"Vols afegir alguna cosa?","es":"¿Quieres añadir algo?","en":"Would you like to add anything?","ar":"هل تريدين إضافة شيء؟","fa":"آیا می خواهید چیزی اضافه کنید؟"}'::jsonb,
    'free_text', null, false, 40
  )
on conflict (id) do nothing;

insert into public.survey_responses (
  id, org_id, survey_id, player_id, answers_encrypted,
  status, completed_at, created_at, updated_at
)
values
  (
    '5eed0000-0000-4000-8042-000000000001',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8040-000000000001',
    '5eed0000-0000-4000-8000-000000000004',
    public.encrypt_field('{"5eed0000-0000-4000-8041-000000000001":5,"5eed0000-0000-4000-8041-000000000002":"training","5eed0000-0000-4000-8041-000000000003":true,"5eed0000-0000-4000-8041-000000000004":"تجربة ممتازة"}'),
    'completed', now() - interval '3 hours', now() - interval '4 hours', now() - interval '3 hours'
  ),
  (
    '5eed0000-0000-4000-8042-000000000002',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8040-000000000001',
    '5eed0000-0000-4000-8000-000000000013',
    public.encrypt_field('{"5eed0000-0000-4000-8041-000000000001":3,"5eed0000-0000-4000-8041-000000000002":"support","5eed0000-0000-4000-8041-000000000003":false,"5eed0000-0000-4000-8041-000000000004":"Molt útil"}'),
    'completed', now() - interval '2 hours', now() - interval '3 hours', now() - interval '2 hours'
  )
on conflict (id) do nothing;

-- Organization settings fixtures (RAPP-64). The accepted staff invitation
-- makes invitation history visible; the document row exercises the staff-only
-- list and accent-insensitive search without requiring an R2 upload first.
insert into public.staff_invitations (
  id, org_id, profile_id, email, role, invited_by, expires_at, accepted_at, created_at
)
values (
  '5eed0000-0000-4000-8064-000000000001',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8000-000000000002',
  'marta.puig@example.test',
  'staff',
  '5eed0000-0000-4000-8000-000000000001',
  now() + interval '30 days',
  now() - interval '90 days',
  now() - interval '90 days'
)
on conflict (profile_id) do nothing;

insert into public.internal_documents (
  id, org_id, uploaded_by, object_key, name, content_type, file_size, created_at
)
values (
  '5eed0000-0000-4000-8064-000000000002',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8000-000000000001',
  '5eed0000-0000-4000-8000-000000000000/documents/5eed0000-0000-4000-8064-000000000002.pdf',
  'Assegurança esportiva 2026.pdf',
  'application/pdf',
  32768,
  now() - interval '7 days'
)
on conflict (id) do nothing;

commit;

-- Seeded staff stand for today's staff, who keep the sensitive fields and RGPD
-- erasure as an adjustment when team access moves to permissions (RAPP-230).
-- A staff member created later gets the plain Staff preset.
insert into public.team_member_permissions (org_id, profile_id, permission_code)
select profile.org_id, profile.id, code
from public.profiles as profile
cross join unnest(array['participants.view_sensitive', 'rgpd.erase']) as code
where profile.role = 'staff'
on conflict do nothing;

-- Seeded team members and entity contacts have an authenticator set up
-- (RAPP-233), with the development secret SEED_TOTP_SECRET in
-- packages/shared/testing/fixtures.ts, so the second factor can be completed
-- locally and in tests.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
select gen_random_uuid(), profile.id, 'Ramassà (seed)', 'totp', 'verified', 'JBSWY3DPEHPK3PXP', now(), now()
from public.profiles as profile
where profile.role in ('staff', 'admin', 'entity');

-- The onboarding design sandbox (RAPP-615) ------------------------------------------------------------
-- A team member on the built-in "Onboarding design" preset (...097), who sees
-- only the onboarding settings and the test players, and one test player
-- (...096), invited and not joined, so signing in as her opens the wizard.
-- Both are test accounts: on a stack with the fixed code switched on
-- (RAPP-616) they sign in with it.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000', account.id, 'authenticated', 'authenticated', account.email,
  extensions.crypt('ramassa-dev-password', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  now(), now(), '', '', '', '', '', ''
from (values
  ('5eed0000-0000-4000-8000-000000000097'::uuid, 'disseny@example.test'),
  ('5eed0000-0000-4000-8000-000000000096'::uuid, 'jugadora.prova@example.test')
) as account(id, email)
on conflict (id) do nothing;

insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.id in ('5eed0000-0000-4000-8000-000000000097', '5eed0000-0000-4000-8000-000000000096')
on conflict (provider_id, provider) do nothing;

insert into public.profiles (id, org_id, role, first_name, last_name, preferred_language, is_test_account)
values
  ('5eed0000-0000-4000-8000-000000000097', '5eed0000-0000-4000-8000-000000000000',
   'staff', 'Pau', 'Dissenya', 'ca', true),
  ('5eed0000-0000-4000-8000-000000000096', '5eed0000-0000-4000-8000-000000000000',
   'invited', 'Joana', 'Prova', 'ca', true)
on conflict (id) do nothing;

-- Her open invitation, as create_participant_invite leaves it, so the purge
-- of women who never joined keeps her.
insert into public.invites (org_id, email, invited_by, expires_at)
values ('5eed0000-0000-4000-8000-000000000000', 'jugadora.prova@example.test',
        '5eed0000-0000-4000-8000-000000000097', now() + interval '30 days');

-- Exactly the Onboarding design preset, replacing the Staff one a new staff
-- account starts with.
select private.write_member_permissions(
  null,
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8000-000000000097',
  array(select preset_permission.permission_code
          from public.permission_preset_permissions as preset_permission
          join public.permission_presets as preset on preset.id = preset_permission.preset_id
         where preset.org_id = '5eed0000-0000-4000-8000-000000000000'
           and preset.builtin_key = 'onboarding_design'),
  (select preset.id from public.permission_presets as preset
    where preset.org_id = '5eed0000-0000-4000-8000-000000000000'
      and preset.builtin_key = 'onboarding_design')
);

insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
select gen_random_uuid(), '5eed0000-0000-4000-8000-000000000097', 'Ramassà (seed)', 'totp', 'verified',
       'JBSWY3DPEHPK3PXP', now(), now()
where not exists (
  select 1 from auth.mfa_factors where user_id = '5eed0000-0000-4000-8000-000000000097'
);

-- Signature blocks (RAPP-690, RAPP-691) ----------------------------------------------
-- On an archived screen, so no live flow asks for a signature: one block, Amina's
-- signature of it, and the pending tablet signature of the walk-in Salma.
insert into public.intake_screens (id, org_id, title, intro, after_screen, sort_order, is_archived)
values ('5eed0000-0000-4000-8090-000000000001', '5eed0000-0000-4000-8000-000000000000',
        '{"ca":"Autoritzacions antigues","es":"Autorizaciones antiguas","en":"Old authorizations"}'::jsonb,
        null, 'logistics', 90, true)
on conflict (id) do nothing;

insert into public.form_blocks (id, org_id, surface, screen_key, body, sort_order)
values ('5eed0000-0000-4000-8090-000000000002', '5eed0000-0000-4000-8000-000000000000',
        'onboarding', '5eed0000-0000-4000-8090-000000000001',
        '{"ca":"Accepto les normes de convivència.","es":"Acepto las normas de convivencia.","en":"I accept the code of conduct.","ar":"أوافق على قواعد السلوك."}'::jsonb, 0)
on conflict (id) do nothing;

insert into public.form_signatures
  (id, org_id, profile_id, surface, block_id, screen_key, body, language,
   signer_kind, signer_user_id, signer_name, strokes, signed_at)
values ('5eed0000-0000-4000-8090-000000000003', '5eed0000-0000-4000-8000-000000000000',
        '5eed0000-0000-4000-8000-000000000011', 'wizard', '5eed0000-0000-4000-8090-000000000002',
        '5eed0000-0000-4000-8090-000000000001', 'أوافق على قواعد السلوك.', 'ar',
        'player', '5eed0000-0000-4000-8000-000000000011', 'أمينة الحسن',
        '[[[120,620],[200,480],[290,560],[380,410],[470,590],[560,450]],[[640,520],[760,500],[880,540]]]'::jsonb,
        timestamptz '2026-09-20 18:28:00+02')
on conflict (id) do nothing;

insert into public.walk_in_form_signatures
  (id, walk_in_id, org_id, block_id, screen_key, body, language, strokes, signed_at, witnessed_by)
values ('5eed0000-0000-4000-8090-000000000004', '5eed0000-0000-4000-8043-000000000001',
        '5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8090-000000000002',
        '5eed0000-0000-4000-8090-000000000001', 'أوافق على قواعد السلوك.', 'ar',
        '[[[110,600],[210,470],[300,550],[390,420]]]'::jsonb,
        timestamptz '2026-09-15 19:12:00+02', '5eed0000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

-- Dades legals (RAPP-699) -------------------------------------------------------------
-- The seeded version brought its consents into the catalogue and placed them on the
-- authorization. One consent the team added, asked on the archived screen above so no
-- live flow asks it: Amina gave it on paper, then staff recorded her withdrawal.
insert into public.consents (id, org_id, key, name, body, created_by, created_at, updated_at)
values ('5eed0000-0000-4000-8099-000000000001', '5eed0000-0000-4000-8000-000000000000',
        'fotos_de_partit',
        '{"ca":"Fotos de partit","es":"Fotos de partido","en":"Match photos","ar":"صور المباريات","fa":"عکس‌های مسابقه"}'::jsonb,
        '{"ca":"Accepto que l''equip comparteixi fotos dels partits al grup de l''equip.","es":"Acepto que el equipo comparta fotos de los partidos en el grupo del equipo.","en":"I agree that the team shares match photos in the team group.","ar":"أوافق على أن يشارك الفريق صور المباريات في مجموعة الفريق.","fa":"موافقم که تیم عکس‌های مسابقه را در گروه تیم به اشتراک بگذارد."}'::jsonb,
        '5eed0000-0000-4000-8000-000000000001',
        timestamptz '2026-09-01 10:00:00+02', timestamptz '2026-09-01 10:00:00+02')
on conflict (id) do nothing;

insert into public.consent_placements (id, org_id, consent_id, surface, screen_key, sort_order, required)
values ('5eed0000-0000-4000-8099-000000000002', '5eed0000-0000-4000-8000-000000000000',
        '5eed0000-0000-4000-8099-000000000001', 'onboarding', '5eed0000-0000-4000-8090-000000000001', 1, false)
on conflict (id) do nothing;

insert into public.consent_events
  (org_id, profile_id, consent_id, consent_key, granted, method, decided_at, language, wording,
   recorded_by, reason)
select '5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-000000000011',
       '5eed0000-0000-4000-8099-000000000001', 'fotos_de_partit', e.granted, e.method, e.decided_at, 'ca',
       'Accepto que l''equip comparteixi fotos dels partits al grup de l''equip.',
       '5eed0000-0000-4000-8000-000000000002', e.reason
  from (values (true, 'paper', timestamptz '2026-09-15 19:00:00+02', null::text),
               (false, 'staff', timestamptz '2026-10-02 18:00:00+02', 'Ho va demanar a l''entrenament.'))
       as e(granted, method, decided_at, reason)
 where not exists (select 1 from public.consent_events x
                    where x.profile_id = '5eed0000-0000-4000-8000-000000000011'
                      and x.consent_key = 'fotos_de_partit');

-- The walk-in Salma's tick of the team's consent on the tablet (RAPP-699), waiting
-- with her signing until staff confirm her.
insert into public.walk_in_consents
  (id, walk_in_id, org_id, consent_id, consent_key, granted, required, screen_key, wording, language,
   decided_at, recorded_by)
values ('5eed0000-0000-4000-8099-000000000003', '5eed0000-0000-4000-8043-000000000001',
        '5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8099-000000000001', 'fotos_de_partit',
        true, false, '5eed0000-0000-4000-8090-000000000001',
        'أوافق على أن يشارك الفريق صور المباريات في مجموعة الفريق.', 'ar',
        timestamptz '2026-09-15 19:12:00+02', '5eed0000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

-- Forms the team created (RAPP-700, RAPP-701): a form for every player, live,
-- which Amina answered and Fàtima still has pending, and a form for the players
-- picked (Natàlia), live too. Each has its published version.
insert into public.custom_forms
  (id, org_id, name, filled_by, mandatory, deadline, audience, version, published_at, created_by)
values
  ('5eed0000-0000-4000-8100-000000000001', '5eed0000-0000-4000-8000-000000000000',
   '{"ca":"Com véns als entrenaments","es":"Cómo vienes a los entrenamientos","en":"How you get to training"}'::jsonb,
   'player', 'optional', null, 'all', 1, timestamptz '2026-10-01 10:00:00+02',
   '5eed0000-0000-4000-8000-000000000002'),
  ('5eed0000-0000-4000-8100-000000000002', '5eed0000-0000-4000-8000-000000000000',
   '{"ca":"Seguiment social","es":"Seguimiento social","en":"Social follow-up"}'::jsonb,
   'player', 'optional', null, 'chosen', 1, timestamptz '2026-10-01 10:00:00+02',
   '5eed0000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.custom_form_screens (id, org_id, form_id, title, sort_order)
values
  ('5eed0000-0000-4000-8101-000000000001', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8100-000000000001', '{"ca":"Transport","es":"Transporte","en":"Transport"}'::jsonb, 0),
  ('5eed0000-0000-4000-8101-000000000002', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8100-000000000002', '{"ca":"Seguiment","es":"Seguimiento","en":"Follow-up"}'::jsonb, 0)
on conflict (id) do nothing;

insert into public.field_placements
  (id, org_id, field_id, surface, screen_key, custom_form_id, sort_order, required)
values
  ('5eed0000-0000-4000-8101-000000000011', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8045-000000000001', 'custom_form', '5eed0000-0000-4000-8101-000000000001',
   '5eed0000-0000-4000-8100-000000000001', 0, true),
  ('5eed0000-0000-4000-8101-000000000012', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8045-000000000004', 'custom_form', '5eed0000-0000-4000-8101-000000000002',
   '5eed0000-0000-4000-8100-000000000002', 0, false)
on conflict (id) do nothing;

insert into public.custom_form_responses
  (id, org_id, form_id, version, profile_id, status, asked_at, answered_at, answered_by, filled_by)
values
  ('5eed0000-0000-4000-8102-000000000001', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8100-000000000001', 1, '5eed0000-0000-4000-8000-000000000011', 'done',
   timestamptz '2026-10-01 10:00:00+02', timestamptz '2026-10-02 18:30:00+02',
   '5eed0000-0000-4000-8000-000000000011', 'player'),
  ('5eed0000-0000-4000-8102-000000000002', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8100-000000000001', 1, '5eed0000-0000-4000-8000-000000000012', 'pending',
   timestamptz '2026-10-01 10:00:00+02', null, null, null),
  ('5eed0000-0000-4000-8102-000000000003', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8100-000000000002', 1, '5eed0000-0000-4000-8000-000000000022', 'pending',
   timestamptz '2026-10-01 10:00:00+02', null, null, null)
on conflict (id) do nothing;

insert into public.custom_form_recipients (form_id, profile_id, org_id)
values ('5eed0000-0000-4000-8100-000000000002', '5eed0000-0000-4000-8000-000000000022',
        '5eed0000-0000-4000-8000-000000000000')
on conflict do nothing;

insert into public.custom_form_versions (org_id, form_id, version, content, published_at)
select f.org_id, f.id, 1, private.custom_form_content(f.id), f.published_at
  from public.custom_forms f
 where f.id in ('5eed0000-0000-4000-8100-000000000001', '5eed0000-0000-4000-8100-000000000002')
on conflict (form_id, version) do nothing;
