import type { SeasonWizardScreen } from '@ramassa/shared/intake';
import type { OnboardingDraft, OnboardingDraftStep } from '@ramassa/shared/onboarding-drafts';

export function referringEntityForAdditionalSupport(draft: OnboardingDraft | null): string | null {
  if (draft?.logistics?.hasReferenceEntity === false) return null;
  const value = draft?.logistics?.referenceEntity;
  return typeof value === 'string' ? value.trim() || null : null;
}

export const SEASON_SCREEN_TITLE_KEYS = {
  season: 'currentSituationTitle',
  'supporting-entities': 'supportingOrganisationsTitle',
  'participation-support': 'participationSupportTitle',
  'specific-needs': 'supportNeedsTitle',
} as const;

const SCREEN_FIELDS = {
  season: ['applicantStatus'],
  'supporting-entities': ['supportingEntities'],
  'participation-support': ['childcareNeed'],
  'specific-needs': ['specificNeeds'],
} as const;

/** Merge only this screen's answers into the latest stored season draft. */
export function mergeSeasonDraft(
  draft: OnboardingDraft | null,
  screen: SeasonWizardScreen,
  answers: Readonly<Record<string, unknown>>,
  currentStep: OnboardingDraftStep,
): OnboardingDraft {
  const patch = Object.fromEntries(SCREEN_FIELDS[screen].map((key) => [key, answers[key]]));
  if (screen === 'season' && answers.applicantStatus !== 'other')
    patch.applicantStatusDetails = undefined;
  return { ...draft, currentStep, season: { ...draft?.season, ...patch } };
}
