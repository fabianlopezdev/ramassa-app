/**
 * The wizard's intake seeding (RAPP-300): what staff or a partner entity
 * already answered, turned into the draft each screen edits, and into the
 * stored payload the terms step compares against so only new or changed
 * answers are sent.
 *
 * Only ANSWERED questions are seeded. A column default (no dependants,
 * Catalan) or a value nobody chose stays out of the draft, so the screen asks
 * it.
 */
import type { Href } from 'expo-router';
import type { IntakeQuestion, WizardScreen } from '@ramassa/shared/intake';
import type { OnboardingDraft, OnboardingStepName } from '@ramassa/shared/onboarding-drafts';
import type { ProfileRow } from '@ramassa/shared/schemas';

export const WIZARD_SCREEN_ROUTES: Readonly<Record<WizardScreen, Href>> = {
  identity: '/onboarding',
  background: '/onboarding/background',
  documentation: '/onboarding/documentation',
  logistics: '/onboarding/logistics',
  summary: '/onboarding/summary',
  terms: '/onboarding/terms',
};

export const WIZARD_SCREEN_DRAFT_STEP: Readonly<Record<WizardScreen, OnboardingStepName>> = {
  identity: 'identity',
  background: 'background',
  documentation: 'documentation',
  logistics: 'logistics',
  summary: 'summary',
  terms: 'terms',
};

type DraftSections = Required<Pick<OnboardingDraft, 'identity' | 'documentation' | 'logistics'>>;

/** The answered part of her profile, in the shape each screen's form edits. */
export function seedDraftFromProfile(
  profile: ProfileRow,
  answered: ReadonlySet<IntakeQuestion>,
): DraftSections {
  const identity: Record<string, unknown> = {};
  const documentation: Record<string, unknown> = {};
  const logistics: Record<string, unknown> = {};
  const has = (question: IntakeQuestion) => answered.has(question);

  if (has('first_name')) identity.firstName = profile.first_name;
  if (has('last_name')) identity.lastName = profile.last_name;
  if (has('date_of_birth') && profile.date_of_birth !== null) {
    const [year = '', month = '', day = ''] = profile.date_of_birth.split('-');
    identity.day = String(Number(day));
    identity.month = String(Number(month));
    identity.year = year;
  }
  if (has('place_of_birth') && profile.place_of_birth !== null) {
    identity.placeOfBirth = profile.place_of_birth;
  }
  if (has('nationality') && profile.nationality !== null) {
    identity.nationality = profile.nationality;
  }
  if (has('preferred_language')) identity.preferredLanguage = profile.preferred_language;

  if (has('document') && profile.document_type !== null) {
    documentation.documentType = profile.document_type;
    if (profile.document_number !== null) documentation.documentNumber = profile.document_number;
  }

  if (has('phone') && profile.phone !== null) logistics.phone = profile.phone;
  if (has('address') && profile.address !== null) logistics.address = profile.address;
  if (has('city') && profile.city !== null) logistics.city = profile.city;
  if (has('postal_code') && profile.postal_code !== null)
    logistics.postalCode = profile.postal_code;
  if (has('reference_entity')) logistics.referenceEntity = profile.reference_entity;
  if (has('reference_contact_name') && profile.reference_contact_name !== null) {
    logistics.referenceContactName = profile.reference_contact_name;
  }
  if (has('dependents')) {
    logistics.hasDependents = profile.has_dependents;
    logistics.numDependents = String(profile.num_dependents);
  }
  if (has('clothing_size') && profile.clothing_size !== null) {
    logistics.clothingSize = profile.clothing_size;
  }
  if (has('shoe_size') && profile.shoe_size !== null) logistics.shoeSize = profile.shoe_size;

  return { identity, documentation, logistics };
}

/** Her stored profile under the `complete_onboarding` payload keys. */
export function storedPayloadFromProfile(profile: ProfileRow): Record<string, unknown> {
  return {
    first_name: profile.first_name,
    last_name: profile.last_name,
    date_of_birth: profile.date_of_birth,
    place_of_birth: profile.place_of_birth,
    nationality: profile.nationality,
    preferred_language: profile.preferred_language,
    document_type: profile.document_type,
    document_number: profile.document_number,
    phone: profile.phone,
    address: profile.address,
    city: profile.city,
    postal_code: profile.postal_code,
    reference_entity: profile.reference_entity,
    reference_contact_name: profile.reference_contact_name,
    has_dependents: profile.has_dependents,
    num_dependents: profile.num_dependents,
    clothing_size: profile.clothing_size,
    shoe_size: profile.shoe_size,
    media_consent: profile.media_consent,
  };
}
