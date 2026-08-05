import { expect, test } from 'bun:test';
import { AppError } from '@ramassa/shared/errors';
import { isEventSignupActionDisabled, requireEventSignupOnline } from './event-signup-policy';

test('offline signup attempts fail immediately with NETWORK-1', () => {
  expect(() => requireEventSignupOnline(false)).toThrow(AppError);
  try {
    requireEventSignupOnline(false);
  } catch (error) {
    expect((error as AppError).code).toBe('NETWORK-1');
  }
});

test('online signup attempts proceed', () => {
  expect(() => requireEventSignupOnline(true)).not.toThrow();
});

test('a full event still allows an attempt so the server can return the capacity result', () => {
  expect(
    isEventSignupActionDisabled({
      hasEvent: true,
      hasNextState: true,
      isFull: true,
      hasActiveSignup: false,
    }),
  ).toBe(false);
});

test('an unavailable event or closed signup remains disabled', () => {
  expect(
    isEventSignupActionDisabled({
      hasEvent: false,
      hasNextState: true,
      isFull: false,
      hasActiveSignup: false,
    }),
  ).toBe(true);
  expect(
    isEventSignupActionDisabled({
      hasEvent: true,
      hasNextState: false,
      isFull: false,
      hasActiveSignup: false,
    }),
  ).toBe(true);
});
