/**
 * The frame of every profile screen (RAPP-794): the native header with its
 * title and back control, which mirrors by itself in right-to-left languages,
 * over one scrolling column. The profile menu and each screen it opens share
 * it, so moving between them never changes the shape of the page.
 *
 * The column fills at least the screen's height, so a screen can keep a last
 * block at the bottom with `mt-auto`, such as the credits of the menu (RAPP-877).
 */
import { PageWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { useMemo, type ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function ProfileScreenFrame({
  title,
  testID,
  children,
}: {
  readonly title: string;
  readonly testID: string;
  readonly children: ReactNode;
}) {
  // Android only: the header already clears the status bar, and on iOS the
  // automatic inset adjustment clears the home indicator.
  const insets = useSafeAreaInsets();
  const androidBottomInset = useMemo(
    () => (process.env.EXPO_OS === 'android' ? { paddingBottom: insets.bottom } : undefined),
    [insets.bottom],
  );
  return (
    <>
      <NativeScreenHeader title={title} />
      <ScrollView
        testID={testID}
        className="flex-1 bg-neutral-50"
        contentContainerClassName="grow p-lg"
        contentContainerStyle={androidBottomInset}
        contentInsetAdjustmentBehavior="automatic"
      >
        <PageWidth className="grow gap-lg">{children}</PageWidth>
      </ScrollView>
    </>
  );
}
