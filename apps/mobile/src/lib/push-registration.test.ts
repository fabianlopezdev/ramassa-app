import { expect, test } from 'bun:test';
import {
  buildPushTokenRow,
  decidePushRegistration,
  resolvePushPlatform,
  shouldWriteToken,
  type PushRegistrationInput,
} from './push-registration';

const ready: PushRegistrationInput = {
  hasSession: true,
  isPhysicalDevice: true,
  os: 'android',
  hasProjectId: true,
  permission: 'granted',
};

test('only android and ios resolve to a push platform', () => {
  expect(resolvePushPlatform('android')).toBe('android');
  expect(resolvePushPlatform('ios')).toBe('ios');
  // The DB allows 'web' for a future web-push phase, but VAPID is not configured,
  // so the client must not claim a web token it cannot obtain.
  expect(resolvePushPlatform('web')).toBeNull();
  expect(resolvePushPlatform('macos')).toBeNull();
});

test('a signed-in, permitted device on a real phone registers', () => {
  expect(decidePushRegistration(ready)).toEqual({ kind: 'register' });
});

test('an undetermined permission asks first, so the rationale precedes the OS prompt', () => {
  expect(decidePushRegistration({ ...ready, permission: 'undetermined' })).toEqual({
    kind: 'request-permission',
  });
});

test('a denied permission NEVER registers, and the app keeps working', () => {
  // The UX hard constraint: push is optional. A denial must be a quiet skip, not
  // an error, and must never record a token.
  const decision = decidePushRegistration({ ...ready, permission: 'denied' });
  expect(decision).toEqual({ kind: 'skip', reason: 'permission-denied' });
  expect(decision.kind).not.toBe('register');
});

test('no session means no token: a token is always owned by a signed-in user', () => {
  expect(decidePushRegistration({ ...ready, hasSession: false })).toEqual({
    kind: 'skip',
    reason: 'no-session',
  });
});

test('a simulator is skipped: Expo cannot issue a push token without real hardware', () => {
  expect(decidePushRegistration({ ...ready, isPhysicalDevice: false })).toEqual({
    kind: 'skip',
    reason: 'not-a-physical-device',
  });
});

test('an unsupported platform is skipped rather than stored with a wrong platform', () => {
  expect(decidePushRegistration({ ...ready, os: 'web' })).toEqual({
    kind: 'skip',
    reason: 'unsupported-platform',
  });
});

test('a missing EAS projectId degrades gracefully instead of throwing', () => {
  // getExpoPushTokenAsync REQUIRES a projectId (SDK 49+). The project is not
  // linked to EAS yet, so this is the live path today: the app must boot and run
  // normally, just without push.
  expect(decidePushRegistration({ ...ready, hasProjectId: false })).toEqual({
    kind: 'skip',
    reason: 'missing-project-id',
  });
});

test('session is checked before hardware, so signed-out simulators report the real reason', () => {
  expect(decidePushRegistration({ ...ready, hasSession: false, isPhysicalDevice: false })).toEqual({
    kind: 'skip',
    reason: 'no-session',
  });
});

test('an unchanged token is not rewritten on every app start', () => {
  expect(shouldWriteToken('ExponentPushToken[same]', 'ExponentPushToken[same]')).toBe(false);
});

test('a rotated or first-ever token is written', () => {
  expect(shouldWriteToken(null, 'ExponentPushToken[first]')).toBe(true);
  expect(shouldWriteToken('ExponentPushToken[old]', 'ExponentPushToken[new]')).toBe(true);
});

test('the upsert row carries the device id that dedupes it', () => {
  expect(
    buildPushTokenRow({
      userId: 'user-1',
      token: 'ExponentPushToken[abc]',
      platform: 'ios',
      deviceId: 'install-uuid-1',
    }),
  ).toEqual({
    user_id: 'user-1',
    token: 'ExponentPushToken[abc]',
    platform: 'ios',
    device_id: 'install-uuid-1',
  });
});
