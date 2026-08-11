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
 * 3. **Encrypted columns carry PLAINTEXT here.** `phone`, `address`,
 *    `postal_code`, and `document_number` are `bytea` in the database
 *    (ADR-004), but a factory models the object app code handles once it is
 *    past `decrypt_field`. A ciphertext blob would make a redaction test or a
 *    rendering test prove nothing.
 *
 * The identity fields come from `fixtures.ts`, which `supabase/seed.sql`
 * mirrors; the derived filler below is generated from the same ordinal on both
 * sides, so a factory-built participant and the seeded row agree.
 */

import {
  serializeServiceCategoryMetadataSchema,
  SERVICE_CATEGORY_DEFINITIONS,
} from '../services/definitions';
import type { Database, Json } from '../types/database';
import {
  ONBOARDING_ACCOUNT_EMAIL,
  PARTICIPANT_FIXTURES,
  SEED_ORGANIZATION_ID,
  SEED_ORGANIZATION_SLUG,
  SEED_TERMS_VERSION,
  seedUserId,
  STAFF_FIXTURES,
  type PersonFixture,
} from './fixtures';

export type OrganizationRow = Database['public']['Tables']['organizations']['Row'];
export type AnnouncementRow = Database['public']['Tables']['announcements']['Row'];
export type AttendanceRow = Database['public']['Tables']['attendance']['Row'];
export type EventCategoryRow = Database['public']['Tables']['event_categories']['Row'];
export type EventRow = Database['public']['Tables']['events']['Row'];
export type EventOccurrenceRow = Database['public']['Tables']['event_occurrences']['Row'];
export type EventSignupRow = Database['public']['Tables']['event_signups']['Row'];
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
export type TermsAcceptanceRow = Database['public']['Tables']['terms_acceptances']['Row'];
export type DeletionRequestRow = Database['public']['Tables']['deletion_requests']['Row'];
export type ParticipantNoteRow = Database['public']['Tables']['participant_notes']['Row'];
export type EquipmentDeliveryRow = Database['public']['Tables']['equipment_deliveries']['Row'];
export type AuditLogRow = Database['public']['Tables']['audit_log']['Row'];
export type InviteRow = Database['public']['Tables']['invites']['Row'];
export type ServiceCategoryRow = Database['public']['Tables']['service_categories']['Row'];
export type ServiceRow = Database['public']['Tables']['services']['Row'];
export type ServiceImageRow = Database['public']['Tables']['service_images']['Row'];
export type ServiceInterestRow = Database['public']['Tables']['service_interests']['Row'];

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
 * The filler fields, derived from the ordinal exactly as `supabase/seed.sql`
 * derives them. Deriving beats listing: twenty rows of hand-written sizes and
 * postal codes would be noise to read and a second place to update.
 */
function derivedProfileFields(fixture: PersonFixture) {
  const { ordinal } = fixture;
  const hasNoDocument = ordinal % 5 === 0;
  const hasNoPlaceOfBirth = ordinal % 11 === 0;
  const hasDependents = ordinal % 3 === 0;
  const referral = REFERRING_ENTITIES[ordinal % REFERRING_ENTITIES.length]!;

  return {
    date_of_birth: `${1985 + (ordinal % 15)}-${pad(1 + (ordinal % 12), 2)}-${pad(1 + (ordinal % 28), 2)}`,
    // Two participants keep a NULL birthplace, as the seed leaves them: a
    // profile created before the field was required carries one, and staff have
    // to supply it before they can save anything else about her.
    place_of_birth: hasNoPlaceOfBirth
      ? null
      : (PLACES_OF_BIRTH_BY_NATIONALITY[fixture.nationality] ?? 'Vic'),
    phone: `+346${pad(ordinal, 8)}`,
    address: `Carrer de Prova, ${ordinal}`,
    postal_code: POSTAL_CODES_BY_CITY[fixture.city] ?? '08500',
    document_type: hasNoDocument ? 'none' : 'nie',
    document_number: hasNoDocument ? null : `Y${pad(ordinal, 7)}Z`,
    reference_entity: referral.entity,
    reference_contact_name: referral.contact,
    has_dependents: hasDependents,
    num_dependents: hasDependents ? 1 + (ordinal % 4) : 0,
    clothing_size: CLOTHING_SIZES[ordinal % CLOTHING_SIZES.length]!,
    shoe_size: String(36 + (ordinal % 6)),
    // A handful of accounts are deliberately imperfect: the app has to cope with
    // a participant who never accepted the terms, one who was deactivated, and
    // one banned from the forum. A uniformly happy dataset hides those screens.
    terms_accepted_at: ordinal % 7 === 0 ? null : FIXTURE_TIMESTAMP,
    is_active: ordinal % 13 !== 0,
    is_forum_banned: ordinal % 17 === 0,
    // Derived from the ADDRESS, exactly as `supabase/seed.sql` derives it: an
    // unroutable address IS an admin-created account, because the only reason
    // to generate one is that she has no inbox. One fact, two derivations, no
    // way for them to disagree (RAPP-25).
    auth_method: fixture.email.endsWith('@ramassa.invalid') ? 'admin_created' : 'magic_link',
  };
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
    contact_email: 'contacte@example.test',
    contact_phone: '+34600000000',
    created_at: FIXTURE_TIMESTAMP,
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
    // Postgres GENERATES this from the searchable fields (RAPP-23), so a
    // fixture cannot meaningfully supply one: null stands for "whatever the
    // database will derive", and no test should assert on it.
    search_document: null,
    first_name: fixture.firstName,
    last_name: fixture.lastName,
    nationality: fixture.nationality,
    city: fixture.city,
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
    ...derivedProfileFields(fixture),
    ...overrides,
  };
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
    ...overrides,
  };
}
