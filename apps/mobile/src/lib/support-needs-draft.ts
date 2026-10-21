import type { OnboardingDraft, OnboardingDraftStep } from '@ramassa/shared/onboarding-drafts';
import {
  encodeSupportNeeds,
  selectedSupportNeeds,
  supportNeedsForEditing,
  type SupportNeedCategory,
  type SupportNeedsAnswer,
} from '@ramassa/shared/schemas';

export function mergeSupportNeedsDraft(
  draft: OnboardingDraft | null,
  answer: SupportNeedsAnswer,
  currentStep: OnboardingDraftStep,
): OnboardingDraft {
  return {
    ...draft,
    currentStep,
    season: { ...draft?.season, specificNeeds: encodeSupportNeeds(answer) },
  };
}
export function lastSupportNeedStep(
  value: unknown,
): `needs-detail:${SupportNeedCategory}` | 'specific-needs' {
  const categories = selectedSupportNeeds(
    supportNeedsForEditing(typeof value === 'string' ? value : ''),
  );
  const last = categories[0];
  return last ? `needs-detail:${last}` : 'specific-needs';
}
