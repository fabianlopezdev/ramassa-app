import { expect, test } from 'bun:test';
import { systemFieldIndexFromCatalog } from '@ramassa/shared/intake-builder';
import { createMmkvOnboardingDraftStore } from '@ramassa/shared/onboarding-drafts';
import { systemFieldsCatalogFixture } from '@ramassa/shared/testing';
import { mergeLogisticsDraft } from './logistics-draft';
import { contactFormSchema, equipmentFormSchema, logisticsFormSchema } from './onboarding-form';
import { wizardDraftStep, wizardStepRoute } from './onboarding-intake';
import { wizardDraftStoreOn } from './wizard-draft';

// Her draft is kept by field (RAPP-663): every save goes through her fields.
const fields = systemFieldIndexFromCatalog(systemFieldsCatalogFixture());
test('contact validates without equipment, while each section keeps its own validation', () => {
  expect(contactFormSchema.safeParse({ referenceEntity: null, hasDependents: false }).success).toBe(
    true,
  );
  expect(
    contactFormSchema.safeParse({ referenceEntity: null, hasDependents: true, numDependents: '0' })
      .success,
  ).toBe(false);
  expect(equipmentFormSchema.safeParse({ clothingSize: 'M', shoeSize: '38' }).success).toBe(true);
  expect(equipmentFormSchema.safeParse({ clothingSize: '', shoeSize: '38' }).success).toBe(false);
  expect(equipmentFormSchema.safeParse({ clothingSize: 'M', shoeSize: '99' }).success).toBe(false);
});

test('saving either section preserves the other, and the final payload still validates', () => {
  const draft = mergeLogisticsDraft(
    { currentStep: 'logistics', logistics: { clothingSize: 'M', shoeSize: '38' } },
    { phone: '', referenceEntity: null, hasDependents: false, numDependents: '' },
    'equipment',
  );
  expect(draft.logistics?.clothingSize).toBe('M');
  const updated = mergeLogisticsDraft(draft, { clothingSize: 'L', shoeSize: '40' }, 'summary');
  expect(updated.logistics?.referenceEntity).toBeNull();
  expect(logisticsFormSchema.parse(updated.logistics).clothingSize).toBe('L');
});

test('the equipment route and saved draft resume independently', () => {
  expect(wizardStepRoute('equipment')).toBe('/onboarding/equipment');
  expect(wizardStepRoute('equipment', 'back')).toBe('/onboarding/equipment?entrance=none');
  expect(wizardDraftStep('equipment')).toBe('equipment');
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
    currentStep: 'equipment',
    logistics: { phone: '+34600111222', clothingSize: 'M' },
  });
  expect(store.loadDraft()?.currentStep).toBe('equipment');
  expect(store.loadDraft()?.logistics?.phone).toBe('+34600111222');
});
