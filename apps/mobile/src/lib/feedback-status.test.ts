import { expect, test } from 'bun:test';
import { nextFeedbackStatuses } from './feedback-status';

test('feedback only moves forward', () => {
  expect(nextFeedbackStatuses('new')).toEqual(['read', 'in_progress', 'resolved']);
  expect(nextFeedbackStatuses('read')).toEqual(['in_progress', 'resolved']);
  expect(nextFeedbackStatuses('in_progress')).toEqual(['resolved']);
  expect(nextFeedbackStatuses('resolved')).toEqual([]);
});
