/**
 * The mentoring form on the board (RAPP-940): what a player fills in when she
 * asks the club for a one-to-one conversation (Mentoria). It is one of the
 * forms she sends when she wants, drawn by the board and the screen page
 * those forms share (`lib/on-demand-form.ts`).
 *
 * Its fixed screen (`systemScreen` `mentoring_request`) holds the request's
 * own parts, which the app draws and staff cannot remove: the topic, the
 * detail and the preferred date and time. The phones draw them first on that
 * screen, worded as her app words them.
 */

import type { PhoneQuestion, Translate } from '@/components/onboarding/screen-content';
import {
  fixedPhoneQuestion,
  isOnDemandFixedScreen,
  type OnDemandFormDefinition,
} from '@/lib/on-demand-form';
import type { CustomFormScreen } from '@ramassa/shared/intake-builder';
import { MENTORING_REQUEST_SCREEN, MENTORING_TOPICS } from '@ramassa/shared/mentoring';
import type { LanguageCode } from '@ramassa/shared/schemas';

const MENTORING_TOPIC_KEYS = {
  personal_development: 'mentoring:topicPersonalDevelopment',
  labor_orientation: 'mentoring:topicLaborOrientation',
  asylum_rights: 'mentoring:topicAsylumRights',
  gender_violence: 'mentoring:topicGenderViolence',
  empowerment: 'mentoring:topicEmpowerment',
  digital_skills: 'mentoring:topicDigitalSkills',
  other: 'mentoring:topicOther',
} as const;

/**
 * The fixed parts on her phone, in one language, as her app words them: the
 * topic she picks, the detail she may write and the date and time she may
 * prefer. They lead the fixed screen; the questions staff add come after them.
 * The date and the time open her phone's pickers: each is drawn as one field.
 */
export function mentoringFixedPhoneQuestions(
  language: LanguageCode,
  t: Translate,
): readonly PhoneQuestion[] {
  const say = (key: string) => t(key, { lng: language });
  return [
    fixedPhoneQuestion(language, 'mentoring', {
      id: 'topic',
      type: 'single_choice',
      label: say('mentoring:topicLabel'),
      isRequired: true,
      options: MENTORING_TOPICS.map((topic) => say(MENTORING_TOPIC_KEYS[topic])),
    }),
    fixedPhoneQuestion(language, 'mentoring', {
      id: 'detail',
      type: 'long_text',
      label: say('mentoring:detailLabel'),
      isRequired: false,
    }),
    fixedPhoneQuestion(language, 'mentoring', {
      id: 'date',
      type: 'short_text',
      label: say('mentoring:preferredDateLabel'),
      isRequired: false,
    }),
    fixedPhoneQuestion(language, 'mentoring', {
      id: 'time',
      type: 'short_text',
      label: say('mentoring:preferredTimeLabel'),
      isRequired: false,
    }),
  ];
}

/** Formularis › Formulari de mentoria, on the board the on-demand forms share. */
export const MENTORING_FORM: OnDemandFormDefinition = {
  key: 'mentoring',
  fixedScreen: MENTORING_REQUEST_SCREEN,
  boardPath: '/forms/mentoring',
  screenPath: '/forms/mentoring/screens/$screenId',
  nameKey: 'nav:staff.mentoringForm',
  namespace: 'mentoring',
  fixedPhoneQuestions: mentoringFixedPhoneQuestions,
};

/** Whether a screen is the one holding the topic, the detail and the preferred date and time. */
export function isMentoringRequestScreen(screen: Pick<CustomFormScreen, 'systemScreen'>): boolean {
  return isOnDemandFixedScreen(MENTORING_FORM, screen);
}
