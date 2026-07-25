import { Stack } from 'expo-router/stack';
import { ScrollView } from 'react-native';
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
export function DevMenuScreen() {
  return (
    <>
      {/* `headerBackVisible: false` so there is exactly ONE way out, always
          present, instead of a native arrow that vanishes once signing in
          unmounts the group this was pushed from (RAPP-87). */}
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Developer menu',
          headerBackVisible: false,
          headerLeft: () => <DevMenuCloseButton />,
        }}
      />
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
    </>
  );
}
