import { expect, test } from 'bun:test';
import { generateMessageId } from './message-id';

test('message ids are valid UUIDs when WebCrypto is unavailable', () => {
  expect(generateMessageId()).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});
