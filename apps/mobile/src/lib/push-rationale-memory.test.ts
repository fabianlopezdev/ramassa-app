import { expect, test } from 'bun:test';
import { declinePushRationale, hasDeclinedPushRationale } from './push-rationale-memory';

test('"not now" is remembered for that account for the rest of the run', () => {
  expect(hasDeclinedPushRationale('coach-1')).toBe(false);
  declinePushRationale('coach-1');
  expect(hasDeclinedPushRationale('coach-1')).toBe(true);
  expect(hasDeclinedPushRationale('player-2')).toBe(false);
  declinePushRationale(null);
  expect(hasDeclinedPushRationale(null)).toBe(false);
});
