import { describe, expect, test } from 'bun:test';
import {
  AppError,
  errorCodeRegistry,
  getErrorMessageKey,
  isAppError,
  toAppError,
  UNEXPECTED_ERROR_CODE,
} from './index';

describe('errorCodeRegistry', () => {
  test('every code is prefixed by its own domain (stable, self-describing codes)', () => {
    for (const [code, definition] of Object.entries(errorCodeRegistry)) {
      expect(code.startsWith(`${definition.domain}-`)).toBe(true);
    }
  });

  test('codes use the DOMAIN-N shape staff can read aloud from an error screen', () => {
    for (const code of Object.keys(errorCodeRegistry)) {
      expect(code).toMatch(/^[A-Z]+-\d+$/);
    }
  });

  test('the unexpected fallback code exists in the registry', () => {
    expect(errorCodeRegistry[UNEXPECTED_ERROR_CODE]).toBeDefined();
  });
});

describe('AppError', () => {
  test('carries code, domain, context, and cause, and is a real Error', () => {
    const cause = new Error('socket hang up');
    const error = new AppError('AUTH-1', {
      context: { userId: 'user-123' },
      cause,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe('AppError');
    expect(error.code).toBe('AUTH-1');
    expect(error.domain).toBe('AUTH');
    expect(error.context).toEqual({ userId: 'user-123' });
    expect(error.cause).toBe(cause);
  });

  test('developer message defaults to the registry description', () => {
    const error = new AppError('AUTH-1');
    expect(error.message).toBe(errorCodeRegistry['AUTH-1'].description);
  });

  test('an explicit developer message overrides the default', () => {
    const error = new AppError('AUTH-1', { message: 'magic link token expired after 15m' });
    expect(error.message).toBe('magic link token expired after 15m');
  });

  test('context defaults to an empty object', () => {
    expect(new AppError('DB-1').context).toEqual({});
  });
});

describe('getErrorMessageKey', () => {
  test('maps a code to its i18n key in the errors namespace', () => {
    expect(getErrorMessageKey('AUTH-1')).toBe('errors:AUTH-1');
    expect(getErrorMessageKey('UNEXPECTED-1')).toBe('errors:UNEXPECTED-1');
  });
});

describe('isAppError / toAppError', () => {
  test('isAppError narrows correctly', () => {
    expect(isAppError(new AppError('DB-1'))).toBe(true);
    expect(isAppError(new Error('plain'))).toBe(false);
    expect(isAppError('AUTH-1')).toBe(false);
    expect(isAppError(null)).toBe(false);
  });

  test('toAppError passes an existing AppError through untouched', () => {
    const original = new AppError('SYNC-1', { context: { queueLength: 3 } });
    expect(toAppError(original)).toBe(original);
  });

  test('toAppError wraps a plain Error, keeping it as cause and its message visible', () => {
    const plain = new Error('fetch failed');
    const wrapped = toAppError(plain);

    expect(wrapped.code).toBe(UNEXPECTED_ERROR_CODE);
    expect(wrapped.cause).toBe(plain);
    expect(wrapped.message).toContain('fetch failed');
  });

  test('toAppError wraps a plain Error under a caller-chosen code', () => {
    const wrapped = toAppError(new Error('row not found'), 'DB-2');
    expect(wrapped.code).toBe('DB-2');
  });

  test('toAppError wraps a thrown non-Error value without losing it', () => {
    const wrapped = toAppError('the string somebody threw');
    expect(wrapped.code).toBe(UNEXPECTED_ERROR_CODE);
    expect(wrapped.context.thrownValue).toBe('the string somebody threw');
  });
});
