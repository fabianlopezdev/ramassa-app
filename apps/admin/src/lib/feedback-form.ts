/**
 * The suggestions form on the board (RAPP-939): what a player fills in when
 * she sends the club a suggestion (Suggeriments), read as a form of the
 * engine so the board, the phones and the screen editor every form uses draw
 * it as they draw any form.
 *
 * The dashboard's catalog sends it apart from the lists of forms
 * (`feedbackForm`); its questions are among the fields and its placements
 * among the forms' rows. The view below adds it to the forms, so the shared
 * pieces that find a form by id find it.
 *
 * Its fixed screen (`systemScreen` `feedback_message`) holds the suggestion's
 * own parts, which the app draws and staff cannot remove: the type, the text
 * and the photo. The phones draw them first on that screen, worded as her
 * app words them.
 */

import type { PhoneQuestion, Translate } from '@/components/onboarding/screen-content';
import { FEEDBACK_MESSAGE_SCREEN, FEEDBACK_TYPES } from '@ramassa/shared/feedback';
import type { CustomForm, CustomFormScreen, IntakeCatalog } from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export interface FeedbackFormView {
  /** The catalog with the suggestions form among its forms. */
  readonly catalog: IntakeCatalog;
  readonly form: CustomForm;
}

/** The suggestions form as a form of the engine; null from a server before it. */
export function feedbackFormView(catalog: IntakeCatalog): FeedbackFormView | null {
  const form = catalog.feedbackForm;
  if (form === undefined) return null;
  return { form, catalog: { ...catalog, customForms: [...(catalog.customForms ?? []), form] } };
}

/** Whether a screen is the one holding the type, the text and the photo. */
export function isFeedbackMessageScreen(screen: Pick<CustomFormScreen, 'systemScreen'>): boolean {
  return screen.systemScreen === FEEDBACK_MESSAGE_SCREEN;
}

const FEEDBACK_TYPE_KEYS = {
  activity_proposal: 'feedback:typeActivityProposal',
  idea: 'feedback:typeIdea',
  problem: 'feedback:typeProblem',
  general: 'feedback:typeGeneral',
} as const;

/**
 * The fixed parts on her phone, in one language, as her app words them: the
 * type she picks, her message and the optional photo. They lead the fixed
 * screen; the questions staff add come after them.
 */
export function feedbackFixedPhoneQuestions(
  language: LanguageCode,
  t: Translate,
): readonly PhoneQuestion[] {
  const say = (key: string) => t(key, { lng: language });
  const only = (text: string) => ({ [language]: text });
  const part = (
    id: string,
    type: PhoneQuestion['draft']['type'],
    label: string,
    isRequired: boolean,
    options: readonly string[] = [],
  ): PhoneQuestion => ({
    id: `feedback:${id}`,
    label,
    help: '',
    isRequired,
    draft: {
      type,
      label: only(label),
      help: {},
      settings: {},
      options: options.map(only),
      ...(type === 'single_choice' ? { look: 'cards' as const } : {}),
    },
  });
  return [
    part(
      'type',
      'single_choice',
      say('feedback:typeLabel'),
      true,
      FEEDBACK_TYPES.map((type) => say(FEEDBACK_TYPE_KEYS[type])),
    ),
    part('content', 'long_text', say('feedback:contentLabel'), true),
    part('image', 'file_upload', say('feedback:imageAdd'), false),
  ];
}
