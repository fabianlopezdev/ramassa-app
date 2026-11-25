/**
 * The incident form on the board (RAPP-973): what a player fills in when she
 * reports an incident to the team from Contacte. It is one of the forms she
 * sends when she wants, drawn by the board and the screen page those forms
 * share (`lib/on-demand-form.ts`).
 *
 * Its fixed screen (`systemScreen` `incident_report`) holds the report's own
 * parts, which the app draws and staff cannot remove: what happened, when,
 * where, and the switch to send it anonymously. The phones draw them first on
 * that screen, worded as her app words them. Who reads a report is a
 * permission of its own (`incidents.manage`): the people who build the form
 * never read one.
 */

import type { PhoneQuestion, Translate } from '@/components/onboarding/screen-content';
import {
  fixedPhoneQuestion,
  isOnDemandFixedScreen,
  type OnDemandFormDefinition,
} from '@/lib/on-demand-form';
import { INCIDENT_REPORT_SCREEN } from '@ramassa/shared/incidents';
import type { CustomFormScreen } from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

/**
 * The fixed parts on her phone, in one language, as her app words them: what
 * happened, the day, the place, and the anonymous switch, drawn here as the
 * yes or no it stands for. The questions staff add come after them.
 */
export function incidentFixedPhoneQuestions(
  language: LanguageCode,
  t: Translate,
): readonly PhoneQuestion[] {
  const say = (key: string) => t(key, { lng: language });
  return [
    fixedPhoneQuestion(language, 'incidents', {
      id: 'what',
      type: 'long_text',
      label: say('incidents:whatLabel'),
      isRequired: true,
    }),
    fixedPhoneQuestion(language, 'incidents', {
      id: 'when',
      type: 'date',
      label: say('incidents:whenLabel'),
      isRequired: true,
    }),
    fixedPhoneQuestion(language, 'incidents', {
      id: 'where',
      type: 'short_text',
      label: say('incidents:whereLabel'),
      isRequired: true,
    }),
    fixedPhoneQuestion(language, 'incidents', {
      id: 'anonymous',
      type: 'yes_no',
      label: say('incidents:anonymousLabel'),
      isRequired: false,
    }),
  ];
}

/** Formularis › Formulari d'incidents, on the board the on-demand forms share. */
export const INCIDENT_FORM: OnDemandFormDefinition = {
  key: 'incident',
  fixedScreen: INCIDENT_REPORT_SCREEN,
  boardPath: '/forms/incidents',
  screenPath: '/forms/incidents/screens/$screenId',
  nameKey: 'nav:staff.incidentForm',
  namespace: 'incidents',
  fixedPhoneQuestions: incidentFixedPhoneQuestions,
};

/** Whether a screen is the one holding what happened, when, where and the anonymous switch. */
export function isIncidentReportScreen(screen: Pick<CustomFormScreen, 'systemScreen'>): boolean {
  return isOnDemandFixedScreen(INCIDENT_FORM, screen);
}
