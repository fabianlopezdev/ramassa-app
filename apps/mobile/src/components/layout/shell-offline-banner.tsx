/**
 * The one offline banner (RAPP-807): a strip at the top of the signed-in shell
 * for players, the team and entities, shown whenever the phone has no
 * connection. Screens keep only what this banner cannot say, next to the action
 * it concerns (a write that waits for the connection, marks queued on the
 * phone).
 *
 * The banner sits above the navigator, so it never covers a tab bar or a
 * header's controls: the screens move down by its height. The navigator gets
 * its own safe-area provider, measured below the banner, so headers and screens
 * stop adding the status bar a second time while the banner is up. A plain
 * view, so the app lock cover hides it like any other screen content.
 */
import { isNetworkStateOnline } from '@/lib/network-status';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useNetworkState } from 'expo-network';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaFrame,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

const styles = StyleSheet.create({ fill: { flex: 1 } });

function ShellOfflineBanner({ topInset }: { readonly topInset: number }) {
  const { t } = useTranslation('common');
  const languageFontClass = useLanguageFontClass();
  const topInsetStyle = useMemo(() => ({ paddingTop: topInset }), [topInset]);
  return (
    <View
      testID="shell-offline-banner"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="border-b border-secondary-dark bg-secondary-light"
      style={topInsetStyle}
    >
      <View className="flex-row items-center gap-sm px-lg py-sm">
        <View accessible={false} className="h-sm w-sm rounded-full bg-warning" />
        <Text
          className={`flex-1 text-start text-sm font-medium text-neutral-900 ${languageFontClass}`}
        >
          {t('offline')}
        </Text>
      </View>
    </View>
  );
}

/** Wraps the signed-in navigator: the banner on top, the screens below it. */
export function ShellOfflineFrame({ children }: { readonly children: ReactNode }) {
  const isOffline = !isNetworkStateOnline(useNetworkState());
  const insets = useSafeAreaInsets();
  const frame = useSafeAreaFrame();
  // Only the first render reads these: the nested provider measures itself
  // after that, and starting from the parent's values avoids a blank frame.
  const [initialMetrics] = useState(() => ({ insets, frame }));
  return (
    <View style={styles.fill}>
      {isOffline ? <ShellOfflineBanner topInset={insets.top} /> : null}
      <SafeAreaProvider initialMetrics={initialMetrics} style={styles.fill}>
        {children}
      </SafeAreaProvider>
    </View>
  );
}
