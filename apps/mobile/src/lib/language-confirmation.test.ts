import { expect, mock, test } from 'bun:test';
import {
  consumeLanguageConfirmation,
  LANGUAGE_CONFIRMED_RELOAD_KEY,
} from './language-confirmation';

test('only a confirmed direction reload resumes login, once', () => {
  let pending: boolean | undefined;
  const storage = {
    getBoolean: mock(() => pending),
    remove: mock(() => {
      pending = undefined;
    }),
  };
  expect(consumeLanguageConfirmation(storage)).toBe(false);
  pending = true;
  expect(consumeLanguageConfirmation(storage)).toBe(true);
  expect(storage.remove).toHaveBeenCalledWith(LANGUAGE_CONFIRMED_RELOAD_KEY);
  expect(consumeLanguageConfirmation(storage)).toBe(false);
});
