import { describe, expect, test } from 'bun:test';
import {
  classifyStorageKey,
  clearStorageKeys,
  groupStorageKeys,
  type DevStorageInspector,
} from './dev-storage';

function createFakeMmkv(initial: Record<string, string>): DevStorageInspector & {
  snapshot(): Record<string, string>;
} {
  const store = new Map(Object.entries(initial));
  return {
    getAllKeys: () => [...store.keys()],
    getString: (key) => store.get(key),
    remove: (key) => store.delete(key),
    snapshot: () => Object.fromEntries(store),
  };
}

describe('classifyStorageKey', () => {
  test('recognizes the supabase-js session key by its sb- prefix', () => {
    expect(classifyStorageKey('sb-127-auth-token')).toBe('session');
  });

  test('recognizes the app-owned keys', () => {
    expect(classifyStorageKey('ramassa.language')).toBe('language');
    expect(classifyStorageKey('ramassa.deviceId')).toBe('device');
    expect(classifyStorageKey('ramassa.pushToken.lastWritten')).toBe('push');
  });

  test('an unknown key is reported as other rather than silently binned', () => {
    expect(classifyStorageKey('something.else')).toBe('other');
    expect(classifyStorageKey('ramassa.somethingNew')).toBe('other');
  });
});

describe('groupStorageKeys', () => {
  test('buckets every key and keeps empty groups out', () => {
    const grouped = groupStorageKeys([
      'ramassa.language',
      'ramassa.deviceId',
      'sb-127-auth-token',
      'mystery',
    ]);
    expect(grouped.language).toEqual(['ramassa.language']);
    expect(grouped.device).toEqual(['ramassa.deviceId']);
    expect(grouped.session).toEqual(['sb-127-auth-token']);
    expect(grouped.other).toEqual(['mystery']);
    expect(grouped.push).toEqual([]);
  });

  test('keys are sorted, so the panel does not reshuffle between renders', () => {
    expect(groupStorageKeys(['ramassa.b', 'ramassa.a']).other).toEqual(['ramassa.a', 'ramassa.b']);
  });
});

describe('clearStorageKeys', () => {
  test('removes exactly the keys it is given', () => {
    const mmkv = createFakeMmkv({
      'ramassa.language': 'ar',
      'ramassa.deviceId': 'abc',
      'sb-127-auth-token': '{}',
    });
    clearStorageKeys(mmkv, ['ramassa.language']);
    expect(mmkv.snapshot()).toEqual({ 'ramassa.deviceId': 'abc', 'sb-127-auth-token': '{}' });
  });

  test('returns how many keys it removed, so the UI can report the outcome', () => {
    const mmkv = createFakeMmkv({ 'ramassa.language': 'ar' });
    expect(clearStorageKeys(mmkv, ['ramassa.language', 'not-there'])).toBe(1);
  });

  test('clearing nothing is a no-op, not a crash', () => {
    const mmkv = createFakeMmkv({ 'ramassa.language': 'ar' });
    expect(clearStorageKeys(mmkv, [])).toBe(0);
    expect(mmkv.snapshot()).toEqual({ 'ramassa.language': 'ar' });
  });
});
