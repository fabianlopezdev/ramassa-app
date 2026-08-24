/**
 * Onboarding draft persistence (RAPP-21), written BEFORE the implementation.
 *
 * The contract under test is the issue's own sentence: "an interruption never
 * loses input". Concretely: partial step data and the current position survive
 * a kill/relaunch round trip; corrupt stored JSON reads as "no draft" instead
 * of crashing the wizard's first render; and completion wipes everything,
 * because a finished wizard leaving PII in device storage would outlive its
 * purpose (RGPD data minimization, and drafts are the ONLY place intake PII
 * ever exists client-side unencrypted).
 */

import { describe, expect, test } from 'bun:test';
import {
  createInMemoryOnboardingDraftStore,
  createMmkvOnboardingDraftStore,
} from './onboarding-drafts';

function makeFakeMmkv() {
  const backing = new Map<string, string>();
  return {
    getString: (key: string) => backing.get(key),
    set: (key: string, value: string) => void backing.set(key, value),
    remove: (key: string) => backing.delete(key),
    backing,
  };
}

describe('onboarding draft store', () => {
  test('a saved draft round-trips: step position and partial input intact', () => {
    const store = createInMemoryOnboardingDraftStore();
    store.saveDraft({
      currentStep: 'documentation',
      identity: { firstName: 'أمينة', lastName: 'الحسن' },
      documentation: { documentType: 'nie' },
    });
    const draft = store.loadDraft();
    expect(draft?.currentStep).toBe('documentation');
    expect(draft?.identity?.firstName).toBe('أمينة');
    expect(draft?.documentation?.documentType).toBe('nie');
  });

  test('the warm welcome split resumes on the new background step without losing names', () => {
    const mmkv = makeFakeMmkv();
    const store = createMmkvOnboardingDraftStore(mmkv);
    store.saveDraft({
      currentStep: 'background',
      identity: { firstName: 'أمينة', lastName: 'الحسن' },
    });

    const resumed = createMmkvOnboardingDraftStore(mmkv).loadDraft();
    expect(resumed).toEqual({
      currentStep: 'background',
      identity: { firstName: 'أمينة', lastName: 'الحسن' },
    });
  });

  test('no draft reads as null, not as an empty object', () => {
    const store = createInMemoryOnboardingDraftStore();
    expect(store.loadDraft()).toBeNull();
  });

  test('corrupt stored JSON reads as no-draft instead of crashing first render', () => {
    const mmkv = makeFakeMmkv();
    const store = createMmkvOnboardingDraftStore(mmkv);
    mmkv.backing.set('ramassa.onboarding-draft', '{not json');
    expect(store.loadDraft()).toBeNull();
  });

  test('a draft with an unknown step name reads as no-draft (schema drift safety)', () => {
    const mmkv = makeFakeMmkv();
    const store = createMmkvOnboardingDraftStore(mmkv);
    mmkv.backing.set(
      'ramassa.onboarding-draft',
      JSON.stringify({ currentStep: 'payment', identity: {} }),
    );
    expect(store.loadDraft()).toBeNull();
  });

  test('clearDraft removes the stored PII entirely', () => {
    const mmkv = makeFakeMmkv();
    const store = createMmkvOnboardingDraftStore(mmkv);
    store.saveDraft({ currentStep: 'identity', identity: { firstName: 'Оксана' } });
    expect(mmkv.backing.size).toBe(1);
    store.clearDraft();
    expect(mmkv.backing.size).toBe(0);
    expect(store.loadDraft()).toBeNull();
  });

  test('saving a later step preserves nothing implicitly: the caller owns the whole draft', () => {
    const store = createInMemoryOnboardingDraftStore();
    store.saveDraft({ currentStep: 'identity', identity: { firstName: 'زهرا' } });
    store.saveDraft({ currentStep: 'logistics', logistics: { city: 'Vic' } });
    const draft = store.loadDraft();
    expect(draft?.identity).toBeUndefined();
    expect(draft?.logistics?.city).toBe('Vic');
  });
});
