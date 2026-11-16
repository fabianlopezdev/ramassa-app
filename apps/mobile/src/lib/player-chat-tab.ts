/**
 * What the Xat tab (RAPP-789) says about her mentoring: the request she is
 * still waiting on, or nothing. Completed and cancelled requests are history
 * and live on the mentoring screen.
 */
import type { MentoringRequest } from '@ramassa/shared/mentoring';

const OPEN_MENTORING_STATUSES: ReadonlySet<MentoringRequest['status']> = new Set([
  'requested',
  'scheduled',
]);

export function latestOpenMentoringRequest(
  requests: readonly MentoringRequest[],
): MentoringRequest | null {
  let latest: MentoringRequest | null = null;
  for (const request of requests) {
    if (!OPEN_MENTORING_STATUSES.has(request.status)) continue;
    if (latest === null || Date.parse(request.createdAt) > Date.parse(latest.createdAt)) {
      latest = request;
    }
  }
  return latest;
}
