import { act, renderHook } from '@testing-library/react';
import { expect, test } from 'bun:test';
import { useStorySubmissionScrollReset } from './story-submission-scroll';

test('a completed story submission resets the retained form scroll position', () => {
  let resetCount = 0;
  const resetScroll = () => {
    resetCount += 1;
  };
  const { rerender } = renderHook(
    ({ isComplete }: { readonly isComplete: boolean }) =>
      useStorySubmissionScrollReset(isComplete, resetScroll),
    { initialProps: { isComplete: false } },
  );

  expect(resetCount).toBe(0);

  act(() => rerender({ isComplete: true }));
  expect(resetCount).toBe(1);

  act(() => rerender({ isComplete: true }));
  expect(resetCount).toBe(1);
});
