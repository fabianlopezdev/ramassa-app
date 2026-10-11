import { describe, expect, test } from 'bun:test';
import {
  areaHome,
  forgetAccount,
  readRememberedAccount,
  rememberAccount,
  resolveAccountArea,
  teamScreens,
  type AccountAreaStorage,
} from './account-area';

function memoryStorage(): AccountAreaStorage & { readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getString: (key) => values.get(key),
    set: (key, value) => void values.set(key, value),
    remove: (key) => values.delete(key),
  };
}

describe('resolveAccountArea', () => {
  test('each role has its own area', () => {
    expect(resolveAccountArea({ role: 'player', needsOnboarding: false, remembered: null })).toBe(
      'player',
    );
    expect(resolveAccountArea({ role: 'staff', needsOnboarding: false, remembered: null })).toBe(
      'team',
    );
    expect(resolveAccountArea({ role: 'admin', needsOnboarding: false, remembered: null })).toBe(
      'team',
    );
    expect(resolveAccountArea({ role: 'entity', needsOnboarding: false, remembered: null })).toBe(
      'entity',
    );
  });

  test('an entity contact never resolves to the player tabs', () => {
    expect(
      resolveAccountArea({
        role: 'entity',
        needsOnboarding: false,
        remembered: { area: 'player', permissions: new Set() },
      }),
    ).toBe('entity');
  });

  test('an incomplete profile goes to onboarding first', () => {
    expect(resolveAccountArea({ role: null, needsOnboarding: true, remembered: null })).toBe(
      'onboarding',
    );
  });

  test('an unchecked account uses what this device remembers, offline', () => {
    expect(
      resolveAccountArea({
        role: null,
        needsOnboarding: false,
        remembered: { area: 'team', permissions: new Set(['attendance.mark']) },
      }),
    ).toBe('team');
  });

  test('an unchecked account with nothing remembered is unresolved, never a player by default', () => {
    expect(resolveAccountArea({ role: null, needsOnboarding: false, remembered: null })).toBe(
      'unresolved',
    );
  });
});

describe('the remembered account', () => {
  test('round-trips the area and the permissions per user', () => {
    const storage = memoryStorage();
    rememberAccount(storage, 'u1', { area: 'team', permissions: new Set(['attendance.mark']) });
    expect(readRememberedAccount(storage, 'u1')).toEqual({
      area: 'team',
      permissions: new Set(['attendance.mark']),
    });
    expect(readRememberedAccount(storage, 'u2')).toBeNull();
    forgetAccount(storage, 'u1');
    expect(readRememberedAccount(storage, 'u1')).toBeNull();
  });

  test('a damaged or edited entry is ignored, and unknown codes are dropped', () => {
    const storage = memoryStorage();
    storage.set('ramassa.account-area.v1:u1', 'not json');
    expect(readRememberedAccount(storage, 'u1')).toBeNull();
    storage.set(
      'ramassa.account-area.v1:u1',
      JSON.stringify({ area: 'superuser', permissions: [] }),
    );
    expect(readRememberedAccount(storage, 'u1')).toBeNull();
    storage.set(
      'ramassa.account-area.v1:u1',
      JSON.stringify({ area: 'team', permissions: ['attendance.mark', 'everything.all', 7] }),
    );
    expect(readRememberedAccount(storage, 'u1')?.permissions).toEqual(new Set(['attendance.mark']));
  });
});

test('team screens follow permissions', () => {
  expect(teamScreens(new Set(['attendance.reports']))).toEqual({
    attendance: true,
    messages: false,
  });
  expect(teamScreens(new Set(['messages.inbox']))).toEqual({ attendance: false, messages: true });
  expect(teamScreens(new Set())).toEqual({ attendance: false, messages: false });
});

test('while the first lookup after signing in runs, the area waits rather than failing', () => {
  expect(
    resolveAccountArea({
      role: null,
      needsOnboarding: false,
      isResolvingProfile: true,
      remembered: null,
    }),
  ).toBe('resolving');
  expect(
    resolveAccountArea({
      role: null,
      needsOnboarding: false,
      isResolvingProfile: true,
      remembered: { area: 'team', permissions: new Set() },
    }),
  ).toBe('team');
});

test('each area starts on its own home; the player keeps the root', () => {
  expect(areaHome('team', new Set(['attendance.mark', 'messages.inbox']))).toBe('/attendance');
  expect(areaHome('team', new Set(['messages.inbox']))).toBe('/messages');
  expect(areaHome('team', new Set(['settings.branding']))).toBe('/team-home');
  expect(areaHome('entity', new Set())).toBe('/entity-portal');
  expect(areaHome('unresolved', new Set())).toBe('/account-unresolved');
  expect(areaHome('player', new Set())).toBeNull();
});
