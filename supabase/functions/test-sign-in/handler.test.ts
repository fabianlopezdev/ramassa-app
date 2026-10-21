/**
 * The staging fixed code for test accounts (RAPP-616). The handler is pure:
 * the database, the Auth admin API and the secrets are injected, so the whole
 * contract runs under `bun test`.
 */
import { describe, expect, test } from 'bun:test';
import {
  codesMatch,
  createTestSignInHandler,
  isTestSignInEnabled,
  networkOf,
  type TestSignInDependencies,
} from './handler';

const TEST_PLAYER = '5eed0000-0000-4000-8000-000000000096';
const ENABLED = { TEST_SIGN_IN_ENABLED: 'true', TEST_SIGN_IN_CODE: '123456' };

function dependencies(overrides: Partial<TestSignInDependencies> = {}) {
  const calls: string[] = [];
  const deps: TestSignInDependencies = {
    secrets: ENABLED,
    registerAttempt: async (email, network) => {
      calls.push(`attempt:${email}:${network}`);
      return true;
    },
    findTestAccount: async (email) => {
      calls.push(`find:${email}`);
      return email === 'jugadora.prova@example.test' ? TEST_PLAYER : null;
    },
    createTokenHash: async (email) => {
      calls.push(`token:${email}`);
      return 'hashed-token';
    },
    recordSuccess: async (profileId) => {
      calls.push(`audit:${profileId}`);
    },
    ...overrides,
  };
  return { deps, calls };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/functions/v1/test-sign-in', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '10.0.0.1, 10.0.0.2',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe('switched on only by both staging secrets', () => {
  test.each([
    [{}, 'no secrets (production)'],
    [{ TEST_SIGN_IN_ENABLED: 'true' }, 'no code'],
    [{ TEST_SIGN_IN_CODE: '123456' }, 'not enabled'],
    [{ TEST_SIGN_IN_ENABLED: 'false', TEST_SIGN_IN_CODE: '123456' }, 'enabled false'],
    [{ TEST_SIGN_IN_ENABLED: 'true', TEST_SIGN_IN_CODE: '12345' }, 'a five-digit code'],
    [{ TEST_SIGN_IN_ENABLED: 'true', TEST_SIGN_IN_CODE: 'abcdef' }, 'a code that is not digits'],
  ])('%j (%s) is off', (secrets) => {
    expect(isTestSignInEnabled(secrets)).toBe(false);
  });

  test('a production config answers 404 to every request and touches nothing', async () => {
    const { deps, calls } = dependencies({ secrets: {} });
    const handle = createTestSignInHandler(deps);
    for (const request of [
      post({ email: 'jugadora.prova@example.test', code: '123456' }),
      new Request('http://localhost/', { method: 'OPTIONS' }),
      new Request('http://localhost/', { method: 'GET' }),
    ]) {
      const response = await handle(request);
      expect(response.status).toBe(404);
    }
    expect(calls).toEqual([]);
  });
});

