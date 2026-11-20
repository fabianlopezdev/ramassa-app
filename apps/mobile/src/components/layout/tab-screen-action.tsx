/**
 * The main action of a player tab, pinned at the bottom of the screen just
 * above the tab bar (RAPP-852), such as Share on Comunitat. The list scrolls
 * under it; the screen gives its content the room the action takes, through
 * `onContentHeight`, so the last row can scroll clear of it.
 *
 * Native tabs place a screen differently per platform: on Android the screen
 * already ends above the tab bar, and on iOS it runs under the floating bar.
 * So only iOS takes the screen's bottom safe area (react-native-screens),
 * which includes the bar. On Android that safe area still counts the bar and
 * the system bar, and taking it would float the action a bar too high.
 * https://docs.expo.dev/router/advanced/native-tabs/#safe-area-handling
 */
import { PageWidth } from '@/components/layout/content-width';
import { useCallback, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-screens/experimental';

const styles = StyleSheet.create({
  pinned: { position: 'absolute', start: 0, end: 0, bottom: 0 },
});
const SAFE_AREA_EDGES = process.env.EXPO_OS === 'ios' ? { bottom: true } : {};

export function TabScreenAction({
  children,
  onContentHeight,
  testID,
}: {
  readonly children: ReactNode;
  /** The height of the action itself, without the tab bar under it. */
  readonly onContentHeight: (height: number) => void;
  readonly testID?: string;
}) {
  const handleLayout = useCallback(
    ({ nativeEvent }: LayoutChangeEvent) => onContentHeight(nativeEvent.layout.height),
    [onContentHeight],
  );
  return (
    <SafeAreaView edges={SAFE_AREA_EDGES} pointerEvents="box-none" style={styles.pinned}>
      <View
        testID={testID}
        pointerEvents="box-none"
        className="px-lg pb-md"
        onLayout={handleLayout}
      >
        <PageWidth>{children}</PageWidth>
      </View>
    </SafeAreaView>
  );
}
