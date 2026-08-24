import { expect, test } from 'bun:test';
import { PASSWORD_MIN_LENGTH } from '../lib/constants';
import {
  appRoleSchema,
  emailOtpRequestSchema,
  emailOtpVerifySchema,
  loginEmailSchema,
  passwordLoginSchema,
} from './auth';

test('loginEmailSchema trims, lowercases, then validates', () => {
  const parsed = loginEmailSchema.parse('  Marc@Ramassa.CAT ');
  expect(parsed).toBe('marc@ramassa.cat');
});

test('loginEmailSchema rejects malformed addresses', () => {
  expect(loginEmailSchema.safeParse('not-an-email').success).toBe(false);
  expect(loginEmailSchema.safeParse('').success).toBe(false);
});

test('emailOtpRequestSchema needs only a valid email', () => {
  expect(emailOtpRequestSchema.safeParse({ email: 'player@example.com' }).success).toBe(true);
  expect(emailOtpRequestSchema.safeParse({ email: 'nope' }).success).toBe(false);
});

test('emailOtpVerifySchema binds a six-digit code to a valid email', () => {
  expect(
    emailOtpVerifySchema.safeParse({ email: 'player@example.com', token: '123456' }).success,
  ).toBe(true);
  expect(
    emailOtpVerifySchema.safeParse({ email: 'player@example.com', token: '12345' }).success,
  ).toBe(false);
  expect(emailOtpVerifySchema.safeParse({ email: 'nope', token: '123456' }).success).toBe(false);
});

test('passwordLoginSchema enforces the minimum password length', () => {
  const shortPassword = 'a'.repeat(PASSWORD_MIN_LENGTH - 1);
  const longEnough = 'a'.repeat(PASSWORD_MIN_LENGTH);
  expect(
    passwordLoginSchema.safeParse({ email: 'p@example.com', password: shortPassword }).success,
  ).toBe(false);
  expect(
    passwordLoginSchema.safeParse({ email: 'p@example.com', password: longEnough }).success,
  ).toBe(true);
});

test('appRoleSchema accepts the four known roles and rejects others', () => {
  for (const role of ['player', 'staff', 'admin', 'entity']) {
    expect(appRoleSchema.safeParse(role).success).toBe(true);
  }
  expect(appRoleSchema.safeParse('superuser').success).toBe(false);
});
