import { Link } from 'expo-router';
import { Pressable, Text } from 'react-native';

/**
 * The way into the dev menu (RAPP-19).
 *
 * The SPEC says "accessible from settings"; there is no settings screen yet
 * (RAPP-22), so it sits on the Profile tab, which is where settings will live.
 * It is also placed on the login screen, because the account switcher is most
 * useful exactly when nobody is signed in.
 *
 * Callers require this module inside a `__DEV__` branch, so the label never
 * reaches a production bundle either.
 */
export function DevMenuEntry() {
  return (
    <Link href="/dev-menu" asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open the developer menu"
        className="min-h-min items-center justify-center rounded-md border border-neutral-300 bg-neutral-100 px-lg py-sm active:opacity-70"
      >
        <Text className="text-sm font-medium text-neutral-700">Developer menu</Text>
      </Pressable>
    </Link>
  );
}
