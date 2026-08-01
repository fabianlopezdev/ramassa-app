import { Stack } from 'expo-router/stack';
import { ScrollView, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DevAccountsSection } from './dev-accounts-section';
import { DevCacheSection } from './dev-cache-section';
import { DevEnvironmentSection } from './dev-environment-section';
import { DevErrorsSection } from './dev-errors-section';
import { DevLanguageSection } from './dev-language-section';
import { DevLogsSection } from './dev-logs-section';
import { DevMenuCloseButton } from './dev-menu-close-button';
import { DevMotionSection } from './dev-motion-section';
import { DevNavigationSection } from './dev-navigation-section';
import { DevNetworkSection } from './dev-network-section';
import { DevPushSection } from './dev-push-section';

/**
 * The developer menu (RAPP-19). Reachable only in dev builds; see
 * `src/app/dev-menu.tsx` for the gate that keeps this whole module out of a
 * release bundle.
 *
 * Order is by how often it gets used: what am I running and as whom, then
 * switch who I am, then switch language, then the diagnostic panels.
 *
 * The header options are set from here rather than from the root layout so
 * every reference to a dev module stays inside the dev folder, which is what
 * makes the production gate a single, checkable rule.
 */
// The header row is pinned left-to-right in BOTH reading directions. The dev
// client's floating gear button occupies the top-right corner in both (it is
// the client's own overlay and does not mirror), so a close control that
// mirrors to the right under RTL lands exactly beneath it and every tap opens
// the client's tools menu instead - which is precisely how the LTR variant of
// this header failed when the close sat on the right. Reachability beats RTL
// purity on a dev-only surface. Hoisted per contract rule 17: NativeWind has no
// utility for `direction`, and an inline object would re-allocate every render.
const headerRowLtr: ViewStyle = { direction: 'ltr' };

export function DevMenuScreen() {
  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top']}>
      {/* The header is rendered IN the screen, not by the native stack
          (RAPP-93). Under RTL on Android, react-native-screens (4.25.2,
          Fabric) lays the whole ScreenStackHeaderConfig out at negative Y -
          measured at 0,-385 on the Pixel 8 image - so the title and the close
          button exist, render, and sit 385px above the viewport: invisible,
          unreachable, and pruned from the accessibility tree. Since this
          route's own comment already ruled the native back affordance
          unreliable (RAPP-87), the menu now depends on the native header for
          nothing: an in-screen flex row mirrors correctly in RTL by itself,
          and the ONE way out exists in both directions. */}
      <Stack.Screen options={{ headerShown: false }} />
      <View
        style={headerRowLtr}
        className="flex-row items-center justify-between border-b border-neutral-200 bg-white px-md py-sm"
      >
        <DevMenuCloseButton />
        <Text className="text-lg font-semibold text-neutral-900">Developer menu</Text>
      </View>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        className="flex-1 bg-neutral-50"
        contentContainerClassName="gap-md p-md pb-2xl"
        testID="dev-menu-scroll"
      >
        <DevEnvironmentSection />
        <DevAccountsSection />
        <DevLanguageSection />
        <DevMotionSection />
        <DevNavigationSection />
        <DevCacheSection />
        <DevNetworkSection />
        <DevLogsSection />
        <DevErrorsSection />
        <DevPushSection />
      </ScrollView>
    </SafeAreaView>
  );
}
