/**
 * Where the media Worker lives, for the one admin flow that calls it: the RGPD
 * sweep that must run before a participant's record can be erased (RAPP-26).
 *
 * Read through a literal `import.meta.env` access so Vite statically replaces
 * it, like the Supabase values next door. Optional in the shared schema, because
 * the mobile app boots fine without it today and a required key would take both
 * apps down over a feature neither of them uses yet; missing here surfaces at
 * the point of use as a refused erasure with a code, never as a silent no-op.
 */

import { adminClientEnv } from './supabase';

export const mediaWorkerUrl: string = adminClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL ?? '';
