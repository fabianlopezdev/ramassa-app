/**
 * Who is asking? (RAPP-14 scope item 2.) Answered in two steps, because the two
 * questions have two different authorities:
 *
 *   1. IDENTITY comes from the access token, verified locally against the
 *      project's JWKS (`/auth/v1/.well-known/jwks.json`). Supabase's asymmetric
 *      signing keys mean the Worker needs no shared secret, cannot mint tokens,
 *      and adds no round trip to the auth server. The public keys are cached in
 *      module scope by `jose` — public material only, never request state.
 *   2. TENANT AND ROLE come from the caller's own `profiles` row, read through
 *      PostgREST with the caller's token so RLS applies (ADR-009). They are not
 *      in the token today, so trusting a claim for them would be trusting
 *      nothing at all.
 *
 * Both failures are AUTH errors, deliberately indistinguishable to the caller:
 * an expired token, a forged token, and a token for a deleted profile all
 * return AUTH-2 rather than telling a prober which one it was.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import { AppError } from '@ramassa/shared/errors';
import { appRoleSchema, type AppRole } from '@ramassa/shared/schemas';

export interface CallerIdentity {
  readonly userId: string;
  readonly orgId: string;
  readonly role: AppRole;
}

/**
 * One JWK set per Supabase URL, kept for the lifetime of the isolate. `jose`
 * owns the refresh and cool-down behaviour; re-creating it per request would
 * refetch the keys on every upload.
 */
const remoteJwkSetsBySupabaseUrl = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getRemoteJwkSet(supabaseUrl: string): ReturnType<typeof createRemoteJWKSet> {
  const cached = remoteJwkSetsBySupabaseUrl.get(supabaseUrl);
  if (cached !== undefined) {
    return cached;
  }
  const jwkSet = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
  remoteJwkSetsBySupabaseUrl.set(supabaseUrl, jwkSet);
  return jwkSet;
}

export function readBearerToken(request: Request): string {
  const header = request.headers.get('Authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || token === undefined || token.length === 0) {
    throw new AppError('AUTH-2', { message: 'Missing bearer token' });
  }
  return token;
}

/**
 * Verifies signature, expiry, issuer and audience, and returns the subject.
 * `authenticated` is the audience Supabase stamps on a signed-in user's token;
 * anon tokens carry a different one and are rejected here.
 */
export async function verifyAccessToken(options: {
  readonly token: string;
  readonly supabaseUrl: string;
}): Promise<string> {
  const verified = await jwtVerify(options.token, getRemoteJwkSet(options.supabaseUrl), {
    issuer: `${options.supabaseUrl}/auth/v1`,
    audience: 'authenticated',
  }).catch((cause: unknown) => {
    throw new AppError('AUTH-2', { message: 'Access token rejected', cause });
  });

  const subject = verified.payload.sub;
  if (subject === undefined || subject.length === 0) {
    throw new AppError('AUTH-2', { message: 'Access token has no subject' });
  }
  return subject;
}

/**
 * `z.guid()`, not `z.uuid()`: the column is already a Postgres `uuid`, so the
 * only job here is "is this the shape I expect". `z.uuid()` additionally
 * enforces the RFC version nibble, which rejects deliberately readable
 * identifiers like the seed organization (`...-0000000000a1`).
 */
const profileRowSchema = z.object({
  id: z.guid(),
  org_id: z.guid(),
  role: appRoleSchema,
});

/**
 * Reads the caller's own profile through PostgREST. The caller's token is
 * forwarded, so the row comes back only if RLS lets that user read it; a
 * deactivated or deleted participant gets nothing and is denied.
 */
export async function fetchCallerProfile(options: {
  readonly userId: string;
  readonly token: string;
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
  readonly fetchImplementation?: typeof fetch;
}): Promise<CallerIdentity> {
  const performFetch = options.fetchImplementation ?? fetch;
  const profileUrl = new URL(`${options.supabaseUrl}/rest/v1/profiles`);
  profileUrl.searchParams.set('select', 'id,org_id,role');
  profileUrl.searchParams.set('id', `eq.${options.userId}`);

  const response = await performFetch(profileUrl.toString(), {
    headers: {
      apikey: options.supabasePublishableKey,
      Authorization: `Bearer ${options.token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new AppError('AUTH-2', {
      message: 'Could not read the caller profile',
      context: { status: response.status },
    });
  }

  const rows = profileRowSchema.array().safeParse(await response.json());
  if (!rows.success) {
    throw new AppError('AUTH-2', {
      message: 'Profile response did not match the expected shape',
      context: { issues: rows.error.issues.map((issue) => issue.message) },
    });
  }

  const profile = rows.data[0];
  if (profile === undefined) {
    // RLS returned nothing: deactivated, deleted, or never provisioned.
    throw new AppError('AUTH-2', { message: 'No readable profile for this identity' });
  }

  return { userId: profile.id, orgId: profile.org_id, role: profile.role };
}

/** The full identity check: token -> subject -> tenant and role. */
export async function resolveCallerIdentity(options: {
  readonly request: Request;
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
  readonly fetchImplementation?: typeof fetch;
}): Promise<CallerIdentity> {
  const token = readBearerToken(options.request);
  const userId = await verifyAccessToken({ token, supabaseUrl: options.supabaseUrl });
  return fetchCallerProfile({
    userId,
    token,
    supabaseUrl: options.supabaseUrl,
    supabasePublishableKey: options.supabasePublishableKey,
    fetchImplementation: options.fetchImplementation,
  });
}
