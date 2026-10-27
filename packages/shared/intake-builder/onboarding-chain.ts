/**
 * The forms chained after Onboarding (RAPP-703, forms design §9): per
 * organization, the forms a new player goes through right after her
 * Onboarding and the app terms, in the order the team sets on the Onboarding
 * board. Each is the season authorization or a published form the team
 * created. The authorization is chained by default.
 *
 * Taking a form out of the chain only stops it from following Onboarding: it
 * keeps applying by its own rules (who it is for, when it must be answered,
 * its Home card and its gate).
 *
 *   - The board: `fetchOnboardingFormChain`, `saveOnboardingFormChain` (a live
 *     edit, like Onboarding's own screen order) and the "Fins a N pantalles"
 *     count (`onboardingScreenCounts`).
 *   - Her phone: her chain while it is ahead of her (`fetchMyOnboardingChain`,
 *     empty once done), the next form that applies to her
 *     (`nextChainedForm`) and the end of the walk (`finishOnboardingChain`).
 *     Older builds never read the chain, so they keep the gates as they were.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError, databaseErrorCode } from '../errors';
import { FINAL_WIZARD_SCREENS } from '../onboarding/intake';
import type { Database } from '../types/database';
import { authorizationQuestions } from './authorization-fields';
import { wizardFlow, type IntakeCatalog } from './builder';
import type { CustomForm, CustomFormScreen } from './custom-form-model';
import {
  customFormScreenBlocks,
  customFormScreenConsents,
  customFormScreenQuestions,
} from './custom-forms';
import { flowStep, isShownToHer, movableOrder } from './player-plan';

type Client = SupabaseClient<Database>;

/** A chained form: the season authorization, or a form the team created. */
export type ChainedFormRef = 'authorization' | `custom:${string}`;

export const AUTHORIZATION_FORM_REF = 'authorization' satisfies ChainedFormRef;

/** Every organization starts with the authorization chained. */
export const DEFAULT_ONBOARDING_CHAIN: readonly ChainedFormRef[] = [AUTHORIZATION_FORM_REF];

export function customFormRef(formId: string): ChainedFormRef {
  return `custom:${formId}`;
}

/** The form id of a chained form the team created; null for the authorization. */
export function customFormIdOfRef(ref: ChainedFormRef): string | null {
  return ref.startsWith('custom:') ? ref.slice('custom:'.length) : null;
}

const refSchema = z.union([
  z.literal(AUTHORIZATION_FORM_REF),
  z.templateLiteral(['custom:', z.uuid()]),
]);

function parseRefs(raw: unknown): readonly ChainedFormRef[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((each): ChainedFormRef[] => {
    const parsed = refSchema.safeParse(each);
    return parsed.success ? [parsed.data] : [];
  });
}

function databaseError(error: { readonly message: string; readonly code?: string }): AppError {
  return new AppError(databaseErrorCode(error.message), { message: error.message });
}

// The board ---------------------------------------------------------------------------------------

/** The organization's chain; the default when none was saved. */
export async function fetchOnboardingFormChain(client: Client): Promise<readonly ChainedFormRef[]> {
  const { data, error } = await client
    .from('onboarding_form_chains')
    .select('form_refs')
    .maybeSingle();
  if (error) throw databaseError(error);
  return data === null ? DEFAULT_ONBOARDING_CHAIN : parseRefs(data.form_refs);
}

export async function saveOnboardingFormChain(
  client: Client,
  refs: readonly ChainedFormRef[],
): Promise<void> {
  const { error } = await client.rpc('save_onboarding_form_chain', { p_refs: [...refs] });
  if (error) throw databaseError(error);
}

/** A form's screens that ask her something, in the form's order: the ones her phone walks. */
export function customFormAskingScreens(
  catalog: IntakeCatalog,
  form: Pick<CustomForm, 'screens'>,
): readonly CustomFormScreen[] {
  return form.screens.filter(
    (screen) =>
      customFormScreenQuestions(catalog, screen.id).length > 0 ||
      customFormScreenBlocks(catalog, screen.id).length > 0 ||
      customFormScreenConsents(catalog, screen.id).length > 0,
  );
}

/**
 * The season authorization's screens for a new player: the document, the
 * health screen while a field is placed on it, then the consents and the
 * signature. The re-registration screens are for returning players only.
 */
