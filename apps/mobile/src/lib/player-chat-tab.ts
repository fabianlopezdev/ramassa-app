/**
 * What the Xat tab (RAPP-789) says about her mentoring: the request she is
 * still waiting on, or nothing. Completed and cancelled requests are history
 * and live on the mentoring screen.
 */
import type { MentoringRequest } from '@ramassa/shared/mentoring';
import type { TabNews } from '@ramassa/shared/tab-news';

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

export interface ContactCardNewsCounts {
  readonly mentoring: number;
  readonly feedback: number;
}

const NO_CONTACT_CARD_NEWS: ContactCardNewsCounts = { mentoring: 0, feedback: 0 };

/**
 * The numbers on the Mentoria and Suggeriments cards (RAPP-873): her requests
 * and suggestions the staff changed since she last opened that screen. They
 * add up to the tab's number with the unread messages, and are zero until the
 * news has loaded.
 */
export function contactCardNewsCounts(news: TabNews | undefined): ContactCardNewsCounts {
  if (news === undefined) return NO_CONTACT_CARD_NEWS;
  return {
    mentoring: news.mentoring.changedRequestIds.length,
    feedback: news.feedback.changedSubmissionIds.length,
  };
}

/**
 * What a Contacte card says aloud (RAPP-873): its title, the state it shows,
 * then how many things are new, in the words of `common:newCount`.
 */
export function contactCardAccessibilityLabel(
  title: string,
  state: string | null,
  newCount: number,
  sayNewCount: (label: string, count: number) => string,
): string {
  const label = state === null ? title : `${title}, ${state}`;
  return newCount > 0 ? sayNewCount(label, newCount) : label;
}
