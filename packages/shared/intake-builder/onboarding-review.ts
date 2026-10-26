/**
 * Onboarding's Nova versió (RAPP-697): a screen saved as a new version asks
 * every player who finished Onboarding before it to go through that screen
 * again, before she uses the app.
 *
 * Staff mark the screen (`markOnboardingScreenChanged`). Her phone reads her
 * screens to review (`fetchMyOnboardingReview`) and walks them with the
 * Onboarding wizard itself, planned by `reviewFlow`, `reviewNotAsked` and
 * `reviewAsking`: only those screens, in board order, every question on them
 * asked with her saved answer filled in. Finishing saves her answers through
 * the Onboarding writers (`complete_onboarding_review`).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError, databaseErrorCode } from '../errors';
import {
  customStepId,
  customStepKey,
  INTAKE_QUESTIONS,
  WIZARD_QUESTION_SCREENS,
  WIZARD_SCREEN_QUESTIONS,
  type AnsweredQuestions,
  type CustomWizardScreen,
  type IntakeQuestion,
  type WizardFlow,
  type WizardQuestionScreen,
  type WizardStepKey,
} from '../onboarding/intake';
import { DETAIL_SCREEN_PARENTS, type EditableWizardScreen } from '../onboarding/screen-texts';
import type { Database, Json } from '../types/database';
import { placedQuestions, type IntakeCatalog } from './builder';

type Client = SupabaseClient<Database>;

function databaseError(error: { readonly message: string }): AppError {
  return new AppError(databaseErrorCode(error.message), { message: error.message });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A screen as the database keys it (an app screen's name, a Ramassà screen's id) as a wizard step. */
export function reviewStepKey(screenKey: string): WizardStepKey | null {
  if (UUID.test(screenKey)) return customStepKey(screenKey);
  return (WIZARD_QUESTION_SCREENS as readonly string[]).includes(screenKey)
    ? (screenKey as WizardQuestionScreen)
    : null;
}

/**
 * The screen a Nova versió marks for a screen staff edit: its own step, or
 * the step a detail screen opens from. Null for a screen she never reviews
 * (the summary and the terms, which have their own forms).
 */
export function newVersionScreenKey(screen: string): string | null {
  if (UUID.test(screen)) return screen;
  const parent = DETAIL_SCREEN_PARENTS[screen as EditableWizardScreen];
  if (parent !== undefined) return parent;
  return (WIZARD_QUESTION_SCREENS as readonly string[]).includes(screen) ? screen : null;
}

/** Desa's Nova versió on an Onboarding screen: players who finished review it. */
export async function markOnboardingScreenChanged(
  client: Client,
  screenKey: string,
): Promise<void> {
  const { error } = await client.rpc('mark_onboarding_screen_changed', {
    p_screen_key: screenKey,
  });
  if (error) throw databaseError(error);
}

/** Her screens to review, as wizard steps; none when she has nothing pending. */
export async function fetchMyOnboardingReview(client: Client): Promise<readonly WizardStepKey[]> {
  const { data, error } = await client.rpc('my_onboarding_review');
  if (error) throw databaseError(error);
  return z
    .array(z.string())
    .parse(data ?? [])
    .flatMap((key) => {
      const step = reviewStepKey(key);
      return step === null ? [] : [step];
    });
}

/** What she sends when she finishes her review: her names, her answers by field, her signatures. */
export interface OnboardingReviewPayload {
  readonly first_name?: string;
  readonly last_name?: string;
  readonly answers: Json;
  readonly signatures: Json;
}

export async function completeOnboardingReview(
  client: Client,
  payload: OnboardingReviewPayload,
): Promise<void> {
  const { error } = await client.rpc('complete_onboarding_review', {
    payload: payload as unknown as Json,
  });
  if (error) throw databaseError(error);
}

/** Whether she still has screens to review, for her page. */
export async function fetchParticipantOnboardingReviewPending(
  client: Client,
  profileId: string,
): Promise<boolean> {
  const { data, error } = await client.rpc('participant_onboarding_review_pending', {
    p_profile_id: profileId,
  });
  if (error) throw databaseError(error);
  return z.boolean().parse(data ?? false);
}

// The review run planned with the wizard's own planner ------------------------------------------------

/** Her flow for a review: every app screen she does not review is hidden. */
export function reviewFlow(flow: WizardFlow, pending: readonly WizardStepKey[]): WizardFlow {
  return {
    order: flow.order,
    hiddenScreens: new Set([
      ...flow.hiddenScreens,
      ...WIZARD_QUESTION_SCREENS.filter((screen) => !pending.includes(screen)),
    ]),
  };
}

/**
 * The app's questions her review does not ask: every one off her screens to
 * review, and the ones staff removed. The ones on them are asked, answered or
 * not, with her answer filled in.
 */
export function reviewNotAsked(
  hidden: ReadonlySet<IntakeQuestion>,
  pending: readonly WizardStepKey[],
): AnsweredQuestions {
  const asked = new Set<IntakeQuestion>(
    WIZARD_QUESTION_SCREENS.filter((screen) => pending.includes(screen)).flatMap(
      (screen) => WIZARD_SCREEN_QUESTIONS[screen],
    ),
  );
  return new Set([...INTAKE_QUESTIONS.filter((question) => !asked.has(question)), ...hidden]);
}

/** Every field placed on a screen she reviews, on Ask: it shows with her answer to confirm. */
export function reviewAsking(
  catalog: IntakeCatalog,
  pending: readonly WizardStepKey[],
  asking: ReadonlyMap<string, boolean> = new Map(),
): ReadonlyMap<string, boolean> {
  const next = new Map(asking);
  for (const step of pending) {
    for (const question of placedQuestions(catalog, customStepId(step) ?? step)) {
      next.set(question.id, true);
    }
  }
  return next;
}

/** Her staff screens for a review: the ones she does not review count as answered, so they are skipped. */
export function reviewPlan(
  plan: readonly CustomWizardScreen[],
  pending: readonly WizardStepKey[],
): readonly CustomWizardScreen[] {
  return plan.map((screen) =>
    pending.includes(screen.builtinScreen ?? customStepKey(screen.id))
      ? screen
      : { ...screen, isAnswered: true },
  );
}
