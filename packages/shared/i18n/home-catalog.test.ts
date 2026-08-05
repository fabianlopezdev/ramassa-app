import { describe, expect, test } from 'bun:test';
import { createI18n } from './create-i18n';
import { createInMemoryLanguageStorage } from './language-storage';
import { SUPPORTED_LANGUAGES } from './languages';

const i18n = createI18n({ languageStorage: createInMemoryLanguageStorage() });

const HOME_FEED_KEYS = [
  'feedTitle',
  'feedIntro',
  'filterLabel',
  'filterAll',
  'category.info',
  'category.training',
  'category.social',
  'category.urgent',
  'pinned',
  'offlineBanner',
  'emptyTitle',
  'emptyBody',
  'loadFailed',
  'retryAction',
  'openAnnouncementLabel',
  'detailTitle',
  'loading',
] as const;

describe('player home feed catalog', () => {
  test.each(SUPPORTED_LANGUAGES.map((language) => [language] as const))(
    'every feed label resolves in %s',
    (language) => {
      const translate = i18n.getFixedT(language, 'home');
      for (const key of HOME_FEED_KEYS) {
        expect(translate(key)).not.toBe(key);
      }
    },
  );
});
