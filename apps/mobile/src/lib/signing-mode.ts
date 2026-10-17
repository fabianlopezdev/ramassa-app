/**
 * Signing mode on a staff tablet (RAPP-305): after the coach taps Hand over,
 * the tablet shows only the authorization for that one player until the coach
 * leaves with her own biometrics or passcode.
 *
 * The session is kept in the encrypted private storage, so a crash or a cold
 * start opens signing mode again instead of the staff screens. The version she
 * signs is kept there too, so signing works with no connection.
 */
import {
  authorizationForSigningSchema,
  type AuthorizationForSigning,
  type TabletSigner,
} from '@ramassa/shared/authorization';
import type { OutboxStorage } from '@ramassa/shared/offline';

const SESSION_KEY = 'ramassa.signing-mode.v1';
const AUTHORIZATION_PREFIX = 'ramassa.signing-authorization.v1';

export interface SigningSession {
  readonly ownerId: string;
  readonly signer: TabletSigner;
  readonly startedAt: string;
}

function isSigner(value: unknown): value is TabletSigner {
  if (typeof value !== 'object' || value === null) return false;
  const signer = value as Record<string, unknown>;
  return signer.kind === 'player'
    ? typeof signer.profileId === 'string' && typeof signer.name === 'string'
    : signer.kind === 'walk_in' &&
        typeof signer.firstName === 'string' &&
        typeof signer.lastName === 'string';
}

/** The open session for this coach, or null. Another account's session is not hers. */
export function readSigningSession(
  storage: OutboxStorage,
  ownerId: string | null,
): SigningSession | null {
  if (ownerId === null) return null;
  const raw = storage.getString(SESSION_KEY);
  if (raw === undefined) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SigningSession>;
    if (
      parsed.ownerId !== ownerId ||
      typeof parsed.startedAt !== 'string' ||
      !isSigner(parsed.signer)
    ) {
      return null;
    }
    return { ownerId, signer: parsed.signer, startedAt: parsed.startedAt };
  } catch {
    return null;
  }
}

export function startSigningSession(
  storage: OutboxStorage,
  ownerId: string,
  signer: TabletSigner,
  now: Date = new Date(),
): SigningSession {
  const session: SigningSession = { ownerId, signer, startedAt: now.toISOString() };
  storage.set(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function endSigningSession(storage: OutboxStorage): void {
  storage.remove(SESSION_KEY);
}

const authorizationKey = (ownerId: string) => `${AUTHORIZATION_PREFIX}:${ownerId}`;

export function saveAuthorizationForSigning(
  storage: OutboxStorage,
  ownerId: string,
  authorization: AuthorizationForSigning | null,
): void {
  if (authorization === null) {
    storage.remove(authorizationKey(ownerId));
    return;
  }
  storage.set(authorizationKey(ownerId), JSON.stringify(authorization));
}

/** The version last read online, for signing with no connection. */
export function readAuthorizationForSigning(
  storage: OutboxStorage,
  ownerId: string,
): AuthorizationForSigning | null {
  const raw = storage.getString(authorizationKey(ownerId));
  if (raw === undefined) return null;
  try {
    const parsed = authorizationForSigningSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
