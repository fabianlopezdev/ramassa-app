import { expect, test } from 'bun:test';
import { realtimeTopic } from './realtime-topic';

test('two subscribers to the same data get two channels', () => {
  const first = realtimeTopic('message-activity:abc');
  const second = realtimeTopic('message-activity:abc');
  expect(first).not.toBe(second);
  expect(first.startsWith('message-activity:abc#')).toBe(true);
});
