/**
 * The dev menu's always-on instrumentation (RAPP-19).
 *
 * Both buffers have to start collecting BEFORE the menu is opened, otherwise
 * the inspector only ever shows the requests and logs the menu itself caused.
 * So this module is pulled in from the mobile observability wiring, which is
 * the first module the app evaluates, through a `__DEV__`-guarded require.
 * Nothing here exists in a release bundle.
 *
 * Capacities are named here rather than in `packages/shared/lib/constants.ts`:
 * that file is the DOMAIN constant registry for production code, and a dev
 * screen's ring-buffer size is neither.
 */

import { createDevLogBuffer } from './dev-log-buffer';
import { createDevNetworkLog, installDevFetchLogger, type DevFetchScope } from './dev-network-log';

/** Enough to cover a cold start plus a sign-in without scrolling forever. */
const NETWORK_LOG_CAPACITY = 50;

/** Logs are chattier than requests, and cheap to hold. */
const LOG_BUFFER_CAPACITY = 200;

export const devNetworkLog = createDevNetworkLog({ capacity: NETWORK_LOG_CAPACITY });

const logBuffer = createDevLogBuffer({ capacity: LOG_BUFFER_CAPACITY });

export const devLogBuffer = logBuffer;

/** Handed to `createLogger` as a second sink beside the console one. */
export const devLogSink = logBuffer.sink;

// supabase-js and the R2 upload client both call global `fetch`, so wrapping it
// once here sees everything either of them does without either one knowing.
// Literal member access so Metro inlines the value at bundle time.
installDevFetchLogger({
  scope: globalThis as unknown as DevFetchScope,
  log: devNetworkLog,
  now: () => Date.now(),
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
});
