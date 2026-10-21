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
import {
  customStepId,
  isCustomStep,
  type CustomWizardScreen,
  type IntakeQuestion,
  type WizardScreen,
  type WizardStepKey,
} from '@ramassa/shared/intake';
import {
  customAnswerError,
  isEmptyAnswer,
  isScreenAnswered,
  type CustomAnswers,
  type CustomAnswerValue,
  type IntakeScreen,
} from '@ramassa/shared/intake-builder';
import type {
  OnboardingDraft,
  OnboardingDraftStep,
  OnboardingStepName,
} from '@ramassa/shared/onboarding-drafts';
import type { LanguageCode, ProfileRow } from '@ramassa/shared/schemas';

export const WIZARD_SCREEN_ROUTES = {
  identity: '/onboarding',
  background: '/onboarding/background',
  documentation: '/onboarding/documentation',
  logistics: '/onboarding/logistics',
  equipment: '/onboarding/equipment',
  season: '/onboarding/season',
  'supporting-entities': '/onboarding/supporting-entities',
  'participation-support': '/onboarding/participation-support',
  'specific-needs': '/onboarding/specific-needs',
  summary: '/onboarding/summary',
  'terms-intro': '/onboarding/terms-intro',
  terms: '/onboarding/terms',
} as const satisfies Readonly<Record<WizardScreen, Href>>;

const WIZARD_SCREEN_DRAFT_STEP: Readonly<Record<WizardScreen, OnboardingStepName>> = {
  identity: 'identity',
  background: 'background',
  documentation: 'documentation',
  logistics: 'logistics',
  equipment: 'equipment',
  season: 'season',
  'supporting-entities': 'supporting-entities',
  'participation-support': 'participation-support',
  'specific-needs': 'specific-needs',
  summary: 'summary',
  'terms-intro': 'terms-intro',
  terms: 'terms',
};

/** The route of any wizard step, a staff screen included (RAPP-307). */
export function wizardStepRoute(
  step: WizardStepKey | OnboardingDraftStep,
  direction: 'forward' | 'back' = 'forward',
): Href {
  if (step.startsWith('needs-detail:'))
    return `/onboarding/specific-needs-details/${step.slice('needs-detail:'.length)}${direction === 'back' ? '?entrance=none' : ''}` as Href;
  if (step === 'applicant-status-details')
    return `/onboarding/applicant-status-details${direction === 'back' ? '?entrance=none' : ''}` as Href;
  if (step === 'documentation-details')
    return `/onboarding/documentation-details${direction === 'back' ? '?entrance=none' : ''}` as Href;
  const screenId = customStepId(step);
  const route =
    screenId === null
      ? WIZARD_SCREEN_ROUTES[step as WizardScreen]
      : `/onboarding/custom/${screenId}`;
  return (direction === 'back' ? `${route}?entrance=none` : route) as Href;
}

/** The draft step that resumes at a wizard step: a staff screen keeps its own key. */
export function wizardDraftStep(step: WizardStepKey | OnboardingDraftStep): OnboardingDraftStep {
  if (
    step === 'documentation-details' ||
    step === 'applicant-status-details' ||
    step.startsWith('needs-detail:')
  )
    return step as OnboardingDraftStep;
  return isCustomStep(step) ? step : WIZARD_SCREEN_DRAFT_STEP[step as WizardScreen];
}

/** The staff screens in the shape the wizard planner takes (RAPP-307). */
export function customWizardPlan(
  screens: readonly IntakeScreen[],
  stored: CustomAnswers,
): CustomWizardScreen[] {
  return screens.map((screen) => ({
    id: screen.id,
    afterScreen: screen.afterScreen,
    isAnswered: isScreenAnswered(screen, stored),
  }));
}

/** Her answers as the wizard shows them: the stored ones, with her draft on top. */
export function mergedCustomAnswers(
  stored: CustomAnswers,
  draft: Readonly<Record<string, CustomAnswerValue>> | undefined,
): CustomAnswers {
  return { ...stored, ...draft };
}

