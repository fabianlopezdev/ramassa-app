import { describe, expect, test } from 'bun:test';
import type { Href } from 'expo-router';
import {
  pushDetailQueryRoot,
  resolvePushDetailRoute,
  shouldOpenPushDetail,
} from './push-deep-link';

describe('push detail routes', () => {
  test('announcement taps open only the announcement detail route', () => {
    expect(
      resolvePushDetailRoute({
        contentType: 'announcement',
        contentId: '10000000-0000-4000-8000-000000000001',
      }),
    ).toBe('/announcement/10000000-0000-4000-8000-000000000001');
  });

  test('event taps open only the event detail route', () => {
    expect(
      resolvePushDetailRoute({
        contentType: 'event',
        contentId: '20000000-0000-4000-8000-000000000001',
      }),
    ).toBe('/event/20000000-0000-4000-8000-000000000001');
  });

  test('message taps open the single team chat and refresh its unread state', () => {
    expect(
      resolvePushDetailRoute({
        contentType: 'message',
        contentId: '30000000-0000-4000-8000-000000000001',
      }),
    ).toBe('/team-chat' as Href);
    expect(pushDetailQueryRoot('message')).toBe('messaging');
  });

  test('mentoring schedule taps open the private mentoring screen', () => {
    expect(
      resolvePushDetailRoute({
        contentType: 'mentoring_update',
        contentId: '30000000-0000-4000-8000-000000000002',
      }),
    ).toBe('/mentoring' as Href);
    expect(pushDetailQueryRoot('mentoring_update')).toBe('player-mentoring');
  });

  test('refreshes the content collection before opening a newly published detail', () => {
    expect(pushDetailQueryRoot('announcement')).toBe('player-announcements');
    expect(pushDetailQueryRoot('event')).toBe('player-events');
  });

  test.each([
    [null],
    [{}],
    [{ contentType: 'story', contentId: '10000000-0000-4000-8000-000000000001' }],
    [{ contentType: 'announcement', contentId: '../profile' }],
    [{ url: '/profile-delete-data' }],
  ])('rejects malformed or arbitrary notification data', (data) => {
    expect(resolvePushDetailRoute(data)).toBeNull();
  });

  test('cold-start navigation waits for a signed-in, onboarded player and a mounted router', () => {
    const ready = { hasSession: true, needsOnboarding: false, isNavigationReady: true };

    expect(shouldOpenPushDetail(ready)).toBe(true);
    expect(shouldOpenPushDetail({ ...ready, hasSession: false })).toBe(false);
    expect(shouldOpenPushDetail({ ...ready, needsOnboarding: true })).toBe(false);
    expect(shouldOpenPushDetail({ ...ready, isNavigationReady: false })).toBe(false);
  });
});
