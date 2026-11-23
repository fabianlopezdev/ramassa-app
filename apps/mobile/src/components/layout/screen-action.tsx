/**
 * The call to action of a screen, at the bottom of the screen under its
 * scrolling content (RAPP-881), where the onboarding forms and the player tabs
 * keep theirs. It runs the width of the page and sits above the home indicator,
 * under a hairline, so content that scrolls behind it ends on a clean edge.
 *
 * `ActionScreen` is the screen around it: the content scrolls above the action
 * and never under it, and when the keyboard opens both stay above the keyboard,
 * so she can send what she typed without closing it first.
 */
import { PageWidth } from '@/components/layout/content-width';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { use, useMemo, type ReactNode } from 'react';
import { KeyboardAvoidingView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const BOTTOM_EDGE = ['bottom'] as const;
const fillStyle = { flex: 1 } as const;
const KEYBOARD_BEHAVIOR = process.env.EXPO_OS === 'ios' ? 'padding' : 'height';

function ScreenAction({
  children,
  testID,
}: {
  readonly children: ReactNode;
  readonly testID?: string;
}) {
  return (
    <SafeAreaView edges={BOTTOM_EDGE}>
      <View testID={testID} className="border-t border-neutral-200 px-lg pb-md pt-md">
        {/* The gap sits on the column that holds the buttons, so stacked actions keep it (RAPP-910). */}
        <PageWidth className="gap-sm">{children}</PageWidth>
      </View>
    </SafeAreaView>
  );
}

export function ActionScreen({
  action,
  actionTestID,
  className,
  backgroundColor,
  isUnderFloatingHeader = false,
  children,
}: {
  /** The call to action, or nothing when the screen has none right now. */
  readonly action: ReactNode;
  readonly actionTestID?: string;
  /** The screen's surface, such as `bg-white`. */
  readonly className?: string;
  /** A screen on its own colour, such as a forum post on its category's wash (RAPP-893). */
  readonly backgroundColor?: string;
  /**
   * The screen opens on a photo under a header with no bar (RAPP-915), so
   * this view starts at the top of the screen.
   */
  readonly isUnderFloatingHeader?: boolean;
  readonly children: ReactNode;
}) {
  // The keyboard is measured from the top of the screen and this view starts
  // under the native header, or at the top under a floating one. With the
  // keyboard up the home indicator's room under the action is not needed, so
  // on iOS the action sits right on the keys.
  const nativeHeaderHeight = use(HeaderHeightContext) ?? 0;
  const headerHeight = isUnderFloatingHeader ? 0 : nativeHeaderHeight;
  const { bottom } = useSafeAreaInsets();
  const keyboardOffset = headerHeight - (process.env.EXPO_OS === 'ios' ? bottom : 0);
  const hasAction = action !== null && action !== undefined && action !== false;
  const style = useMemo(
    () => (backgroundColor === undefined ? fillStyle : { ...fillStyle, backgroundColor }),
    [backgroundColor],
  );
  return (
    <KeyboardAvoidingView
      style={style}
      className={className}
      behavior={KEYBOARD_BEHAVIOR}
      keyboardVerticalOffset={keyboardOffset}
    >
      {children}
      {hasAction ? <ScreenAction testID={actionTestID}>{action}</ScreenAction> : null}
    </KeyboardAvoidingView>
  );
}
