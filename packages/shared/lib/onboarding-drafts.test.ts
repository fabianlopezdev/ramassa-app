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
  createAccountOnboardingDraftStore,
  createInMemoryOnboardingDraftStore,
  createMmkvOnboardingDraftStore,
  isStoredOnboardingDraft,
  type OnboardingDraft,
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
    const draft = store.loadDraft() as OnboardingDraft | null;
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

  test('a draft resumes on a staff screen with her answers to it (RAPP-307)', () => {
    const mmkv = makeFakeMmkv();
    createMmkvOnboardingDraftStore(mmkv).saveDraft({
      currentStep: 'custom:5eed0000-0000-4000-8000-000000000001',
      custom: { a: 'yes', b: ['x', 'y'] },
    });
    expect(createMmkvOnboardingDraftStore(mmkv).loadDraft()).toEqual({
      currentStep: 'custom:5eed0000-0000-4000-8000-000000000001',
      custom: { a: 'yes', b: ['x', 'y'] },
    });
  });

  test('a version 2 draft keeps her answers by field id (RAPP-663)', () => {
    const mmkv = makeFakeMmkv();
    const draft = {
      version: 2 as const,
      currentStep: 'logistics' as const,
      account: { firstName: 'أمينة', preferredLanguage: 'ar' },
      answers: { '5eed0000-0000-4000-8000-000000000001': ['x', 'y'] },
      screen: { 'logistics.referenceEntity': null },
    };
    createMmkvOnboardingDraftStore(mmkv).saveDraft(draft);
    const loaded = createMmkvOnboardingDraftStore(mmkv).loadDraft();
    expect(loaded).toEqual(draft);
    expect(loaded !== null && isStoredOnboardingDraft(loaded)).toBe(true);
  });

  test('a version 1 draft still reads, as version 1, so her phone can convert it', () => {
    const mmkv = makeFakeMmkv();
    createMmkvOnboardingDraftStore(mmkv).saveDraft({
      currentStep: 'documentation',
      identity: { firstName: 'Laia' },
    });
    const loaded = createMmkvOnboardingDraftStore(mmkv).loadDraft();
    expect(loaded !== null && isStoredOnboardingDraft(loaded)).toBe(false);
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
    const draft = store.loadDraft() as OnboardingDraft | null;
    expect(draft?.identity).toBeUndefined();
    expect(draft?.logistics?.city).toBe('Vic');
  });
});

test('the introduction and existing terms drafts both resume without losing consent choices', () => {
  for (const currentStep of ['terms-intro', 'terms'] as const) {
    const mmkv = makeFakeMmkv();
    const draft = {
      currentStep,
      identity: { firstName: 'Laia' },
      terms: { termsAccepted: false, mediaConsent: true },
    };
    createMmkvOnboardingDraftStore(mmkv).saveDraft(draft);
    expect(createMmkvOnboardingDraftStore(mmkv).loadDraft()).toEqual(draft);
  }
});

describe('account-scoped onboarding drafts on a shared device', () => {
  test('Not now retains A draft for A without exposing it to B or signed-out screens', () => {
    const mmkv = makeFakeMmkv();
    const store = createAccountOnboardingDraftStore(mmkv);
    const first = {
      currentStep: 'terms' as const,
      identity: { firstName: 'Amina' },
      documentation: { documentNumber: 'private-A' },
      terms: { signatureOwnerId: 'player-a', mediaConsent: true },
    };
    store.setUser('player-a');
    store.saveDraft(first);
    store.setUser(null);
    expect(store.loadDraft()).toBeNull();
    expect(() => store.saveDraft(first)).toThrow();
    store.setUser('player-b');
    expect(store.loadDraft()).toBeNull();
    const second = { currentStep: 'background' as const, identity: { firstName: 'Laia' } };
    store.saveDraft(second);
    store.setUser('player-a');
    expect(store.loadDraft()).toEqual(first);
    store.clearDraft();
    expect(store.loadDraft()).toBeNull();
    store.setUser('player-b');
    expect(store.loadDraft()).toEqual(second);
    const restarted = createAccountOnboardingDraftStore(mmkv);
    restarted.setUser('player-b');
    expect(restarted.loadDraft()).toEqual(second);
  });

  test('an unowned legacy draft is removed instead of being assigned to the next account', () => {
    const mmkv = makeFakeMmkv();
    createMmkvOnboardingDraftStore(mmkv).saveDraft({
      currentStep: 'identity',
      identity: { firstName: 'Unowned' },
    });
    const store = createAccountOnboardingDraftStore(mmkv);
    store.setUser('player-b');
    expect(store.loadDraft()).toBeNull();
    expect(mmkv.backing.has('ramassa.onboarding-draft')).toBe(false);
  });
});

test('a completed request clears its own account draft after another account becomes active', () => {
  const mmkv = makeFakeMmkv();
  const store = createAccountOnboardingDraftStore(mmkv);
  store.setUser('player-a');
  store.saveDraft({ currentStep: 'terms', identity: { firstName: 'Amina' } });
  store.setUser('player-b');
  const next = { currentStep: 'identity' as const, identity: { firstName: 'Laia' } };
  store.saveDraft(next);
  store.clearUserDraft('player-a');
  expect(store.loadDraft()).toEqual(next);
  store.setUser('player-a');
  expect(store.loadDraft()).toBeNull();
});
