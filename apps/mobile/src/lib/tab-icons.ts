/**
 * The tab icons (RAPP-835): images made from the app's own icon files by
 * `bun run icons:tabs`, so iPhone and Android show the same pictures. The
 * phone's tab bar takes an image and no component, and colours it with one
 * colour: the line weight while a tab rests, the two-tone weight when it is
 * selected, its second tone being the same colour at half strength. The
 * player, team and entity bars all read from here.
 */
import calendarSelected from '@/assets/images/tab/calendar.boldDuotone.png';
import calendarResting from '@/assets/images/tab/calendar.linear.png';
import chartSelected from '@/assets/images/tab/chart.boldDuotone.png';
import chartResting from '@/assets/images/tab/chart.linear.png';
import chatSelected from '@/assets/images/tab/chat.boldDuotone.png';
import chatResting from '@/assets/images/tab/chat.linear.png';
import chatsSelected from '@/assets/images/tab/chats.boldDuotone.png';
import chatsResting from '@/assets/images/tab/chats.linear.png';
import documentSelected from '@/assets/images/tab/document.boldDuotone.png';
import documentResting from '@/assets/images/tab/document.linear.png';
import gridSelected from '@/assets/images/tab/grid.boldDuotone.png';
import gridResting from '@/assets/images/tab/grid.linear.png';
import homeSelected from '@/assets/images/tab/home.boldDuotone.png';
import homeResting from '@/assets/images/tab/home.linear.png';
import moreSelected from '@/assets/images/tab/more.boldDuotone.png';
import moreResting from '@/assets/images/tab/more.linear.png';
import sunSelected from '@/assets/images/tab/sun.boldDuotone.png';
import sunResting from '@/assets/images/tab/sun.linear.png';
import userPlusSelected from '@/assets/images/tab/user-plus.boldDuotone.png';
import userPlusResting from '@/assets/images/tab/user-plus.linear.png';
import usersSelected from '@/assets/images/tab/users.boldDuotone.png';
import usersResting from '@/assets/images/tab/users.linear.png';
import type { ImageSourcePropType } from 'react-native';

interface TabIcon {
  readonly default: ImageSourcePropType;
  readonly selected: ImageSourcePropType;
}

export const tabIcons = {
  calendar: { default: calendarResting, selected: calendarSelected },
  chart: { default: chartResting, selected: chartSelected },
  chat: { default: chatResting, selected: chatSelected },
  chats: { default: chatsResting, selected: chatsSelected },
  document: { default: documentResting, selected: documentSelected },
  grid: { default: gridResting, selected: gridSelected },
  home: { default: homeResting, selected: homeSelected },
  more: { default: moreResting, selected: moreSelected },
  sun: { default: sunResting, selected: sunSelected },
  'user-plus': { default: userPlusResting, selected: userPlusSelected },
  users: { default: usersResting, selected: usersSelected },
} as const satisfies Record<string, TabIcon>;
