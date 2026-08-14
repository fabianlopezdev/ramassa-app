import { expect, test } from 'bun:test';
import { createI18n } from './create-i18n';
import { createInMemoryLanguageStorage } from './language-storage';
import { SUPPORTED_LANGUAGES } from './languages';

test('the referral workflow is translated in every supported language', () => {
  for (const language of SUPPORTED_LANGUAGES) {
    const i18n = createI18n({
      languageStorage: createInMemoryLanguageStorage(),
      deviceLanguages: [language],
    });
    for (const key of [
      'title',
      'newAction',
      'firstName',
      'documentation.in_progress',
      'status.pending',
      'updateTypes.education',
      'staffQueueTitle',
      'completeAction',
    ]) {
      const translated = i18n.t(`referrals:${key}`);
      expect(translated).not.toBe(`referrals:${key}`);
      expect(translated).not.toBe(key);
    }
  }
});
