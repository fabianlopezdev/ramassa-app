/**
 * Onboarding draft persistence (RAPP-21): the "an interruption never loses
 * input" guarantee. The wizard saves the WHOLE draft (partial step values plus
 * the step the player is on) after every meaningful change, and reloads it on
 * mount, so a phone call, a crash or a battery death resumes exactly where the
 * player left off.
 *
 * Storage is injected, same as language and session storage: MMKV never
 * reaches the web bundle, and tests run against memory. Values are stored as
 * one JSON blob under one key because the draft is read and cleared as a unit.
 *
 * Loading is deliberately paranoid: corrupt JSON or a shape from an older app
 * version reads as "no draft" rather than crashing the first screen a new
 * player ever sees. Losing a draft is annoying; a wizard that cannot open is
 * fatal.
 *
 * `clearDraft` on completion is a privacy requirement, not tidiness: the draft
 * is the only place intake PII ever exists client-side unencrypted, and it
 * must not outlive its purpose (RGPD minimization; the durable copy lives
 * encrypted server-side by then).
 */

import { z } from 'zod';
import type { MmkvLike } from './supabase';

const DRAFT_STORAGE_KEY = 'ramassa.onboarding-draft';

export const ONBOARDING_STEPS = ['identity', 'documentation', 'logistics', 'terms'] as const;
export type OnboardingStepName = (typeof ONBOARDING_STEPS)[number];

/**
 * Partial, permissive shapes on purpose: a draft holds whatever the player has
 * typed SO FAR, which by definition need not validate yet. The step schemas
 * (schemas/onboarding.ts) judge completeness when the player presses Continue;
 * this schema only guards against structural drift from older app versions.
 */
const draftSchema = z.object({
  currentStep: z.enum(ONBOARDING_STEPS),
  identity: z.record(z.string(), z.unknown()).optional(),
  documentation: z.record(z.string(), z.unknown()).optional(),
  logistics: z.record(z.string(), z.unknown()).optional(),
  terms: z.record(z.string(), z.unknown()).optional(),
});

export interface OnboardingDraft {
  currentStep: OnboardingStepName;
  identity?: Record<string, unknown>;
  documentation?: Record<string, unknown>;
  logistics?: Record<string, unknown>;
  terms?: Record<string, unknown>;
}

export interface OnboardingDraftStore {
  loadDraft(): OnboardingDraft | null;
  saveDraft(draft: OnboardingDraft): void;
  clearDraft(): void;
}

function parseStoredDraft(raw: string | undefined | null): OnboardingDraft | null {
  if (raw === undefined || raw === null) return null;
  try {
    const parsed = draftSchema.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as OnboardingDraft) : null;
  } catch {
    return null;
  }
}

/** Mobile draft storage backed by the app's MMKV instance. */
export function createMmkvOnboardingDraftStore(mmkv: MmkvLike): OnboardingDraftStore {
  return {
    loadDraft: () => parseStoredDraft(mmkv.getString(DRAFT_STORAGE_KEY)),
    saveDraft: (draft) => mmkv.set(DRAFT_STORAGE_KEY, JSON.stringify(draft)),
    clearDraft: () => void mmkv.remove(DRAFT_STORAGE_KEY),
  };
}

/** Web draft storage backed by localStorage (the player web export). */
export function createLocalStorageOnboardingDraftStore(): OnboardingDraftStore {
  return {
    loadDraft: () => parseStoredDraft(globalThis.localStorage.getItem(DRAFT_STORAGE_KEY)),
    saveDraft: (draft) => globalThis.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft)),
    clearDraft: () => globalThis.localStorage.removeItem(DRAFT_STORAGE_KEY),
  };
}

/** Non-persisting store for tests and storage-less environments. */
export function createInMemoryOnboardingDraftStore(): OnboardingDraftStore {
  let storedDraft: OnboardingDraft | null = null;
  return {
    loadDraft: () => (storedDraft === null ? null : structuredClone(storedDraft)),
    saveDraft: (draft) => {
      storedDraft = structuredClone(draft);
    },
    clearDraft: () => {
      storedDraft = null;
    },
  };
}
