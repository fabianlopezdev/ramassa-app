import { expect, test } from 'bun:test';
import { APP_NAME } from './app-name';

test('test harness runs inside the mobile workspace', () => {
  expect(APP_NAME).toBe('Ramassà');
});
