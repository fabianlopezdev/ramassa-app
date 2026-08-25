import { describe, expect, test } from 'bun:test';
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
