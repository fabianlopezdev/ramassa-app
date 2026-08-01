import { describe, expect, test } from 'bun:test';
import { errorCodeRegistry, type AppErrorCode } from '@ramassa/shared/errors';
import {
  HAPTIC_FEEDBACKS,
  hapticForErrorCode,
  shouldPlayHaptic,
  type HapticFeedback,
} from './haptic-policy';

describe('hapticForErrorCode: every AppError can speak, and says the right thing', () => {
  test('a validation problem warns, because the user can fix it', () => {
    expect(hapticForErrorCode('VALIDATION-1')).toBe('warning');
  });

  test('bad credentials warn rather than alarm: it is a typo, not a failure', () => {
    expect(hapticForErrorCode('AUTH-6')).toBe('warning');
  });

  test('a file that is too large or the wrong type warns', () => {
    expect(hapticForErrorCode('UPLOAD-2')).toBe('warning');
    expect(hapticForErrorCode('UPLOAD-3')).toBe('warning');
  });

  test('a network drop errors: nothing the user typed can fix it', () => {
    expect(hapticForErrorCode('NETWORK-1')).toBe('error');
  });

  test('database, sync and unexpected failures error', () => {
    expect(hapticForErrorCode('DB-1')).toBe('error');
    expect(hapticForErrorCode('SYNC-1')).toBe('error');
    expect(hapticForErrorCode('UNEXPECTED-1')).toBe('error');
  });

  test('EVERY registered code maps to a real feedback, so a new code cannot fall through', () => {
    const codes = Object.keys(errorCodeRegistry) as AppErrorCode[];
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      const feedback: HapticFeedback = hapticForErrorCode(code);
      expect(HAPTIC_FEEDBACKS).toContain(feedback);
    }
  });

  test('no error code is ever mapped to a celebratory feedback', () => {
    for (const code of Object.keys(errorCodeRegistry) as AppErrorCode[]) {
      expect(['success', 'selection', 'tapLight']).not.toContain(hapticForErrorCode(code));
    }
  });
});

describe('shouldPlayHaptic: the kill switch and the platform gate', () => {
  test('plays on a supported platform when enabled', () => {
    expect(shouldPlayHaptic({ isEnabled: true, os: 'ios' })).toBe(true);
    expect(shouldPlayHaptic({ isEnabled: true, os: 'android' })).toBe(true);
  });

  test('the kill switch wins over everything', () => {
    expect(shouldPlayHaptic({ isEnabled: false, os: 'ios' })).toBe(false);
    expect(shouldPlayHaptic({ isEnabled: false, os: 'android' })).toBe(false);
  });

  test('web is silently skipped rather than throwing', () => {
    expect(shouldPlayHaptic({ isEnabled: true, os: 'web' })).toBe(false);
  });

  test('an unknown platform is skipped, not assumed supported', () => {
    expect(shouldPlayHaptic({ isEnabled: true, os: 'windows' })).toBe(false);
  });
});
