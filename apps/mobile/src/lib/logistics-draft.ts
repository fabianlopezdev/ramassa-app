import type { OnboardingDraft, OnboardingDraftStep } from '@ramassa/shared/onboarding-drafts';

/** Contact and equipment share stored fields but never overwrite the other screen's answers. */
export function mergeLogisticsDraft(
  draft: OnboardingDraft | null,
  values: Readonly<Record<string, unknown>>,
  currentStep: OnboardingDraftStep,
): OnboardingDraft {
  return { ...draft, currentStep, logistics: { ...draft?.logistics, ...values } };
}
