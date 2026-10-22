import { expect, test } from 'bun:test';
import { dependentsShown } from './dependents';

test('an unanswered dependants question is unknown, never "no" (RAPP-611)', () => {
  expect(dependentsShown(null, 0)).toEqual({ kind: 'unknown' });
  expect(dependentsShown(undefined, 0)).toEqual({ kind: 'unknown' });
  expect(dependentsShown(false, 0)).toEqual({ kind: 'none' });
  expect(dependentsShown(true, 2)).toEqual({ kind: 'count', count: 2 });
});

test('a roster row without Personal access shows nothing about her dependants', () => {
  expect(dependentsShown(null, null)).toEqual({ kind: 'hidden' });
});
