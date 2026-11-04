/**
 * Walking a form she fills in (RAPP-700, RAPP-772): which of its screens she
 * is shown for her answers, the screen before and after the one she is on,
 * and what she sends from the screens she saw. One walk for a form the team
 * created, for the app terms at the end of her Onboarding and for the terms
 * she accepts again; each sends it its own way.
 *
 * A screen that depends on an answer (RAPP-715) shows right after the screen
 * asking it, only while her answers so far open it: changing that answer
 * changes what comes next, and she sends only the screens she saw.
 */
import type { LanguageCode } from '../schemas/language';
import type { Json } from '../types/database';
import { isCustomQuestionVisible, type CustomAnswers, type IntakeCatalog } from './builder';
import type { CustomForm, CustomFormScreen } from './custom-form-model';
import {
  customFormScreenBlocks,
  customFormScreenConsents,
  customFormScreenQuestions,
  type CustomFormAnswers,
} from './custom-forms';
import { formSignaturesPayload, type FormSignatureDrafts } from './form-blocks';
import { customFormAskingScreens } from './onboarding-chain';
import { openFormScreens } from './screen-branches';

/** What she gave on a form so far, kept across its screens. */
export interface FormWalkDraft {
  /** Her answers by field id, the stored ones under hers. */
  readonly answers: CustomAnswers;
  /** Her strokes or "No puc signar" (RAPP-771), by block id. */
  readonly signatures: FormSignatureDrafts;
  /** Her ticks, by consent key. */
  readonly consents: Readonly<Record<string, boolean>>;
}

export const EMPTY_FORM_WALK_DRAFT: FormWalkDraft = { answers: {}, signatures: {}, consents: {} };

/** The screens of a form she is shown for these answers, in her order. */
export function formWalkScreens(
  catalog: IntakeCatalog,
  form: Pick<CustomForm, 'screens'>,
  answers: CustomAnswers,
): readonly CustomFormScreen[] {
  return openFormScreens(catalog, form, customFormAskingScreens(catalog, form), answers);
}

/** The screen after one for these answers; null when it is the last she is shown. */
export function formWalkNext(
  catalog: IntakeCatalog,
  form: Pick<CustomForm, 'screens'>,
  screenId: string,
  answers: CustomAnswers,
): CustomFormScreen | null {
  const shown = formWalkScreens(catalog, form, answers);
  return shown[shown.findIndex((screen) => screen.id === screenId) + 1] ?? null;
}

/**
 * The screen before one for these answers; null on the first she is shown.
 * A screen her answers no longer open goes back to the one before it.
 */
export function formWalkPrevious(
  catalog: IntakeCatalog,
  form: Pick<CustomForm, 'screens'>,
  screenId: string,
  answers: CustomAnswers,
): CustomFormScreen | null {
  const shown = formWalkScreens(catalog, form, answers);
  const at = shown.findIndex((screen) => screen.id === screenId);
  if (at >= 0) return at > 0 ? (shown[at - 1] ?? null) : null;
  const order = customFormAskingScreens(catalog, form).map((screen) => screen.id);
  const place = order.indexOf(screenId);
  return shown.filter((screen) => order.indexOf(screen.id) < place).at(-1) ?? null;
}

/** Whether a screen is the last she is shown for these answers: Continue sends then. */
export function isLastFormWalkScreen(
  catalog: IntakeCatalog,
  form: Pick<CustomForm, 'screens'>,
  screenId: string,
  answers: CustomAnswers,
): boolean {
  const shown = formWalkScreens(catalog, form, answers);
  return shown[shown.length - 1]?.id === screenId;
}

/**
 * What she sends from the screens she saw: her answers to their visible
 * questions (an answer she cleared as null), her signatures with the language
 * each text was shown in, and her ticks of their consents.
 */
export function formWalkPayload(
  catalog: IntakeCatalog,
  screens: readonly Pick<CustomFormScreen, 'id'>[],
  draft: FormWalkDraft,
  language: LanguageCode,
): CustomFormAnswers & { readonly signatures: Json } {
  const asked = screens.flatMap((screen) => customFormScreenQuestions(catalog, screen.id));
  const blocks = screens.flatMap((screen) => customFormScreenBlocks(catalog, screen.id));
  const consents = screens.flatMap((screen) => customFormScreenConsents(catalog, screen.id));
  return {
    answers: Object.fromEntries(
      asked
        .filter((question) => isCustomQuestionVisible(question, draft.answers))
        .map((question) => [question.id, draft.answers[question.id] ?? null]),
    ),
    signatures: formSignaturesPayload(blocks, draft.signatures, language),
    ...(consents.length === 0
      ? {}
      : {
          consents: Object.fromEntries(
            consents.map((consent) => [consent.key, draft.consents[consent.key] === true]),
          ),
        }),
    language,
  };
}
