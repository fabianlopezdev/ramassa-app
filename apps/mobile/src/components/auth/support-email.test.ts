import { expect, mock, test } from 'bun:test';
import { openSupportEmail } from './support-email';

test('opens the configured monitored mailbox with mailto', async () => {
  const canOpenURL = mock(async () => true);
  const openURL = mock(async () => undefined);

  expect(await openSupportEmail('support@example.test', { canOpenURL, openURL })).toBe(true);
  expect(canOpenURL).toHaveBeenCalledWith('mailto:support@example.test');
  expect(openURL).toHaveBeenCalledWith('mailto:support@example.test');
});

test('returns false when no mail app can handle the address', async () => {
  const canOpenURL = mock(async () => false);
  const openURL = mock(async () => undefined);

  expect(await openSupportEmail('support@example.test', { canOpenURL, openURL })).toBe(false);
  expect(openURL).not.toHaveBeenCalled();
});
