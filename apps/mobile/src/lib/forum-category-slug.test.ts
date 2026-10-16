import { expect, test } from 'bun:test';
import { FORUM_CATEGORY_SLUG, forumCategorySlug } from './forum-category-slug';

test('a Catalan name becomes an identifier the database accepts', () => {
  expect(forumCategorySlug('Cursos i tallers')).toBe('cursos-i-tallers');
  expect(forumCategorySlug("  L'Escola de l·lers!  ")).toBe('l-escola-de-l-lers');
  expect(forumCategorySlug('Àrea Ç 2026')).toBe('area-c-2026');
  for (const name of ['Cursos i tallers', "L'Escola", 'Àrea Ç 2026']) {
    expect(forumCategorySlug(name)).toMatch(FORUM_CATEGORY_SLUG);
  }
});

test('a name with no letters or numbers gives no identifier', () => {
  expect(forumCategorySlug('¿¡ !?')).toBe('');
});
