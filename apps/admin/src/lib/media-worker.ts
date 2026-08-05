/**
 * Where the media Worker lives for uploads, authenticated object delivery, and
 * the RGPD sweep that runs before a participant record can be erased.
 *
 * Read through a literal `import.meta.env` access so Vite statically replaces
 * it, like the Supabase values next door. Optional in the shared schema, because
 * the mobile app boots fine without it today and a required key would take both
 * apps down when local media is not running; each media flow handles a missing
 * value at the point of use.
 */

import { adminClientEnv } from './supabase';

export const mediaWorkerUrl: string = adminClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL ?? '';
