/**
 * The app's own forms she sends when she wants, on the board (RAPP-939,
 * RAPP-940, RAPP-973): the suggestions form, the mentoring request and the
 * incident report. Each is read as
 * a form of the engine, so the board, the phones and the screen editor every
 * form uses draw it as they draw any form, and both share one board and one
 * screen page (`OnDemandFormBoard`, `OnDemandFormScreenEditor`).
 *
 * The dashboard's catalog sends each apart from the lists of forms
 * (`feedbackForm`, `mentoringForm`, `incidentForm`); their questions are among the fields and
 * their placements among the forms' rows. The view below adds the form to the
 * forms, so the shared pieces that find a form by id find it.
 *
 * Each has one fixed screen holding the request's own parts, which the app
 * draws and staff cannot remove. A definition says which screen that is, how
 * the phones draw those parts, and where its pages are.
 */

import type { PhoneQuestion, Translate } from '@/components/onboarding/screen-content';
import {
  onDemandFormOf,
  type CustomForm,
  type CustomFormScreen,
  type FormSystemScreen,
  type IntakeCatalog,
  type OnDemandFormKey,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export interface OnDemandFormDefinition {
  readonly key: OnDemandFormKey;
  /** The screen holding the request's own parts. */
  readonly fixedScreen: FormSystemScreen;
  /** The board, and one screen's editor. */
  readonly boardPath: '/forms/feedback' | '/forms/mentoring' | '/forms/incidents';
  readonly screenPath:
    | '/forms/feedback/screens/$screenId'
    | '/forms/mentoring/screens/$screenId'
    | '/forms/incidents/screens/$screenId';
  /** The one key that names it in the menu, on the page and in the editor's back link. */
  readonly nameKey: 'nav:staff.feedbackForm' | 'nav:staff.mentoringForm' | 'nav:staff.incidentForm';
  /** The translation namespace its fixed parts are worded in, as her app words them. */
  readonly namespace: 'feedback' | 'mentoring' | 'incidents';
  /** The fixed parts on her phone, in one language. They lead the fixed screen. */
  readonly fixedPhoneQuestions: (language: LanguageCode, t: Translate) => readonly PhoneQuestion[];
}

export interface OnDemandFormView {
  /** The catalog with the form among its forms. */
  readonly catalog: IntakeCatalog;
  readonly form: CustomForm;
}

/** The form as a form of the engine; null from a server before it. */
export function onDemandFormView(
  catalog: IntakeCatalog,
  key: OnDemandFormKey,
): OnDemandFormView | null {
  const form = onDemandFormOf(catalog, key);
  if (form === undefined) return null;
  return { form, catalog: { ...catalog, customForms: [...(catalog.customForms ?? []), form] } };
}

/** Whether a screen is the form's fixed screen. */
export function isOnDemandFixedScreen(
  definition: Pick<OnDemandFormDefinition, 'fixedScreen'>,
  screen: Pick<CustomFormScreen, 'systemScreen'>,
): boolean {
  return screen.systemScreen === definition.fixedScreen;
}

/**
 * One fixed part as the phones draw it, in one language: a question with no
 * wording to edit, worded as her app words it.
 */
export function fixedPhoneQuestion(
  language: LanguageCode,
  namespace: OnDemandFormDefinition['namespace'],
  part: {
    /** The part's name in the form, kept apart from every other question's id. */
    readonly id: string;
    readonly type: PhoneQuestion['draft']['type'];
    readonly label: string;
    readonly isRequired: boolean;
    readonly options?: readonly string[];
  },
): PhoneQuestion {
  const only = (text: string) => ({ [language]: text });
  return {
    id: `${namespace}:${part.id}`,
    label: part.label,
    help: '',
    isRequired: part.isRequired,
    draft: {
      type: part.type,
      label: only(part.label),
      help: {},
      settings: {},
      options: (part.options ?? []).map(only),
      ...(part.type === 'single_choice' ? { look: 'cards' as const } : {}),
    },
  };
}
