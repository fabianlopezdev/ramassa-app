import { useUnreadMessages } from '@/lib/messaging';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTranslation } from 'react-i18next';

/**
 * The player navigation shell (RAPP-16): five bottom tabs, the SPEC's whole
 * primary IA (max 2 nav levels).
 *
 * NativeTabs (not JS tabs) on purpose: the native tab bar gives platform-correct
 * screen-reader labels, RTL mirroring (ar/fa), and >=48dp targets for free,
 * which is exactly what the WCAG requirement and RAPP-70's premium bar ask for.
 * Every tab carries BOTH an icon and a text label (SPEC UX rule: icon-only
 * fails low-literacy users, text-only fails non-native speakers). Labels come
 * from the `nav` i18n namespace so all five languages translate and the
 * no-literal-string lint rule is satisfied. Android caps native tabs at 5, so
 * these five are the ceiling.
 *
 * `labelVisibilityMode="labeled"` is what makes the second half of that rule
 * TRUE ON ANDROID, which is the platform nearly all of these players are on.
 * Material's default (`auto`) hides every label except the selected tab's once
 * there are four or more items, so the shipped Android build showed four
 * unlabelled pictograms and one word — icon-only navigation, for an audience
 * the SPEC defines as reading little in any language. iOS was unaffected and
 * showed all five labels, which is exactly why it survived review: the defect
 * was only ever visible in an Android capture.
 */
export default function TabsLayout() {
  const { t } = useTranslation('nav');
  const unread = useUnreadMessages().data ?? 0;
  return (
    <NativeTabs labelVisibilityMode="labeled">
      <NativeTabs.Trigger name="index" testID="player-tab-home">
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
        <NativeTabs.Trigger.Label>{t('nav:tabs.home')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="events">
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
        <NativeTabs.Trigger.Label>{t('nav:tabs.events')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="community" testID="player-tab-messages">
        <NativeTabs.Trigger.Icon sf="bubble.left.and.bubble.right.fill" md="chat" />
        <NativeTabs.Trigger.Label>{t('nav:tabs.messages')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Badge hidden={unread === 0}>
          {String(Math.min(unread, 99))}
        </NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="services">
        <NativeTabs.Trigger.Icon sf="square.grid.2x2.fill" md="category" />
        <NativeTabs.Trigger.Label>{t('nav:tabs.services')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile" testID="player-tab-profile">
        <NativeTabs.Trigger.Icon sf="person.crop.circle.fill" md="person" />
        <NativeTabs.Trigger.Label>{t('nav:tabs.profile')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
