/**
 * Step-up checks (RAPP-235). The risky actions (RGPD deletion, permission and
 * preset changes, new accounts, second-factor resets and exports) need an
 * authenticator code from the last few minutes, even in a verified session.
 * The database enforces it and answers `step_up_required` without one; the
 * screens read the same time from the token first, so they ask for the code
 * before the action instead of after a refusal.
 */
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from '../errors';
import { STEP_UP_WINDOW_SECONDS } from '../lib/constants';
import type { Database } from '../types/database';
import { readAccessTokenClaims, verifySecondFactor } from './second-factor';

type Client = SupabaseClient<Database>;

/**
 * The screens ask for a code a minute early, so an action started near the end
 * of the window does not reach the database a moment too late.
 */
const STEP_UP_MARGIN_SECONDS = 60;

const amrSchema = z.array(z.object({ method: z.string(), timestamp: z.number() }).loose());

/** When the session last verified an authenticator code, in Unix seconds, or null. */
export function secondFactorVerifiedAt(session: Session | null): number | null {
  const parsed = amrSchema.safeParse(readAccessTokenClaims(session)?.amr);
  if (!parsed.success) return null;
  const times = parsed.data
    .filter((entry) => entry.method === 'totp')
    .map((entry) => entry.timestamp);
  return times.length === 0 ? null : Math.max(...times);
}

export function hasRecentSecondFactor(session: Session | null, nowMs = Date.now()): boolean {
  const verifiedAt = secondFactorVerifiedAt(session);
  if (verifiedAt === null) return false;
  return nowMs / 1000 - verifiedAt < STEP_UP_WINDOW_SECONDS - STEP_UP_MARGIN_SECONDS;
}

/** Verifies a fresh code with the person's authenticator, which moves the time forward. */
export async function confirmSecondFactor(client: Client, code: string): Promise<void> {
  const listed = await client.auth.mfa.listFactors();
  if (listed.error) throw new AppError('AUTH-1', { message: listed.error.message });
  const verified = listed.data.totp.find((factor) => factor.status === 'verified');
  if (verified === undefined)
    throw new AppError('AUTH-9', { message: 'No verified authenticator' });
  await verifySecondFactor(client, verified.id, code);
}
