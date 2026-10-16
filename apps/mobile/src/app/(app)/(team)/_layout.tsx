/**
 * The team shell (RAPP-245). Three ways to hold the same screens, chosen in
 * `teamLayout` from the person's areas and the screen width:
 *
 *   tabs     native bottom tabs, one per area she may open, plus More
 *   home     a large-button start screen, for one or two areas on a phone
 *   sidebar  a tablet: every area in a sidebar beside the open screen
 *
 * A tab or sidebar entry exists only for an area her permissions open; the
 * database checks every read and write regardless.
 */
import { TeamLayoutContext } from '@/components/team/team-layout-context';
import { TeamSidebarItem } from '@/components/team/team-sidebar-item';
import { useUnreadMessages } from '@/lib/messaging';
import { boundedTabSlotStyle } from '@/lib/tab-slot-style';
import { isCompactSidebar, teamAreas, teamLayout } from '@/lib/team-shell';
import { unreadBadgeProps } from '@/lib/unread-badge';
import { useAccountAccess } from '@/lib/use-account-access';
import { usePathname } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { Stack } from 'expo-router/stack';
import { TabList, Tabs, TabSlot, TabTrigger } from 'expo-router/ui';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@ramassa/shared/tokens';

const hiddenHeaderScreenOptions = { headerShown: false } as const;
// A style object, not classes: TabList puts its own row layout on its child,
// and that wins over classes, which left the sidebar as a row of bare icons.
const sidebarBase = {
  flexDirection: 'column',
  justifyContent: 'flex-start',
  alignItems: 'stretch',
  gap: tokens.spacing.xs,
  paddingHorizontal: tokens.spacing.sm,
  paddingTop: tokens.spacing['3xl'],
  backgroundColor: tokens.colors.white,
  borderEndWidth: 1,
  borderEndColor: tokens.colors.neutral[200],
} as const;
const shellRowStyle = {
  flex: 1,
  flexDirection: 'row',
  backgroundColor: tokens.colors.neutral[50],
} as const;
const wideSidebarStyle = { ...sidebarBase, width: 240 } as const;
const compactSidebarStyle = {
  ...sidebarBase,
  width: 96,
  paddingHorizontal: tokens.spacing.xs,
} as const;
const todayIcon = { ios: 'sun.max.fill', android: 'today', web: 'today' } as const;
const participantsIcon = { ios: 'person.2.fill', android: 'group', web: 'group' } as const;
const contentIcon = { ios: 'doc.richtext.fill', android: 'article', web: 'article' } as const;
const messagesIcon = {
  ios: 'bubble.left.and.bubble.right.fill',
  android: 'chat',
  web: 'chat',
} as const;
const moreIcon = { ios: 'ellipsis.circle.fill', android: 'more_horiz', web: 'more_horiz' } as const;

