/**
 * The privacy boundary around cached server state (RAPP-22).
 *
 * What is actually at stake: the cached `own-profile` row is decrypted PII for
 * a refugee woman. The cases below are the four the product really produces on
 * a shared phone, plus the token refresh that must NOT count as a change.
 */

import { expect, test } from 'bun:test';
import { shouldDropCachedServerState } from './session-cache';

const amina = '5eed0000-0000-4000-8000-000000000001';
const fatima = '5eed0000-0000-4000-8000-000000000002';

test('the first observed session drops nothing: nothing has been fetched yet', () => {
  expect(shouldDropCachedServerState(undefined, amina)).toBe(false);
  expect(shouldDropCachedServerState(undefined, null)).toBe(false);
});

test('a token refresh on the same identity keeps the cache', () => {
  expect(shouldDropCachedServerState(amina, amina)).toBe(false);
});

test('signing out drops the cache, so the decrypted row does not outlive the session', () => {
  expect(shouldDropCachedServerState(amina, null)).toBe(true);
});

test('handing the phone to the next woman drops the previous one record', () => {
  expect(shouldDropCachedServerState(amina, fatima)).toBe(true);
});

test('signing in after a sign-out is still a change and still drops', () => {
  expect(shouldDropCachedServerState(null, fatima)).toBe(true);
});
