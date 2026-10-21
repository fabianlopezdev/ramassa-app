import { expect, test } from 'bun:test';
import { createMmkvOnboardingDraftStore } from '@ramassa/shared/onboarding-drafts';
import { decodeSupportNeeds, toggleSupportNeed } from '@ramassa/shared/schemas';
import { wizardStepRoute } from './onboarding-intake';
import { referringEntityForAdditionalSupport } from './season-draft';
import { lastSupportNeedStep, mergeSupportNeedsDraft } from './support-needs-draft';

test('combined details resume and preserve the category answers independently of childcare', () => {
  let raw: string | undefined;
  const store = createMmkvOnboardingDraftStore({
    getString: () => raw,
    set: (_key, value) => {
      raw = String(value);
    },
    remove: () => true,
  });
  const first = {
    categories: ['accessibility', 'communication'] as const,
    details: { accessibility: 'Step-free access' },
  };
  store.saveDraft(
    mergeSupportNeedsDraft(
      { currentStep: 'specific-needs', season: { childcareNeed: 'no' } },
      first,
      'needs-detail:communication',
    ),
  );
  expect(store.loadDraft()?.currentStep).toBe('needs-detail:communication');
  expect(wizardStepRoute('needs-detail:communication', 'back')).toBe(
    '/onboarding/specific-needs-details/communication?entrance=none',
  );
  expect(lastSupportNeedStep(store.loadDraft()?.season?.specificNeeds)).toBe(
    'needs-detail:accessibility',
  );
  const next = { ...first, details: { ...first.details, communication: 'An interpreter' } };
  store.saveDraft(mergeSupportNeedsDraft(store.loadDraft(), next, 'summary'));
  expect(decodeSupportNeeds(store.loadDraft()?.season?.specificNeeds as string)).toEqual(next);
  expect(store.loadDraft()?.season?.childcareNeed).toBe('no');
  store.saveDraft(
    mergeSupportNeedsDraft(store.loadDraft(), toggleSupportNeed(next, 'none'), 'summary'),
  );
  expect(lastSupportNeedStep(store.loadDraft()?.season?.specificNeeds)).toBe('specific-needs');
  expect(decodeSupportNeeds(store.loadDraft()?.season?.specificNeeds as string)?.details).toEqual(
    {},
  );
});

test('additional-support wording may use the earlier entity but never requires one', () => {
  expect(
    referringEntityForAdditionalSupport({
      currentStep: 'supporting-entities',
      logistics: { referenceEntity: ' Example entity ', hasReferenceEntity: true },
    }),
  ).toBe('Example entity');
  expect(
    referringEntityForAdditionalSupport({
      currentStep: 'supporting-entities',
      logistics: { referenceEntity: 'Old value', hasReferenceEntity: false },
    }),
  ).toBeNull();
  expect(
    referringEntityForAdditionalSupport({
      currentStep: 'supporting-entities',
      logistics: { referenceEntity: null },
    }),
  ).toBeNull();
  expect(referringEntityForAdditionalSupport(null)).toBeNull();
});
