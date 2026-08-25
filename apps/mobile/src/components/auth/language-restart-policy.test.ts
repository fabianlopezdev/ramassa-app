import { describe, expect, test } from 'bun:test';
import { chooseLanguageWithRestart } from './language-restart-choice';
import { shouldRestartForLanguage } from './language-restart-policy';

describe('language direction restart policy', () => {
  test('requires a restart only when an LTR layout selects an RTL language', () => {
    expect(shouldRestartForLanguage(false, 'ar')).toBe(true);
    expect(shouldRestartForLanguage(false, 'fa')).toBe(true);
    expect(shouldRestartForLanguage(false, 'ca')).toBe(false);
    expect(shouldRestartForLanguage(false, 'es')).toBe(false);
    expect(shouldRestartForLanguage(false, 'en')).toBe(false);
  });

  test('requires a restart only when an RTL layout selects an LTR language', () => {
    expect(shouldRestartForLanguage(true, 'ar')).toBe(false);
    expect(shouldRestartForLanguage(true, 'fa')).toBe(false);
    expect(shouldRestartForLanguage(true, 'ca')).toBe(true);
  });
});

test('publishes the restart decision before the asynchronous language change completes', async () => {
  const calls: string[] = [];
  let finishLanguageChange: (() => void) | undefined;

  const choice = chooseLanguageWithRestart({
    isRtl: false,
    language: 'ar',
    setLanguage: () =>
      new Promise<void>((resolve) => {
        finishLanguageChange = () => {
          calls.push('language changed');
          resolve();
        };
      }),
    setNeedsRestart: (needsRestart) => calls.push(`restart: ${String(needsRestart)}`),
  });

  expect(calls).toEqual(['restart: true']);
  finishLanguageChange?.();
  expect(await choice).toBe(true);
  expect(calls).toEqual(['restart: true', 'language changed']);
});
