// Sentry.init runs at @/lib/observability module scope, which every import
// below reaches transitively, so the SDK is live before the first render (RAPP-12).
import { AuthDeepLinkHandler } from '@/components/auth/auth-deep-link-handler';
import { OrganizationBrandingProvider } from '@/components/branding/organization-branding-provider';
import { ErrorFallback, type ErrorFallbackProps } from '@/components/error-fallback';
import { PushNotificationResponseHandler } from '@/components/push-notification-response-handler';
import { reportAuthError } from '@/lib/auth';
import { AuthFlowStatusProvider } from '@/lib/auth-flow-status';
import { shouldMountAuthRoutes } from '@/lib/auth-route-readiness';
import { i18n } from '@/lib/i18n';
import { configureNetworkStatus } from '@/lib/network-status';
import { wrapRootComponent } from '@/lib/observability';
import { registerProfileQueries } from '@/lib/profile';
import { configurePushNotificationPresentation } from '@/lib/push-notifications';
import { queryClient, queryPersister } from '@/lib/query-client';
import { persistedQueryOptions } from '@/lib/query-persistence';
import { dropCachedServerState, observeSessionIdentity } from '@/lib/session-cache';
import { supabase } from '@/lib/supabase';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo, useRef } from 'react';
import { I18nextProvider } from 'react-i18next';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';
import { AuthProvider, useAuth } from '@ramassa/shared/auth';
import { motionTokens } from '@ramassa/shared/tokens/motion';
import '../global.css';

// Hold the native splash until the persisted session (if any) has resolved, so
// a signed-in player never flashes the login screen on cold start (RAPP-13).
void SplashScreen.preventAutoHideAsync();
configurePushNotificationPresentation();

// Hoisted rather than inline: GestureHandlerRootView is not NativeWind-aware, so
// it needs a real style object, and an inline one would be a fresh allocation on
// every render of the root.
const gestureRootStyle = { flex: 1 } as const;
const persistOptions = persistedQueryOptions(queryPersister);
let webRouteFocusInstalled = false;
const WEB_ROUTE_FOCUS_POLL_MS = 100;
const WEB_ROUTE_FOCUS_MAX_FRAMES = 60;

function visibleWebHeading(): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('h1, [role="heading"]')].find(
    (heading) => heading.offsetParent !== null,
  );
}

function WebRouteFocusManager() {
  useEffect(() => {
    if (Platform.OS !== 'web' || webRouteFocusInstalled) return;
    webRouteFocusInstalled = true;
    let currentPathname = window.location.pathname;
    let pendingPathname: string | null = null;
    window.setInterval(() => {
      if (
        currentPathname === window.location.pathname ||
        pendingPathname === window.location.pathname
      ) {
        return;
      }
      const destinationPathname = window.location.pathname;
      pendingPathname = destinationPathname;
      const previousHeading = visibleWebHeading();
      let attempts = 0;
      const focusDestinationHeading = () => {
        if (window.location.pathname !== destinationPathname) {
          pendingPathname = null;
          return;
        }
        const heading = visibleWebHeading();
        if (
          heading !== undefined &&
          (heading !== previousHeading || attempts >= WEB_ROUTE_FOCUS_MAX_FRAMES)
        ) {
          currentPathname = destinationPathname;
          pendingPathname = null;
          heading.setAttribute('tabindex', '-1');
          heading.focus();
          return;
        }
        attempts += 1;
        window.requestAnimationFrame(focusDestinationHeading);
      };
      window.requestAnimationFrame(focusDestinationHeading);
    }, WEB_ROUTE_FOCUS_POLL_MS);
  }, []);

  return null;
}

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
  const userId = session?.user.id ?? null;
  // The identity the cache currently holds data for. A ref, not state: this
  // drives an eviction, not a render.
  const cachedUserIdRef = useRef<string | null | undefined>(undefined);
  // The profile query and its optimistic edit read the signed-in user's id, so
  // they are registered here where the session lives rather than at module
  // scope, and re-registered when the session changes.
  //
  // Re-registering is NOT enough on its own, which is what this used to claim:
  // `setQueryDefaults` replaces the query FUNCTION and leaves every cached row
  // exactly where it was. On a shared phone that meant the next woman to sign
  // in was served the previous one's decrypted profile (legal name, document
  // number, address) from cache while her own refetch was still in flight. So
  // an identity change also evicts what is cached.
  //
  // REGISTER FIRST, THEN EVICT, which is the opposite of the obvious order.
  // Eviction refetches the queries that are still on screen, and the
  // deletion-request one resolves its subject through the id getter below, so
  // evicting first would send that refetch out under the PREVIOUS woman's id.
  // (The profile read itself is safe either way: it resolves identity from the
  // session server-side rather than from anything captured here.)
  useEffect(() => {
    registerProfileQueries(() => userId);
    const observation = observeSessionIdentity(cachedUserIdRef.current, userId, isLoading);
    if (observation === null) return;
    cachedUserIdRef.current = observation.cachedUserId;
    if (observation.shouldDrop) {
      dropCachedServerState(queryClient);
    }
  }, [isLoading, userId]);
  // Screen transitions honour reduce-motion too (RAPP-70 scope item 5): the
  // native stack's default slide becomes a plain fade, which is the closest the
  // native navigator offers to "no movement". Set here rather than per screen so
  // no future route can forget it.
  const isReducedMotion = useReducedMotion();
  const screenOptions = useMemo(
    () => ({
      headerShown: false,
      animation: isReducedMotion ? ('fade' as const) : ('default' as const),
      animationDuration: motionTokens.duration.base,
    }),
    [isReducedMotion],
  );

  useEffect(() => {
    if (!isLoading) {
      void SplashScreen.hideAsync();
    }
  }, [isLoading]);

  if (!shouldMountAuthRoutes(isLoading)) return null;

  return (
    <Stack screenOptions={screenOptions}>
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
  // The online manager notifies mounted React Query consumers. Starting its
  // async native probe at query-client module scope can resolve between render
  // and commit, which makes React report a state update on an unmounted root.
  useEffect(() => {
    configureNetworkStatus();
  }, []);

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
        <WebRouteFocusManager />
        {/* Server-state cache for every screen that fetches (RAPP-19). Mounted
            above the auth provider so a future query can be keyed by session
            without the provider tree having to be reordered later. */}
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
          <AuthProvider client={supabase} onError={reportAuthError}>
            <OrganizationBrandingProvider>
              <AuthFlowStatusProvider>
                <AuthDeepLinkHandler />
                <PushNotificationResponseHandler />
                <RootNavigator />
              </AuthFlowStatusProvider>
            </OrganizationBrandingProvider>
          </AuthProvider>
        </PersistQueryClientProvider>
      </I18nextProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap: attaches the SDK's touch-event and profiling instrumentation
// at the very top of the tree.
export default wrapRootComponent(RootLayout);
