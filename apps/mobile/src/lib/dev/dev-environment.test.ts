import { describe, expect, test } from 'bun:test';
import { summarizeDevEnvironment, type DevEnvironmentInput } from './dev-environment';

const baseInput: DevEnvironmentInput = {
  supabaseUrl: 'http://127.0.0.1:54321',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.super-secret-anon-key',
  sentryDsn: 'https://abc@o1.ingest.sentry.io/1',
  commitSha: 'aa2be27c0ffee1234567890',
  appVersion: '1.0.0',
  nativeBuildVersion: '3',
  expoSdkVersion: '1.0.0',
  deviceModelName: 'iPhone 17',
  osName: 'iOS',
  osVersion: '26.0',
  isPhysicalDevice: false,
  userId: '5eed0000-0000-4000-8000-000000000011',
  userEmail: 'amina.alhassan@example.test',
  role: 'player',
  sessionExpiresAt: 1_800_000_000,
  deviceId: 'e2ae6f2c-0000-4000-8000-000000000000',
  pushRegistration: 'skip: missing-project-id',
};

function valueFor(label: string, input: DevEnvironmentInput = baseInput): string | undefined {
  return summarizeDevEnvironment(input).find((row) => row.label === label)?.value;
}

describe('secrets never appear as values', () => {
  test('the anon key is reported as present, never printed', () => {
    const rendered = summarizeDevEnvironment(baseInput)
      .map((row) => row.value)
      .join(' ');
    expect(rendered).not.toContain('super-secret-anon-key');
    expect(valueFor('Supabase anon key')).toBe('present');
  });

  test('a missing anon key is reported as missing', () => {
    expect(valueFor('Supabase anon key', { ...baseInput, supabaseAnonKey: undefined })).toBe(
      'missing',
    );
  });

  test('the Sentry DSN is reported as on or off, never printed', () => {
    const rendered = summarizeDevEnvironment(baseInput)
      .map((row) => row.value)
      .join(' ');
    expect(rendered).not.toContain('o1.ingest.sentry.io');
    expect(valueFor('Sentry reporting')).toBe('on');
    expect(valueFor('Sentry reporting', { ...baseInput, sentryDsn: undefined })).toBe('off');
  });
});

describe('build identity', () => {
  test('the commit SHA is shortened the same way the Sentry dist is', () => {
    expect(valueFor('Commit SHA')).toBe('aa2be27c0ffe');
  });

  test('a local build with no injected SHA says so instead of showing undefined', () => {
    expect(valueFor('Commit SHA', { ...baseInput, commitSha: undefined })).toBe(
      'not injected (local build)',
    );
  });

  test('version and native build number are shown together', () => {
    expect(valueFor('App version')).toBe('1.0.0 (3)');
  });
});

describe('session identity', () => {
  test('shows the signed-in user, role, and expiry', () => {
    expect(valueFor('User id')).toBe('5eed0000-0000-4000-8000-000000000011');
    expect(valueFor('Role')).toBe('player');
    expect(valueFor('Session expires')).toContain('2027');
  });

  test('a signed-out session reads as signed out, not as blanks', () => {
    const signedOut: DevEnvironmentInput = {
      ...baseInput,
      userId: null,
      userEmail: null,
      role: null,
      sessionExpiresAt: null,
    };
    expect(valueFor('User id', signedOut)).toBe('signed out');
    expect(valueFor('Role', signedOut)).toBe('signed out');
    expect(valueFor('Session expires', signedOut)).toBe('signed out');
  });

  test('a role that has not resolved yet is distinguishable from no session', () => {
    expect(valueFor('Role', { ...baseInput, role: null })).toBe('resolving');
  });
});

describe('device', () => {
  test('reports the simulator, which is why push tokens are usually absent', () => {
    expect(valueFor('Device')).toBe('iPhone 17, iOS 26.0 (simulator)');
    expect(valueFor('Device', { ...baseInput, isPhysicalDevice: true })).toBe(
      'iPhone 17, iOS 26.0 (physical)',
    );
  });

  test('an unknown model degrades to a readable value', () => {
    expect(valueFor('Device', { ...baseInput, deviceModelName: null })).toBe(
      'unknown, iOS 26.0 (simulator)',
    );
  });

  test('carries the push registration decision, including its skip reason', () => {
    expect(valueFor('Push registration')).toBe('skip: missing-project-id');
  });
});

describe('shape', () => {
  test('every row has a label and a non-empty value', () => {
    for (const row of summarizeDevEnvironment(baseInput)) {
      expect(row.label.length).toBeGreaterThan(0);
      expect(row.value.length).toBeGreaterThan(0);
    }
  });

  test('labels are unique, so rows can key on them', () => {
    const labels = summarizeDevEnvironment(baseInput).map((row) => row.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
