import { expect, test } from 'bun:test';
import {
  createLocalStorageSessionStorage,
  createMmkvSessionStorage,
  createSupabaseClient,
  type SessionMmkvLike,
} from './supabase';

const SESSION_KEY = 'sb-ramassa-auth-token';

function fakeMmkv(seed: Record<string, string> = {}): SessionMmkvLike & {
  snapshot(): Record<string, string>;
} {
  const store = new Map(Object.entries(seed));
  return {
    getAllKeys: () => [...store.keys()],
    getString: (key) => store.get(key),
    set: (key, value) => void store.set(key, value),
    remove: (key) => store.delete(key),
    snapshot: () => Object.fromEntries(store),
  };
}

function sessionJson(userId: string, accessToken = `access-${userId}`): string {
  return JSON.stringify({
    access_token: accessToken,
    refresh_token: `refresh-${userId}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: userId, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' },
  });
}

test('the MMKV session storage adapter round-trips a session', () => {
  const storage = createMmkvSessionStorage(fakeMmkv(), { sessionKey: SESSION_KEY });
  expect(storage.getItem(SESSION_KEY)).toBeNull();

  storage.setItem(SESSION_KEY, 'session-json');
  expect(storage.getItem(SESSION_KEY)).toBe('session-json');

  storage.removeItem(SESSION_KEY);
  expect(storage.getItem(SESSION_KEY)).toBeNull();
});

// RAPP-420: the default key followed the Supabase host, which in development
// follows Metro's host, so one store held a session per host and a relaunch
// against another Metro brought back the person signed in there before.
test('a sign-in removes every other session slot in the store', () => {
  const mmkv = fakeMmkv({
    'sb-127-auth-token': sessionJson('marta'),
    'sb-127-auth-token-code-verifier': 'verifier',
    'sb-192-auth-token': sessionJson('laia'),
    'sb-192-auth-token-user': '{}',
    'ramassa.deviceId': 'device',
  });
  const storage = createMmkvSessionStorage(mmkv, { sessionKey: SESSION_KEY });

  storage.setItem(SESSION_KEY, sessionJson('laia'));

  expect(mmkv.snapshot()).toEqual({
    [SESSION_KEY]: sessionJson('laia'),
    'ramassa.deviceId': 'device',
  });
});

test('a sign-in keeps the PKCE verifier of the session being written', () => {
  const mmkv = fakeMmkv({ [`${SESSION_KEY}-code-verifier`]: 'verifier' });
  const storage = createMmkvSessionStorage(mmkv, { sessionKey: SESSION_KEY });

  storage.setItem(SESSION_KEY, sessionJson('laia'));

  expect(mmkv.getString(`${SESSION_KEY}-code-verifier`)).toBe('verifier');
});

test('writing another person reports a person change, a token refresh does not', () => {
  const changes: string[] = [];
  const storage = createMmkvSessionStorage(fakeMmkv(), {
    sessionKey: SESSION_KEY,
    onPersonChange: () => changes.push('change'),
  });

  storage.setItem(SESSION_KEY, sessionJson('marta'));
  expect(changes).toHaveLength(1);

  storage.setItem(SESSION_KEY, sessionJson('marta', 'refreshed-access'));
  expect(changes).toHaveLength(1);

  storage.setItem(SESSION_KEY, sessionJson('laia'));
  expect(changes).toHaveLength(2);
});

test("an older build's single session slot is kept, so an update does not sign anyone out", () => {
  const mmkv = fakeMmkv({ 'sb-abcdefghijklmnop-auth-token': sessionJson('marta') });
  const storage = createMmkvSessionStorage(mmkv, { sessionKey: SESSION_KEY });

  expect(storage.getItem(SESSION_KEY)).toBe(sessionJson('marta'));
  expect(mmkv.snapshot()).toEqual({ [SESSION_KEY]: sessionJson('marta') });
});

test('two older session slots are both dropped, since nothing says which person is current', () => {
  const mmkv = fakeMmkv({
    'sb-127-auth-token': sessionJson('marta'),
    'sb-192-auth-token': sessionJson('laia'),
  });
  const storage = createMmkvSessionStorage(mmkv, { sessionKey: SESSION_KEY });

  expect(storage.getItem(SESSION_KEY)).toBeNull();
  expect(mmkv.snapshot()).toEqual({});
});

test('a sign-out removes every session slot in the store', () => {
  const mmkv = fakeMmkv({
    [SESSION_KEY]: sessionJson('laia'),
    'sb-127-auth-token': sessionJson('marta'),
  });
  const storage = createMmkvSessionStorage(mmkv, { sessionKey: SESSION_KEY });

  storage.removeItem(SESSION_KEY);

  expect(mmkv.snapshot()).toEqual({});
});

test('the client reads the same session whatever host the Supabase URL names', async () => {
  const mmkv = fakeMmkv({ [SESSION_KEY]: sessionJson('laia') });
  const clientFor = (supabaseUrl: string) =>
    createSupabaseClient({
      supabaseUrl,
      supabaseAnonKey: 'anon-key-value',
      storage: createMmkvSessionStorage(mmkv, { sessionKey: SESSION_KEY }),
    });

  for (const supabaseUrl of ['http://127.0.0.1:54321', 'http://192.168.0.30:54321']) {
    const { data } = await clientFor(supabaseUrl).auth.getSession();
    expect(data.session?.user.id).toBe('laia');
  }
});

test('the localStorage session storage adapter round-trips a session', () => {
  const storage = createLocalStorageSessionStorage();
  storage.setItem('supabase.auth.token', 'session-json');
  expect(storage.getItem('supabase.auth.token')).toBe('session-json');

  storage.removeItem('supabase.auth.token');
  expect(storage.getItem('supabase.auth.token')).toBeNull();
});

test('createSupabaseClient builds a client wired to the injected storage', () => {
  const client = createSupabaseClient({
    supabaseUrl: 'https://project.supabase.co',
    supabaseAnonKey: 'anon-key-value',
    storage: createMmkvSessionStorage(fakeMmkv(), { sessionKey: SESSION_KEY }),
  });

  expect(typeof client.auth.getSession).toBe('function');
  expect(typeof client.from).toBe('function');
});
