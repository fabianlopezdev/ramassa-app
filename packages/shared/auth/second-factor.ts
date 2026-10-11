/**
 * The second factor (RAPP-233): every team member and entity contact verifies
 * her session with an authenticator app (TOTP) before the database lets it
 * reach anything (assurance level `aal2`). Players sign in with the email code
 * alone.
 *
 * The screens in both apps call these; the database is what enforces the rule.
 */
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from '../errors';
import type { AppRole } from '../schemas/auth';
import type { Database } from '../types/database';

type Client = SupabaseClient<Database>;

/** The roles whose access rules need an `aal2` session. */
const SECOND_FACTOR_ROLES: readonly AppRole[] = ['staff', 'admin', 'entity'];

/** The assurance level the access token carries, read without a round trip. */
export function assuranceLevelOf(session: Session | null): 'aal1' | 'aal2' | null {
  if (session === null || typeof session.access_token !== 'string') return null;
  const payload = session.access_token.split('.')[1];
  if (payload === undefined) return null;
  try {
    const json = JSON.parse(
      atob(
        payload
          .replace(/-/g, '+')
          .replace(/_/g, '/')
          .padEnd(Math.ceil(payload.length / 4) * 4, '='),
      ),
    ) as { aal?: unknown };
    return json.aal === 'aal2' ? 'aal2' : 'aal1';
  } catch {
    return null;
  }
}

export function needsSecondFactor(role: AppRole | null, session: Session | null): boolean {
  return (
    role !== null && SECOND_FACTOR_ROLES.includes(role) && assuranceLevelOf(session) !== 'aal2'
  );
}

export type SecondFactorStart =
  | { readonly kind: 'challenge'; readonly factorId: string }
  | {
      readonly kind: 'enroll';
      readonly factorId: string;
      /** The base32 secret, for typing into an authenticator by hand. */
      readonly secret: string;
      /** The `otpauth://` link an authenticator app opens directly. */
      readonly uri: string;
      /** An SVG data URL of the same link as a QR code. */
      readonly qrCode: string;
    };

/**
 * A verified authenticator means a code is asked for. Without one, a new
 * authenticator is set up: unfinished set-ups from an earlier attempt are
 * removed first, so a second attempt never collides with the first.
 */
export async function startSecondFactor(
  client: Client,
  friendlyName = 'Ramassà',
): Promise<SecondFactorStart> {
  const listed = await client.auth.mfa.listFactors();
  if (listed.error) throw new AppError('AUTH-1', { message: listed.error.message });
  const verified = listed.data.totp.find((factor) => factor.status === 'verified');
  if (verified !== undefined) return { kind: 'challenge', factorId: verified.id };

  for (const factor of listed.data.all) {
    if (factor.status !== 'verified') await client.auth.mfa.unenroll({ factorId: factor.id });
  }
  // The name must be unique per person: a screen that mounts twice (React's
  // development mode does, and a slow phone can) would otherwise collide with
  // its own first attempt. The leftover is removed at the next start.
  const enrolled = await client.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `${friendlyName} ${new Date().toISOString().slice(0, 16)} ${crypto.randomUUID().slice(0, 8)}`,
  });
  if (enrolled.error) throw new AppError('AUTH-1', { message: enrolled.error.message });
  return {
    kind: 'enroll',
    factorId: enrolled.data.id,
    secret: enrolled.data.totp.secret,
    uri: enrolled.data.totp.uri,
    qrCode: enrolled.data.totp.qr_code,
  };
}

const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/);

/** Verifies the six-digit code; on success the session becomes `aal2`. */
export async function verifySecondFactor(
  client: Client,
  factorId: string,
  rawCode: string,
): Promise<void> {
  const code = codeSchema.safeParse(rawCode);
  if (!code.success) throw new AppError('AUTH-8', { message: 'The code has six digits' });
  const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code: code.data });
  if (error) throw new AppError('AUTH-8', { message: error.message });
}

/** A team.manage (or entities.manage) holder resets someone's lost authenticator. */
export async function resetSecondFactor(client: Client, profileId: string): Promise<void> {
  const { error } = await client.rpc('reset_second_factor', {
    p_profile_id: z.uuid().parse(profileId),
  });
  if (error) throw new AppError('DB-1', { message: error.message });
}
