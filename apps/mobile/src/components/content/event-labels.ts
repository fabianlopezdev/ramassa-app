/**
 * Translation keys and symbols for an event's status, sign-up mode, and
 * category icon and colour (RAPP-342), as the web admin names them. The icon
 * codes are the web admin's; each has the closest system symbol per platform.
 */
import type { SymbolViewProps } from 'expo-symbols';
import type { AnnouncementLifecycle } from '@ramassa/shared/announcements';
import type {
  EventCategoryColor,
  EventCategoryIcon,
  EventSignupMode,
} from '@ramassa/shared/events';

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

export const EVENT_COLOR_KEYS = {
  primary: 'colorPrimary',
  secondary: 'colorSecondary',
  accent: 'colorAccent',
  'chart-1': 'colorChart1',
  'chart-2': 'colorChart2',
  'chart-3': 'colorChart3',
} as const satisfies Record<EventCategoryColor, string>;

export const EVENT_ICON_SYMBOLS = {
  dumbbell: { ios: 'dumbbell.fill', android: 'fitness_center', web: 'fitness_center' },
  'graduation-cap': { ios: 'graduationcap.fill', android: 'school', web: 'school' },
  theater: { ios: 'theatermasks.fill', android: 'theater_comedy', web: 'theater_comedy' },
  'briefcase-business': { ios: 'briefcase.fill', android: 'work', web: 'work' },
  languages: { ios: 'character.bubble.fill', android: 'translate', web: 'translate' },
  footprints: { ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' },
  users: { ios: 'person.3.fill', android: 'group', web: 'group' },
} as const satisfies Record<EventCategoryIcon, SymbolViewProps['name']>;
