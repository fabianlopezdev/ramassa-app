/**
 * Whether a form's boxes differ from how it opened (RAPP-751), for the forms
 * that keep their text in the page: its Desa turns on only for a real change.
 * Typing a word and deleting it again is no change.
 */

import { useCallback, useRef, useState } from 'react';

function snapshot(form: HTMLFormElement): string {
  return JSON.stringify(
    // Files are not compared: these forms hold text and switches.
    [...new FormData(form).entries()].map(([key, value]) => [
      key,
      typeof value === 'string' ? value.trim() : '',
    ]),
  );
}

export function useChangedForm() {
  const opened = useRef<string | null>(null);
  const [isChanged, setIsChanged] = useState(false);
  /** The form's ref: what it holds when it opens is the saved state. */
  const formRef = useCallback((form: HTMLFormElement | null) => {
    if (form !== null && opened.current === null) opened.current = snapshot(form);
  }, []);
  /** On every input: compare with how it opened. */
  const track = useCallback((form: HTMLFormElement) => {
    setIsChanged(snapshot(form) !== opened.current);
  }, []);
  return { isChanged, formRef, track };
}
