// Sentry.init runs at @/lib/observability module scope, which every import
// below reaches transitively, so the SDK is live before the first render (RAPP-12).
import { AuthDeepLinkHandler } from '@/components/auth/auth-deep-link-handler';
import { ErrorFallback, type ErrorFallbackProps } from '@/components/error-fallback';
import { reportAuthError } from '@/lib/auth';
import { AuthFlowStatusProvider } from '@/lib/auth-flow-status';
import { i18n } from '@/lib/i18n';
import { wrapRootComponent } from '@/lib/observability';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';
import { AuthProvider, useAuth } from '@ramassa/shared/auth';
import { motionTokens } from '@ramassa/shared/tokens/motion';
import '../global.css';

// Hold the native splash until the persisted session (if any) has resolved, so
// a signed-in player never flashes the login screen on cold start (RAPP-13).
void SplashScreen.preventAutoHideAsync();

// Hoisted rather than inline: GestureHandlerRootView is not NativeWind-aware, so
// it needs a real style object, and an inline one would be a fresh allocation on
// every render of the root.
const gestureRootStyle = { flex: 1 } as const;

/** Root-level net: catches render crashes outside the zone boundaries. */
export function ErrorBoundary(props: ErrorFallbackProps) {
  return (
    <I18nextProvider i18n={i18n}>
      <ErrorFallback {...props} />
    </I18nextProvider>
  );
}

/**
 * Auth-state routing (RAPP-13): the persisted session decides which route group
 * is reachable. `Stack.Protected` redirects to the other group the moment the
 * guard flips, so signing in lands in `(app)` and signing out returns to
 * `(auth)` with no manual navigation.
 */
function RootNavigator() {
  const { session, isLoading } = useAuth();
  // Screen transitions honour reduce-motion too (RAPP-70 scope item 5): the
  // native stack's default slide becomes a plain fade, which is the closest the
  // native navigator offers to "no movement". Set here rather than per screen so
  // no future route can forget it.
  const isReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!isLoading) {
      void SplashScreen.hideAsync();
    }
  }, [isLoading]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: isReducedMotion ? 'fade' : 'default',
        animationDuration: motionTokens.duration.base,
      }}
    >
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      {/* Ungated on purpose: the magic link lands here while still signed out,
          and Expo Router resolves the deep link as a route — without this the
          link opens onto "Unmatched Route". The screen itself redirects once
          the session (or the failure) is known. */}
      <Stack.Screen name="auth/callback" />
    </Stack>
  );
}

function RootLayout() {
  return (
    /* Gesture Handler's root, mounted explicitly (RAPP-70). Expo Router does
       NOT provide one for this configuration, and every `GestureDetector` in
       the app (PressableScale, and therefore every touchable) throws without
       it: "GestureDetector must be used as a descendant of
       GestureHandlerRootView". Found on device; no test or type check sees it,
       because it is a runtime tree requirement. It must stay OUTSIDE the
       providers so it covers the whole app including the modal above. */
    <GestureHandlerRootView style={gestureRootStyle}>
      <I18nextProvider i18n={i18n}>
        {/* Server-state cache for every screen that fetches (RAPP-19). Mounted
            above the auth provider so a future query can be keyed by session
            without the provider tree having to be reordered later. */}
        <QueryClientProvider client={queryClient}>
          <AuthProvider client={supabase} onError={reportAuthError}>
            <AuthFlowStatusProvider>
              <AuthDeepLinkHandler />
              <RootNavigator />
            </AuthFlowStatusProvider>
          </AuthProvider>
        </QueryClientProvider>
      </I18nextProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap: attaches the SDK's touch-event and profiling instrumentation
// at the very top of the tree.
export default wrapRootComponent(RootLayout);
