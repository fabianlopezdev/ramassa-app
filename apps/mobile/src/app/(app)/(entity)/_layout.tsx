/**
 * The partner entity's shell on the phone (RAPP-410), as the web portal's
 * navigation: Home, Referrals, Services, Events and Messages, as native
 * bottom tabs on a phone and a sidebar on a tablet. A tab appears with the
 * slice that builds its screen (RAPP-411 to RAPP-415). The database scopes
 * every read to her own entity, and only once her second factor is verified.
 */
import { TeamSidebarItem } from '@/components/team/team-sidebar-item';
import { useUnreadMessages } from '@/lib/messaging';
import { nativeTabsHostProps } from '@/lib/native-tabs-direction';
import { tabIcons } from '@/lib/tab-icons';
import { boundedTabSlotStyle } from '@/lib/tab-slot-style';
import { unreadBadgeProps } from '@/lib/unread-badge';
import { usePathname } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { TabList, Tabs, TabSlot, TabTrigger } from 'expo-router/ui';
import { useTranslation } from 'react-i18next';
import { I18nManager, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@ramassa/shared/tokens';

const TABLET_WIDTH = 768;
const homeIcon = 'chart';
const referralsIcon = 'user-plus';
const servicesIcon = 'grid';
const eventsIcon = 'calendar';
const messagesIcon = 'chats';
// A style object, as in the team shell: TabList puts its own row layout on its
// child, and that wins over classes.
const sidebarStyle = {
  flexDirection: 'column',
  justifyContent: 'flex-start',
  alignItems: 'stretch',
  gap: tokens.spacing.xs,
  paddingHorizontal: tokens.spacing.sm,
  paddingTop: tokens.spacing['3xl'],
  backgroundColor: tokens.colors.white,
  borderEndWidth: 1,
  borderEndColor: tokens.colors.neutral[200],
  width: 240,
} as const;
const shellRowStyle = {
  flex: 1,
  flexDirection: 'row',
  backgroundColor: tokens.colors.neutral[50],
} as const;

export default function EntityShellLayout() {
  const { t } = useTranslation('nav');
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const unreadBadge = unreadBadgeProps(useUnreadMessages().data ?? 0);

  if (width >= TABLET_WIDTH) {
    return (
      <Tabs style={shellRowStyle}>
        <TabList asChild>
          <View
            accessibilityRole="tablist"
            accessibilityLabel={t('a11y.entityPortal')}
            style={sidebarStyle}
          >
            <TabTrigger name="entity-home" href="/entity-home" asChild>
              <TeamSidebarItem
                compact={false}
                testID="entity-sidebar-home"
                isFocused={pathname === '/entity-home'}
                label={t('entity.dashboard')}
                icon={homeIcon}
              />
            </TabTrigger>
            <TabTrigger name="entity-referrals" href="/entity-referrals" asChild>
              <TeamSidebarItem
                compact={false}
                testID="entity-sidebar-referrals"
                isFocused={pathname === '/entity-referrals'}
                label={t('entity.referrals')}
                icon={referralsIcon}
              />
            </TabTrigger>
            <TabTrigger name="entity-services" href="/entity-services" asChild>
              <TeamSidebarItem
                compact={false}
                testID="entity-sidebar-services"
                isFocused={pathname === '/entity-services'}
                label={t('entity.services')}
                icon={servicesIcon}
              />
            </TabTrigger>
            <TabTrigger name="entity-events" href="/entity-events" asChild>
              <TeamSidebarItem
                compact={false}
                testID="entity-sidebar-events"
                isFocused={pathname === '/entity-events'}
                label={t('entity.events')}
                icon={eventsIcon}
              />
            </TabTrigger>
            <TabTrigger name="entity-messages" href="/entity-messages" asChild>
              <TeamSidebarItem
                compact={false}
                testID="entity-sidebar-messages"
                isFocused={pathname === '/entity-messages'}
                label={t('entity.messages')}
                icon={messagesIcon}
                badge={unreadBadge.hidden ? null : unreadBadge.children}
              />
            </TabTrigger>
          </View>
        </TabList>
        <SafeAreaView edges={['top', 'right', 'bottom']} className="flex-1">
          <TabSlot style={boundedTabSlotStyle} />
        </SafeAreaView>
      </Tabs>
    );
  }

  return (
    <NativeTabs
      // The tab bar mirrors with the screens (RAPP-531).
      unstable_nativeProps={nativeTabsHostProps(I18nManager.isRTL)}
      backgroundColor={tokens.colors.white}
      iconColor={{ default: tokens.colors.neutral[700], selected: tokens.colors.primary.dark }}
      indicatorColor={tokens.colors.neutral[100]}
      labelStyle={{
        default: { color: tokens.colors.neutral[700] },
        selected: { color: tokens.colors.primary.dark },
      }}
      labelVisibilityMode="labeled"
      tintColor={tokens.colors.primary.dark}
    >
      <NativeTabs.Trigger name="entity-home" testID="entity-tab-home">
        <NativeTabs.Trigger.Icon src={tabIcons.chart} renderingMode="template" />
        <NativeTabs.Trigger.Label>{t('entity.dashboard')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="entity-referrals" testID="entity-tab-referrals">
        <NativeTabs.Trigger.Icon src={tabIcons['user-plus']} renderingMode="template" />
        <NativeTabs.Trigger.Label>{t('entity.referrals')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="entity-services" testID="entity-tab-services">
        <NativeTabs.Trigger.Icon src={tabIcons.grid} renderingMode="template" />
        <NativeTabs.Trigger.Label>{t('entity.services')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="entity-events" testID="entity-tab-events">
        <NativeTabs.Trigger.Icon src={tabIcons.calendar} renderingMode="template" />
        <NativeTabs.Trigger.Label>{t('entity.events')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="entity-messages" testID="entity-tab-messages">
        <NativeTabs.Trigger.Icon src={tabIcons.chats} renderingMode="template" />
        <NativeTabs.Trigger.Label>{t('entity.messages')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Badge hidden={unreadBadge.hidden}>
          {unreadBadge.children}
        </NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
