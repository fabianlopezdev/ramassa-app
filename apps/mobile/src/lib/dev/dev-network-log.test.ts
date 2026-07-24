import { describe, expect, test } from 'bun:test';
import {
  classifyRequestKind,
  createDevNetworkLog,
  installDevFetchLogger,
  redactRequestUrl,
  type FetchLike,
} from './dev-network-log';

const SUPABASE_URL = 'http://127.0.0.1:54321';

describe('classifyRequestKind', () => {
  test('separates Supabase auth from Supabase data, because they fail differently', () => {
    expect(
      classifyRequestKind(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, SUPABASE_URL),
    ).toBe('supabase-auth');
    expect(classifyRequestKind(`${SUPABASE_URL}/rest/v1/profiles?select=role`, SUPABASE_URL)).toBe(
      'supabase-rest',
    );
  });

  test('recognizes Supabase storage and realtime', () => {
    expect(classifyRequestKind(`${SUPABASE_URL}/storage/v1/object/x`, SUPABASE_URL)).toBe(
      'supabase-storage',
    );
    expect(classifyRequestKind(`${SUPABASE_URL}/realtime/v1/websocket`, SUPABASE_URL)).toBe(
      'supabase-realtime',
    );
  });

  test('recognizes an R2 upload by its signed-URL host', () => {
    expect(
      classifyRequestKind('https://bucket.abc123.r2.cloudflarestorage.com/media/x', SUPABASE_URL),
    ).toBe('r2-upload');
  });

  test('anything else is other, including Sentry ingest', () => {
    expect(classifyRequestKind('https://o1.ingest.sentry.io/api/1/envelope/', SUPABASE_URL)).toBe(
      'other',
    );
  });

  test('classifies without a configured Supabase URL rather than throwing', () => {
    expect(classifyRequestKind('https://example.test/thing', undefined)).toBe('other');
  });
});

describe('redactRequestUrl', () => {
  test('strips tokens that ride in the query string', () => {
    const redacted = redactRequestUrl(
      'https://x.test/auth/v1/verify?access_token=eyJhbGciOi&refresh_token=abc&type=magiclink',
    );
    expect(redacted).not.toContain('eyJhbGciOi');
    expect(redacted).not.toContain('abc');
    expect(redacted).toContain('type=magiclink');
  });

  test('strips the anon key when it is passed as a parameter', () => {
    expect(redactRequestUrl('https://x.test/rest/v1/profiles?apikey=secret-key')).not.toContain(
      'secret-key',
    );
  });

  test('leaves an ordinary URL untouched', () => {
    expect(redactRequestUrl('https://x.test/rest/v1/profiles?select=role')).toBe(
      'https://x.test/rest/v1/profiles?select=role',
    );
  });

  test('returns a malformed URL unchanged instead of throwing', () => {
    expect(redactRequestUrl('not a url')).toBe('not a url');
  });
});

describe('createDevNetworkLog', () => {
  test('keeps entries newest first', () => {
    const log = createDevNetworkLog({ capacity: 5 });
    log.record({
      method: 'GET',
      url: 'https://x.test/a',
      kind: 'other',
      durationMs: 1,
      startedAt: 0,
    });
    log.record({
      method: 'GET',
      url: 'https://x.test/b',
      kind: 'other',
      durationMs: 1,
      startedAt: 1,
    });
    expect(log.entries().map((entry) => entry.url)).toEqual([
      'https://x.test/b',
      'https://x.test/a',
    ]);
  });

  test('drops the oldest entry past capacity, so it cannot grow without bound', () => {
    const log = createDevNetworkLog({ capacity: 2 });
    for (const path of ['a', 'b', 'c']) {
      log.record({
        method: 'GET',
        url: `https://x.test/${path}`,
        kind: 'other',
        durationMs: 1,
        startedAt: 0,
      });
    }
    expect(log.entries()).toHaveLength(2);
    expect(log.entries().map((entry) => entry.url)).toEqual([
      'https://x.test/c',
      'https://x.test/b',
    ]);
  });

  test('clear empties the buffer', () => {
    const log = createDevNetworkLog({ capacity: 2 });
    log.record({
      method: 'GET',
      url: 'https://x.test/a',
      kind: 'other',
      durationMs: 1,
      startedAt: 0,
    });
    log.clear();
    expect(log.entries()).toEqual([]);
  });

  test('every entry gets a distinct id, so a list can key on it', () => {
    const log = createDevNetworkLog({ capacity: 4 });
    for (let index = 0; index < 3; index += 1) {
      log.record({
        method: 'GET',
        url: 'https://x.test/a',
        kind: 'other',
        durationMs: 1,
        startedAt: 0,
      });
    }
    const ids = log.entries().map((entry) => entry.id);
    expect(new Set(ids).size).toBe(3);
  });
});

