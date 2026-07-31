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

import type { Database } from '../types/database';
import {
  PARTICIPANT_FIXTURES,
  SEED_ORGANIZATION_ID,
  SEED_ORGANIZATION_SLUG,
  SEED_TERMS_VERSION,
  seedUserId,
  type PersonFixture,
} from './fixtures';

export type OrganizationRow = Database['public']['Tables']['organizations']['Row'];
export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type PushTokenRow = Database['public']['Tables']['push_tokens']['Row'];
export type TermsAcceptanceRow = Database['public']['Tables']['terms_acceptances']['Row'];
export type DeletionRequestRow = Database['public']['Tables']['deletion_requests']['Row'];

/** One fixed instant for every timestamp, so factory output is byte-stable. */
const FIXTURE_TIMESTAMP = '2026-01-15T09:00:00+00:00';

const POSTAL_CODES_BY_CITY: Readonly<Record<string, string>> = {
  Vic: '08500',
  Manlleu: '08560',
  Torelló: '08570',
  'Roda de Ter': '08510',
};

const CLOTHING_SIZES = ['S', 'M', 'L', 'XL'] as const;

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
  const hasDependents = ordinal % 3 === 0;
  const referral = REFERRING_ENTITIES[ordinal % REFERRING_ENTITIES.length]!;

  return {
    date_of_birth: `${1985 + (ordinal % 15)}-${pad(1 + (ordinal % 12), 2)}-${pad(1 + (ordinal % 28), 2)}`,
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
    first_name: fixture.firstName,
    last_name: fixture.lastName,
    nationality: fixture.nationality,
    city: fixture.city,
    preferred_language: fixture.preferredLanguage,
    avatar_url: null,
    place_of_birth: null,
    // Media consent defaults to NOT granted, which is the only defensible
    // default for an optional, revocable consent: a fixture that granted it by
    // default would let a test pass while the app quietly assumed permission
    // to publish a participant's photo.
    media_consent_at: null,
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
