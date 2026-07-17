/**
 * Admin browser-side Sentry init (RAPP-12). Imported FIRST by the custom
 * client entry (`src/client.tsx`) so the SDK is live before hydration.
 *
 * Server-side (Cloudflare Workers runtime) init deliberately lands with the
 * Workers deploy wiring (RAPP-15): the Node `instrument.server.mjs --import`
 * path from the Sentry docs does not exist on Workers.
 */

import * as Sentry from '@sentry/tanstackstart-react';
import { redactPii } from '@ramassa/shared/logger';

// Literal member access so Vite statically replaces the values at build time.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const commitSha = import.meta.env.VITE_COMMIT_SHA as string | undefined;

Sentry.init({
  dsn: sentryDsn,
  // No DSN configured = reporting off (local dev, CI); the app still runs.
  enabled: Boolean(sentryDsn),
  // PII policy (RAPP-12): no default user context, no session replay — staff
  // screens show participants' personal data, which must never be recorded.
  sendDefaultPii: false,
  // Release = commit SHA (injected by the build; RAPP-68 owns CI wiring).
  ...(commitSha === undefined ? {} : { release: commitSha }),
  beforeSend(event) {
    // Last-resort net over whatever the SDK collected on its own; primary
    // protection is the logger redacting before anything reaches Sentry.
    if (event.extra !== undefined) {
      event.extra = redactPii(event.extra) as typeof event.extra;
    }
    if (event.message !== undefined) {
      event.message = redactPii(event.message) as string;
    }
    for (const exception of event.exception?.values ?? []) {
      if (exception.value !== undefined) {
        exception.value = redactPii(exception.value) as string;
      }
    }
    return event;
  },
});
