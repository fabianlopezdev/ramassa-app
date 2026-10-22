/**
 * Who the caller is, from her own token (RAPP-14), and the one exception for a
 * woman with no profile yet (RAPP-610): only the upload mint asks for it, and
 * only the database's answer lets her through.
 */
import { describe, expect, test } from 'bun:test';
import { isAppError } from '@ramassa/shared/errors';
import { fetchCallerProfile } from './supabase-identity';

const userId = '0b1d9c2e-3f4a-4b5c-8d6e-9f0a1b2c3d4f';
const org = '5eed0000-0000-4000-8000-000000000000';

/** PostgREST answering the profile read with no row, and the org question with `orgAnswer`. */
function postgrest(orgAnswer: unknown, calls: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/rest/v1/profiles')) return Response.json([]);
    if (url.endsWith('/rest/v1/rpc/my_intake_upload_org')) return Response.json(orgAnswer);
    return new Response(null, { status: 404 });
  }) as typeof fetch;
}

const base = {
  userId,
  secondFactorVerifiedAt: null,
  token: 'token',
  supabaseUrl: 'https://db.example',
  supabasePublishableKey: 'publishable',
};

describe('fetchCallerProfile', () => {
  test('a caller with no profile is refused unless the upload mint allows it', async () => {
    const calls: string[] = [];
    const refused = await fetchCallerProfile({
      ...base,
      fetchImplementation: postgrest(org, calls),
    }).catch((error: unknown) => error);
    expect(isAppError(refused) && refused.code).toBe('AUTH-2');
    expect(calls.some((url) => url.includes('my_intake_upload_org'))).toBe(false);
  });

  test('with the mint allowing it, she gets the organization the database names', async () => {
    const identity = await fetchCallerProfile({
      ...base,
      allowWithoutProfile: true,
      fetchImplementation: postgrest(org),
    });
    expect(identity).toMatchObject({ userId, orgId: org, withoutProfile: true, role: 'invited' });
    expect(identity.permissions.size).toBe(0);
  });

  test('the database naming none (a player, a deactivated one included) is a refusal', async () => {
    const refused = await fetchCallerProfile({
      ...base,
      allowWithoutProfile: true,
      fetchImplementation: postgrest(null),
    }).catch((error: unknown) => error);
    expect(isAppError(refused) && refused.code).toBe('AUTH-2');
  });
});
