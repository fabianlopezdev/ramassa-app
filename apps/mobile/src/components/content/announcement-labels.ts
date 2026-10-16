/** Translation keys for an announcement's category and status (RAPP-340). */
import type { AnnouncementCategory, AnnouncementLifecycle } from '@ramassa/shared/announcements';

export const ANNOUNCEMENT_CATEGORY_KEYS = {
  info: 'categoryInfo',
  training: 'categoryTraining',
  social: 'categorySocial',
  urgent: 'categoryUrgent',
} as const satisfies Record<AnnouncementCategory, string>;

export const ANNOUNCEMENT_STATUS_KEYS = {
  draft: 'statusDraft',
  published: 'statusPublished',
  scheduled: 'statusScheduled',
  expired: 'statusExpired',
} as const satisfies Record<AnnouncementLifecycle, string>;
