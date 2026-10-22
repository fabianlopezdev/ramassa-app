/**
 * After a blocked Continue, the first question without its answer is brought
 * into view and gets the screen reader's focus, on its own error line
 * (pending fix 20, RAPP-611). The banner above says something is missing;
 * this says where.
 *
 * Each question registers its block (to scroll to) and its error line (to
 * focus) under the form field name. Questions are tried in the order they
 * first rendered, which is the order she reads them.
 *
 * Docs: https://reactnative.dev/docs/accessibilityinfo#sendaccessibilityevent
 * (`setAccessibilityFocus` is deprecated in favour of a `focus` event) and
 * https://reactnative.dev/docs/the-new-architecture/layout-measurements
 * (`measureLayout` against an ancestor ref).
 */
import { FormRevealContext } from '@/components/layout/form-reveal';
import { useCallback, useContext, useMemo, useRef } from 'react';
import { AccessibilityInfo, type Text, type View } from 'react-native';

export interface InvalidFieldFocus {
  /** The ref callback for a question's block. */
  readonly block: (name: string) => (view: View | null) => void;
  /** The ref callback for a question's error line. */
  readonly error: (name: string) => (text: Text | null) => void;
  /** Call from the rejected submit with the names that failed. */
  readonly focusFirst: (invalid: readonly string[]) => void;
}

export function useInvalidFieldFocus(): InvalidFieldFocus {
  const reveal = useContext(FormRevealContext);
  const blocks = useRef(new Map<string, View | null>());
  const errors = useRef(new Map<string, Text | null>());
  const block = useCallback(
    (name: string) => (view: View | null) => {
      blocks.current.set(name, view);
    },
    [],
  );
  const error = useCallback(
    (name: string) => (text: Text | null) => {
      errors.current.set(name, text);
    },
    [],
  );
  const focusFirst = useCallback(
    (invalid: readonly string[]) => {
      const first = [...blocks.current.keys()].find(
        (name) => invalid.includes(name) && blocks.current.get(name) != null,
      );
      if (first === undefined) return;
      // The error line renders with the rejected submit's errors: wait for it.
      setTimeout(() => {
        const view = blocks.current.get(first);
        if (view != null) reveal?.(view);
        const target = errors.current.get(first) ?? view;
        if (target == null) return;
        if (process.env.EXPO_OS === 'web') {
          // React Native Web has no accessibility events: move the DOM focus.
          const element = target as unknown as HTMLElement;
          element.setAttribute?.('tabindex', '-1');
          element.focus?.({ preventScroll: true });
          return;
        }
        AccessibilityInfo.sendAccessibilityEvent(target, 'focus');
      }, 0);
    },
    [reveal],
  );
  return useMemo(() => ({ block, error, focusFirst }), [block, error, focusFirst]);
}
