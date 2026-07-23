// Sentry.init runs at @/lib/observability module scope, which every import
// below reaches transitively, so the SDK is live before the first render (RAPP-12).
import { AuthDeepLinkHandler } from '@/components/auth/auth-deep-link-handler';
import { ErrorFallback, type ErrorFallbackProps } from '@/components/error-fallback';
import { reportAuthError } from '@/lib/auth';
import { AuthFlowStatusProvider } from '@/lib/auth-flow-status';
import { i18n } from '@/lib/i18n';
import { wrapRootComponent } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';
import { AuthProvider, useAuth } from '@ramassa/shared/auth';
import '../global.css';

// Hold the native splash until the persisted session (if any) has resolved, so
// a signed-in player never flashes the login screen on cold start (RAPP-13).
void SplashScreen.preventAutoHideAsync();

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

  useEffect(() => {
    if (!isLoading) {
      void SplashScreen.hideAsync();
    }
  }, [isLoading]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
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
    <I18nextProvider i18n={i18n}>
      <AuthProvider client={supabase} onError={reportAuthError}>
        <AuthFlowStatusProvider>
          <AuthDeepLinkHandler />
          <RootNavigator />
        </AuthFlowStatusProvider>
      </AuthProvider>
    </I18nextProvider>
  );
}

// Sentry.wrap: attaches the SDK's touch-event and profiling instrumentation
// at the very top of the tree.
export default wrapRootComponent(RootLayout);
