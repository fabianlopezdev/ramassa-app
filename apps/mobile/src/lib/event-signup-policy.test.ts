import { expect, test } from 'bun:test';
import { AppError } from '@ramassa/shared/errors';
import { isEventAnswerDisabled, requireEventSignupOnline } from './event-signup-policy';

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

test('a full activity turns yes off for a player who has not said yes (RAPP-883)', () => {
  expect(isEventAnswerDisabled({ answer: 'yes', currentAnswer: null, isFull: true })).toBe(true);
  expect(isEventAnswerDisabled({ answer: 'yes', currentAnswer: 'no', isFull: true })).toBe(true);
});

test('a full activity keeps no on, because a no takes no place (RAPP-908)', () => {
  expect(isEventAnswerDisabled({ answer: 'no', currentAnswer: null, isFull: true })).toBe(false);
  expect(isEventAnswerDisabled({ answer: 'no', currentAnswer: 'yes', isFull: true })).toBe(false);
});

test('a full activity she said yes to keeps both answers on, so she can change it', () => {
  expect(isEventAnswerDisabled({ answer: 'yes', currentAnswer: 'yes', isFull: true })).toBe(false);
});

test('an activity with places keeps both answers on', () => {
  expect(isEventAnswerDisabled({ answer: 'yes', currentAnswer: null, isFull: false })).toBe(false);
  expect(isEventAnswerDisabled({ answer: 'no', currentAnswer: null, isFull: false })).toBe(false);
});
