import plist from '@expo/plist';
import { expect, test } from 'bun:test';

test('Expo device discovery can parse plist responses with the secured XML parser', () => {
  const device = { DeviceID: 7, Properties: { SerialNumber: 'simulator-fixture' } };
  expect(plist.parse(plist.build(device))).toEqual(device);
});
