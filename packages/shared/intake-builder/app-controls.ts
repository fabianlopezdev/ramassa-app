/**
 * When the app's own screens stop asking a field with their own control
 * (RAPP-665).
 *
 * Her phone asks the app's fields on the app's own screens, each with the
 * control it always had (the date boxes, the document cards, the size chips).
 * Staff now edit every field on Dades de les jugadores: its type, its options,
 * where it is asked. A question's own control asks it only while
 *
 *   - its first field is placed on her onboarding, on the question's own app
 *     screen, and is not archived;
 *   - the control can read every field of the question: its type, and every
 *     live option's key (`appControlFits`).
 *
 * Otherwise the question is off its control: the app screen hides the control
 * (`hiddenBuiltinQuestions` lists it), and every field of the question is asked
 * where it is placed with the generic renderer, as a Ramassà field is. Her
 * names keep their own control: her phone asks them as text and the database
 * fits the text to their type (RAPP-693).
 */
import {
  WIZARD_QUESTION_SCREENS,
  WIZARD_SCREEN_QUESTIONS,
  type IntakeQuestion,
  type WizardQuestionScreen,
} from '../onboarding/intake';
import {
  ACCOUNT_NAME_KEYS,
  SYSTEM_FIELD_QUESTIONS,
  systemKeysOfQuestion,
  type SystemFieldKey,
} from '../onboarding/system-fields';
import { appControlFits } from './app-field-form';
import type { SystemField, SystemFieldIndex } from './field-answers';
import type { ProfileField, ProfileLayout } from './profile-layout';
import type { CustomAnswerValue } from './question-types';

/** The app's fields of a layout by system key, as the app's forms read them. */
export function layoutSystemFields(layout: ProfileLayout): SystemFieldIndex {
  const index = new Map<SystemFieldKey, SystemField>();
  for (const field of layout.fields) {
    if (field.systemKey == null || field.isArchived) continue;
    index.set(field.systemKey, {
      id: field.id,
      type: field.type,
      privacy: field.privacy,
      options: field.options.map((option) => ({
        id: option.id,
        key: option.key ?? null,
        label: option.label,
        isArchived: option.isArchived,
      })),
    });
  }
  return index;
}

/** The app screen whose own control asks a question. */
export function ownScreenOf(question: IntakeQuestion): WizardQuestionScreen | undefined {
  return WIZARD_QUESTION_SCREENS.find((screen) =>
    WIZARD_SCREEN_QUESTIONS[screen].includes(question),
  );
}

const APP_QUESTIONS = [...new Set(Object.values(SYSTEM_FIELD_QUESTIONS))].filter(
  (question) => !(ACCOUNT_NAME_KEYS as readonly string[]).includes(question),
);

/** The app's questions whose own control no longer asks them, for one layout. */
export function questionsOffTheirControl(layout: ProfileLayout): ReadonlySet<IntakeQuestion> {
  // A layout with no app field at all (an older catalog, a test) changes nothing.
  if (!layout.fields.some((field) => field.systemKey != null)) return new Set();
  const index = layoutSystemFields(layout);
  return new Set(
    APP_QUESTIONS.filter((question) => {
      const [first] = systemKeysOfQuestion(question);
      const field = first === undefined ? undefined : index.get(first);
      if (field === undefined) return true;
      const placement = layout.placements.find(
        (candidate) => candidate.fieldId === field.id && candidate.surface === 'onboarding',
      );
      return placement?.screenKey !== ownScreenOf(question) || !appControlFits(index, question);
    }),
  );
}

/**
 * Whether a field is asked with the generic renderer wherever it is placed on
 * her onboarding and her season form: every Ramassà field, and an app field
 * whose question is off its control.
 */
export function isAskedGenerically(
  field: ProfileField,
  offTheirControl: ReadonlySet<IntakeQuestion>,
): boolean {
  if (field.kind !== 'builtin') return true;
  const question =
    field.builtinKey ?? (field.systemKey == null ? null : SYSTEM_FIELD_QUESTIONS[field.systemKey]);
  return question !== null && offTheirControl.has(question);
}

/**
 * What an edit screen sends for the app fields it asked with the generic
 * renderer (RAPP-666): her own edit and the staff phone's edit draw the app's
 * controls for every other question.
 */
export interface GenericFieldAnswers {
  /** Every app field the screen asked with the generic renderer. */
  readonly fieldIds: readonly string[];
  /** What changed among them, by field id; null removes an answer. */
  readonly answers: Readonly<Record<string, CustomAnswerValue | null>>;
}

/**
 * An edit's answers with the app fields the generic renderer asked: the app's
 * form never answers one of them (its control did not draw it), and their own
 * answers go instead.
 */
export function withGenericAnswers<
  Update extends { readonly answers: Readonly<Record<string, CustomAnswerValue | null>> },
>(update: Update, generic: GenericFieldAnswers | undefined): Update {
  if (generic === undefined || generic.fieldIds.length === 0) return update;
  const asked = new Set(generic.fieldIds);
  return {
    ...update,
    answers: {
      ...Object.fromEntries(Object.entries(update.answers).filter(([id]) => !asked.has(id))),
      ...generic.answers,
    },
  };
}
