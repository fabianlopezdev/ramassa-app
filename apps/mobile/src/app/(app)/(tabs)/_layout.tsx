import { useOrganizationBranding } from '@/components/branding/organization-branding-provider';
import { useUnreadMessages } from '@/lib/messaging';
import { nativeTabsHostProps } from '@/lib/native-tabs-direction';
import { playerNavIcons } from '@/lib/player-nav-icons';
import { unreadBadgeProps } from '@/lib/unread-badge';
import { useHomeAttention } from '@/lib/use-home-attention';
import { NativeTabs } from 'expo-router/native-tabs';
import { useTranslation } from 'react-i18next';
import { I18nManager } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

/**
 * The player navigation shell (RAPP-16): five bottom tabs, the SPEC's whole
 * primary IA (max 2 nav levels). Since RAPP-789 they are Inici, Activitats,
 * Xat, Comunitat and Ajuda: Xat holds everything private with the team and
 * carries the unread badge, Inici carries the count of what she has not dealt
 * with yet (RAPP-821), and her profile opens from her photo at the top of
 * each tab (RAPP-794), because Android allows five tabs and no more.
 *
 * NativeTabs (not JS tabs) on purpose: the native tab bar gives platform-correct
 * screen-reader labels and >=48dp targets for free, which is exactly what the
 * WCAG requirement and RAPP-70's premium bar ask for. RTL mirroring (ar/fa) is
 * NOT free on iOS: the native bar follows the phone's language, so the
 * direction React Native uses is passed in explicitly (RAPP-531).
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
  const unreadBadge = unreadBadgeProps(unread);
  // What on Inici she has not dealt with yet, the same count the screen shows (RAPP-821).
  const homeBadge = unreadBadgeProps(useHomeAttention().count);
  // Badges take the organization's brand colour, calmer than the system red (RAPP-823).
  const badgeColor = useOrganizationBranding()?.primary_color ?? tokens.colors.primary.DEFAULT;
  return (
    <NativeTabs
      // The tab bar mirrors with the screens (RAPP-531).
      unstable_nativeProps={nativeTabsHostProps(I18nManager.isRTL)}
      backgroundColor={tokens.colors.white}
      badgeBackgroundColor={badgeColor}
      badgeTextColor={tokens.colors.white}
      iconColor={{ default: tokens.colors.neutral[700], selected: tokens.colors.primary.dark }}
      indicatorColor={tokens.colors.neutral[100]}
      labelStyle={{
        default: { color: tokens.colors.neutral[700] },
        selected: { color: tokens.colors.primary.dark },
      }}
      labelVisibilityMode="labeled"
      tintColor={tokens.colors.primary.dark}
    >
      <NativeTabs.Trigger name="index" testID="player-tab-home">
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
        <NativeTabs.Trigger.Label>{t('nav:tabs.home')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Badge hidden={homeBadge.hidden}>
          {homeBadge.children}
        </NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="events">
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
        <NativeTabs.Trigger.Label>{t('nav:tabs.events')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="chat" testID="player-tab-chat">
        <NativeTabs.Trigger.Icon
          sf={playerNavIcons.teamChat.ios}
          md={playerNavIcons.teamChat.android}
        />
        <NativeTabs.Trigger.Label>{t('nav:tabs.chat')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Badge hidden={unreadBadge.hidden}>
          {unreadBadge.children}
        </NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="community" testID="player-tab-community">
        <NativeTabs.Trigger.Icon sf="bubble.left.and.bubble.right.fill" md="chat" />
        <NativeTabs.Trigger.Label>{t('nav:tabs.community')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="services">
        <NativeTabs.Trigger.Icon sf="square.grid.2x2.fill" md="category" />
        <NativeTabs.Trigger.Label>{t('nav:tabs.services')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
