/** Where a feedback submission can go next, as on the web admin (RAPP-383). */
import type { FeedbackStatus } from '@ramassa/shared/feedback';

export function nextFeedbackStatuses(
  status: FeedbackStatus,
): readonly Exclude<FeedbackStatus, 'new'>[] {
  if (status === 'new') return ['read', 'in_progress', 'resolved'];
  if (status === 'read') return ['in_progress', 'resolved'];
  if (status === 'in_progress') return ['resolved'];
  return [];
}
