import { useRouter } from 'expo-router';
import { Pressable, Text } from 'react-native';

/**
 * The dev menu's own way out (RAPP-87).
 *
 * The native header's back arrow is NOT reliable here. This route sits outside
 * `Stack.Protected`, so signing in from the account switcher unmounts the
 * `(auth)` group the menu was pushed from: there is then nothing to pop back
 * to, the arrow disappears, and on a gesture-navigation Android (no 3-button
 * bar) an edge-swipe with an empty back stack exits the app instead of closing
 * the menu. Older Androids hid the bug behind the system back button.
 *
 * So this never asks "can I go back" as its only plan: it pops when there is
 * something to pop, and otherwise REPLACES with `/`, which the root navigator's
 * guard resolves to whichever group the current session allows. Either way the
 * menu closes and the app is left on a valid screen.
 */
export function DevMenuCloseButton() {
  const { back, canGoBack, replace } = useRouter();

  return (
    <Pressable
      testID="dev-menu-close"
      accessibilityRole="button"
      accessibilityLabel="Close the developer menu"
      hitSlop={12}
      onPress={() => {
        if (canGoBack()) {
          back();
          return;
        }
        replace('/');
      }}
      className="min-h-min justify-center px-sm active:opacity-60"
    >
      <Text className="text-md font-medium text-primary">Close</Text>
    </Pressable>
  );
}
