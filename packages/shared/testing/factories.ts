/**
 * Typed test factories (RAPP-18). Every unit test that needs a row builds it
 * here instead of hand-writing an object literal, so a schema change breaks in
 * one place and every test keeps describing a person who really exists in the
 * seeded local database.
 *
 * Three rules this module follows:
 *
 * 1. **Deterministic.** No randomness and no `Date.now()`: the same call always
 *    returns the same object, so a failing assertion is reproducible.
 * 2. **Overrides win.** Every factory takes a partial row and merges it last,
 *    so a test states only the field it is actually about.
 * 3. **Sensitive answers carry PLAINTEXT here.** Her phone, address, postal
 *    code and document number are stored encrypted (ADR-004), but a factory
 *    models what app code handles once it is past `decrypt_field`. A
 *    ciphertext blob would make a redaction test or a rendering test prove
 *    nothing.
 *
 * The identity fields come from `fixtures.ts`, which `supabase/seed.sql`
 * mirrors. Her answers to the app's fields are by field (ADR-031):
 * `buildAppAnswersFromFixture` derives them from the same ordinal the seed
 * uses, so a factory-built participant and the seeded one agree.
 */

import type { SystemFieldKey } from '../onboarding/system-fields';
import {
  serializeServiceCategoryMetadataSchema,
  SERVICE_CATEGORY_DEFINITIONS,
} from '../services/definitions';
import type { Database, Json } from '../types/database';
import {
  INVITED_ACCOUNT_ID,
  ONBOARDING_ACCOUNT_EMAIL,
  ONBOARDING_DESIGNER_ID,
  ONBOARDING_DESIGNER_NAME,
  PARTICIPANT_FIXTURES,
  SEED_APP_TERMS_VERSION_ID,
  SEED_ORGANIZATION_ID,
  SEED_ORGANIZATION_SLUG,
  SEED_TERMS_VERSION,
  seedUserId,
  STAFF_FIXTURES,
  TEST_PLAYER_ID,
  TEST_PLAYER_NAME,
  type PersonFixture,
} from './fixtures';

export type OrganizationRow = Database['public']['Tables']['organizations']['Row'];
export type AnnouncementRow = Database['public']['Tables']['announcements']['Row'];
export type AttendanceRow = Database['public']['Tables']['attendance']['Row'];
export type EventCategoryRow = Database['public']['Tables']['event_categories']['Row'];
export type EventRow = Database['public']['Tables']['events']['Row'];
export type EventOccurrenceRow = Database['public']['Tables']['event_occurrences']['Row'];
export type EventSignupRow = Database['public']['Tables']['event_signups']['Row'];
export type ForumCategoryRow = Database['public']['Tables']['forum_categories']['Row'];
export type ForumFlagRow = Database['public']['Tables']['forum_flags']['Row'];
export type ForumPostRow = Database['public']['Tables']['forum_posts']['Row'];
export type ForumReplyRow = Database['public']['Tables']['forum_replies']['Row'];
export type MediaItemRow = Database['public']['Tables']['media_items']['Row'];
export type KnowledgeCategoryRow = Database['public']['Tables']['knowledge_categories']['Row'];
export type KnowledgeArticleRow = Database['public']['Tables']['knowledge_articles']['Row'];
export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type PushTokenRow = Database['public']['Tables']['push_tokens']['Row'];
export type PushPublicationRow = Database['public']['Tables']['push_publications']['Row'];
export type PushDeliveryRow = Database['public']['Tables']['push_deliveries']['Row'];
export type ConversationRow = Database['public']['Tables']['conversations']['Row'];
export type MessageRow = Database['public']['Tables']['messages']['Row'];
export type ConversationReadStateRow =
  Database['public']['Tables']['conversation_read_states']['Row'];
export type ConversationAssignmentHistoryRow =
  Database['public']['Tables']['conversation_assignment_history']['Row'];
export type AppTermsSignatureRow = Database['public']['Tables']['app_terms_signatures']['Row'];
export type TermsAcceptanceRow = Database['public']['Tables']['terms_acceptances']['Row'];
export type DeletionRequestRow = Database['public']['Tables']['deletion_requests']['Row'];
export type ParticipantNoteRow = Database['public']['Tables']['participant_notes']['Row'];
export type EquipmentDeliveryRow = Database['public']['Tables']['equipment_deliveries']['Row'];
export type StockAlertRow = Database['public']['Tables']['stock_alerts']['Row'];
export type AuditLogRow = Database['public']['Tables']['audit_log']['Row'];
export type InviteRow = Database['public']['Tables']['invites']['Row'];
export type SeasonRow = Database['public']['Tables']['seasons']['Row'];
export type AuthorizationVersionRow = Database['public']['Tables']['authorization_versions']['Row'];
export type AppTermsVersionRow = Database['public']['Tables']['app_terms_versions']['Row'];
export type AuthorizationSignatureRow =
  Database['public']['Tables']['authorization_signatures']['Row'];
export type ConsentEventRow = Database['public']['Tables']['consent_events']['Row'];
export type ConsentRow = Database['public']['Tables']['consents']['Row'];
export type ConsentPlacementRow = Database['public']['Tables']['consent_placements']['Row'];
export type WalkInConsentRow = Database['public']['Tables']['walk_in_consents']['Row'];
export type CustomQuestionStateRow = Database['public']['Tables']['custom_question_states']['Row'];
export type ServiceCategoryRow = Database['public']['Tables']['service_categories']['Row'];
export type ServiceRow = Database['public']['Tables']['services']['Row'];
export type ServiceImageRow = Database['public']['Tables']['service_images']['Row'];
export type ServiceInterestRow = Database['public']['Tables']['service_interests']['Row'];
export type MentoringRequestRow = Database['public']['Tables']['mentoring_requests']['Row'];
export type FeedbackSubmissionRow = Database['public']['Tables']['feedback_submissions']['Row'];
export type StaffInvitationRow = Database['public']['Tables']['staff_invitations']['Row'];
export type InternalDocumentRow = Database['public']['Tables']['internal_documents']['Row'];
export type NotificationTemplateRow = Database['public']['Tables']['notification_templates']['Row'];
export type CustomNotificationGroupRow =
  Database['public']['Tables']['custom_notification_groups']['Row'];
export type CustomNotificationGroupMemberRow =
  Database['public']['Tables']['custom_notification_group_members']['Row'];
export type TargetedNotificationSendRow =
  Database['public']['Tables']['targeted_notification_sends']['Row'];
export type SurveyRow = Database['public']['Tables']['surveys']['Row'];
export type SurveyQuestionRow = Database['public']['Tables']['survey_questions']['Row'];
export type SurveyResponseRow = Database['public']['Tables']['survey_responses']['Row'];

/** One fixed instant for every timestamp, so factory output is byte-stable. */
const FIXTURE_TIMESTAMP = '2026-01-15T09:00:00+00:00';

const POSTAL_CODES_BY_CITY: Readonly<Record<string, string>> = {
  Vic: '08500',
  Manlleu: '08560',
  Torelló: '08570',
  'Roda de Ter': '08510',
};

const CLOTHING_SIZES = ['S', 'M', 'L', 'XL'] as const;

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

/**
 * Where each roster nationality's participants were born, in the script they
 * write it in. Mirrors the same map in `supabase/seed.sql`.
 *
 * A birthplace and not a city of residence: the two differ for everyone on this
 * roster except the local player, and a fixture where they matched would let a
 * screen that confused the two look correct.
 */
const PLACES_OF_BIRTH_BY_NATIONALITY: Readonly<Record<string, string>> = {
  Síria: 'حلب',
  Marroc: 'الرباط',
  Tunísia: 'تونس',
  Afganistan: 'کابل',
  Iran: 'تهران',
  Ucraïna: 'Київ',
  Colòmbia: 'Medellín',
  Perú: 'Cusco',
  Bolívia: 'Oruro',
  Veneçuela: 'Maracaibo',
  Senegal: 'Dakar',
  Gàmbia: 'Banjul',
};

const REFERRING_ENTITIES = [
  { entity: 'Creu Roja Osona', contact: 'Sílvia Bosch' },
  { entity: 'CEAR Catalunya', contact: 'Jordi Camps' },
  { entity: null, contact: null },
] as const;

/**
 * The account settings, derived from the ordinal exactly as `supabase/seed.sql`
 * derives them. A handful of accounts are deliberately imperfect: the app has
 * to cope with a participant who never accepted the terms, one who was
 * deactivated, and one banned from the forum. A uniformly happy dataset hides
 * those screens.
 */
