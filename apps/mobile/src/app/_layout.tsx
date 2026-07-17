// Sentry.init runs at @/lib/observability module scope, which every import
// below reaches transitively, so the SDK is live before the first render (RAPP-12).
import { ErrorFallback, type ErrorFallbackProps } from '@/components/error-fallback';
import { i18n } from '@/lib/i18n';
import { wrapRootComponent } from '@/lib/observability';
import { Stack } from 'expo-router/stack';
import { I18nextProvider } from 'react-i18next';
import '../global.css';

/** Root-level net: catches render crashes outside the zone boundaries. */
export function ErrorBoundary(props: ErrorFallbackProps) {
  return (
    <I18nextProvider i18n={i18n}>
      <ErrorFallback {...props} />
    </I18nextProvider>
  );
}

function RootLayout() {
  return (
    <I18nextProvider i18n={i18n}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </I18nextProvider>
  );
}

// Sentry.wrap: attaches the SDK's touch-event and profiling instrumentation
// at the very top of the tree.
export default wrapRootComponent(RootLayout);