export function authorizationScreenCount(catalog: IntakeCatalog): number {
  return 2 + (authorizationQuestions(catalog).length > 0 ? 1 : 0);
}

/** A chained form the chain can still show: the authorization, or a live form she fills in. */
export function chainedCustomForm(
  catalog: IntakeCatalog,
  ref: ChainedFormRef,
): CustomForm | undefined {
  const id = customFormIdOfRef(ref);
  return id === null
    ? undefined
    : (catalog.customForms ?? []).find(
        (form) => form.id === id && !form.isArchived && form.filledBy === 'player',
      );
}

/** How many screens a chained form shows a new player. */
export function chainedFormScreenCount(catalog: IntakeCatalog, ref: ChainedFormRef): number {
  if (ref === AUTHORIZATION_FORM_REF) return authorizationScreenCount(catalog);
  const form = chainedCustomForm(catalog, ref);
  return form === undefined ? 0 : customFormAskingScreens(catalog, form).length;
}

export interface OnboardingScreenCounts {
  /** Onboarding's own screens she can be shown, the summary included. */
  readonly onboarding: number;
  /** The app terms: the screen before them and the one she signs. */
  readonly terms: number;
  /** The chained forms' screens. */
  readonly forms: number;
  readonly total: number;
}

/** The app terms' screens on her phone: the one before them and the one she signs. */
export const TERMS_SCREEN_COUNT = FINAL_WIZARD_SCREENS.filter(
  (screen) => screen !== 'summary',
).length;

/**
 * The screens a new player can be shown, for "Fins a N pantalles". Hidden and
 * archived screens are out, and so is a Ramassà screen with nothing to ask.
 * Some players see fewer (a question already answered is skipped), so the
 * board reads it as "up to".
 */
export function onboardingScreenCounts(
  catalog: IntakeCatalog,
  chain: readonly ChainedFormRef[],
): OnboardingScreenCounts {
  const hidden = wizardFlow(catalog).hiddenScreens;
  const own = movableOrder(catalog).filter((key) => {
    const step = flowStep(catalog, key);
    if (step === null) return false;
    if (step.kind === 'builtin') return !hidden.has(step.key);
    return step.kind !== 'custom' || isShownToHer(catalog, step.screen);
  }).length;
  const terms = TERMS_SCREEN_COUNT;
  const onboarding = own + 1;
  const forms = chain.reduce((sum, ref) => sum + chainedFormScreenCount(catalog, ref), 0);
  return { onboarding, terms, forms, total: onboarding + terms + forms };
}

// Her phone ---------------------------------------------------------------------------------------

/** Her chain while it is ahead of her; empty once she finished it, or for anyone else. */
export async function fetchMyOnboardingChain(client: Client): Promise<readonly ChainedFormRef[]> {
  const { data, error } = await client.rpc('my_onboarding_chain');
  if (error) throw databaseError(error);
  return parseRefs(data);
}

/** She went through her chain: it never shows again, and the forms keep their own rules. */
export async function finishOnboardingChain(client: Client): Promise<void> {
  const { error } = await client.rpc('finish_onboarding_chain');
  if (error) throw databaseError(error);
}

/** The next chained form she goes through, or null when none applies to her. */
export type ChainedFormStep =
  { readonly kind: 'authorization' } | { readonly kind: 'custom'; readonly responseId: string };

/**
 * The first chained form that applies to her, in the chain's order: the
 * authorization while she has to sign it, a form while she has a pending ask
 * for it. A form she put off on this walk (`passed`) is skipped.
 */
export function nextChainedForm(
  chain: readonly ChainedFormRef[],
  her: {
    readonly mustSignAuthorization: boolean;
    readonly pending: readonly { readonly formId: string; readonly responseId: string }[];
    readonly passed?: ReadonlySet<ChainedFormRef>;
  },
): ChainedFormStep | null {
  for (const ref of chain) {
    if (her.passed?.has(ref) === true) continue;
    if (ref === AUTHORIZATION_FORM_REF) {
      if (her.mustSignAuthorization) return { kind: 'authorization' };
      continue;
    }
    const asked = her.pending.find((form) => form.formId === customFormIdOfRef(ref));
    if (asked !== undefined) return { kind: 'custom', responseId: asked.responseId };
  }
  return null;
}
