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
import { AppError } from '../errors';
import { SUPPORT_NEED_CATEGORIES, type SupportNeedCategory } from '../schemas/support-needs';
import type { MmkvLike } from './supabase';

const DRAFT_STORAGE_KEY = 'ramassa.onboarding-draft';

export const ONBOARDING_STEPS = [
  'identity',
  'background',
  'documentation',
  'documentation-details',
  'logistics',
  'equipment',
  // The registration questions (RAPP-306).
  'season',
  'applicant-status-details',
  'supporting-entities',
  'participation-support',
  'specific-needs',
  // The summary of everything before the terms (RAPP-300).
  'summary',
  'terms-intro',
  'terms',
] as const;
export type OnboardingStepName = (typeof ONBOARDING_STEPS)[number];

/** A step the draft can resume at: a built-in one, or a staff screen as `custom:<id>` (RAPP-307). */
export type OnboardingDraftStep =
  OnboardingStepName | `custom:${string}` | `needs-detail:${SupportNeedCategory}`;

/**
 * Partial, permissive shapes on purpose: a draft holds whatever the player has
 * typed SO FAR, which by definition need not validate yet. The step schemas
 * (schemas/onboarding.ts) judge completeness when the player presses Continue;
 * this schema only guards against structural drift from older app versions.
 */
const draftSchema = z.object({
  currentStep: z.union([
    z.enum(ONBOARDING_STEPS),
    z.templateLiteral(['custom:', z.string()]),
    z.templateLiteral(['needs-detail:', z.enum(SUPPORT_NEED_CATEGORIES)]),
  ]),
  identity: z.record(z.string(), z.unknown()).optional(),
  documentation: z.record(z.string(), z.unknown()).optional(),
  logistics: z.record(z.string(), z.unknown()).optional(),
  season: z.record(z.string(), z.unknown()).optional(),
  terms: z.record(z.string(), z.unknown()).optional(),
  // Her answers to the staff questions, by question id (RAPP-307).
  custom: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
  // A test player's situation when the draft began (RAPP-619): a later change
  // on her page makes the draft stale.
  scenarioStamp: z.string().optional(),
});

export interface OnboardingDraft {
  currentStep: OnboardingDraftStep;
  identity?: Record<string, unknown>;
  documentation?: Record<string, unknown>;
  logistics?: Record<string, unknown>;
  season?: Record<string, unknown>;
  terms?: Record<string, unknown>;
  custom?: Record<string, string | readonly string[]>;
  scenarioStamp?: string;
}

export interface OnboardingDraftStore {
  loadDraft(): OnboardingDraft | null;
  saveDraft(draft: OnboardingDraft): void;
  clearDraft(): void;
}

export interface AccountOnboardingDraftStore extends OnboardingDraftStore {
  setUser(userId: string | null): void;
  clearUserDraft(userId: string): void;
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

/** Keep resumable answers private to the account that entered them on a shared phone. */
export function createAccountOnboardingDraftStore(mmkv: MmkvLike): AccountOnboardingDraftStore {
  let current: OnboardingDraftStore | null = null;
  return {
    setUser(userId) {
      // Old drafts had no reliable owner. Never assign that personal data to
      // whichever account happens to sign in after the app is updated.
      mmkv.remove(DRAFT_STORAGE_KEY);
      current =
        userId === null
          ? null
          : createMmkvOnboardingDraftStore({
              getString: (key) => mmkv.getString(`${key}.${userId}`),
              set: (key, value) => mmkv.set(`${key}.${userId}`, value),
              remove: (key) => mmkv.remove(`${key}.${userId}`),
            });
    },
    loadDraft: () => current?.loadDraft() ?? null,
    saveDraft(draft) {
      if (current === null)
        throw new AppError('UNEXPECTED-1', {
          message: 'Onboarding draft requires a signed-in account',
        });
      current.saveDraft(draft);
    },
    clearDraft: () => current?.clearDraft(),
    clearUserDraft: (userId) => void mmkv.remove(`${DRAFT_STORAGE_KEY}.${userId}`),
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
