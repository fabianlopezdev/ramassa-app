import { expect, test } from 'bun:test';
import { foregroundNotificationBehavior } from './push-presentation';

test('foreground notifications remain visible in the Android drop-down and notification list', () => {
  expect(foregroundNotificationBehavior()).toEqual({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  });
});
