/**
 * The one offline notice (RAPP-807, RAPP-817): a slim strip under the status
 * bar of the signed-in shell, for players, the team and entities, shown only
 * while the app's online state says the phone has no connection. Screens keep
 * only what this strip cannot say, next to the action it concerns (a write
 * that waits for the connection, marks queued on the phone).
 *
 * The strip sits above the navigator, so it never covers a tab bar or a
 * header's controls: the screens move down by its height. The status bar area
 * keeps the app's normal colour. The navigator gets its own safe-area
 * provider, measured below the strip, so headers and screens stop adding the
 * status bar a second time while the strip is up. A plain view, so the app
 * lock cover hides it like any other screen content.
 */
import { useIsOnline } from '@/lib/use-is-online';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaFrame,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({ fill: { flex: 1 } });

const offlineSymbol: SymbolViewProps['name'] = {
  ios: 'wifi.slash',
  android: 'wifi_off',
  web: 'wifi_off',
};

function ShellOfflineBanner({ topInset }: { readonly topInset: number }) {
  const { t } = useTranslation('common');
  const languageFontClass = useLanguageFontClass();
  const topInsetStyle = useMemo(() => ({ paddingTop: topInset }), [topInset]);
  return (
    <View className="bg-white" style={topInsetStyle}>
      <View
        testID="shell-offline-banner"
        accessible
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={t('offline')}
        className="flex-row items-center justify-center gap-xs border-b border-neutral-200 bg-neutral-100 px-lg py-xs"
      >
        <SymbolView
          accessible={false}
          name={offlineSymbol}
          size={tokens.fontSize.md}
          tintColor={tokens.colors.neutral[700]}
        />
        <Text className={`text-center text-sm font-medium text-neutral-800 ${languageFontClass}`}>
          {t('offline')}
        </Text>
      </View>
    </View>
  );
}

/** Wraps the signed-in navigator: the strip on top, the screens below it. */
export function ShellOfflineFrame({ children }: { readonly children: ReactNode }) {
  const isOffline = !useIsOnline();
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
