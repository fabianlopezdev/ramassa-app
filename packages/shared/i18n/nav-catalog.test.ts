import { describe, expect, test } from 'bun:test';
import { createI18n } from './create-i18n';
import { createInMemoryLanguageStorage } from './language-storage';
import { SUPPORTED_LANGUAGES } from './languages';

const i18n = createI18n({ languageStorage: createInMemoryLanguageStorage() });

/**
 * Every visible navigation label must resolve in all five grant-mandated
 * languages: the nav shells (RAPP-16) render these directly, and the
 * `i18next/no-literal-string` lint rule forbids hardcoding them, so a missing
 * key would ship an empty tab/menu item rather than fall back to English.
 */
const NAV_KEYS = [
  'tabs.home',
  'tabs.events',
  'tabs.community',
  'tabs.services',
  'tabs.profile',
  'staff.dashboard',
  'staff.participants',
  'staff.content',
  'staff.attendance',
  'staff.messages',
  'staff.settings',
  'entity.referrals',
  'entity.services',
  'entity.events',
  'entity.messages',
  'a11y.primary',
  'a11y.staffSidebar',
  'a11y.entityPortal',
  'a11y.toggleSidebar',
  'a11y.sidebarLabel',
  'a11y.sidebarDescription',
] as const;

describe('nav catalog', () => {
  test.each(SUPPORTED_LANGUAGES.map((language) => [language] as const))(
    'every navigation label resolves to a real translated string in %s',
    (language) => {
      const translate = i18n.getFixedT(language, 'nav');
      for (const key of NAV_KEYS) {
        const label = translate(key);
        // A missing key echoes the key itself back (i18next default); a real
        // translation never equals its own dotted key.
        expect(label.length).toBeGreaterThan(0);
        expect(label).not.toBe(key);
      }
    },
  );
});
