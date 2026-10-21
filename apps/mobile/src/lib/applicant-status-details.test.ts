import { expect, test } from 'bun:test';
import { createMmkvOnboardingDraftStore } from '@ramassa/shared/onboarding-drafts';
import { seasonAnswerFields } from '@ramassa/shared/schemas';
import { wizardStepRoute } from './onboarding-intake';
import { mergeSeasonDraft } from './season-draft';

test('Other details validate and survive their own resumable sub-screen', () => {
  const parsed = seasonAnswerFields.parse({
    applicantStatus: 'other',
    applicantStatusDetails: 'Example',
  });
  expect(parsed).toHaveProperty('applicantStatusDetails', 'Example');
  expect(seasonAnswerFields.safeParse({ applicantStatusDetails: 'x'.repeat(2001) }).success).toBe(
    false,
  );
  let raw: string | undefined;
  const store = createMmkvOnboardingDraftStore({
    getString: () => raw,
    set: (_key, value) => {
      raw = String(value);
    },
    remove: () => true,
  });
  store.saveDraft({ currentStep: 'applicant-status-details', season: parsed });
  expect(store.loadDraft()?.currentStep).toBe('applicant-status-details');
  expect(wizardStepRoute('applicant-status-details', 'back')).toBe(
    '/onboarding/applicant-status-details?entrance=none',
  );
});

test('changing away from Other clears stale explanation but preserves sibling answers', () => {
  const updated = mergeSeasonDraft(
    {
      currentStep: 'season',
      season: {
        applicantStatus: 'other',
        applicantStatusDetails: 'Example',
        specificNeeds: 'Quiet room',
      },
    },
    'season',
    { applicantStatus: 'migrant' },
    'supporting-entities',
  );
  expect(updated.season?.applicantStatusDetails).toBeUndefined();
  expect(updated.season?.specificNeeds).toBe('Quiet room');
});
