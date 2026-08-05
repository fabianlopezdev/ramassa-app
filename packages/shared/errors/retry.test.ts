/**
 * The retry policy (RAPP-12). Written over the REGISTRY rather than a handful
 * of chosen codes, so a code appended later cannot quietly land in the wrong
 * bucket: the taxonomy is the input, not an example of it.
 */

import { expect, test } from 'bun:test';
import { AppError } from './app-error';
import { errorCodeRegistry, type AppErrorCode } from './codes';
import { isRetryableError } from './retry';

const allCodes = Object.keys(errorCodeRegistry) as AppErrorCode[];

test('a dropped connection mid-write is worth trying again', () => {
  expect(isRetryableError(new AppError('DB-1'))).toBe(true);
  expect(isRetryableError(new AppError('NETWORK-1'))).toBe(true);
  expect(isRetryableError(new AppError('UPLOAD-1'))).toBe(true);
});

test('an expired session is not fixed by asking again', () => {
  for (const code of allCodes.filter((candidate) => candidate.startsWith('AUTH-'))) {
    expect(isRetryableError(new AppError(code))).toBe(false);
  }
});

test('input the server rejected is not fixed by sending it again', () => {
  expect(isRetryableError(new AppError('VALIDATION-1'))).toBe(false);
});

test('a record that does not exist does not start existing on the second attempt', () => {
  expect(isRetryableError(new AppError('DB-2'))).toBe(false);
});

test('an unrecognized failure is retried: it might be the connection', () => {
  expect(isRetryableError(new Error('boom'))).toBe(true);
  expect(isRetryableError('boom')).toBe(true);
});

test('every registered code has a decided answer', () => {
  for (const code of allCodes) {
    expect(typeof isRetryableError(new AppError(code))).toBe('boolean');
  }
});
