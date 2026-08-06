import { expect, test } from 'bun:test';
import { AppError } from '@ramassa/shared/errors';
import { requireStorySubmissionOnline } from './story-submission-policy';

test('story submission is available online', () => {
  expect(requireStorySubmissionOnline(true)).toBeUndefined();
});

test('story submission fails clearly offline instead of queuing consent and media', () => {
  expect(() => requireStorySubmissionOnline(false)).toThrow(
    expect.objectContaining({ code: 'NETWORK-1' }) as AppError,
  );
});
