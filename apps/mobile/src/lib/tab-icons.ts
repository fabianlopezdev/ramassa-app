/**
 * The tab icons (RAPP-835): images made from the app's own icon files by
 * `bun run icons:tabs`, so iPhone and Android show the same pictures. The
 * phone's tab bar takes an image and no component, and colours it with one
 * colour: the line weight while a tab rests, the two-tone weight when it is
 * selected, its second tone being the same colour at half strength.
 */
import calendarSelected from '@/assets/images/tab/calendar.boldDuotone.png';
import calendarResting from '@/assets/images/tab/calendar.linear.png';
import chatSelected from '@/assets/images/tab/chat.boldDuotone.png';
import chatResting from '@/assets/images/tab/chat.linear.png';
import chatsSelected from '@/assets/images/tab/chats.boldDuotone.png';
import chatsResting from '@/assets/images/tab/chats.linear.png';
import gridSelected from '@/assets/images/tab/grid.boldDuotone.png';
import gridResting from '@/assets/images/tab/grid.linear.png';
import homeSelected from '@/assets/images/tab/home.boldDuotone.png';
import homeResting from '@/assets/images/tab/home.linear.png';
import type { ImageSourcePropType } from 'react-native';

interface TabIcon {
  readonly default: ImageSourcePropType;
  readonly selected: ImageSourcePropType;
}

export const tabIcons = {
  home: { default: homeResting, selected: homeSelected },
  calendar: { default: calendarResting, selected: calendarSelected },
  chat: { default: chatResting, selected: chatSelected },
  chats: { default: chatsResting, selected: chatsSelected },
  grid: { default: gridResting, selected: gridSelected },
} as const satisfies Record<string, TabIcon>;
