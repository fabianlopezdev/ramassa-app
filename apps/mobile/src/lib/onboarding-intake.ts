/**
 * The wizard's routes and what it sends (RAPP-300, RAPP-663): what staff or a
 * partner entity already answered is her stored answers by field, and only
 * new or changed answers are sent.
 */
import type { Href } from 'expo-router';
import {
  customStepId,
  isCustomStep,
  type WizardScreen,
  type WizardStepKey,
} from '@ramassa/shared/intake';
import {
  customAnswerError,
  isEmptyAnswer,
  type CustomAnswers,
  type CustomAnswerValue,
  type CustomQuestion,
} from '@ramassa/shared/intake-builder';
import type {
  OnboardingDraftStep,
  OnboardingStepName,
  StoredOnboardingDraft,
} from '@ramassa/shared/onboarding-drafts';
import type { LanguageCode } from '@ramassa/shared/schemas';

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

/** Her answers as the wizard shows them: the stored ones, with her draft on top. */
export function mergedCustomAnswers(
  stored: CustomAnswers,
  draft: Readonly<Record<string, CustomAnswerValue>> | undefined,
): CustomAnswers {
  return { ...stored, ...draft };
}

function isStringList(value: CustomAnswerValue | undefined): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function sameAnswer(a: CustomAnswerValue | undefined, b: CustomAnswerValue | undefined): boolean {
  if (isEmptyAnswer(a) || isEmptyAnswer(b)) return isEmptyAnswer(a) && isEmptyAnswer(b);
  if (typeof a === 'string' || typeof b === 'string') {
    return typeof a === 'string' && typeof b === 'string' && a.trim() === b.trim();
  }
  // A choice of several is the same answer in any order; every other value
  // (a list she ordered, a number, a file) compares as written.
  if (isStringList(a) && isStringList(b)) {
    return [...a].sort().join('\n') === [...b].sort().join('\n');
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The staff answers to send (RAPP-307), as the built-in ones (RAPP-300): only
 * what she gave or changed, so an answer staff or her entity gave and she only
 * confirmed keeps its source. An answer she emptied is sent as null, which
 * removes it. A field no longer asked of her here, or a value the server
 * would refuse (a kept archived option), is left out.
 */
export function customAnswersToSave(
  questions: readonly CustomQuestion[],
  draft: Readonly<Record<string, CustomAnswerValue>> | undefined,
  stored: CustomAnswers,
): Record<string, CustomAnswerValue | null> {
  const toSave: Record<string, CustomAnswerValue | null> = {};
  for (const question of questions) {
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

/**
 * The app's answers to send (RAPP-663), by field: only what she gave or
 * changed, as the staff ones, so an answer staff or her entity gave and she
 * only confirmed keeps its source. An answer she emptied is sent as null,
 * which removes it. `alwaysSent` travels even when nothing is stored: her
 * "None" to the entity question is an answer with no value.
 */
export function appAnswersToSave(
  next: Readonly<Record<string, CustomAnswerValue | null>>,
  stored: CustomAnswers,
  alwaysSent: ReadonlySet<string> = new Set(),
): Record<string, CustomAnswerValue | null> {
  const toSave: Record<string, CustomAnswerValue | null> = {};
  for (const [id, value] of Object.entries(next)) {
    if (alwaysSent.has(id)) {
      toSave[id] = isEmptyAnswer(value) ? null : value;
      continue;
    }
    if (isEmptyAnswer(value)) {
      if (!isEmptyAnswer(stored[id])) toSave[id] = null;
      continue;
    }
    if (value !== null && !sameAnswer(value, stored[id])) toSave[id] = value;
  }
  return toSave;
}

/** Preserve draft answers while carrying the language already chosen before login. */
export function withSelectedLanguage(
  draft: StoredOnboardingDraft,
  language: LanguageCode,
): StoredOnboardingDraft {
  return { ...draft, account: { ...draft.account, preferredLanguage: language } };
}

/**
 * A test player's draft from before staff changed her situation on her page
 * (RAPP-619) is dropped, so the next open shows the situation that was set:
 * her draft would otherwise win over it, as it rightly does over staff
 * prefill for a real woman (RAPP-300). Real women have no stamp, so their
 * draft is always kept.
 */
export function draftForScenario<Draft extends { readonly scenarioStamp?: string }>(
  draft: Draft | null,
  scenarioStamp: string | null,
): Draft | null {
  if (draft === null || scenarioStamp === null) return draft;
  return draft.scenarioStamp === scenarioStamp ? draft : null;
}
