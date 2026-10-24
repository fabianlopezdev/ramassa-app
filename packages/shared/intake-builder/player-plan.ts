/**
 * One player's copy of the onboarding (RAPP-643, RAPP-644, RAPP-645): her
 * screens in the order her phone walks them, each with its questions, the
 * app's own and Ramassà's in one list, and staff's choice on each (Auto, Ask,
 * Don't ask). The Control Center's last step of a new participant, her
 * participant page and the staff phone's invitation all plan with it, so the
 * three never disagree.
 *
 * The rules are her phone's and the database's:
 *   - an app question is asked as `previewWizardQuestions` says;
 *   - a Ramassà question on Auto is asked unless she answered it, on Ask
 *     always, on Don't ask never;
 *   - Don't ask is refused on a required question nobody answered, and a
 *     screen holding one cannot be skipped;
 *   - the summary, the terms and the season authorization always end it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from '../errors';
import {
  customStepId,
  customStepKey,
  FINAL_WIZARD_SCREENS,
  INTAKE_QUESTIONS,
  WIZARD_QUESTION_SCREENS,
  WIZARD_SCREEN_QUESTIONS,
  wizardFlowOrder,
  type AnsweredQuestions,
  type IntakeQuestion,
  type WizardQuestionScreen,
  type WizardStepKey,
} from '../onboarding/intake';
import {
  INTAKE_STATE_PRESETS,
  type IntakeQuestionState,
  type QuestionStates,
} from '../onboarding/question-states';
import {
  allowedQuestionStates,
  previewWizardQuestions,
  type WizardQuestionAsking,
} from '../onboarding/wizard-preview';
import type { LanguageCode } from '../schemas/language';
import type { Database } from '../types/database';
import {
  addedQuestions,
  allowedCustomQuestionStates,
  canSkipCustomQuestion,
  customStateKey,
  hiddenBuiltinQuestions,
  isAskedOfHer,
  isCustomQuestionRequired,
  isOwnScreen,
  placedQuestions,
  requiredBuiltinQuestions,
  textIn,
  wizardFlow,
  type CustomAnswers,
  type CustomQuestion,
  type CustomQuestionStates,
  type IntakeCatalog,
  type IntakeScreen,
} from './builder';

// Her screens in order -------------------------------------------------------------------------------

/** The screens that always end the onboarding, in order. */
export const LOCKED_STEPS = ['summary', 'terms-intro', 'terms', 'authorization'] as const;
export type LockedStep = (typeof LOCKED_STEPS)[number];

/** One screen of her onboarding: a Ramassà screen, an app question screen, or a locked end. */
export type FlowStep =
  | { readonly kind: 'custom'; readonly key: WizardStepKey; readonly screen: IntakeScreen }
  | { readonly kind: 'builtin'; readonly key: WizardQuestionScreen }
  | { readonly kind: 'locked'; readonly key: LockedStep };

/** The live Ramassà screens of their own; a holder of an app screen's added questions is none. */
export function liveScreens(catalog: IntakeCatalog): readonly IntakeScreen[] {
  return catalog.screens.filter((screen) => !screen.isArchived && isOwnScreen(screen));
}

/** The movable steps in her order: the app's question screens and every live Ramassà screen. */
export function movableOrder(catalog: IntakeCatalog): readonly WizardStepKey[] {
  const final = new Set<string>(FINAL_WIZARD_SCREENS);
  return wizardFlowOrder(
    liveScreens(catalog).map((screen) => ({
      id: screen.id,
      afterScreen: screen.afterScreen,
      isAnswered: false,
    })),
    wizardFlow(catalog),
  ).filter((step) => !final.has(step));
}

function isQuestionScreen(step: string): step is WizardQuestionScreen {
  return (WIZARD_QUESTION_SCREENS as readonly string[]).includes(step);
}

function isLockedStep(step: string): step is LockedStep {
  return (LOCKED_STEPS as readonly string[]).includes(step);
}

/** One step from its key, or null for a step the catalog no longer has. */
export function flowStep(catalog: IntakeCatalog, key: string): FlowStep | null {
  if (isLockedStep(key)) return { kind: 'locked', key };
  if (isQuestionScreen(key)) return { kind: 'builtin', key };
  const id = customStepId(key);
  const screen = id === null ? undefined : liveScreens(catalog).find((each) => each.id === id);
  return screen === undefined ? null : { kind: 'custom', key: customStepKey(screen.id), screen };
}

/** Every step in her order: the movable ones, then the locked ones. */
export function flowSteps(catalog: IntakeCatalog): readonly FlowStep[] {
  return [...movableOrder(catalog), ...LOCKED_STEPS]
    .map((key) => flowStep(catalog, key))
    .filter((step): step is FlowStep => step !== null);
}

/**
 * The name staff know a step by, in their language: a Ramassà screen's
 * title, else the app screen's name from the `settings` translations.
 */
export function flowStepName(
  step: FlowStep,
  language: LanguageCode,
  t: (key: string) => string,
): string {
  if (step.kind === 'custom') return textIn(step.screen.title, language);
  if (step.key === 'authorization') return t('settings:onboardingBoard.authorization');
  return t(`settings:builtinScreens.screenName.${step.key}`);
}

