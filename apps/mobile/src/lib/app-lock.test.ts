import { describe, expect, test } from 'bun:test';
import {
  defaultAppLockSettings,
  effectiveAppLockSettings,
  readAppLockSettings,
  shouldLockOnReturn,
  writeAppLockSettings,
  type AppLockStorage,
} from './app-lock';

function memoryStorage(): AppLockStorage & { readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getString: (key) => values.get(key),
    set: (key, value) => void values.set(key, value),
  };
}

const USER = '5eed0000-0000-4000-8000-000000000002';

describe('defaultAppLockSettings', () => {
  test('team members start with the lock on, after one minute', () => {
    expect(defaultAppLockSettings('team')).toEqual({ enabled: true, timeoutSeconds: 60 });
  });

  test('players and entity contacts start with it off', () => {
    expect(defaultAppLockSettings('player').enabled).toBe(false);
    expect(defaultAppLockSettings('entity').enabled).toBe(false);
  });
});

describe('readAppLockSettings', () => {
  test('a choice made on this device wins over the default', () => {
    const storage = memoryStorage();
    writeAppLockSettings(storage, USER, { enabled: false, timeoutSeconds: 300 });
    expect(readAppLockSettings(storage, USER, 'team')).toEqual({
      enabled: false,
      timeoutSeconds: 300,
    });
  });

  test('each person on a shared phone has her own choice', () => {
    const storage = memoryStorage();
    writeAppLockSettings(storage, USER, { enabled: false, timeoutSeconds: 300 });
    expect(readAppLockSettings(storage, 'someone-else', 'team').enabled).toBe(true);
  });

  test('a damaged or unknown value falls back to the default', () => {
    const storage = memoryStorage();
    storage.set(`ramassa.app-lock.v1:${USER}`, '{not json');
    expect(readAppLockSettings(storage, USER, 'team')).toEqual(defaultAppLockSettings('team'));
    storage.set(
      `ramassa.app-lock.v1:${USER}`,
      JSON.stringify({ enabled: true, timeoutSeconds: 7 }),
    );
    expect(readAppLockSettings(storage, USER, 'player')).toEqual({
      enabled: true,
      timeoutSeconds: 60,
    });
  });
});

describe('shouldLockOnReturn', () => {
  const settings = { enabled: true, timeoutSeconds: 60 } as const;

  test('locks once the time in the background reaches the chosen time', () => {
    expect(shouldLockOnReturn({ settings, backgroundedAtMs: 0, nowMs: 59_999 })).toBe(false);
    expect(shouldLockOnReturn({ settings, backgroundedAtMs: 0, nowMs: 60_000 })).toBe(true);
  });

  test('"immediately" locks on every return', () => {
    expect(
      shouldLockOnReturn({
        settings: { enabled: true, timeoutSeconds: 0 },
        backgroundedAtMs: 1_000,
        nowMs: 1_000,
      }),
    ).toBe(true);
  });

  test('never locks when the lock is off, or when the app was never in the background', () => {
    expect(
      shouldLockOnReturn({
        settings: { enabled: false, timeoutSeconds: 0 },
        backgroundedAtMs: 0,
        nowMs: 10_000_000,
      }),
    ).toBe(false);
    expect(shouldLockOnReturn({ settings, backgroundedAtMs: null, nowMs: 10_000_000 })).toBe(false);
  });
});

describe('effectiveAppLockSettings', () => {
  test('a coach who turned the lock off has it on while signings wait (RAPP-305)', () => {
    const off = { enabled: false, timeoutSeconds: 900 } as const;
    expect(effectiveAppLockSettings(off, 0)).toEqual(off);
    expect(effectiveAppLockSettings(off, 2)).toEqual({ enabled: true, timeoutSeconds: 60 });
  });

  test('a shorter timeout she chose stays; a longer one drops to a minute', () => {
    expect(effectiveAppLockSettings({ enabled: true, timeoutSeconds: 0 }, 1)).toEqual({
      enabled: true,
      timeoutSeconds: 0,
    });
    expect(effectiveAppLockSettings({ enabled: true, timeoutSeconds: 900 }, 1)).toEqual({
      enabled: true,
      timeoutSeconds: 60,
    });
  });
});
