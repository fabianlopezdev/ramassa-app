/**
 * One icon per player destination (RAPP-789, RAPP-793, RAPP-794). A feature
 * that shows in two places, such as mentoring in Xat and in Activitats, takes
 * its icon from here in both, so the shape she learned in one place is the
 * shape she finds in the other.
 */
import type { SymbolViewProps } from 'expo-symbols';

type SymbolName = SymbolViewProps['name'];

export const playerNavIcons = {
  teamChat: { ios: 'message.fill', android: 'chat_bubble', web: 'chat_bubble' },
  mentoring: { ios: 'person.2.fill', android: 'group', web: 'group' },
  feedback: { ios: 'lightbulb.fill', android: 'lightbulb', web: 'lightbulb' },
  myData: { ios: 'person.text.rectangle.fill', android: 'badge', web: 'badge' },
  attendance: {
    ios: 'calendar.badge.checkmark',
    android: 'event_available',
    web: 'event_available',
  },
  language: { ios: 'globe', android: 'language', web: 'language' },
  appLock: { ios: 'lock.fill', android: 'lock', web: 'lock' },
  privacy: { ios: 'hand.raised.fill', android: 'privacy_tip', web: 'privacy_tip' },
  signOut: {
    ios: 'rectangle.portrait.and.arrow.right',
    android: 'logout',
    web: 'logout',
  },
} as const satisfies Record<string, SymbolName>;