function sameAnswer(a: CustomAnswerValue | undefined, b: CustomAnswerValue | undefined): boolean {
  if (isEmptyAnswer(a) || isEmptyAnswer(b)) return isEmptyAnswer(a) && isEmptyAnswer(b);
  if (typeof a === 'string' || typeof b === 'string') {
    return typeof a === 'string' && typeof b === 'string' && a.trim() === b.trim();
  }
  return [...(a ?? [])].sort().join('\n') === [...(b ?? [])].sort().join('\n');
}

/**
 * The staff answers to send (RAPP-307), as the built-in ones (RAPP-300): only
 * what she gave or changed, so an answer staff or her entity gave and she only
 * confirmed keeps its source. An answer she emptied is sent as null, which
 * removes it. A question no longer on her screens, or a value the server would
 * refuse (a kept archived option), is left out.
 */
export function customAnswersToSave(
  screens: readonly IntakeScreen[],
  draft: Readonly<Record<string, CustomAnswerValue>> | undefined,
  stored: CustomAnswers,
): Record<string, CustomAnswerValue | null> {
  const toSave: Record<string, CustomAnswerValue | null> = {};
  for (const question of screens.flatMap((screen) => screen.questions)) {
    const value = draft?.[question.id];
    if (value === undefined || sameAnswer(value, stored[question.id])) continue;
    if (isEmptyAnswer(value)) {
      if (stored[question.id] !== undefined) toSave[question.id] = null;
      continue;
    }
    if (customAnswerError(question, value) === null) toSave[question.id] = value;
  }
  return toSave;
}

type DraftSections = Required<
  Pick<OnboardingDraft, 'identity' | 'documentation' | 'logistics' | 'season'>
>;

/** The answered part of her profile, in the shape each screen's form edits. */
export function seedDraftFromProfile(
  profile: ProfileRow,
  answered: ReadonlySet<IntakeQuestion>,
): DraftSections {
  const identity: Record<string, unknown> = {};
  const documentation: Record<string, unknown> = {};
  const logistics: Record<string, unknown> = {};
  const season: Record<string, unknown> = {};
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
    documentation.documentName = profile.document_name ?? undefined;
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

  // The registration questions (RAPP-306).
  if (has('applicant_status') && profile.applicant_status != null) {
    season.applicantStatus = profile.applicant_status;
    if (profile.applicant_status === 'other')
      season.applicantStatusDetails = profile.applicant_status_details ?? undefined;
  }
  if (has('supporting_entities') && profile.supporting_entities != null) {
    season.supportingEntities = profile.supporting_entities;
  }
  if (has('childcare_need') && profile.childcare_need != null) {
    season.childcareNeed = profile.childcare_need;
  }
  if (has('specific_needs') && profile.specific_needs != null) {
    season.specificNeeds = profile.specific_needs;
  }

  return { identity, documentation, logistics, season };
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
    document_name: profile.document_name ?? null,
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
    applicant_status: profile.applicant_status ?? null,
    applicant_status_details: profile.applicant_status_details ?? null,
    supporting_entities: profile.supporting_entities ?? null,
    childcare_need: profile.childcare_need ?? null,
    specific_needs: profile.specific_needs ?? null,
    media_consent: profile.media_consent,
  };
}

/** Preserve draft answers while carrying the language already chosen before login. */
export function withSelectedLanguage(
  draft: OnboardingDraft,
  language: LanguageCode,
): OnboardingDraft {
  return { ...draft, identity: { ...draft.identity, preferredLanguage: language } };
}

/**
 * A test player's draft from before staff changed her situation on her page
 * (RAPP-619) is dropped, so the next open shows the situation that was set:
 * her draft would otherwise win over it, as it rightly does over staff
 * prefill for a real woman (RAPP-300). Real women have no stamp, so their
 * draft is always kept.
 */
export function draftForScenario(
  draft: OnboardingDraft | null,
  scenarioStamp: string | null,
): OnboardingDraft | null {
  if (draft === null || scenarioStamp === null) return draft;
  return draft.scenarioStamp === scenarioStamp ? draft : null;
}
