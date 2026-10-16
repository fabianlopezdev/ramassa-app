/**
 * Where a survey is in its life (RAPP-384), for the team list: scheduled
 * before it is published, open until it closes, then closed. A pure module,
 * so the unit tests run without the app's Supabase client.
 */
export type SurveyPhase = 'scheduled' | 'open' | 'closed';

export function surveyPhase(
  publishedAt: string,
  closesAt: string | null,
  now: Date = new Date(),
): SurveyPhase {
  const instant = now.getTime();
  if (instant < Date.parse(publishedAt)) return 'scheduled';
  if (closesAt !== null && instant >= Date.parse(closesAt)) return 'closed';
  return 'open';
}