describe('when switched on', () => {
  test('a test account with the right code gets only a token hash, and it is audited', async () => {
    const { deps, calls } = dependencies();
    const response = await createTestSignInHandler(deps)(
      post({ email: '  Jugadora.Prova@Example.TEST ', code: '123456' }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token_hash: 'hashed-token' });
    expect(calls).toEqual([
      // The gateway's own entry, never the caller's leftmost one.
      'attempt:jugadora.prova@example.test:10.0.0.2',
      'find:jugadora.prova@example.test',
      'token:jugadora.prova@example.test',
      `audit:${TEST_PLAYER}`,
    ]);
  });

  test('a wrong code and a real account get the same answer, so no account is revealed', async () => {
    const wrong = dependencies();
    const wrongCode = await createTestSignInHandler(wrong.deps)(
      post({ email: 'jugadora.prova@example.test', code: '654321' }),
    );
    const real = dependencies();
    const realAccount = await createTestSignInHandler(real.deps)(
      post({ email: 'amina.alhassan@example.test', code: '123456' }),
    );
    expect(wrongCode.status).toBe(401);
    expect(realAccount.status).toBe(401);
    expect(await wrongCode.json()).toEqual(await realAccount.json());
    expect(real.calls.some((call) => call.startsWith('token:'))).toBe(false);
  });

  test('a wrong code, a real account and an unknown address do the same work', async () => {
    const kinds = (calls: readonly string[]) => calls.map((call) => call.split(':')[0]);
    const cases = [
      { email: 'jugadora.prova@example.test', code: '654321' },
      { email: 'amina.alhassan@example.test', code: '123456' },
      { email: 'nobody@example.test', code: '123456' },
      { email: 'nobody@example.test', code: '654321' },
    ];
    const answers: unknown[] = [];
    const work: string[][] = [];
    for (const body of cases) {
      const { deps, calls } = dependencies();
      const response = await createTestSignInHandler(deps)(post(body));
      expect(response.status).toBe(401);
      answers.push(await response.json());
      work.push(kinds(calls));
    }
    // Every refusal counts the attempt and looks the address up, then refuses.
    for (const steps of work) expect(steps).toEqual(['attempt', 'find']);
    for (const answer of answers) expect(answer).toEqual(answers[0]);
  });

  test('over the rate limit nothing is checked', async () => {
    const { deps, calls } = dependencies({ registerAttempt: async () => false });
    const response = await createTestSignInHandler(deps)(
      post({ email: 'jugadora.prova@example.test', code: '123456' }),
    );
    expect(response.status).toBe(429);
    expect(calls).toEqual([]);
  });

  test('a malformed request is refused before any attempt is counted', async () => {
    const { deps, calls } = dependencies();
    const handle = createTestSignInHandler(deps);
    expect((await handle(post({ email: 'not-an-address', code: '123456' }))).status).toBe(400);
    expect((await handle(post({ email: 'a@example.test', code: '12' }))).status).toBe(400);
    expect(
      (await handle(new Request('http://localhost/', { method: 'POST', body: 'not json' }))).status,
    ).toBe(400);
    expect((await handle(new Request('http://localhost/', { method: 'GET' }))).status).toBe(405);
    expect(calls).toEqual([]);
  });

  test('the browser preflight is answered', async () => {
    const { deps } = dependencies();
    const response = await createTestSignInHandler(deps)(
      new Request('http://localhost/', { method: 'OPTIONS' }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  });

  test('a failure behind the door is a generic error, never a detail', async () => {
    const { deps } = dependencies({
      createTokenHash: async () => {
        throw new Error('auth admin unreachable at http://internal');
      },
    });
    const response = await createTestSignInHandler(deps)(
      post({ email: 'jugadora.prova@example.test', code: '123456' }),
    );
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('internal');
  });
});

describe('the rate limit keys on the address the platform saw', () => {
  test('a forged leftmost X-Forwarded-For entry is ignored', () => {
    const forged = (first: string) =>
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'x-forwarded-for': `${first}, 203.0.113.7` },
      });
    expect(networkOf(forged('1.1.1.1'))).toBe('203.0.113.7');
    expect(networkOf(forged('2.2.2.2'))).toBe('203.0.113.7');
  });

  test('the client address Cloudflare sets in front of Supabase wins', () => {
    const request = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '198.51.100.4', 'x-forwarded-for': '1.1.1.1, 10.0.0.2' },
    });
    expect(networkOf(request)).toBe('198.51.100.4');
  });

  test('without either header the network is unknown', () => {
    expect(networkOf(new Request('http://localhost/', { method: 'POST' }))).toBe('unknown');
  });

  test('spoofing a new X-Forwarded-For on each request still hits one counter', async () => {
    const networks = new Set<string>();
    const { deps } = dependencies({
      registerAttempt: async (_email, network) => {
        networks.add(network);
        return true;
      },
    });
    const handle = createTestSignInHandler(deps);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await handle(
        post(
          { email: 'jugadora.prova@example.test', code: '654321' },
          { 'x-forwarded-for': `10.9.9.${attempt}, 203.0.113.7` },
        ),
      );
    }
    expect([...networks]).toEqual(['203.0.113.7']);
  });
});

test('codes are compared in constant time, digit by digit', () => {
  expect(codesMatch('123456', '123456')).toBe(true);
  expect(codesMatch('123456', '123457')).toBe(false);
  expect(codesMatch('123456', '12345')).toBe(false);
  expect(codesMatch('', '')).toBe(false);
});
