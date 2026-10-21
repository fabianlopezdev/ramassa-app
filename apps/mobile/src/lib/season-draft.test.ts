import { expect, test } from 'bun:test';
import { createMmkvOnboardingDraftStore } from '@ramassa/shared/onboarding-drafts';
import { wizardDraftStep, wizardStepRoute } from './onboarding-intake';
import { mergeSeasonDraft } from './season-draft';

test('split season routes resume without losing existing or sibling answers', () => {
  let stored: string | undefined;
  const store = createMmkvOnboardingDraftStore({
    getString: () => stored,
    set: (_key, value) => {
      stored = String(value);
    },
    remove: () => {
      stored = undefined;
      return true;
    },
  });
  store.saveDraft({
    currentStep: 'season',
    season: {
      applicantStatus: 'refugee',
      specificNeeds: 'Quiet room',
      supportingEntities: ['Example entity'],
    },
  });
  const staleForm = { applicantStatus: 'migrant', specificNeeds: '', supportingEntities: [] };
  store.saveDraft(mergeSeasonDraft(store.loadDraft(), 'season', staleForm, 'supporting-entities'));
  expect(store.loadDraft()?.season).toEqual({
    applicantStatus: 'migrant',
    specificNeeds: 'Quiet room',
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
  expect(store.loadDraft()?.season?.specificNeeds).toBe('Quiet room');
  expect(store.loadDraft()?.season?.supportingEntities).toEqual([]);
  for (const screen of ['supporting-entities', 'participation-support'] as const) {
    expect(wizardDraftStep(screen)).toBe(screen);
    expect(wizardStepRoute(screen, 'back')).toBe(`/onboarding/${screen}?entrance=none`);
    store.saveDraft({ ...store.loadDraft(), currentStep: screen });
    expect(store.loadDraft()?.currentStep).toBe(screen);
  }
});
