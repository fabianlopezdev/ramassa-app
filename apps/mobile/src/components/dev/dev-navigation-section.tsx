import { useRouter, type Href } from 'expo-router';
import { DevButton, DevButtonRow, DevNote, DevSection } from './dev-ui';

/**
 * Jump to any screen (RAPP-19 scope item 1, first half).
 *
 * Data-driven so a new screen is one line here, not a new component. The list
 * is short today because Phase 1 shipped shells only (RAPP-16); every feature
 * issue from Phase 3 on adds its screens here.
 *
 * `(auth)/login` is reachable even while signed in: the root navigator's
 * `Stack.Protected` guard will bounce it straight back, which is itself the
 * fastest way to check the guard still works.
 */
const DEV_ROUTES: readonly { readonly label: string; readonly href: Href }[] = [
  { label: 'Home', href: '/(app)/(tabs)' },
  { label: 'Events', href: '/(app)/(tabs)/events' },
  { label: 'Community', href: '/(app)/(tabs)/community' },
  { label: 'Services', href: '/(app)/(tabs)/services' },
  { label: 'Profile', href: '/(app)/(tabs)/profile' },
  { label: 'Login', href: '/(auth)/login' },
  { label: 'Auth callback', href: '/auth/callback' },
  { label: 'Sitemap', href: '/_sitemap' },
];

export function DevNavigationSection() {
  const { push } = useRouter();

  return (
    <DevSection title="Open any screen">
      <DevNote>Phase 1 is navigation shells; feature screens are added here as they land.</DevNote>
      <DevButtonRow>
        {DEV_ROUTES.map((route) => (
          <DevButton key={route.label} label={route.label} onPress={() => push(route.href)} />
        ))}
      </DevButtonRow>
    </DevSection>
  );
}
