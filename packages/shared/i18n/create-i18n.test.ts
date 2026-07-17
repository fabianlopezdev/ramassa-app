import { describe, expect, test } from 'bun:test';
import { createI18n } from './create-i18n';
import { createInMemoryLanguageStorage } from './language-storage';
import { SUPPORTED_LANGUAGES } from './languages';

describe('translation resolution', () => {
  test('resolves the login title in every supported language', () => {
    const expectedByLanguage = {
      ca: 'Inici de sessió',
      es: 'Inicio de sesión',
      en: 'Log in',
      ar: 'تسجيل الدخول',
      fa: 'ورود',
    } as const;

    for (const language of SUPPORTED_LANGUAGES) {
      const i18n = createI18n({
        languageStorage: createInMemoryLanguageStorage(),
        deviceLanguages: [language],
      });
      expect(i18n.t('auth:loginTitle')).toBe(expectedByLanguage[language]);
    }
  });

  test('namespaces are split per feature (common, home, auth)', () => {
    const i18n = createI18n({ languageStorage: createInMemoryLanguageStorage() });
    expect(i18n.t('common:appName')).toBe('Ramassà');
    expect(i18n.t('home:subtitle')).not.toBe('home:subtitle');
    expect(i18n.t('auth:loginTitle')).not.toBe('auth:loginTitle');
  });
});

describe('fallback behavior', () => {
  test('starts in Catalan when there is no persisted or device language', () => {
    const i18n = createI18n({ languageStorage: createInMemoryLanguageStorage() });
    expect(i18n.resolvedLanguage).toBe('ca');
  });

  test('an unsupported device language falls back to Catalan', () => {
    const i18n = createI18n({
      languageStorage: createInMemoryLanguageStorage(),
      deviceLanguages: ['de-DE'],
    });
    expect(i18n.resolvedLanguage).toBe('ca');
  });

  test('a key missing from another locale falls back to the Catalan string', () => {
    const i18n = createI18n({
      languageStorage: createInMemoryLanguageStorage(),
      deviceLanguages: ['ar'],
    });
    // The sentinel key exists only in ca/common.json, so Arabic must fall back.
    expect(i18n.t('common:fallbackSentinel')).toBe('només en català');
  });
});

describe('language persistence', () => {
  test('changing the language writes it to the injected storage', async () => {
    const storage = createInMemoryLanguageStorage();
    const i18n = createI18n({ languageStorage: storage });

    await i18n.changeLanguage('fa');

    expect(storage.getLanguage()).toBe('fa');
  });

  test('round-trip: a fresh instance sharing the storage starts in the persisted language', async () => {
    const storage = createInMemoryLanguageStorage();
    const first = createI18n({ languageStorage: storage });
    await first.changeLanguage('ar');

    const second = createI18n({ languageStorage: storage, deviceLanguages: ['en-US'] });

    expect(second.resolvedLanguage).toBe('ar');
  });
});
