/**
 * The staging fixed code for test accounts (RAPP-616).
 *
 * A test account (a test player, or a team account an admin marked) signs in
 * with one fixed six-digit code instead of an emailed one, so the person
 * designing the onboarding can sign in as a test player on a phone many times
 * a day. It exists only where BOTH secrets are set:
 *
 *   TEST_SIGN_IN_ENABLED=true
 *   TEST_SIGN_IN_CODE=<six digits>
 *
 * Production never sets them, and without them every request gets 404 and
 * nothing behind the door is touched.
 *
 * The answer is a token hash only: the app trades it for a session with
 * `supabase.auth.verifyOtp({ token_hash, type: 'email' })`, so everything after
 * sign-in (the second factor for staff, the onboarding gate for players)
 * stays exactly as it is.
 *
 * Pure on purpose: the database, the Auth admin API and the secrets are
 * injected, so `bun test` runs the whole contract (index.ts wires Deno).
 */

export interface TestSignInSecrets {
  readonly TEST_SIGN_IN_ENABLED?: string;
  readonly TEST_SIGN_IN_CODE?: string;
}

export interface TestSignInDependencies {
  readonly secrets: TestSignInSecrets;
  /**
   * Records one attempt; false when the address, the network or all attempts
   * together are over their limit. The last one bounds a shared code however
   * many addresses an attacker uses.
   */
  readonly registerAttempt: (email: string, network: string) => Promise<boolean>;
  /** The id of an active test account with that address, or null. */
  readonly findTestAccount: (email: string) => Promise<string | null>;
  /** A one-time sign-in token for that address, hashed, from the Auth admin API. */
  readonly createTokenHash: (email: string) => Promise<string>;
  readonly recordSuccess: (profileId: string) => Promise<void>;
  /** A failure behind the door, for the function's own log. Never answered. */
  readonly onError?: (error: unknown) => void;
}

const CODE_PATTERN = /^\d{6}$/;
// The same shape the database and the login form accept.
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_EMAIL_LENGTH = 254;

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
} as const;

export function isTestSignInEnabled(secrets: TestSignInSecrets): boolean {
  return (
    secrets.TEST_SIGN_IN_ENABLED === 'true' && CODE_PATTERN.test(secrets.TEST_SIGN_IN_CODE ?? '')
  );
}

/** Equal six-digit codes, compared without an early exit. */
export function codesMatch(given: string, expected: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(given);
  const b = encoder.encode(expected);
  let difference = a.length ^ b.length;
  for (let index = 0; index < b.length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0 && b.length > 0;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}

// One answer for a wrong code and for an address that is no test account, so
// the door never says which addresses exist.
const REFUSED = { error: 'TEST_SIGN_IN/REFUSED' } as const;

/**
 * The caller's network address, as the platform saw it. On hosted Supabase,
 * Cloudflare sits in front and sets `cf-connecting-ip` itself (the address
 * Supabase's own docs check in a pre-request filter:
 * https://supabase.com/docs/guides/database/debugging-performance). Without
 * it, the RIGHTMOST X-Forwarded-For entry: the one the last proxy appended.
 * Never the leftmost one, which the caller writes: a new forged value on each
 * request used to start a new counter every time.
 */
export function networkOf(request: Request): string {
  const connecting = request.headers.get('cf-connecting-ip')?.trim();
  if (connecting !== undefined && connecting !== '') return connecting;
  const forwarded = request.headers
    .get('x-forwarded-for')
    ?.split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  return forwarded?.at(-1) ?? 'unknown';
}

async function readBody(
  request: Request,
): Promise<{ readonly email: string; readonly code: string } | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null) return null;
  const { email, code } = body as Record<string, unknown>;
  if (typeof email !== 'string' || typeof code !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  if (normalized.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(normalized)) return null;
  if (!CODE_PATTERN.test(code)) return null;
  return { email: normalized, code };
}

export function createTestSignInHandler(
  dependencies: TestSignInDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const { secrets } = dependencies;
    if (!isTestSignInEnabled(secrets)) {
      return new Response('Not found', { status: 404 });
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') {
      return json(405, { error: 'TEST_SIGN_IN/METHOD' });
    }
    const body = await readBody(request);
    if (body === null) {
      return json(400, { error: 'TEST_SIGN_IN/INVALID' });
    }
    try {
      if (!(await dependencies.registerAttempt(body.email, networkOf(request)))) {
        return json(429, { error: 'TEST_SIGN_IN/RATE_LIMITED' });
      }
      // The same work for a wrong code, a real account and an unknown
      // address: the lookup always runs, then one refusal. Answering a wrong
      // code before the lookup made it measurably faster than a right one.
      const codeIsRight = codesMatch(body.code, secrets.TEST_SIGN_IN_CODE ?? '');
      const profileId = await dependencies.findTestAccount(body.email);
      if (!codeIsRight || profileId === null) {
        return json(401, REFUSED);
      }
      const tokenHash = await dependencies.createTokenHash(body.email);
      await dependencies.recordSuccess(profileId);
      return json(200, { token_hash: tokenHash });
    } catch (error) {
      dependencies.onError?.(error);
      return json(500, { error: 'TEST_SIGN_IN/UNAVAILABLE' });
    }
  };
}
