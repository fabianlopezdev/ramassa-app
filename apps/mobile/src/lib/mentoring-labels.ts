/**
 * The player's mentoring labels, shared by her request list and a request's
 * detail (X5): the translation key of each topic and status, and her preferred
 * slot as she chose it.
 */
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import type { MentoringRequest, MentoringStatus, MentoringTopic } from '@ramassa/shared/mentoring';

export const MENTORING_TOPIC_KEYS: Readonly<Record<MentoringTopic, string>> = {
  personal_development: 'topicPersonalDevelopment',
  labor_orientation: 'topicLaborOrientation',
  asylum_rights: 'topicAsylumRights',
  gender_violence: 'topicGenderViolence',
  empowerment: 'topicEmpowerment',
  digital_skills: 'topicDigitalSkills',
  other: 'topicOther',
};

export const MENTORING_STATUS_KEYS: Readonly<Record<MentoringStatus, string>> = {
  requested: 'statusRequested',
  scheduled: 'statusScheduled',
  completed: 'statusCompleted',
  cancelled: 'statusCancelled',
};

/**
 * Her preferred day and time, or null without a preferred day. Both are wall
 * values she picked: the day is read at Madrid noon and the time in UTC, so no
 * device time zone moves either.
 */
export function preferredSlotParts(
  request: Pick<MentoringRequest, 'preferredDate' | 'preferredTime'>,
  locale: string,
): { readonly date: string; readonly time: string | null } | null {
  if (request.preferredDate === null) return null;
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: MADRID_TIME_ZONE,
  }).format(new Date(`${request.preferredDate}T12:00:00Z`));
  if (request.preferredTime === null) return { date, time: null };
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`1970-01-01T${request.preferredTime}Z`));
  return { date, time };
}