/** A Ramassà screen her phone shows: it holds a live question asked of her. */
export function isShownToHer(screen: IntakeScreen): boolean {
  return screen.questions.some((question) => !question.isArchived && isAskedOfHer(question));
}

// Her choices --------------------------------------------------------------------------------------

/** Staff's choices for one player: on the app's questions and on Ramassà's. */
export interface PlayerChoices {
  readonly states: QuestionStates;
  readonly customStates: CustomQuestionStates;
}

export const NO_CHOICES: PlayerChoices = { states: {}, customStates: {} };

/** One question of a screen as staff choose it. */
export type PlanQuestion =
  | (PlanQuestionBase & { readonly kind: 'builtin'; readonly question: IntakeQuestion })
  | (PlanQuestionBase & { readonly kind: 'custom'; readonly question: CustomQuestion });

interface PlanQuestionBase {
  /** The built-in question name, or the Ramassà question's id. */
  readonly key: string;
  /** The choice that will be saved: Don't ask where it is refused shows as Auto. */
  readonly state: IntakeQuestionState;
  readonly asking: WizardQuestionAsking;
  readonly isAnswered: boolean;
  readonly isRequired: boolean;
  /** Don't ask is allowed: optional, or required and answered. */
  readonly canSkip: boolean;
}

export interface PlanScreen {
  readonly step: FlowStep;
  /** Her step number on this plan, counting only the screens it shows. */
  readonly number: number;
  readonly questions: readonly PlanQuestion[];
  /** Every question is set to Don't ask. */
  readonly isSkipped: boolean;
  /** A required question nobody answered keeps the screen: it cannot be skipped. */
  readonly mustAsk: boolean;
  /** How many of its questions she will be asked. */
  readonly askedCount: number;
}

export interface PlayerPlan {
  readonly screens: readonly PlanScreen[];
  readonly askedCount: number;
  readonly total: number;
}

function liveForHer(questions: readonly CustomQuestion[]): readonly CustomQuestion[] {
  return questions.filter((question) => !question.isArchived && isAskedOfHer(question));
}

/**
 * Her plan: only the screens it can show (none staff hid, none with nothing
 * for her), the locked ends last. `customAnswers` are her answers to Ramassà's
 * questions, none for a player not created yet.
 */
export function playerPlan(
  catalog: IntakeCatalog,
  answered: AnsweredQuestions,
  choices: PlayerChoices,
  customAnswers: CustomAnswers = {},
): PlayerPlan {
  const flow = wizardFlow(catalog);
  const previews = new Map(
    previewWizardQuestions(
      answered,
      choices.states,
      hiddenBuiltinQuestions(catalog),
      flow,
      requiredBuiltinQuestions(catalog),
    ).map((row) => [row.question, row] as const),
  );

  const builtinQuestions = (screen: WizardQuestionScreen): PlanQuestion[] =>
    WIZARD_SCREEN_QUESTIONS[screen].flatMap((question): PlanQuestion[] => {
      const preview = previews.get(question);
      if (preview === undefined || preview.isRemoved) return [];
      return [
        {
          kind: 'builtin',
          key: question,
          question,
          state: preview.state === 'skip' && !preview.canSkip ? 'auto' : preview.state,
          asking: preview.asking,
          isAnswered: preview.isAnswered,
          isRequired: preview.isRequired,
          canSkip: preview.canSkip,
        },
      ];
    });
  const customQuestions = (questions: readonly CustomQuestion[]): PlanQuestion[] =>
    liveForHer(questions).map((question): PlanQuestion => {
      const canSkip = canSkipCustomQuestion(question, customAnswers);
      const saved = choices.customStates[question.id] ?? 'auto';
      const state = saved === 'skip' && !canSkip ? 'auto' : saved;
      const isAnswered = customAnswers[question.id] !== undefined;
      const isAsked = state === 'ask' || (state === 'auto' && !isAnswered);
      return {
        kind: 'custom',
        key: question.id,
        question,
        state,
        asking: !isAsked
          ? 'not-asked'
          : question.showWhen === undefined
            ? 'asked'
            : 'when-it-applies',
        isAnswered,
        isRequired: isCustomQuestionRequired(question),
        canSkip,
      };
    });

  const screens = flowSteps(catalog)
    .flatMap((step): { step: FlowStep; questions: PlanQuestion[] }[] => {
      if (step.kind === 'locked') return [{ step, questions: [] }];
      if (step.kind === 'builtin' && flow.hiddenScreens.has(step.key)) return [];
      const questions =
        step.kind === 'custom'
          ? customQuestions(placedQuestions(catalog, step.screen.id, step.screen.questions))
          : [...builtinQuestions(step.key), ...customQuestions(addedQuestions(catalog, step.key))];
      return questions.length === 0 ? [] : [{ step, questions }];
    })
    .map(({ step, questions }, index): PlanScreen => ({
      step,
      number: index + 1,
      questions,
      isSkipped: questions.length > 0 && questions.every((question) => question.state === 'skip'),
      mustAsk: questions.some((question) => !question.canSkip),
      askedCount: questions.filter((question) => question.asking !== 'not-asked').length,
    }));
  const all = screens.flatMap((screen) => screen.questions);
  return {
    screens,
    askedCount: all.filter((question) => question.asking !== 'not-asked').length,
    total: all.length,
  };
}

