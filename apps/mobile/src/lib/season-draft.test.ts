import { expect, test } from 'bun:test';
import { systemFieldIndexFromCatalog } from '@ramassa/shared/intake-builder';
import { createMmkvOnboardingDraftStore } from '@ramassa/shared/onboarding-drafts';
import { encodeSupportNeeds } from '@ramassa/shared/schemas';
import { systemFieldsCatalogFixture } from '@ramassa/shared/testing';
import { wizardDraftStep, wizardStepRoute } from './onboarding-intake';
import { mergeSeasonDraft } from './season-draft';
import { wizardDraftStoreOn } from './wizard-draft';

// Her draft is kept by field (RAPP-663): every save goes through her fields.
const fields = systemFieldIndexFromCatalog(systemFieldsCatalogFixture());
const quietRoom = encodeSupportNeeds({
  categories: ['other'],
  details: {},
  explanation: 'Quiet room',
});
test('split season routes resume without losing existing or sibling answers', () => {
  let stored: string | undefined;
  const store = wizardDraftStoreOn(
    createMmkvOnboardingDraftStore({
      getString: () => stored,
      set: (_key, value) => {
        stored = String(value);
      },
      remove: () => {
        stored = undefined;
        return true;
      },
    }),
    fields,
  );
  store.saveDraft({
    currentStep: 'season',
    season: {
      applicantStatus: 'refugee',
      specificNeeds: quietRoom,
      supportingEntities: ['Example entity'],
    },
  });
  const staleForm = { applicantStatus: 'migrant', specificNeeds: '', supportingEntities: [] };
  store.saveDraft(mergeSeasonDraft(store.loadDraft(), 'season', staleForm, 'supporting-entities'));
  expect(store.loadDraft()?.season).toEqual({
    applicantStatus: 'migrant',
    specificNeeds: quietRoom,
    supportingEntities: ['Example entity'],
  });
  store.saveDraft(
    mergeSeasonDraft(
      store.loadDraft(),
      'supporting-entities',
      { supportingEntities: [] },
      'participation-support',
    ),
  );
  expect(store.loadDraft()?.season?.applicantStatus).toBe('migrant');
  expect(store.loadDraft()?.season?.specificNeeds).toBe(quietRoom);
  expect(store.loadDraft()?.season?.supportingEntities).toEqual([]);
  for (const screen of ['supporting-entities', 'participation-support'] as const) {
    expect(wizardDraftStep(screen)).toBe(screen);
    expect(wizardStepRoute(screen, 'back')).toBe(`/onboarding/${screen}?entrance=none`);
    store.saveDraft({ ...store.loadDraft(), currentStep: screen });
    expect(store.loadDraft()?.currentStep).toBe(screen);
  }
});
