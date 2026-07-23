import { expect, test } from 'bun:test';
import {
  createI18n,
  createInMemoryLanguageStorage,
  SUPPORTED_LANGUAGES,
} from '@ramassa/shared/i18n';
import { ENTITY_NAV_ITEMS, STAFF_NAV_ITEMS } from './nav-items';

const ALL_ITEMS = [...STAFF_NAV_ITEMS, ...ENTITY_NAV_ITEMS];

test('no admin route is claimed by two areas at once', () => {
  // Regression guard: `_staff` and `_entity` are PATHLESS layouts, so before the
  // entity area was namespaced under /portal, `_staff.messages` and
  // `_entity.messages` both resolved to `/messages` and collided in the route
  // tree. Any future same-named section would silently do it again.
  const staffPaths = new Set<string>(STAFF_NAV_ITEMS.map((item) => item.to));
  const overlap = ENTITY_NAV_ITEMS.filter((item) => staffPaths.has(item.to));
  expect(overlap).toEqual([]);
});

test('every nav destination is unique', () => {
  const paths = ALL_ITEMS.map((item) => item.to);
  expect(new Set(paths).size).toBe(paths.length);
});

test('the entity area stays namespaced under /portal', () => {
  for (const item of ENTITY_NAV_ITEMS) {
    expect(item.to.startsWith('/portal/')).toBe(true);
  }
});

test('every nav item ships an icon AND a label key (SPEC: never icon-only)', () => {
  for (const item of ALL_ITEMS) {
    expect(item.icon).toBeDefined();
    expect(item.labelKey.length).toBeGreaterThan(0);
  }
});

test.each(SUPPORTED_LANGUAGES.map((language) => [language] as const))(
  'every nav item label the shells actually render resolves in %s',
  (language) => {
    const i18n = createI18n({ languageStorage: createInMemoryLanguageStorage() });
    const translate = i18n.getFixedT(language);
    for (const item of ALL_ITEMS) {
      const label = translate(item.labelKey);
      // A missing key echoes the key back, which would ship a menu item reading
      // "nav:staff.content" to a user.
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(item.labelKey);
    }
  },
);
