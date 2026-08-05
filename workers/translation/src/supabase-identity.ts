import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import { AppError } from '@ramassa/shared/errors';
import { appRoleSchema, type AppRole } from '@ramassa/shared/schemas';

export interface CallerIdentity {
  readonly userId: string;
  readonly orgId: string;
  readonly role: AppRole;
}

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

const profileRowSchema = z.object({
  id: z.guid(),
  org_id: z.guid(),
  role: appRoleSchema,
});

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
    throw new AppError('AUTH-2', { message: 'No readable profile for this identity' });
  }
  return { userId: profile.id, orgId: profile.org_id, role: profile.role };
}

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