/** One question's choice changed; Auto is stored as no entry. */
export function withQuestionChoice(
  choices: PlayerChoices,
  question: Pick<PlanQuestion, 'kind' | 'key'>,
  state: IntakeQuestionState,
): PlayerChoices {
  if (question.kind === 'builtin') {
    const states: Partial<Record<IntakeQuestion, 'ask' | 'skip'>> = { ...choices.states };
    if (state === 'auto') delete states[question.key as IntakeQuestion];
    else states[question.key as IntakeQuestion] = state;
    return { ...choices, states };
  }
  const customStates: Record<string, 'ask' | 'skip'> = { ...choices.customStates };
  if (state === 'auto') delete customStates[question.key];
  else customStates[question.key] = state;
  return { ...choices, customStates };
}

/**
 * A whole screen asked (each question back to Auto) or skipped (each one
 * that may be skipped set to Don't ask).
 */
export function withScreenChoice(
  choices: PlayerChoices,
  screen: PlanScreen,
  isAsked: boolean,
): PlayerChoices {
  return screen.questions.reduce(
    (next, question) =>
      withQuestionChoice(
        next,
        question,
        isAsked ? 'auto' : question.canSkip ? 'skip' : question.state,
      ),
    choices,
  );
}

/**
 * A preset fills every choice: the app's questions from its states, and
 * Ramassà's questions on Ask when it is "she reviews everything", else Auto.
 */
export function presetChoices(
  catalog: IntakeCatalog,
  states: QuestionStates,
  askAll: boolean,
): PlayerChoices {
  if (!askAll) return { states, customStates: {} };
  const ids = liveScreens(catalog)
    .flatMap((screen) => liveForHer(placedQuestions(catalog, screen.id, screen.questions)))
    .concat(
      WIZARD_QUESTION_SCREENS.flatMap((screen) => liveForHer(addedQuestions(catalog, screen))),
    )
    .map((question) => question.id);
  return {
    states,
    customStates: Object.fromEntries(ids.map((id) => [id, 'ask' as const])),
  };
}

/** The two built-in presets, in the shape a plan takes. */
export const PLAYER_PRESETS = {
  missing: (catalog: IntakeCatalog) => presetChoices(catalog, INTAKE_STATE_PRESETS.missing, false),
  review: (catalog: IntakeCatalog) => presetChoices(catalog, INTAKE_STATE_PRESETS.review, true),
} as const;

/**
 * What changed between two sets of choices, as `set_intake_question_states`
 * takes it: Auto for a removed choice, a Ramassà question as `custom:<id>`.
 */
export function choiceChanges(
  before: PlayerChoices,
  after: PlayerChoices,
): Readonly<Record<string, IntakeQuestionState>> {
  const changes: Record<string, IntakeQuestionState> = {};
  const builtin = new Set([...Object.keys(before.states), ...Object.keys(after.states)]);
  for (const key of builtin) {
    const old = before.states[key as IntakeQuestion] ?? 'auto';
    const next = after.states[key as IntakeQuestion] ?? 'auto';
    if (old !== next) changes[key] = next;
  }
  const custom = new Set([...Object.keys(before.customStates), ...Object.keys(after.customStates)]);
  for (const id of custom) {
    const old = before.customStates[id] ?? 'auto';
    const next = after.customStates[id] ?? 'auto';
    if (old !== next) changes[customStateKey(id)] = next;
  }
  return changes;
}

/** The choices to send with the invitation: the ones the database would refuse fall back to Auto. */
export function choicesPayload(
  catalog: IntakeCatalog,
  answered: AnsweredQuestions,
  choices: PlayerChoices,
): Readonly<Record<string, 'ask' | 'skip'>> {
  return {
    ...allowedQuestionStates(choices.states, answered, requiredBuiltinQuestions(catalog)),
    ...allowedCustomQuestionStates(choices.customStates, catalog),
  };
}

/** Staff read one player's choices on every question, the app's and Ramassà's. */
export async function fetchParticipantChoices(
  client: SupabaseClient<Database>,
  profileId: string,
): Promise<PlayerChoices> {
  const { data, error } = await client.rpc('participant_question_states', {
    p_profile_id: profileId,
  });
  if (error) throw new AppError('DB-1', { message: error.message });
  const rows = z
    .array(z.object({ question: z.string(), state: z.enum(['ask', 'skip']) }))
    .parse(data ?? []);
  const states: Partial<Record<IntakeQuestion, 'ask' | 'skip'>> = {};
  const customStates: Record<string, 'ask' | 'skip'> = {};
  for (const row of rows) {
    if (row.question.startsWith('custom:')) customStates[row.question.slice(7)] = row.state;
    else if ((INTAKE_QUESTIONS as readonly string[]).includes(row.question))
      states[row.question as IntakeQuestion] = row.state;
  }
  return { states, customStates };
}
