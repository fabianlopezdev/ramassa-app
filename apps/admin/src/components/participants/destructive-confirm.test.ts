import { describe, expect, test } from 'bun:test';
import { isConfirmationPhraseMatched } from './destructive-confirm';

describe('isConfirmationPhraseMatched', () => {
  test('the exact phrase matches', () => {
    expect(isConfirmationPhraseMatched('ESBORRA', 'ESBORRA')).toBe(true);
  });

  /**
   * The gate exists to stop a misclick, not to test typing. A staff member who
   * typed the right word in the wrong case, or with the trailing space a paste
   * brings along, has demonstrated exactly the deliberateness it is asking for.
   */
  test.each([['esborra'], ['Esborra'], ['  ESBORRA  '], ['esBORra\n']])(
    '%p is accepted as the phrase',
    (typed) => {
      expect(isConfirmationPhraseMatched(typed, 'ESBORRA')).toBe(true);
    },
  );

  /**
   * And the refusals, which are the half that makes the rule mean anything: a
   * comparison that returned true for everything would pass every case above.
   */
  test.each([[''], [' '], ['ESBOR'], ['ESBORRAR'], ['ANONIMITZA'], ['delete']])(
    '%p is not the phrase',
    (typed) => {
      expect(isConfirmationPhraseMatched(typed, 'ESBORRA')).toBe(false);
    },
  );

  /**
   * The Arabic and Farsi dialogs ask for a word in their own script, which has
   * no case at all. A comparison built on Latin case folding must still be exact
   * there rather than accidentally lenient.
   */
  test('a non-Latin phrase matches only itself', () => {
    expect(isConfirmationPhraseMatched('حذف', 'حذف')).toBe(true);
    expect(isConfirmationPhraseMatched('حذ', 'حذف')).toBe(false);
    expect(isConfirmationPhraseMatched('تجهيل', 'حذف')).toBe(false);
  });
});
