import * as Sentry from '@sentry/tanstackstart-react';
import { createRouter } from '@tanstack/react-router';
import { ErrorFallback } from './components/error-fallback';
import { createStaffAccessCache } from './lib/staff-route-guard';
import { supabase } from './lib/supabase';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  const staffAccess = createStaffAccessCache();
  const router = createRouter({
    routeTree,
    context: { staffAccess },
    scrollRestoration: true,
    // Every route without its own errorComponent falls back to the
    // translated, code-showing fallback (RAPP-12).
    defaultErrorComponent: ErrorFallback,
  });

  // Browser-only navigation instrumentation (per the official Sentry
  // TanStack Start manual setup); the server render skips it.
  if (!router.isServer) {
    // A new sign-in or a sign-out starts the staff guard's cache again (RAPP-615).
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') staffAccess.clear();
    });
    Sentry.addIntegration(Sentry.tanstackRouterBrowserTracingIntegration(router));
  }

  return router;
}
