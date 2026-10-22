/**
 * The staging fixed code for test accounts (RAPP-616): the Deno wiring of
 * `handler.ts`. See README.md for the secrets and why production never has
 * them.
 *
 * It holds the project's secret key, as every Edge Function receives it, and
 * uses it only behind the two secrets: without them `handler.ts` answers 404
 * and no client is created. ADR-029 records why this one function needs the
 * Auth admin API.
 */

import '@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTestSignInHandler, type TestSignInSecrets } from './handler.ts';

const secrets: TestSignInSecrets = {
  TEST_SIGN_IN_ENABLED: Deno.env.get('TEST_SIGN_IN_ENABLED'),
  TEST_SIGN_IN_CODE: Deno.env.get('TEST_SIGN_IN_CODE'),
};

function secretKey(): string {
  // The new key format first (a JSON map of named keys), then the legacy one.
  // https://supabase.com/docs/guides/functions/secrets#default-secrets
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys !== undefined) {
    const named = (JSON.parse(keys) as Record<string, string>)['default'];
    if (named !== undefined) return named;
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy === undefined) throw new Error('No secret key');
  return legacy;
}

let admin: SupabaseClient | null = null;
function adminClient(): SupabaseClient {
  admin ??= createClient(Deno.env.get('SUPABASE_URL') ?? '', secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

const handle = createTestSignInHandler({
  secrets,
  registerAttempt: async (email, network) => {
    const { data, error } = await adminClient().rpc('test_sign_in_register_attempt', {
      p_email: email,
      p_network: network,
    });
    if (error) throw new Error(error.message);
    return data === true;
  },
  findTestAccount: async (email) => {
    const { data, error } = await adminClient().rpc('test_sign_in_account', { p_email: email });
    if (error) throw new Error(error.message);
    return typeof data === 'string' ? data : null;
  },
  // https://supabase.com/docs/reference/javascript/auth-admin-generatelink
  createTokenHash: async (email) => {
    const { data, error } = await adminClient().auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    const tokenHash = data.properties?.hashed_token;
    if (error || tokenHash === undefined || tokenHash === '') {
      throw new Error(error?.message ?? 'No token');
    }
    return tokenHash;
  },
  recordSuccess: async (profileId) => {
    const { error } = await adminClient().rpc('test_sign_in_record_success', {
      p_profile_id: profileId,
    });
    if (error) throw new Error(error.message);
  },
  // The message only: it names the failing step, never the address.
  onError: (error) =>
    console.error('test-sign-in failed', error instanceof Error ? error.message : 'unknown'),
});

Deno.serve(handle);
