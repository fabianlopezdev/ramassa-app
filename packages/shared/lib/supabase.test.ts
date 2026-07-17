import { expect, test } from 'bun:test';
import {
  createLocalStorageSessionStorage,
  createMmkvSessionStorage,
  createSupabaseClient,
  type MmkvLike,
} from './supabase';

function fakeMmkv(): MmkvLike {
  const store = new Map<string, string>();
  return {
    getString: (key) => store.get(key),
    set: (key, value) => void store.set(key, value),
    delete: (key) => void store.delete(key),
  };
}

test('the MMKV session storage adapter round-trips a session', () => {
  const storage = createMmkvSessionStorage(fakeMmkv());
  expect(storage.getItem('supabase.auth.token')).toBeNull();

  storage.setItem('supabase.auth.token', 'session-json');
  expect(storage.getItem('supabase.auth.token')).toBe('session-json');

  storage.removeItem('supabase.auth.token');
  expect(storage.getItem('supabase.auth.token')).toBeNull();
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
    storage: createMmkvSessionStorage(fakeMmkv()),
  });

  expect(typeof client.auth.getSession).toBe('function');
  expect(typeof client.from).toBe('function');
});
