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

test('a full event she has not joined turns the action off (RAPP-883)', () => {
  expect(
    isEventSignupActionDisabled({
      hasEvent: true,
      hasNextState: true,
      isFull: true,
      hasActiveSignup: false,
    }),
  ).toBe(true);
});

test('a full event she has joined keeps the action on, so she can cancel', () => {
  expect(
    isEventSignupActionDisabled({
      hasEvent: true,
      hasNextState: true,
      isFull: true,
      hasActiveSignup: true,
    }),
  ).toBe(false);
});

test('an event with places keeps the action on', () => {
  expect(
    isEventSignupActionDisabled({
      hasEvent: true,
      hasNextState: true,
      isFull: false,
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