export default function TeamShellLayout() {
  const { t } = useTranslation('nav');
  const { permissions } = useAccountAccess();
  const { width } = useWindowDimensions();
  const areas = teamAreas(permissions);
  const layout = teamLayout({ areaCount: areas.length, width });
  const compact = isCompactSidebar(width);
  // The open entry, from the path: the trigger's own focus flag stayed false
  // on the iPad, so the sidebar showed no selected entry.
  const pathname = usePathname();
  const hasAttendance = areas.includes('attendance');
  const hasParticipants = areas.includes('participants');
  const hasContent = areas.includes('content');
  const hasMessages = areas.includes('messages');
  const unread = useUnreadMessages().data ?? 0;
  const unreadBadge = unreadBadgeProps(unread);

  let shell;
  if (layout === 'sidebar') {
    shell = (
      // TabList must be a direct child of Tabs: the triggers are found by
      // walking Tabs' children, and a wrapper View hid them (no route switched).
      <Tabs style={shellRowStyle}>
        <TabList asChild>
          <View
            accessibilityRole="tablist"
            accessibilityLabel={t('team.navigation')}
            style={compact ? compactSidebarStyle : wideSidebarStyle}
          >
            {hasAttendance ? (
              <TabTrigger name="today" href="/today" asChild>
                <TeamSidebarItem
                  compact={compact}
                  testID="team-sidebar-today"
                  isFocused={pathname === '/today'}
                  label={t('team.today')}
                  icon={todayIcon}
                />
              </TabTrigger>
            ) : null}
            {hasParticipants ? (
              <TabTrigger name="participants" href="/participants" asChild>
                <TeamSidebarItem
                  compact={compact}
                  testID="team-sidebar-participants"
                  isFocused={pathname === '/participants'}
                  label={t('team.participants')}
                  icon={participantsIcon}
                />
              </TabTrigger>
            ) : null}
            {hasContent ? (
              <TabTrigger name="content" href="/content" asChild>
                <TeamSidebarItem
                  compact={compact}
                  testID="team-sidebar-content"
                  isFocused={pathname === '/content'}
                  label={t('team.content')}
                  icon={contentIcon}
                />
              </TabTrigger>
            ) : null}
            {hasMessages ? (
              <TabTrigger name="messages" href="/messages" asChild>
                <TeamSidebarItem
                  compact={compact}
                  testID="team-sidebar-messages"
                  isFocused={pathname === '/messages'}
                  label={t('team.messages')}
                  icon={messagesIcon}
                  badge={unreadBadge.hidden ? null : unreadBadge.children}
                />
              </TabTrigger>
            ) : null}
            <TabTrigger name="more" href="/more" asChild>
              <TeamSidebarItem
                compact={compact}
                testID="team-sidebar-more"
                isFocused={pathname === '/more'}
                label={t('team.more')}
                icon={moreIcon}
              />
            </TabTrigger>
          </View>
        </TabList>
        <SafeAreaView edges={['top', 'right', 'bottom']} className="flex-1">
          <TabSlot style={boundedTabSlotStyle} />
        </SafeAreaView>
      </Tabs>
    );
  } else if (layout === 'home') {
    shell = (
      <Stack screenOptions={hiddenHeaderScreenOptions}>
        <Stack.Screen name="home" />
        <Stack.Protected guard={hasAttendance}>
          <Stack.Screen name="today" />
        </Stack.Protected>
        <Stack.Protected guard={hasParticipants}>
          <Stack.Screen name="participants" />
        </Stack.Protected>
        <Stack.Protected guard={hasContent}>
          <Stack.Screen name="content" />
        </Stack.Protected>
        <Stack.Protected guard={hasMessages}>
          <Stack.Screen name="messages" />
        </Stack.Protected>
        <Stack.Screen name="more" />
      </Stack>
    );
  } else {
    shell = (
      <NativeTabs
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
        <NativeTabs.Trigger name="today" hidden={!hasAttendance} testID="team-tab-today">
          <NativeTabs.Trigger.Icon sf="sun.max.fill" md="today" />
          <NativeTabs.Trigger.Label>{t('team.today')}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger
          name="participants"
          hidden={!hasParticipants}
          testID="team-tab-participants"
        >
          <NativeTabs.Trigger.Icon sf="person.2.fill" md="group" />
          <NativeTabs.Trigger.Label>{t('team.participants')}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="content" hidden={!hasContent} testID="team-tab-content">
          <NativeTabs.Trigger.Icon sf="doc.richtext.fill" md="article" />
          <NativeTabs.Trigger.Label>{t('team.content')}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="messages" hidden={!hasMessages} testID="team-tab-messages">
          <NativeTabs.Trigger.Icon sf="bubble.left.and.bubble.right.fill" md="chat" />
          <NativeTabs.Trigger.Label>{t('team.messages')}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Badge hidden={unreadBadge.hidden}>
            {unreadBadge.children}
          </NativeTabs.Trigger.Badge>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="more" testID="team-tab-more">
          <NativeTabs.Trigger.Icon sf="ellipsis.circle.fill" md="more_horiz" />
          <NativeTabs.Trigger.Label>{t('team.more')}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="home" hidden />
      </NativeTabs>
    );
  }

  return <TeamLayoutContext.Provider value={layout}>{shell}</TeamLayoutContext.Provider>;
}
