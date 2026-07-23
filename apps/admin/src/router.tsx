import * as Sentry from '@sentry/tanstackstart-react';
import { createRouter } from '@tanstack/react-router';
import { ErrorFallback } from './components/error-fallback';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    // Every route without its own errorComponent falls back to the
    // translated, code-showing fallback (RAPP-12).
    defaultErrorComponent: ErrorFallback,
  });

  // Browser-only navigation instrumentation (per the official Sentry
  // TanStack Start manual setup); the server render skips it.
  if (!router.isServer) {
    Sentry.addIntegration(Sentry.tanstackRouterBrowserTracingIntegration(router));
  }

  return router;
}
