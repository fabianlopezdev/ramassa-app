import { useEffect, useRef } from 'react';

export function useStorySubmissionScrollReset(isComplete: boolean, resetScroll: () => void): void {
  const wasComplete = useRef(isComplete);

  useEffect(() => {
    if (isComplete && !wasComplete.current) {
      resetScroll();
    }
    wasComplete.current = isComplete;
  }, [isComplete, resetScroll]);
}
