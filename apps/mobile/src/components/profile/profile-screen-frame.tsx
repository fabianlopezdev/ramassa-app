/**
 * The frame of every profile screen (RAPP-794): the native header with its
 * title and back control, which mirrors by itself in right-to-left languages,
 * over one scrolling column. The profile menu and each screen it opens share
 * it, so moving between them never changes the shape of the page.
 *
 * The column fills at least the screen's height, so a screen can keep a last
 * block at the bottom with `mt-auto`, such as the credits of the menu (RAPP-877).
 * With `flushBottom` the page drops its own bottom padding and lets that block
 * reach into the space kept for the home indicator, stopping a small gap above
 * the bar, so it sits at the very bottom of the phone. A phone with no bar
 * keeps no such space, and the block stays where it is.
 */
import { PageWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { useMemo, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '@ramassa/shared/tokens';

export function ProfileScreenFrame({
  title,
  testID,
  flushBottom = false,
  children,
}: {
  readonly title: string;
  readonly testID: string;
  /** No padding under the last block, for a footer that belongs at the very bottom. */
  readonly flushBottom?: boolean;
  readonly children: ReactNode;
}) {
  // Android only: the header already clears the status bar, and on iOS the
  // automatic inset adjustment clears the home indicator.
  const insets = useSafeAreaInsets();
  const androidBottomInset = useMemo(
    () => (process.env.EXPO_OS === 'android' ? { paddingBottom: insets.bottom } : undefined),
    [insets.bottom],
  );
  const bottomTuckStyle = useMemo(
    () =>
      flushBottom ? { marginBottom: -Math.max(0, insets.bottom - tokens.spacing.md) } : undefined,
    [flushBottom, insets.bottom],
  );
  return (
    <>
      <NativeScreenHeader title={title} />
      <ScrollView
        testID={testID}
        className="flex-1 bg-neutral-50"
        contentContainerClassName={`grow px-lg pt-lg ${flushBottom ? '' : 'pb-lg'}`}
        contentContainerStyle={androidBottomInset}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View className="grow" style={bottomTuckStyle}>
          <PageWidth className="grow gap-lg">{children}</PageWidth>
        </View>
      </ScrollView>
    </>
  );
}
