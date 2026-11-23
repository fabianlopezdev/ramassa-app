/**
 * What waits for her on Inici (RAPP-790): her pending forms first, in the
 * server's order (RAPP-700), then her surveys on the form engine (RAPP-929),
 * then every survey she has not completed. A survey
 * stays here after its activity ends, until she answers it or it closes.
 */

import type { MySurvey, PendingCustomForm } from '@ramassa/shared/intake-builder';
import type { PlayerSurvey } from '@ramassa/shared/surveys';

export type HomeToDoItem =
  | { readonly kind: 'form'; readonly key: string; readonly form: PendingCustomForm }
  | { readonly kind: 'survey'; readonly key: string; readonly survey: PlayerSurvey }
  // A survey on the form engine (RAPP-929).
  | { readonly kind: 'survey-form'; readonly key: string; readonly survey: MySurvey };

export function buildHomeToDoQueue(
  forms: readonly PendingCustomForm[] | undefined,
  surveys: readonly PlayerSurvey[] | undefined,
  surveyForms: readonly MySurvey[] | undefined = [],
): readonly HomeToDoItem[] {
  const formItems = (forms ?? []).map((form): HomeToDoItem => ({
    kind: 'form',
    key: `form:${form.responseId}`,
    form,
  }));
  const surveyItems = (surveys ?? [])
    .filter((survey) => survey.responseStatus !== 'completed')
    .map((survey): HomeToDoItem => ({ kind: 'survey', key: `survey:${survey.id}`, survey }));
  const surveyFormItems = (surveyForms ?? []).map((survey): HomeToDoItem => ({
    kind: 'survey-form',
    key: `survey-form:${survey.responseId}`,
    survey,
  }));
  return [...formItems, ...surveyFormItems, ...surveyItems];
}
