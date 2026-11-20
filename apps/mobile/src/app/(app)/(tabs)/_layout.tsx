import { useBrandColor } from '@/components/branding/organization-branding-provider';
import { useUnreadMessages } from '@/lib/messaging';
import { nativeTabsHostProps } from '@/lib/native-tabs-direction';
import { tabIcons } from '@/lib/tab-icons';
import { unreadBadgeProps } from '@/lib/unread-badge';
import { useActivitiesAttention } from '@/lib/use-activities-attention';
import { useHomeAttention } from '@/lib/use-home-attention';
import { useTabNewsCounts } from '@/lib/use-tab-news';
import { NativeTabs } from 'expo-router/native-tabs';
import { useTranslation } from 'react-i18next';
import { I18nManager } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

/**
 * The player navigation shell (RAPP-16): five bottom tabs, the SPEC's whole
 * primary IA (max 2 nav levels). They are Inici, Activitats, Comunitat, Ajuda
 * and Contacte (RAPP-789, RAPP-860): Contacte holds everything private with
 * the staff and carries the unread badge. It was called Xat and sat third; it
 * is last now, where people look for a way to reach someone, and next to
 * Ajuda. Its route is still `chat`. Inici carries the count of what she has not dealt
 * with yet (RAPP-821). Activitats counts the new activities Inici is not
 * already counting. Comunitat counts new posts, replies on her posts, gallery
 * items and stories by others; Ajuda counts new services and guides; Contacte
 * counts unread messages plus a change the staff made to her mentoring or her
 * suggestion (RAPP-873). Her profile opens from her photo at the top of
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
  // Each new thing counts on one tab only (RAPP-873).
  const tabNews = useTabNewsCounts();
  const communityBadge = unreadBadgeProps(tabNews.community);
  const helpBadge = unreadBadgeProps(tabNews.help);
  const contactBadge = unreadBadgeProps(unread + tabNews.contact);
  // What on Inici she has not dealt with yet, the same count the screen shows (RAPP-821).
  const homeBadge = unreadBadgeProps(useHomeAttention().count);
  const activitiesBadge = unreadBadgeProps(useActivitiesAttention().count);
  // Badges take the organization's brand colour, calmer than the system red (RAPP-823).
  const badgeColor = useBrandColor();
  return (
    <NativeTabs
      // The tab bar mirrors with the screens (RAPP-531).
      unstable_nativeProps={nativeTabsHostProps(I18nManager.isRTL)}
      backgroundColor={tokens.colors.surface.page}
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
        <NativeTabs.Trigger.Icon src={tabIcons.home} renderingMode="template" />
        <NativeTabs.Trigger.Label>{t('nav:tabs.home')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Badge hidden={homeBadge.hidden}>
          {homeBadge.children}
        </NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="events">
        <NativeTabs.Trigger.Icon src={tabIcons.calendar} renderingMode="template" />
        <NativeTabs.Trigger.Label>{t('nav:tabs.events')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Badge hidden={activitiesBadge.hidden}>
          {activitiesBadge.children}
        </NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="community" testID="player-tab-community">
        <NativeTabs.Trigger.Icon src={tabIcons.chats} renderingMode="template" />
        <NativeTabs.Trigger.Label>{t('nav:tabs.community')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Badge hidden={communityBadge.hidden}>
          {communityBadge.children}
        </NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="services">
        <NativeTabs.Trigger.Icon src={tabIcons.grid} renderingMode="template" />
        <NativeTabs.Trigger.Label>{t('nav:tabs.services')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Badge hidden={helpBadge.hidden}>
          {helpBadge.children}
        </NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="chat" testID="player-tab-chat">
        <NativeTabs.Trigger.Icon src={tabIcons.chat} renderingMode="template" />
        <NativeTabs.Trigger.Label>{t('nav:tabs.chat')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Badge hidden={contactBadge.hidden}>
          {contactBadge.children}
        </NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
