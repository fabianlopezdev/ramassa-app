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

test('a signed-in, permitted device registers', () => {
  expect(decidePushRegistration(ready)).toEqual({ kind: 'register' });
});

test('a simulator is NOT disqualified: Expo supports push on modern simulators', () => {
  // Regression guard. An earlier version gated on Device.isDevice, which would
  // have blocked testing on an iOS Simulator (Xcode 14+, macOS 13+, iOS 16+) and
  // on Android emulators with Play services, both of which Expo supports.
  expect(decidePushRegistration({ ...ready, os: 'ios' })).toEqual({ kind: 'register' });
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

test('an unsupported platform is skipped rather than stored with a wrong platform', () => {
  expect(decidePushRegistration({ ...ready, os: 'web' })).toEqual({
    kind: 'skip',
    reason: 'unsupported-platform',
  });
});

test('a missing EAS projectId degrades gracefully instead of throwing', () => {
  // getExpoPushTokenAsync REQUIRES a projectId (SDK 49+). The project IS linked
  // now, so this guards a build whose config lost the
  // link: it must boot and run normally, just without push.
  expect(decidePushRegistration({ ...ready, hasProjectId: false })).toEqual({
    kind: 'skip',
    reason: 'missing-project-id',
  });
});

test('session is checked first, so a signed-out device reports the real reason', () => {
  expect(decidePushRegistration({ ...ready, hasSession: false, permission: 'denied' })).toEqual({
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
