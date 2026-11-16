/**
 * What waits for her on Inici (RAPP-790): her pending forms first, in the
 * server's order (RAPP-700), then every survey she has not completed. A survey
 * stays here after its activity ends, until she answers it or it closes.
 */

import type { PendingCustomForm } from '@ramassa/shared/intake-builder';
import type { PlayerSurvey } from '@ramassa/shared/surveys';

export type HomeToDoItem =
  | { readonly kind: 'form'; readonly key: string; readonly form: PendingCustomForm }
  | { readonly kind: 'survey'; readonly key: string; readonly survey: PlayerSurvey };

export function buildHomeToDoQueue(
  forms: readonly PendingCustomForm[] | undefined,
  surveys: readonly PlayerSurvey[] | undefined,
): readonly HomeToDoItem[] {
  const formItems = (forms ?? []).map((form): HomeToDoItem => ({
    kind: 'form',
    key: `form:${form.responseId}`,
    form,
  }));
  const surveyItems = (surveys ?? [])
    .filter((survey) => survey.responseStatus !== 'completed')
    .map((survey): HomeToDoItem => ({ kind: 'survey', key: `survey:${survey.id}`, survey }));
  return [...formItems, ...surveyItems];
}
