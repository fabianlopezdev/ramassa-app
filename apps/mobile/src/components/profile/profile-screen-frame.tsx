/**
 * The frame of every profile screen (RAPP-794): the native header with its
 * title and back control, which mirrors by itself in right-to-left languages,
 * over one scrolling column. The profile menu and each screen it opens share
 * it, so moving between them never changes the shape of the page.
 *
 * A screen may pass a `footer`, such as the credits of the menu (RAPP-877). It
 * sits under the column at the very bottom of the phone: pushed down when the
 * page is shorter than the screen, with no page padding under it, and reaching
 * into the space kept for the home indicator to a small gap above the bar. A
 * phone with no bar keeps no such space, and the footer stays where it is.
 * The column itself is left alone, since it is the part that rises when the
 * screen arrives (RAPP-875).
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
  footer,
  children,
}: {
  readonly title: string;
  readonly testID: string;
  /** A last block kept at the very bottom of the phone, under everything else. */
  readonly footer?: ReactNode;
  readonly children: ReactNode;
}) {
  // Android only: the header already clears the status bar, and on iOS the
  // automatic inset adjustment clears the home indicator.
  const insets = useSafeAreaInsets();
  const androidBottomInset = useMemo(
    () => (process.env.EXPO_OS === 'android' ? { paddingBottom: insets.bottom } : undefined),
    [insets.bottom],
  );
  const hasFooter = footer !== undefined && footer !== null;
  const bottomTuckStyle = useMemo(
    () =>
      hasFooter ? { marginBottom: -Math.max(0, insets.bottom - tokens.spacing.md) } : undefined,
    [hasFooter, insets.bottom],
  );
  return (
    <>
      <NativeScreenHeader title={title} />
      <ScrollView
        testID={testID}
        className="flex-1 bg-neutral-50"
        contentContainerClassName={`grow px-lg pt-lg ${hasFooter ? '' : 'pb-lg'}`}
        contentContainerStyle={androidBottomInset}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View className="grow" style={bottomTuckStyle}>
          <PageWidth className="gap-lg">{children}</PageWidth>
          {hasFooter ? (
            <View className="mt-auto w-full pt-lg sm:max-w-page sm:self-center">{footer}</View>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}
