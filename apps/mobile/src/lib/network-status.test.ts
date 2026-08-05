import { expect, test } from 'bun:test';
import { isNetworkStateOnline } from './network-status';

test('only an explicit disconnected or unreachable state is offline', () => {
  expect(isNetworkStateOnline({})).toBe(true);
  expect(isNetworkStateOnline({ isConnected: true, isInternetReachable: undefined })).toBe(true);
  expect(isNetworkStateOnline({ isConnected: false, isInternetReachable: true })).toBe(false);
  expect(isNetworkStateOnline({ isConnected: true, isInternetReachable: false })).toBe(false);
});
