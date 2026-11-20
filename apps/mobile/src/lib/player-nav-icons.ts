/**
 * One icon per player destination (RAPP-789, RAPP-793, RAPP-794). A feature
 * that shows in two places, such as mentoring in Xat and in Activitats, takes
 * its icon from here in both, so the shape she learned in one place is the
 * shape she finds in the other. The names are the app's own icons (RAPP-837),
 * the same drawing on iPhone and Android.
 */
import type { IconName } from '@/components/icons/icon';

export const playerNavIcons = {
  teamChat: 'chat',
  mentoring: 'users',
  feedback: 'lightbulb',
  myData: 'id-card',
  attendance: 'calendar-check',
  formsLater: 'clock',
  language: 'globe',
  appLock: 'lock',
  privacy: 'shield',
  signOut: 'logout',
} as const satisfies Record<string, IconName>;
