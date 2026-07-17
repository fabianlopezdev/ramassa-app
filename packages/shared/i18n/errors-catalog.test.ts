import { describe, expect, test } from 'bun:test';
import { errorCodeRegistry, getErrorMessageKey, type AppErrorCode } from '../errors';
import { createI18n } from './create-i18n';
import { createInMemoryLanguageStorage } from './language-storage';
import { SUPPORTED_LANGUAGES } from './languages';

const i18n = createI18n({ languageStorage: createInMemoryLanguageStorage() });
const errorCodes = Object.keys(errorCodeRegistry) as AppErrorCode[];

describe('errors catalog', () => {
  test.each(SUPPORTED_LANGUAGES.map((language) => [language] as const))(
    'every error code resolves to a real translated message in %s',
    (language) => {
      const translate = i18n.getFixedT(language);
      for (const code of errorCodes) {
        const message = translate(getErrorMessageKey(code));
        // A missing key would echo the key itself back; a real message never
        // contains its own code.
        expect(message.length).toBeGreaterThan(0);
        expect(message).not.toContain(code);
      }
    },
  );

  test.each(SUPPORTED_LANGUAGES.map((language) => [language] as const))(
    'the fallback screen strings (title, retry, code label) exist in %s',
    (language) => {
      const translate = i18n.getFixedT(language, 'errors');
      for (const key of ['fallbackTitle', 'retry', 'errorCodeLabel']) {
        const message = translate(key);
        expect(message.length).toBeGreaterThan(0);
        expect(message).not.toBe(key);
      }
    },
  );
});
