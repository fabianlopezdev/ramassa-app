import { describe, expect, test } from 'bun:test';
import { createI18n } from './create-i18n';
import { createInMemoryLanguageStorage } from './language-storage';
import { SUPPORTED_LANGUAGES } from './languages';

const i18n = createI18n({ languageStorage: createInMemoryLanguageStorage() });

/**
 * The push permission rationale is shown BEFORE the OS prompt (SPEC UX hard
 * constraint). An untranslated rationale would be worse than none: the user
 * would face an English wall of text and then a system dialog she cannot read,
 * and would reasonably decline. So every key must exist in all five languages.
 */
const PUSH_KEYS = [
  'rationaleTitle',
  'rationaleBody',
  'rationaleAccept',
  'rationaleDecline',
  'deniedNotice',
] as const;

describe('push catalog', () => {
  test.each(SUPPORTED_LANGUAGES.map((language) => [language] as const))(
    'every push permission string resolves in %s',
    (language) => {
      const translate = i18n.getFixedT(language, 'push');
      for (const key of PUSH_KEYS) {
        const message = translate(key);
        expect(message.length).toBeGreaterThan(0);
        expect(message).not.toBe(key);
      }
    },
  );
});