function derivedAccountFields(fixture: PersonFixture) {
  const { ordinal } = fixture;
  return {
    terms_accepted_at: ordinal % 7 === 0 ? null : FIXTURE_TIMESTAMP,
    is_active: ordinal % 13 !== 0,
    is_forum_banned: ordinal % 17 === 0,
    // Every account signs in with an emailed code since RAPP-224; the column
    // goes in RAPP-211.
    sessions_valid_after: null,
  };
}

/** One answer of an app field as the seed gives it: a choice by its option key. */
export type AppAnswerFixture = string | number | readonly string[];

/**
 * A participant's answers to the app's fields, by system key, derived from the
 * ordinal exactly as `supabase/seed.sql` derives them (ADR-031: her answers
 * are by field, her profile holds her names and her account settings). A
 * choice is its option key, as the seed writes it. Deriving beats listing:
 * twenty rows of hand-written sizes and postal codes would be noise to read
 * and a second place to update.
 */
export function buildAppAnswersFromFixture(
  fixture: PersonFixture,
): Readonly<Partial<Record<SystemFieldKey, AppAnswerFixture>>> {
  const { ordinal } = fixture;
  const hasNoDocument = ordinal % 5 === 0;
  const hasDependents = ordinal % 3 === 0;
  const referral = REFERRING_ENTITIES[ordinal % REFERRING_ENTITIES.length]!;
  // Two participants have no birthplace, as the seed leaves them: a profile
  // from before the field was required has none, and staff have to supply it
  // before they can save anything else about her.
  const placeOfBirth =
    ordinal % 11 === 0 ? null : (PLACES_OF_BIRTH_BY_NATIONALITY[fixture.nationality] ?? 'Vic');
  const answers: Partial<Record<SystemFieldKey, AppAnswerFixture | null>> = {
    date_of_birth: `${1985 + (ordinal % 15)}-${pad(1 + (ordinal % 12), 2)}-${pad(1 + (ordinal % 28), 2)}`,
    place_of_birth: placeOfBirth,
    nationality: fixture.nationality,
    address: `Carrer de Prova, ${ordinal}`,
    city: fixture.city,
    postal_code: POSTAL_CODES_BY_CITY[fixture.city] ?? '08500',
    phone: `+346${pad(ordinal, 8)}`,
    document_type: hasNoDocument ? 'none' : 'nie',
    document_number: hasNoDocument ? null : `Y${pad(ordinal, 7)}Z`,
    reference_entity: referral.entity,
    reference_contact_name: referral.contact,
    has_dependents: hasDependents ? 'yes' : 'no',
    num_dependents: hasDependents ? 1 + (ordinal % 4) : null,
    clothing_size: CLOTHING_SIZES[ordinal % CLOTHING_SIZES.length]!,
    shoe_size: String(36 + (ordinal % 6)),
  };
  return Object.fromEntries(
    Object.entries(answers).filter(([, value]) => value !== null && value !== undefined),
  ) as Partial<Record<SystemFieldKey, AppAnswerFixture>>;
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

export function buildOrganization(overrides: Partial<OrganizationRow> = {}): OrganizationRow {
  return {
    id: SEED_ORGANIZATION_ID,
    name: 'AE Ramassà',
    slug: SEED_ORGANIZATION_SLUG,
    logo_url: null,
    primary_color: '#0077B6',
    secondary_color: '#FFD166',
    default_language: 'ca',
    available_languages: ['ca', 'es', 'en', 'ar', 'fa'],
    locked_default_language: null,
    contact_email: 'contacte@example.test',
    contact_phone: '+34600000000',
    created_at: FIXTURE_TIMESTAMP,
    document_step_explanation: null,
    ...overrides,
  };
}

export function buildServiceCategory(
  overrides: Partial<ServiceCategoryRow> = {},
): ServiceCategoryRow {
  const definition = SERVICE_CATEGORY_DEFINITIONS[0];
  return {
    id: '5eed0000-0000-4000-8009-000000000001',
    org_id: SEED_ORGANIZATION_ID,
    name: toJson(definition.name),
    slug: definition.slug,
    icon: definition.icon,
    color: definition.color,
    sort_order: definition.sortOrder,
    metadata_schema: toJson(serializeServiceCategoryMetadataSchema(definition)),
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildService(overrides: Partial<ServiceRow> = {}): ServiceRow {
  const creator = STAFF_FIXTURES.find((person) => person.role === 'staff')!;
  return {
    id: '5eed0000-0000-4000-800a-000000000003',
    org_id: SEED_ORGANIZATION_ID,
    category_id: buildServiceCategory().id,
    title: {
      ca: 'Habitació compartida per a dones',
      es: 'Habitación compartida para mujeres',
      en: 'Shared room for women',
      ar: 'غرفة مشتركة للنساء',
      fa: 'اتاق مشترک برای زنان',
    },
    description: null,
    provider_name: 'Fundació Habitat3',
    location: 'Vic',
    zone: 'Osona',
    cost_type: 'subsidized',
    cost_amount: 120,
    cost_details: 'Subministraments inclosos',
    contact_name: 'Anna Serra',
    contact_phone: '+34938851000',
    contact_email: 'silvia.bosch@example.test',
    contact_role: 'Coordinació d’habitatge',
    schedule: 'De dilluns a divendres, de 9 a 14 h',
    external_url: 'https://example.test/habitacio-vic',
    availability: 'available',
    metadata: {
      housing_type: 'shared_flat',
      duration: 'long_term',
      deposit_required: true,
      deposit_amount: 250,
      for_whom: 'women_only',
      restrictions: 'Cal empadronament',
    },
    status: 'published',
    published_at: FIXTURE_TIMESTAMP,
    expires_at: null,
    submitted_by: null,
    created_by: seedUserId(creator.ordinal),
    reviewed_by: null,
    reviewed_at: null,
    rejection_reason: null,
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildServiceImage(overrides: Partial<ServiceImageRow> = {}): ServiceImageRow {
  return {
    id: '5eed0000-0000-4000-800b-000000000001',
    org_id: SEED_ORGANIZATION_ID,
    service_id: buildService().id,
    url: 'org/services/housing/shared-room.webp',
    alt_text: {
      ca: 'Habitació doble amb llum natural',
      es: 'Habitación doble con luz natural',
      en: 'Twin room with natural light',
      ar: 'غرفة مزدوجة بإضاءة طبيعية',
      fa: 'اتاق دو نفره با نور طبیعی',
    },
    position: 0,
    created_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildServiceInterest(
  overrides: Partial<ServiceInterestRow> = {},
): ServiceInterestRow {
  return {
    id: '5eed0000-0000-4000-800c-000000000001',
    org_id: SEED_ORGANIZATION_ID,
    service_id: '5eed0000-0000-4000-800a-000000000004',
    user_id: seedUserId(PARTICIPANT_FIXTURES[1]!.ordinal),
    created_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildForumCategory(overrides: Partial<ForumCategoryRow> = {}): ForumCategoryRow {
  return {
    id: '5eed0000-0000-4000-8006-000000000002',
    org_id: SEED_ORGANIZATION_ID,
    name: {
      ca: 'Feina',
      es: 'Empleo',
      en: 'Jobs',
      ar: 'العمل',
      fa: 'کار',
    },
    slug: 'jobs',
    icon: 'briefcase',
    color: 'secondary',
    sort_order: 20,
    created_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildForumPost(overrides: Partial<ForumPostRow> = {}): ForumPostRow {
  const author = PARTICIPANT_FIXTURES[0]!;
  return {
    id: '5eed0000-0000-4000-8010-000000000099',
    org_id: SEED_ORGANIZATION_ID,
    category_id: buildForumCategory().id,
    author_id: seedUserId(author.ordinal),
    author_first_name: author.firstName,
    content: 'Busco feina de cuina a Vic.',
    image_url: null,
    visibility: 'visible',
    is_pinned: false,
    flag_count: 0,
    reply_count: 1,
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildForumFlag(overrides: Partial<ForumFlagRow> = {}): ForumFlagRow {
  const flagger = PARTICIPANT_FIXTURES[1]!;
  return {
    id: '5eed0000-0000-4000-8012-000000000099',
    org_id: SEED_ORGANIZATION_ID,
    flagger_id: seedUserId(flagger.ordinal),
    target_type: 'post',
    post_id: buildForumPost().id,
    reply_id: null,
    media_id: null,
    reason: 'harassment',
    comment: 'Em fa sentir insegura.',
    state: 'pending',
    reviewed_by: null,
    reviewed_at: null,
    created_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildMediaItem(overrides: Partial<MediaItemRow> = {}): MediaItemRow {
  const uploader = PARTICIPANT_FIXTURES[0]!;
  const uploaderId = seedUserId(uploader.ordinal);
  return {
    id: '5eed0000-0000-4000-8014-000000000099',
    org_id: SEED_ORGANIZATION_ID,
    uploaded_by: uploaderId,
    uploader_first_name: uploader.firstName,
    file_url: `${SEED_ORGANIZATION_ID}/gallery/${uploaderId}/2026/08/11111111111111111111111111111111.jpg`,
    thumbnail_url: `${SEED_ORGANIZATION_ID}/gallery/${uploaderId}/2026/08/22222222222222222222222222222222.jpg`,
    file_type: 'image',
    file_size: 640000,
    caption: 'Entrenament de dimarts',
    privacy_level: 'community',
    moderation_state: 'visible',
    flag_count: 0,
    consent_acknowledged_at: FIXTURE_TIMESTAMP,
    consent_version: 'gallery-consent-v1',
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildForumReply(overrides: Partial<ForumReplyRow> = {}): ForumReplyRow {
  const author = PARTICIPANT_FIXTURES[1]!;
  return {
    id: '5eed0000-0000-4000-8010-000000000199',
    org_id: SEED_ORGANIZATION_ID,
    post_id: buildForumPost().id,
    author_id: seedUserId(author.ordinal),
    author_first_name: author.firstName,
    content: 'أعرف una feina a Vic.',
    image_url: null,
    visibility: 'visible',
    flag_count: 0,
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

/**
 * A complete published announcement in every supported language. Tests that
 * need a draft or scheduled item override only the fields that define it.
 */
export function buildAnnouncement(overrides: Partial<AnnouncementRow> = {}): AnnouncementRow {
  const author = STAFF_FIXTURES.find((person) => person.role === 'staff')!;

  return {
    id: '5eed0000-0000-4000-8001-000000000099',
    org_id: SEED_ORGANIZATION_ID,
    category: 'info',
    title: {
      ca: 'Trobada de famílies',
      es: 'Encuentro de familias',
      en: 'Family gathering',
      ar: 'لقاء العائلات',
      fa: 'گردهمایی خانواده‌ها',
    },
    body: {
      ca: 'Dissabte compartirem un dinar al club.',
      es: 'El sábado compartiremos una comida en el club.',
      en: 'We will share lunch at the club on Saturday.',
      ar: 'سنتناول الغداء معًا في النادي يوم السبت.',
      fa: 'شنبه در باشگاه ناهار را با هم صرف می‌کنیم.',
    },
    image_url: null,
    image_alt: null,
    is_pinned: false,
    status: 'published',
    published_at: FIXTURE_TIMESTAMP,
    expires_at: null,
    created_by: seedUserId(author.ordinal),
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildEventCategory(overrides: Partial<EventCategoryRow> = {}): EventCategoryRow {
  return {
    id: '5eed0000-0000-4000-8002-000000000099',
    org_id: SEED_ORGANIZATION_ID,
    name: {
      ca: 'Entrenaments',
      es: 'Entrenamientos',
      en: 'Training',
      ar: 'التدريبات',
      fa: 'تمرین ها',
    },
    icon: 'dumbbell',
    color: 'primary',
    sort_order: 10,
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildEvent(overrides: Partial<EventRow> = {}): EventRow {
  const author = STAFF_FIXTURES.find((person) => person.role === 'staff')!;

  return {
    id: '5eed0000-0000-4000-8003-000000000099',
    org_id: SEED_ORGANIZATION_ID,
    category_id: buildEventCategory().id,
    title: {
      ca: 'Entrenament setmanal',
      es: 'Entrenamiento semanal',
      en: 'Weekly training',
      ar: 'تدريب أسبوعي',
      fa: 'تمرین هفتگی',
    },
    description: null,
    location: 'Camp Municipal de Vic',
    location_url: 'https://maps.google.com/?q=Camp+Municipal+de+Vic',
    starts_at: '2026-03-22T17:00:00+00:00',
    ends_at: '2026-03-22T18:30:00+00:00',
    time_zone: 'Europe/Madrid',
    recurrence_rule: null,
    is_recurring: false,
    max_participants: 18,
    active_signup_count: 0,
    signup_mode: 'confirm',
    status: 'published',
    published_at: FIXTURE_TIMESTAMP,
    expires_at: null,
    created_by: seedUserId(author.ordinal),
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildEventOccurrence(
  overrides: Partial<EventOccurrenceRow> = {},
): EventOccurrenceRow {
  return {
    id: '5eed0000-0000-4000-8004-000000000099',
    org_id: SEED_ORGANIZATION_ID,
    event_id: buildEvent().id,
    starts_at: '2026-03-22T17:00:00+00:00',
    ends_at: '2026-03-22T18:30:00+00:00',
    created_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildEventSignup(overrides: Partial<EventSignupRow> = {}): EventSignupRow {
  return {
    id: '5eed0000-0000-4000-8006-000000000099',
    org_id: SEED_ORGANIZATION_ID,
    event_id: buildEvent().id,
    player_id: seedUserId(PARTICIPANT_FIXTURES[0]!.ordinal),
    state: 'confirmed',
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildAttendance(overrides: Partial<AttendanceRow> = {}): AttendanceRow {
  return {
    id: '5eed0000-0000-4000-8009-000000000099',
    org_id: SEED_ORGANIZATION_ID,
    occurrence_id: buildEventOccurrence().id,
    player_id: seedUserId(PARTICIPANT_FIXTURES[0]!.ordinal),
    status: 'present',
    marked_by: seedUserId(STAFF_FIXTURES[1]!.ordinal),
    marked_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildKnowledgeCategory(
  overrides: Partial<KnowledgeCategoryRow> = {},
): KnowledgeCategoryRow {
  return {
    id: '5eed0000-0000-4000-8004-000000000099',
    org_id: SEED_ORGANIZATION_ID,
    name: {
      ca: 'Drets i asil',
      es: 'Derechos y asilo',
      en: 'Rights and asylum',
      ar: 'الحقوق واللجوء',
      fa: 'حقوق و پناهندگی',
    },
    slug: 'rights-asylum',
    icon: 'scale',
    sort_order: 10,
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildKnowledgeArticle(
  overrides: Partial<KnowledgeArticleRow> = {},
): KnowledgeArticleRow {
  const author = STAFF_FIXTURES.find((person) => person.role === 'staff')!;
  const body = Object.fromEntries(
    ['ca', 'es', 'en', 'ar', 'fa'].map((language) => [
      language,
      [{ type: 'paragraph', text: `Safe account guide (${language})` }],
    ]),
  );

  return {
    id: '5eed0000-0000-4000-8005-000000000099',
    org_id: SEED_ORGANIZATION_ID,
    category_id: buildKnowledgeCategory().id,
    title: {
      ca: 'Protegeix el teu compte',
      es: 'Protege tu cuenta',
      en: 'Protect your account',
      ar: 'احمي حسابك',
      fa: 'از حساب خود محافظت کنید',
    },
    body,
    image_url: null,
    video_url: null,
    external_url: null,
    content_type: 'article',
    story_status: null,
    submission_language: null,
    story_image_urls: [],
    publication_consent: null,
    publication_consent_at: null,
    publication_consent_version: null,
    author_id: null,
    author_first_name: null,
    reviewer_note: null,
    reviewed_by: null,
    reviewed_at: null,
    is_published: true,
    published_at: FIXTURE_TIMESTAMP,
    expires_at: null,
    created_by: seedUserId(author.ordinal),
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildParticipantStory(
  overrides: Partial<KnowledgeArticleRow> = {},
): KnowledgeArticleRow {
  const author = PARTICIPANT_FIXTURES[0]!;
  return buildKnowledgeArticle({
    id: '5eed0000-0000-4000-8005-000000000100',
    category_id: buildKnowledgeCategory({
      id: '5eed0000-0000-4000-8004-000000000100',
      slug: 'general-resources',
    }).id,
    title: { ca: 'El meu primer partit' },
    body: { ca: [{ type: 'paragraph', text: 'Vaig trobar un equip.' }] },
    content_type: 'participant_story',
    story_status: 'submitted',
    submission_language: 'ca',
    publication_consent: true,
    publication_consent_at: FIXTURE_TIMESTAMP,
    publication_consent_version: 'story-publication-v1',
    author_id: seedUserId(author.ordinal),
    author_first_name: author.firstName,
    is_published: false,
    published_at: null,
    created_by: seedUserId(author.ordinal),
    ...overrides,
  });
}

/**
 * The base profile builder every other profile factory composes. Defaults to
 * the first roster participant; pass `role` to build staff, admin, or entity.
 */
export function buildProfile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return buildProfileFromFixture(PARTICIPANT_FIXTURES[0]!, overrides);
}

/**
 * A participant from the roster: a real name in its own script, with the app
 * language that goes with it. Use this wherever a test's meaning depends on
 * who the person is (RTL rendering, font selection, PII redaction).
 */
export function buildParticipant(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return buildProfileFromFixture(PARTICIPANT_FIXTURES[0]!, { role: 'player', ...overrides });
}

/**
 * A set of participants that is multilingual by construction, because it walks
 * the roster in order rather than repeating one person. Past the end of the
 * roster it wraps, offsetting the ordinal so IDs stay unique.
 */
export function buildParticipants(count: number): ProfileRow[] {
  return Array.from({ length: count }, (_unused, index) => {
    const lap = Math.floor(index / PARTICIPANT_FIXTURES.length);
    const fixture = PARTICIPANT_FIXTURES[index % PARTICIPANT_FIXTURES.length]!;
    const ordinal = fixture.ordinal + lap * 100;
    return buildProfileFromFixture({ ...fixture, ordinal }, { role: 'player' });
  });
}

export function buildProfileFromFixture(
  fixture: PersonFixture,
  overrides: Partial<ProfileRow> = {},
): ProfileRow {
  return {
    id: seedUserId(fixture.ordinal),
    org_id: SEED_ORGANIZATION_ID,
    role: 'player',
    collaborating_entity_id: null,
    first_name: fixture.firstName,
    last_name: fixture.lastName,
    preferred_language: fixture.preferredLanguage,
    avatar_url: null,
    // Media consent defaults to NOT granted, which is the only defensible
    // default for an optional, revocable consent: a fixture that granted it by
    // default would let a test pass while the app quietly assumed permission
    // to publish a participant's photo.
    media_consent_at: null,
    // A fixture is a participant whose record still describes a person. The
    // anonymized state is produced by an irreversible RPC (RAPP-26), so a test
    // that wants one asks for it explicitly rather than inheriting it.
    anonymized_at: null,
    push_notifications_enabled: true,
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    // Her season count (RAPP-303): not given unless a test says so.
    season_number: null,
    // Seasons played before the app (RAPP-306).
    prior_seasons: 0,
    // A real person unless a test says otherwise (RAPP-615).
    is_test_account: false,
    // The forms chained after her Onboarding are behind her (RAPP-703).
    onboarding_chain_done_at: FIXTURE_TIMESTAMP,
    // Her number in her organization (RAPP-693): "Jugadora 0042" where her name is private.
    member_number: fixture.ordinal,
    ...derivedAccountFields(fixture),
    ...overrides,
  };
}

/**
 * The seeded test player (RAPP-615): invited, not joined, a test account. A
 * test about the design sandbox builds her instead of a roster participant,
 * because a real participant must never be one.
 */
export function buildTestPlayer(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return buildProfileFromFixture(PARTICIPANT_FIXTURES[0]!, {
    id: TEST_PLAYER_ID,
    role: 'invited',
    first_name: TEST_PLAYER_NAME.firstName,
    last_name: TEST_PLAYER_NAME.lastName,
    preferred_language: 'ca',
    terms_accepted_at: null,
    is_test_account: true,
    ...overrides,
  });
}

/** The seeded team member on the Onboarding design preset (RAPP-615). */
export function buildOnboardingDesigner(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return buildProfileFromFixture(STAFF_FIXTURES[1]!, {
    id: ONBOARDING_DESIGNER_ID,
    role: 'staff',
    first_name: ONBOARDING_DESIGNER_NAME.firstName,
    last_name: ONBOARDING_DESIGNER_NAME.lastName,
    preferred_language: 'ca',
    is_test_account: true,
    ...overrides,
  });
}

export function buildPushToken(overrides: Partial<PushTokenRow> = {}): PushTokenRow {
  const owner = PARTICIPANT_FIXTURES[0]!;

  return {
    id: seedUserId(900 + owner.ordinal),
    user_id: seedUserId(owner.ordinal),
    token: `ExponentPushToken[seed-${pad(owner.ordinal, 4)}]`,
    platform: 'android',
    device_id: `seed-device-${pad(owner.ordinal, 4)}`,
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildPushPublication(
  overrides: Partial<PushPublicationRow> = {},
): PushPublicationRow {
  const contentId = '5eed0000-0000-4000-8001-000000000002';
  return {
    id: '5eed0000-0000-4000-8007-000000000001',
    org_id: SEED_ORGANIZATION_ID,
    recipient_id: null,
    content_type: 'announcement',
    content_id: contentId,
    idempotency_key: `announcement:${contentId}`,
    scheduled_for: FIXTURE_TIMESTAMP,
    state: 'complete',
    recipient_count: 1,
    sent_count: 1,
    delivered_count: 1,
    failed_count: 0,
    completed_at: FIXTURE_TIMESTAMP,
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildConversation(overrides: Partial<ConversationRow> = {}): ConversationRow {
  const player = PARTICIPANT_FIXTURES[0]!;
  const staff = STAFF_FIXTURES.find((person) => person.role === 'staff')!;
  return {
    id: '5eed0000-0000-4000-800c-000000000001',
    org_id: SEED_ORGANIZATION_ID,
    user_id: seedUserId(player.ordinal),
    assigned_staff_id: seedUserId(staff.ordinal),
    created_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildMessage(overrides: Partial<MessageRow> = {}): MessageRow {
  const player = PARTICIPANT_FIXTURES[0]!;
  return {
    id: '5eed0000-0000-4000-800d-000000000001',
    org_id: SEED_ORGANIZATION_ID,
    conversation_id: buildConversation().id,
    sender_id: seedUserId(player.ordinal),
    content: 'Synthetic fixture message',
    image_url: null,
    created_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildConversationReadState(
  overrides: Partial<ConversationReadStateRow> = {},
): ConversationReadStateRow {
  const player = PARTICIPANT_FIXTURES[0]!;
  return {
    org_id: SEED_ORGANIZATION_ID,
    conversation_id: buildConversation().id,
    user_id: seedUserId(player.ordinal),
    last_read_message_id: buildMessage().id,
    read_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildConversationAssignmentHistory(
  overrides: Partial<ConversationAssignmentHistoryRow> = {},
): ConversationAssignmentHistoryRow {
  const player = PARTICIPANT_FIXTURES[0]!;
  const staff = STAFF_FIXTURES.find((person) => person.role === 'staff')!;
  return {
    id: '5eed0000-0000-4000-800e-000000000001',
    org_id: SEED_ORGANIZATION_ID,
    conversation_id: buildConversation().id,
    user_id: seedUserId(player.ordinal),
    changed_by: seedUserId(staff.ordinal),
    previous_staff_id: null,
    assigned_staff_id: seedUserId(staff.ordinal),
    created_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildMentoringRequest(
  overrides: Partial<MentoringRequestRow> = {},
): MentoringRequestRow {
  const player = PARTICIPANT_FIXTURES[0]!;
  const staff = STAFF_FIXTURES.find((person) => person.role === 'staff')!;
  return {
    id: '5eed0000-0000-4000-8015-000000000001',
    org_id: SEED_ORGANIZATION_ID,
    player_id: seedUserId(player.ordinal),
    topic: 'labor_orientation',
    topic_detail_encrypted: 'Synthetic private mentoring note',
    preferred_date: '2026-01-20',
    preferred_time: '10:30:00',
    status: 'scheduled',
    scheduled_at: '2026-01-21T10:30:00+00:00',
    assigned_staff_id: seedUserId(staff.ordinal),
    staff_notes_encrypted: 'Synthetic private staff note',
    completed_at: null,
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildFeedbackSubmission(
  overrides: Partial<FeedbackSubmissionRow> = {},
): FeedbackSubmissionRow {
  const player = PARTICIPANT_FIXTURES[0]!;
  return {
    id: '5eed0000-0000-4000-8017-000000000001',
    org_id: SEED_ORGANIZATION_ID,
    author_id: seedUserId(player.ordinal),
    type: 'activity_proposal',
    content_encrypted: 'Synthetic private feedback content',
    image_url: null,
    status: 'in_progress',
    resolved_by: null,
    resolved_at: null,
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

const WEEKLY_NOTIFICATION_TITLE = {
  ca: 'Recordatori de l’entrenament setmanal',
  es: 'Recordatorio del entrenamiento semanal',
  en: 'Weekly training reminder',
  ar: 'تذكير بالتدريب الأسبوعي',
  fa: 'یادآوری تمرین هفتگی',
} as const;
const WEEKLY_NOTIFICATION_BODY = {
  ca: 'Recorda que aquesta tarda tenim entrenament.',
  es: 'Recuerda que esta tarde tenemos entrenamiento.',
  en: 'Remember that training is this afternoon.',
  ar: 'تذكّري أن التدريب سيكون بعد ظهر اليوم.',
  fa: 'یادت باشد تمرین امروز بعدازظهر است.',
} as const;

export function buildNotificationTemplate(
  overrides: Partial<NotificationTemplateRow> = {},
): NotificationTemplateRow {
  const staff = STAFF_FIXTURES.find((person) => person.role === 'staff')!;
  return {
    id: '5eed0000-0000-4000-8033-000000000001',
    org_id: SEED_ORGANIZATION_ID,
    name: 'Entrenament setmanal',
    category: 'engagement',
    title: toJson(WEEKLY_NOTIFICATION_TITLE),
    body: toJson(WEEKLY_NOTIFICATION_BODY),
    created_by: seedUserId(staff.ordinal),
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildCustomNotificationGroup(
  overrides: Partial<CustomNotificationGroupRow> = {},
): CustomNotificationGroupRow {
  const staff = STAFF_FIXTURES.find((person) => person.role === 'staff')!;
  return {
    id: '5eed0000-0000-4000-8034-000000000001',
    org_id: SEED_ORGANIZATION_ID,
    name: 'Grup setmanal multilingüe',
    created_by: seedUserId(staff.ordinal),
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildCustomNotificationGroupMember(
  overrides: Partial<CustomNotificationGroupMemberRow> = {},
): CustomNotificationGroupMemberRow {
  const participant = PARTICIPANT_FIXTURES[0]!;
  return {
    org_id: SEED_ORGANIZATION_ID,
    group_id: buildCustomNotificationGroup().id,
    participant_id: seedUserId(participant.ordinal),
    created_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildTargetedNotificationSend(
  overrides: Partial<TargetedNotificationSendRow> = {},
): TargetedNotificationSendRow {
  const staff = STAFF_FIXTURES.find((person) => person.role === 'staff')!;
  return {
    id: '5eed0000-0000-4000-8035-000000000001',
    org_id: SEED_ORGANIZATION_ID,
    template_id: buildNotificationTemplate().id,
    title: toJson(WEEKLY_NOTIFICATION_TITLE),
    body: toJson(WEEKLY_NOTIFICATION_BODY),
    audience_kind: 'custom_group',
    audience_config: toJson({ custom_group_id: buildCustomNotificationGroup().id }),
    recipient_count: 5,
    sent_by: seedUserId(staff.ordinal),
    created_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildSurvey(overrides: Partial<SurveyRow> = {}): SurveyRow {
  const staff = STAFF_FIXTURES.find((person) => person.role === 'staff')!;
  return {
    id: '5eed0000-0000-4000-8040-000000000001',
    org_id: SEED_ORGANIZATION_ID,
    event_id: null,
    title: toJson({
      ca: 'La teva opinió',
      es: 'Tu opinión',
      en: 'Your feedback',
      ar: 'رأيك',
      fa: 'نظر شما',
    }),
    published_at: FIXTURE_TIMESTAMP,
    closes_at: '2026-02-15T09:00:00+00:00',
    audience_kind: 'all',
    audience_config: toJson({}),
    created_by: seedUserId(staff.ordinal),
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildSurveyQuestion(overrides: Partial<SurveyQuestionRow> = {}): SurveyQuestionRow {
  return {
    id: '5eed0000-0000-4000-8041-000000000001',
    org_id: SEED_ORGANIZATION_ID,
    survey_id: buildSurvey().id,
    prompt: toJson({
      ca: 'Com ho valores?',
      es: '¿Cómo lo valoras?',
      en: 'How do you rate it?',
      ar: 'كيف تقيمينه؟',
      fa: 'چه امتیازی می دهید؟',
    }),
    question_type: 'rating',
    options: null,
    required: true,
    sort_order: 10,
    created_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildSurveyResponse(overrides: Partial<SurveyResponseRow> = {}): SurveyResponseRow {
  const participant = PARTICIPANT_FIXTURES[0]!;
  return {
    id: '5eed0000-0000-4000-8042-000000000001',
    org_id: SEED_ORGANIZATION_ID,
    survey_id: buildSurvey().id,
    player_id: seedUserId(participant.ordinal),
    answers_encrypted: '\\x656e63727970746564',
    status: 'completed',
    completed_at: FIXTURE_TIMESTAMP,
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildPushDelivery(overrides: Partial<PushDeliveryRow> = {}): PushDeliveryRow {
  const owner = PARTICIPANT_FIXTURES[0]!;
  return {
    id: '5eed0000-0000-4000-8008-000000000001',
    org_id: SEED_ORGANIZATION_ID,
    publication_id: '5eed0000-0000-4000-8007-000000000001',
    push_token_id: seedUserId(900 + owner.ordinal),
    recipient_id: seedUserId(owner.ordinal),
    language: owner.preferredLanguage,
    state: 'delivered',
    attempt_count: 1,
    receipt_attempt_count: 1,
    expo_ticket_id: 'seed-ticket-delivered',
    ticketed_at: FIXTURE_TIMESTAMP,
    worker_id: null,
    lease_expires_at: null,
    next_attempt_at: FIXTURE_TIMESTAMP,
    receipt_due_at: null,
    last_error_code: null,
    completed_at: FIXTURE_TIMESTAMP,
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

/**
 * A terms-acceptance event (RAPP-21). Defaults to the first roster participant
 * accepting in HER language, not in Catalan: the record exists to prove which
 * text someone actually read, so a fixture that always says 'ca' would make
 * every test agree with itself while proving nothing about the multilingual
 * case.
 */
export function buildTermsAcceptance(
  overrides: Partial<TermsAcceptanceRow> = {},
): TermsAcceptanceRow {
  const participant = PARTICIPANT_FIXTURES[0]!;
  return {
    id: `5eed0000-0000-4000-8000-${String(participant.ordinal).padStart(12, '0')}`,
    profile_id: `5eed0000-0000-4000-8000-${String(participant.ordinal).padStart(12, '0')}`,
    terms_version: SEED_TERMS_VERSION,
    locale_shown: participant.preferredLanguage,
    accepted_at: FIXTURE_TIMESTAMP,
    // Made by the test player scenario switches only (RAPP-619).
    is_test_fixture: false,
    // The version she accepted (RAPP-613): version 1 for every seeded acceptance.
    version_id: SEED_APP_TERMS_VERSION_ID,
    // Seeded acceptances predate app terms signatures, so the gate counts them.
    accepted_before_signatures: true,
    ...overrides,
  };
}

/**
 * An RGPD erasure request (RAPP-22). Defaults to OPEN and unresolved, because
 * that is the state every screen has to handle: the participant's "we received
 * it", and the staff queue that still has to answer it. A resolved fixture
 * would let both of those go untested while still looking like coverage.
 */
export function buildDeletionRequest(
  overrides: Partial<DeletionRequestRow> = {},
): DeletionRequestRow {
  const participant = PARTICIPANT_FIXTURES[0]!;
  const profileId = `5eed0000-0000-4000-8000-${String(participant.ordinal).padStart(12, '0')}`;
  return {
    id: `5eed0000-0000-4000-8000-${String(900 + participant.ordinal).padStart(12, '0')}`,
    profile_id: profileId,
    reason: 'Ja no puc venir a entrenar i prefereixo que esborreu les meves dades.',
    state: 'open',
    resolution_note: null,
    resolved_by: null,
    resolved_at: null,
    created_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

/**
 * A staff note about a participant (RAPP-24). Defaults to the first roster
 * participant written up by Marta Puig, because a note only means anything with
 * an author: the table stores one so a thread reads as a conversation between
 * colleagues, and a factory that invented an author id would let a broken
 * author column look fine in every test.
 */
export function buildParticipantNote(
  overrides: Partial<ParticipantNoteRow> = {},
): ParticipantNoteRow {
  const subject = PARTICIPANT_FIXTURES[0]!;
  const author = STAFF_FIXTURES.find((person) => person.role === 'staff')!;
  return {
    id: seedUserId(700 + subject.ordinal),
    profile_id: seedUserId(subject.ordinal),
    author_id: seedUserId(author.ordinal),
    body: 'Ha començat el curs de català als matins. Millor proposar-li els entrenaments de tarda.',
    created_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

/**
 * An access-audit entry (RAPP-24). Defaults to the VIEW action with no
 * `changes`, which is the entry the screen produces most and the one whose
 * shape matters: a view changed nothing, so recording a diff for it would be a
 * lie the first reader of this table would believe.
 *
 * Note what a `changes` override may carry, and what it may never carry. The
 * values of encrypted columns (document number, phone, address, postal code)
 * are recorded as `{ changed: true }` and never as text, or the audit log
 * becomes a plaintext mirror of exactly the fields ADR-004 encrypts.
 */
export function buildAuditLogEntry(overrides: Partial<AuditLogRow> = {}): AuditLogRow {
  const subject = PARTICIPANT_FIXTURES[0]!;
  const actor = STAFF_FIXTURES.find((person) => person.role === 'staff')!;
  return {
    id: seedUserId(800 + subject.ordinal),
    org_id: SEED_ORGANIZATION_ID,
    actor_id: seedUserId(actor.ordinal),
    action: 'profile.view_sensitive',
    target_type: 'profile',
    target_id: seedUserId(subject.ordinal),
    changes: null,
    created_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

/**
 * A staff invitation for a participant who has an email (RAPP-25). Defaults to
 * PENDING, because that is the state the wizard reads and the staff list has to
 * make actionable; a spent fixture would let the prefill path go untested while
 * still looking like coverage.
 *
 * Addressed to the seeded onboarding account, which has an auth identity and no
 * profile: the exact state a freshly invited woman is in.
 */
export function buildInvite(overrides: Partial<InviteRow> = {}): InviteRow {
  const inviter = STAFF_FIXTURES.find((person) => person.role === 'staff')!;
  return {
    id: seedUserId(600),
    org_id: SEED_ORGANIZATION_ID,
    email: ONBOARDING_ACCOUNT_EMAIL,
    reference_entity: 'Creu Roja Osona',
    referral_id: null,
    invited_by: seedUserId(inviter.ordinal),
    // A fixed instant plus the real window, so an expiry assertion states the
    // relationship rather than a date that rots.
    expires_at: '2026-02-14T09:00:00+00:00',
    accepted_at: null,
    accepted_by: null,
    created_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

/**
 * One equipment handover (RAPP-27). Defaults to boots in a size, which is the
 * row the screen shows most.
 *
 * `delivered_by` is a real staff fixture rather than an invented id, for the
 * reason `buildParticipantNote` gives: the column exists so the log says who
 * actually met her, and a factory that made one up would let a broken
 * attribution look fine in every test.
 */
export function buildEquipmentDelivery(
  overrides: Partial<EquipmentDeliveryRow> = {},
): EquipmentDeliveryRow {
  const subject = PARTICIPANT_FIXTURES[0]!;
  const deliverer = STAFF_FIXTURES.find((person) => person.role === 'staff')!;
  return {
    id: seedUserId(800 + subject.ordinal),
    profile_id: seedUserId(subject.ordinal),
    item: 'boots',
    size: '38',
    delivered_on: FIXTURE_TIMESTAMP.slice(0, 10),
    delivered_by: seedUserId(deliverer.ordinal),
    note: null,
    created_at: FIXTURE_TIMESTAMP,
    mode: 'given',
    unit_code: 'B-0001',
    signature: [
      [
        [10, 20],
        [30, 40],
      ],
    ],
    signature_state: 'signed',
    signature_reason: null,
    statement_language: 'ar',
    ...overrides,
  };
}

export function buildStockAlert(overrides: Partial<StockAlertRow> = {}): StockAlertRow {
  return {
    id: seedUserId(850),
    org_id: SEED_ORGANIZATION_ID,
    item_type_id: seedUserId(851),
    size: 'XL',
    opened_at: FIXTURE_TIMESTAMP,
    resolved_at: null,
    resolved_by: null,
    ...overrides,
  };
}

export function buildStaffInvitation(
  overrides: Partial<StaffInvitationRow> = {},
): StaffInvitationRow {
  return {
    id: seedUserId(6401),
    org_id: SEED_ORGANIZATION_ID,
    profile_id: seedUserId(2),
    email: 'marta.puig@example.test',
    role: 'staff',
    invited_by: seedUserId(1),
    expires_at: '2026-02-14T09:00:00+00:00',
    accepted_at: FIXTURE_TIMESTAMP,
    created_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildInternalDocument(
  overrides: Partial<InternalDocumentRow> = {},
): InternalDocumentRow {
  const id = seedUserId(6402);
  return {
    id,
    org_id: SEED_ORGANIZATION_ID,
    uploaded_by: seedUserId(1),
    object_key: `${SEED_ORGANIZATION_ID}/documents/${id}.pdf`,
    name: 'Assegurança esportiva 2026.pdf',
    content_type: 'application/pdf',
    file_size: 32768,
    created_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

/**
 * A staff choice for one Ramassà field (RAPP-643): the seeded invited woman is
 * asked the transport field even if she answered it.
 */
export function buildCustomQuestionState(
  overrides: Partial<CustomQuestionStateRow> = {},
): CustomQuestionStateRow {
  return {
    profile_id: INVITED_ACCOUNT_ID,
    org_id: SEED_ORGANIZATION_ID,
    question_id: SEED_CUSTOM_QUESTION_ID,
    state: 'ask',
    updated_at: FIXTURE_TIMESTAMP,
    updated_by: null,
    ...overrides,
  };
}

export const SEED_SEASON_ID = '5eed0000-0000-4000-8040-000000000001';
export const SEED_AUTHORIZATION_VERSION_ID = '5eed0000-0000-4000-8041-000000000001';

/** The current season of the seeded organization (RAPP-304). */
export function buildSeason(overrides: Partial<SeasonRow> = {}): SeasonRow {
  return {
    id: SEED_SEASON_ID,
    org_id: SEED_ORGANIZATION_ID,
    name: '2026/27',
    starts_on: '2026-09-01',
    is_current: true,
    created_at: FIXTURE_TIMESTAMP,
    is_test_fixture: false,
    ...overrides,
  };
}

/**
 * A published authorization version with every consent and one section
 * (RAPP-304), in the editable shape (RAPP-614). Pass `season_id: null,
 * version_number: null, published_at: null` for a draft.
 */
export function buildAuthorizationVersion(
  overrides: Partial<AuthorizationVersionRow> = {},
): AuthorizationVersionRow {
  const label = (text: string) => ({ ca: text });
  return {
    id: SEED_AUTHORIZATION_VERSION_ID,
    org_id: SEED_ORGANIZATION_ID,
    season_id: SEED_SEASON_ID,
    version_number: 1,
    content: {
      title: label('Autorització 2026/27'),
      sections: [{ key: 'participation', title: label('Participació'), body: label('Text.') }],
      consents: {
        participation: { required: true, position: 0, label: label('Participo.') },
        data_processing: { required: true, position: 1, label: label('Dades.') },
        code_of_conduct: { required: true, position: 2, label: label('Codi.') },
        health_data: { required: true, position: 3, label: label('Salut.') },
        image_rights: { required: false, position: 4, label: label('Imatge.') },
        newsletter: { required: false, position: 5, label: label('Butlletí.') },
        messaging_groups: { required: false, position: 6, label: label('Grups.') },
      },
      // Both questions asked with the RAPP-304 flags, no wording override (RAPP-614).
      questions: {
        health: { asked: true, required: true, privacy: 'health', texts: {} },
        emergency_contact: { asked: true, required: false, privacy: 'personal', texts: {} },
      },
      texts: {},
      attachments: [],
    },
    published_at: FIXTURE_TIMESTAMP,
    published_by: null,
    updated_at: FIXTURE_TIMESTAMP,
    updated_by: null,
    is_correction: false,
    ...overrides,
  };
}

/**
 * A published app terms version (RAPP-613). Every organization starts with
 * version 1, the bundled text; pass `version_number: null, published_at: null`
 * for a draft.
 */
export function buildAppTermsVersion(
  overrides: Partial<AppTermsVersionRow> = {},
): AppTermsVersionRow {
  const text = (value: string) => ({ ca: value });
  return {
    id: SEED_APP_TERMS_VERSION_ID,
    org_id: SEED_ORGANIZATION_ID,
    version_number: 1,
    content: {
      title: text('Termes i condicions de l’app'),
      body: text('Text dels termes.'),
      intro_title: text('Abans d’acceptar els termes'),
      intro: text('A la pantalla següent podràs llegir els termes.'),
      points: [{ title: text('Per què t’ho demanem'), body: text('Per organitzar l’activitat.') }],
      accept_label: text('He llegit i accepto els termes'),
      media_label: text('Accepto sortir a fotos (opcional)'),
      media_hint: text('Pots canviar-ho quan vulguis.'),
    },
    published_at: FIXTURE_TIMESTAMP,
    published_by: null,
    updated_at: FIXTURE_TIMESTAMP,
    updated_by: null,
    is_correction: false,
    ...overrides,
  };
}

/** A paper record for the season, the state most seeded players are in (RAPP-304). */
export function buildAuthorizationSignature(
  overrides: Partial<AuthorizationSignatureRow> = {},
): AuthorizationSignatureRow {
  return {
    id: '5eed0000-0000-4000-8042-000000000099',
    org_id: SEED_ORGANIZATION_ID,
    profile_id:
      PARTICIPANT_FIXTURES[1] === undefined ? '' : seedUserId(PARTICIPANT_FIXTURES[1].ordinal),
    season_id: SEED_SEASON_ID,
    version_id: null,
    is_test_fixture: false,
    method: 'paper',
    language: null,
    device: null,
    signed_at: FIXTURE_TIMESTAMP,
    signature: null,
    unable_to_draw: false,
    paper_signed_on: '2026-09-15',
    recorded_by: null,
    witnessed_by: null,
    ...overrides,
  };
}

const SEED_STAFF_CONSENT_ID = '5eed0000-0000-4000-8099-000000000001';

/** One consent given while signing (RAPP-304), on the seeded version (RAPP-699). */
export function buildConsentEvent(overrides: Partial<ConsentEventRow> = {}): ConsentEventRow {
  return {
    id: 1,
    org_id: SEED_ORGANIZATION_ID,
    profile_id: seedUserId(PARTICIPANT_FIXTURES[0]!.ordinal),
    signature_id: '5eed0000-0000-4000-8042-000000000011',
    consent_id: SEED_STAFF_CONSENT_ID,
    consent_key: 'participation',
    granted: true,
    method: 'app',
    decided_at: FIXTURE_TIMESTAMP,
    // The version and the words she was shown (RAPP-614).
    version_id: SEED_AUTHORIZATION_VERSION_ID,
    form: 'authorization',
    screen_key: null,
    language: 'ca',
    wording: 'Participo.',
    required: true,
    recorded_by: null,
    reason: null,
    custom_form_id: null,
    ...overrides,
  };
}

/** The consent the team added in the seeds (RAPP-699): Dades legals' catalogue. */
export function buildConsent(overrides: Partial<ConsentRow> = {}): ConsentRow {
  return {
    id: SEED_STAFF_CONSENT_ID,
    org_id: SEED_ORGANIZATION_ID,
    key: 'fotos_de_partit',
    system_key: null,
    name: { ca: 'Fotos de partit' },
    body: { ca: "Accepto que l'equip comparteixi fotos dels partits al grup de l'equip." },
    is_archived: false,
    created_by: seedUserId(1),
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

/** Where the seeded consent is asked: the archived Onboarding screen (RAPP-699). */
export function buildConsentPlacement(
  overrides: Partial<ConsentPlacementRow> = {},
): ConsentPlacementRow {
  return {
    id: '5eed0000-0000-4000-8099-000000000002',
    org_id: SEED_ORGANIZATION_ID,
    consent_id: SEED_STAFF_CONSENT_ID,
    surface: 'onboarding',
    screen_key: '5eed0000-0000-4000-8090-000000000001',
    sort_order: 1,
    required: false,
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    custom_form_id: null,
    ...overrides,
  };
}

/** The walk-in Salma's tick of the seeded consent on the tablet (RAPP-699). */
export function buildWalkInConsent(overrides: Partial<WalkInConsentRow> = {}): WalkInConsentRow {
  return {
    id: '5eed0000-0000-4000-8099-000000000003',
    walk_in_id: '5eed0000-0000-4000-8043-000000000001',
    org_id: SEED_ORGANIZATION_ID,
    consent_id: SEED_STAFF_CONSENT_ID,
    consent_key: 'fotos_de_partit',
    granted: true,
    required: false,
    screen_key: '5eed0000-0000-4000-8090-000000000001',
    wording: 'أوافق على أن يشارك الفريق صور المباريات في مجموعة الفريق.',
    language: 'ar',
    decided_at: FIXTURE_TIMESTAMP,
    recorded_by: seedUserId(2),
    ...overrides,
  };
}

export type WalkInSigningRow = Database['public']['Tables']['walk_in_signings']['Row'];

/**
 * A woman who signed on a staff tablet with no account yet (RAPP-305). She waits
 * for review; her signing is encrypted in the database, so the factory holds no
 * payload.
 */
export function buildWalkInSigning(overrides: Partial<WalkInSigningRow> = {}): WalkInSigningRow {
  return {
    id: '5eed0000-0000-4000-8043-000000000001',
    org_id: SEED_ORGANIZATION_ID,
    first_name: 'Salma',
    last_name: 'Idrissi',
    version_id: SEED_AUTHORIZATION_VERSION_ID,
    payload: null,
    signed_at: FIXTURE_TIMESTAMP,
    // The seeded staff member who held the tablet.
    collected_by: seedUserId(2),
    status: 'pending',
    resolved_profile_id: null,
    resolved_by: null,
    resolved_at: null,
    created_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export type FormBlockRow = Database['public']['Tables']['form_blocks']['Row'];
export type FormSignatureRow = Database['public']['Tables']['form_signatures']['Row'];
export type WalkInFormSignatureRow = Database['public']['Tables']['walk_in_form_signatures']['Row'];

const SEED_SIGNATURE_BLOCK_ID = '5eed0000-0000-4000-8090-000000000002';
const SEED_SIGNATURE_SCREEN_ID = '5eed0000-0000-4000-8090-000000000001';
const SEED_STROKES = [
  [
    [120, 620],
    [200, 480],
    [290, 560],
  ],
];

/** A signature block on the seeded archived Onboarding screen (RAPP-690). */
export function buildFormBlock(overrides: Partial<FormBlockRow> = {}): FormBlockRow {
  return {
    id: SEED_SIGNATURE_BLOCK_ID,
    org_id: SEED_ORGANIZATION_ID,
    surface: 'onboarding',
    screen_key: SEED_SIGNATURE_SCREEN_ID,
    kind: 'signature',
    body: { ca: 'Accepto les normes de convivència.' },
    sort_order: 0,
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    custom_form_id: null,
    ...overrides,
  };
}

/** Amina's signature of the seeded block, on her phone (RAPP-690). */
export function buildFormSignature(overrides: Partial<FormSignatureRow> = {}): FormSignatureRow {
  return {
    id: '5eed0000-0000-4000-8090-000000000003',
    org_id: SEED_ORGANIZATION_ID,
    profile_id: seedUserId(11),
    referral_id: null,
    surface: 'wizard',
    block_id: SEED_SIGNATURE_BLOCK_ID,
    screen_key: SEED_SIGNATURE_SCREEN_ID,
    body: 'Accepto les normes de convivència.',
    language: 'ca',
    signer_kind: 'player',
    signer_user_id: seedUserId(11),
    signer_name: 'Amina Al-Hassan',
    strokes: SEED_STROKES,
    signed_at: FIXTURE_TIMESTAMP,
    signed_on_tablet: false,
    witnessed_by: null,
    custom_form_id: null,
    ...overrides,
  };
}

/** The walk-in's pending tablet signature of the seeded block (RAPP-691). */
export function buildWalkInFormSignature(
  overrides: Partial<WalkInFormSignatureRow> = {},
): WalkInFormSignatureRow {
  return {
    id: '5eed0000-0000-4000-8090-000000000004',
    walk_in_id: '5eed0000-0000-4000-8043-000000000001',
    org_id: SEED_ORGANIZATION_ID,
    block_id: SEED_SIGNATURE_BLOCK_ID,
    screen_key: SEED_SIGNATURE_SCREEN_ID,
    body: 'Accepto les normes de convivència.',
    language: 'ca',
    strokes: SEED_STROKES,
    signed_at: FIXTURE_TIMESTAMP,
    witnessed_by: seedUserId(2),
    ...overrides,
  };
}

type PublicRow<Name extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][Name]['Row'];
export type IntakeScreenRow = PublicRow<'intake_screens'>;
export type ProfileSectionRow = PublicRow<'profile_sections'>;
export type ProfileFieldRow = PublicRow<'profile_fields'>;
export type FieldPlacementRow = PublicRow<'field_placements'>;
export type CustomQuestionOptionRow = PublicRow<'custom_question_options'>;
export type CustomAnswerRow = PublicRow<'custom_answers'>;
export type ReferralCustomAnswerRow = PublicRow<'referral_custom_answers'>;
export type IntakeStatePresetRow = PublicRow<'intake_state_presets'>;

export const SEED_INTAKE_SCREEN_ID = '5eed0000-0000-4000-8044-000000000001';
export const SEED_CUSTOM_QUESTION_ID = '5eed0000-0000-4000-8045-000000000001';
const NO_SEASON_KEY = '00000000-0000-0000-0000-000000000000';

/** The seeded "Transport" screen, after the logistics step (RAPP-307). */
export function buildIntakeScreen(overrides: Partial<IntakeScreenRow> = {}): IntakeScreenRow {
  return {
    id: SEED_INTAKE_SCREEN_ID,
    org_id: SEED_ORGANIZATION_ID,
    title: { ca: 'Com arribes als entrenaments' },
    intro: null,
    after_screen: 'logistics',
    sort_order: 0,
    // Where staff placed it in the question builder (RAPP-612): the flow reset restores it.
    home_after_screen: overrides.after_screen ?? 'logistics',
    home_sort_order: overrides.sort_order ?? 0,
    is_archived: false,
    is_hidden: false,
    show_when_field_id: null,
    show_when_values: null,
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export const SEED_SUPPORT_SECTION_KEY = 'support';

/** A section of the profile layout (RAPP-649): the seeded organization's Support. */
export function buildProfileSection(overrides: Partial<ProfileSectionRow> = {}): ProfileSectionRow {
  return {
    id: '5eed0000-0000-4000-8047-000000000007',
    org_id: SEED_ORGANIZATION_ID,
    key: SEED_SUPPORT_SECTION_KEY,
    title: { ca: 'Suport', es: 'Apoyo', en: 'Support' },
    sort_order: 6,
    is_builtin: true,
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

/** The seeded transport field (RAPP-649): the first seeded question, same id. */
export function buildProfileField(overrides: Partial<ProfileFieldRow> = {}): ProfileFieldRow {
  return {
    id: SEED_CUSTOM_QUESTION_ID,
    org_id: SEED_ORGANIZATION_ID,
    section_id: '5eed0000-0000-4000-8047-000000000007',
    kind: 'custom',
    system_key: null,
    question_type: 'yes_no_maybe',
    label: { ca: 'Vens amb transport públic?' },
    help: null,
    privacy: 'normal',
    // Most fields need no permission on top of their level (RAPP-698).
    read_permission: null,
    default_required: false,
    settings: {},
    show_when_field_id: null,
    show_when_option_id: null,
    sort_order: 100,
    created_by: null,
    is_archived: false,
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

/**
 * A field of any type with its settings (RAPP-610), for tests that need a
 * number, a date, a list, a consent, a file or a signature.
 */
export function buildTypedProfileField(
  type: ProfileFieldRow['question_type'],
  settings: ProfileFieldRow['settings'],
  overrides: Partial<ProfileFieldRow> = {},
): ProfileFieldRow {
  return buildProfileField({ question_type: type, settings, ...overrides });
}

/** The transport field on its onboarding screen (RAPP-649). */
export function buildFieldPlacement(overrides: Partial<FieldPlacementRow> = {}): FieldPlacementRow {
  return {
    id: '5eed0000-0000-4000-8048-000000000001',
    org_id: SEED_ORGANIZATION_ID,
    field_id: SEED_CUSTOM_QUESTION_ID,
    surface: 'onboarding',
    screen_key: SEED_INTAKE_SCREEN_ID,
    shared_screen: null,
    sort_order: 0,
    required: false,
    label_override: null,
    help_override: null,
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    custom_form_id: null,
    ...overrides,
  };
}

export function buildCustomQuestionOption(
  overrides: Partial<CustomQuestionOptionRow> = {},
): CustomQuestionOptionRow {
  return {
    id: '5eed0000-0000-4000-8046-000000000001',
    org_id: SEED_ORGANIZATION_ID,
    question_id: '5eed0000-0000-4000-8045-000000000002',
    key: null,
    label: { ca: 'Una entitat' },
    sort_order: 0,
    is_archived: false,
    ...overrides,
  };
}

/** Her answer to a question with no season; a Sensitive one would be encrypted. */
export function buildCustomAnswer(overrides: Partial<CustomAnswerRow> = {}): CustomAnswerRow {
  return {
    profile_id: seedUserId(11),
    question_id: SEED_CUSTOM_QUESTION_ID,
    season_key: NO_SEASON_KEY,
    season_id: null,
    org_id: SEED_ORGANIZATION_ID,
    value: 'yes',
    value_encrypted: null,
    source: 'player',
    answered_by: null,
    answered_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

/** What an entity answered with a referral, always encrypted (no plain value here). */
export function buildReferralCustomAnswer(
  overrides: Partial<ReferralCustomAnswerRow> = {},
): ReferralCustomAnswerRow {
  return {
    referral_id: '5eed0000-0000-4000-8010-000000000001',
    question_id: SEED_CUSTOM_QUESTION_ID,
    org_id: SEED_ORGANIZATION_ID,
    value_encrypted: '',
    created_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export type IntakeBuiltinScreenRow = PublicRow<'intake_builtin_screens'>;
export type IntakeFlowOrderRow = PublicRow<'intake_flow_orders'>;

/** The seeded help line on the summary screen (RAPP-612). */
export function buildIntakeBuiltinScreen(
  overrides: Partial<IntakeBuiltinScreenRow> = {},
): IntakeBuiltinScreenRow {
  return {
    org_id: SEED_ORGANIZATION_ID,
    screen: 'summary',
    texts: { help: { ca: "Pots canviar qualsevol resposta abans d'acceptar els termes." } },
    is_hidden: false,
    updated_at: FIXTURE_TIMESTAMP,
    updated_by: null,
    ...overrides,
  };
}

export type CustomFormRow = PublicRow<'custom_forms'>;

/** The seeded form for every player, published (RAPP-700, RAPP-701). */
export function buildCustomForm(overrides: Partial<CustomFormRow> = {}): CustomFormRow {
  return {
    id: '5eed0000-0000-4000-8100-000000000001',
    org_id: SEED_ORGANIZATION_ID,
    name: {
      ca: 'Com véns als entrenaments',
      es: 'Cómo vienes a los entrenamientos',
      en: 'How you get to training',
    },
    filled_by: 'player',
    mandatory: 'optional',
    deadline: null,
    audience: 'all',
    repeats_each_season: false,
    version: 1,
    published_at: '2026-10-01T08:00:00.000Z',
    is_archived: false,
    created_by: seedUserId(2),
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export type CustomFormScreenRow = PublicRow<'custom_form_screens'>;

/** The seeded form's one screen (RAPP-700). */
export function buildCustomFormScreen(
  overrides: Partial<CustomFormScreenRow> = {},
): CustomFormScreenRow {
  return {
    id: '5eed0000-0000-4000-8101-000000000001',
    org_id: SEED_ORGANIZATION_ID,
    form_id: buildCustomForm().id,
    title: { ca: 'Transport', es: 'Transporte', en: 'Transport' },
    intro: null,
    sort_order: 0,
    is_archived: false,
    is_hidden: false,
    show_when_field_id: null,
    show_when_values: null,
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export type CustomFormResponseRow = PublicRow<'custom_form_responses'>;

/** Fàtima's pending ask of the seeded form (RAPP-700). */
export function buildCustomFormResponse(
  overrides: Partial<CustomFormResponseRow> = {},
): CustomFormResponseRow {
  return {
    id: '5eed0000-0000-4000-8102-000000000002',
    org_id: SEED_ORGANIZATION_ID,
    form_id: buildCustomForm().id,
    version: 1,
    profile_id: seedUserId(12),
    season_id: null,
    status: 'pending',
    asked_at: '2026-10-01T08:00:00.000Z',
    answered_at: null,
    answered_by: null,
    filled_by: null,
    ...overrides,
  };
}

/** The seeded flow: the app's own order with the staff screens after equipment (RAPP-612). */
export function buildIntakeFlowOrder(
  overrides: Partial<IntakeFlowOrderRow> = {},
): IntakeFlowOrderRow {
  return {
    org_id: SEED_ORGANIZATION_ID,
    step_order: [
      'identity',
      'background',
      'documentation',
      'logistics',
      'equipment',
      `custom:${SEED_INTAKE_SCREEN_ID}`,
      'custom:5eed0000-0000-4000-8044-000000000002',
      'custom:5eed0000-0000-4000-8044-000000000003',
      'season',
      'supporting-entities',
      'participation-support',
      'specific-needs',
    ],
    updated_at: FIXTURE_TIMESTAMP,
    updated_by: null,
    ...overrides,
  };
}

export function buildIntakeStatePreset(
  overrides: Partial<IntakeStatePresetRow> = {},
): IntakeStatePresetRow {
  return {
    id: '5eed0000-0000-4000-8047-000000000001',
    org_id: SEED_ORGANIZATION_ID,
    name: 'Només talles',
    states: { clothing_size: 'ask', shoe_size: 'ask' },
    created_at: FIXTURE_TIMESTAMP,
    created_by: null,
    ...overrides,
  };
}

/** Synthetic app-terms signing stays independent of season signing fixtures. */
export function buildAppTermsSignature(
  overrides: Partial<AppTermsSignatureRow> = {},
): AppTermsSignatureRow {
  const acceptance = buildTermsAcceptance();
  return {
    acceptance_id: acceptance.id,
    profile_id: acceptance.profile_id,
    org_id: SEED_ORGANIZATION_ID,
    signature: [
      [
        [100, 200],
        [300, 400],
      ],
    ],
    unable_to_draw: false,
    media_consent: false,
    device: 'synthetic-seed',
    ...overrides,
  };
}
