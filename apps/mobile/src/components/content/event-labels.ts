/**
 * Translation keys and symbols for an event's status, sign-up mode, and
 * category icon and colour (RAPP-342, RAPP-893), as the web admin names them. The icon
 * codes are the web admin's; each has the closest icon of the app's set.
 */
import type { IconName } from '@/components/icons/icon';
import type { AnnouncementLifecycle } from '@ramassa/shared/announcements';
import type { EventCategoryIcon, EventSignupMode } from '@ramassa/shared/events';

export const EVENT_STATUS_KEYS = {
  draft: 'statusDraft',
  published: 'statusPublished',
  scheduled: 'statusScheduled',
  expired: 'statusExpired',
} as const satisfies Record<AnnouncementLifecycle, string>;

export const EVENT_SIGNUP_KEYS = {
  none: 'signupNone',
  interest: 'signupInterest',
  confirm: 'signupConfirm',
} as const satisfies Record<EventSignupMode, string>;

export const EVENT_ICON_KEYS = {
  dumbbell: 'iconDumbbell',
  'graduation-cap': 'iconGraduationCap',
  theater: 'iconTheater',
  'briefcase-business': 'iconBriefcaseBusiness',
  languages: 'iconLanguages',
  footprints: 'iconFootprints',
  users: 'iconUsers',
} as const satisfies Record<EventCategoryIcon, string>;

export const EVENT_ICON_NAMES = {
  dumbbell: 'dumbbell',
  'graduation-cap': 'graduation-cap',
  theater: 'masks',
  'briefcase-business': 'briefcase',
  languages: 'translate',
  footprints: 'walking',
  users: 'users',
} as const satisfies Record<EventCategoryIcon, IconName>;
