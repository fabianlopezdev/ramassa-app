/**
 * The suggestions form on the board (RAPP-939): what a player fills in when
 * she sends the club a suggestion (Suggeriments). It is one of the forms she
 * sends when she wants, drawn by the board and the screen page those forms
 * share (`lib/on-demand-form.ts`).
 *
 * Its fixed screen (`systemScreen` `feedback_message`) holds the suggestion's
 * own parts, which the app draws and staff cannot remove: the type, the text
 * and the photo. The phones draw them first on that screen, worded as her
 * app words them.
 */

import type { PhoneQuestion, Translate } from '@/components/onboarding/screen-content';
import {
  fixedPhoneQuestion,
  isOnDemandFixedScreen,
  onDemandFormView,
  type OnDemandFormDefinition,
  type OnDemandFormView,
} from '@/lib/on-demand-form';
import { FEEDBACK_MESSAGE_SCREEN, FEEDBACK_TYPES } from '@ramassa/shared/feedback';
import type { CustomFormScreen, IntakeCatalog } from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export type FeedbackFormView = OnDemandFormView;

/** The suggestions form as a form of the engine; null from a server before it. */
export function feedbackFormView(catalog: IntakeCatalog): FeedbackFormView | null {
  return onDemandFormView(catalog, 'feedback');
}

/** Whether a screen is the one holding the type, the text and the photo. */
export function isFeedbackMessageScreen(screen: Pick<CustomFormScreen, 'systemScreen'>): boolean {
  return isOnDemandFixedScreen(FEEDBACK_FORM, screen);
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
  return [
    fixedPhoneQuestion(language, 'feedback', {
      id: 'type',
      type: 'single_choice',
      label: say('feedback:typeLabel'),
      isRequired: true,
      options: FEEDBACK_TYPES.map((type) => say(FEEDBACK_TYPE_KEYS[type])),
    }),
    fixedPhoneQuestion(language, 'feedback', {
      id: 'content',
      type: 'long_text',
      label: say('feedback:contentLabel'),
      isRequired: true,
    }),
    fixedPhoneQuestion(language, 'feedback', {
      id: 'image',
      type: 'file_upload',
      label: say('feedback:imageAdd'),
      isRequired: false,
    }),
  ];
}

/** Formularis › Formulari de suggeriments, on the board the on-demand forms share. */
export const FEEDBACK_FORM: OnDemandFormDefinition = {
  key: 'feedback',
  fixedScreen: FEEDBACK_MESSAGE_SCREEN,
  boardPath: '/forms/feedback',
  screenPath: '/forms/feedback/screens/$screenId',
  nameKey: 'nav:staff.feedbackForm',
  namespace: 'feedback',
  fixedPhoneQuestions: feedbackFixedPhoneQuestions,
};