describe('installDevFetchLogger', () => {
  function createScope(fetchImplementation: FetchLike) {
    return { fetch: fetchImplementation };
  }

  test('records a successful request with its status and duration', async () => {
    const log = createDevNetworkLog({ capacity: 5 });
    let clock = 0;
    const scope = createScope(() => Promise.resolve(new Response('{}', { status: 200 })));

    installDevFetchLogger({
      scope,
      log,
      now: () => {
        clock += 25;
        return clock;
      },
      supabaseUrl: SUPABASE_URL,
    });
    await scope.fetch(`${SUPABASE_URL}/rest/v1/profiles?select=role`, { method: 'GET' });

    const [entry] = log.entries();
    expect(entry?.status).toBe(200);
    expect(entry?.kind).toBe('supabase-rest');
    expect(entry?.durationMs).toBe(25);
    expect(entry?.failed).toBe(false);
  });

  test('records a rejected request instead of swallowing it, and rethrows', async () => {
    const log = createDevNetworkLog({ capacity: 5 });
    const scope = createScope(() => Promise.reject(new Error('offline')));

    installDevFetchLogger({ scope, log, now: () => 0, supabaseUrl: SUPABASE_URL });

    await expect(scope.fetch('https://x.test/a')).rejects.toThrow('offline');
    const [entry] = log.entries();
    expect(entry?.failed).toBe(true);
    expect(entry?.status).toBeUndefined();
  });

  test('redacts tokens before the URL reaches the buffer', async () => {
    const log = createDevNetworkLog({ capacity: 5 });
    const scope = createScope(() => Promise.resolve(new Response('{}', { status: 200 })));

    installDevFetchLogger({ scope, log, now: () => 0, supabaseUrl: SUPABASE_URL });
    await scope.fetch(`${SUPABASE_URL}/auth/v1/verify?access_token=super-secret`);

    expect(log.entries()[0]?.url).not.toContain('super-secret');
  });

  test('defaults the method to GET when the caller omits it', async () => {
    const log = createDevNetworkLog({ capacity: 5 });
    const scope = createScope(() => Promise.resolve(new Response('{}', { status: 200 })));

    installDevFetchLogger({ scope, log, now: () => 0, supabaseUrl: SUPABASE_URL });
    await scope.fetch('https://x.test/a');

    expect(log.entries()[0]?.method).toBe('GET');
  });

  test('installing twice does not double-record, so Fast Refresh cannot stack wrappers', async () => {
    const log = createDevNetworkLog({ capacity: 5 });
    const scope = createScope(() => Promise.resolve(new Response('{}', { status: 200 })));

    installDevFetchLogger({ scope, log, now: () => 0, supabaseUrl: SUPABASE_URL });
    installDevFetchLogger({ scope, log, now: () => 0, supabaseUrl: SUPABASE_URL });
    await scope.fetch('https://x.test/a');

    expect(log.entries()).toHaveLength(1);
  });

  test('uninstall restores the original fetch', async () => {
    const log = createDevNetworkLog({ capacity: 5 });
    const original: FetchLike = () => Promise.resolve(new Response('{}', { status: 200 }));
    const scope = createScope(original);

    const uninstall = installDevFetchLogger({
      scope,
      log,
      now: () => 0,
      supabaseUrl: SUPABASE_URL,
    });
    uninstall();

    expect(scope.fetch).toBe(original);
    await scope.fetch('https://x.test/a');
    expect(log.entries()).toEqual([]);
  });

  test('reads the method off a Request object, not only an init bag', async () => {
    const log = createDevNetworkLog({ capacity: 5 });
    const scope = createScope(() => Promise.resolve(new Response('{}', { status: 201 })));

    installDevFetchLogger({ scope, log, now: () => 0, supabaseUrl: SUPABASE_URL });
    await scope.fetch(new Request('https://x.test/a', { method: 'POST' }));

    expect(log.entries()[0]?.method).toBe('POST');
  });
});
