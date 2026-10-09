import { expect, test } from 'bun:test';
import ca from './locales/ca/services.json';
import en from './locales/en/services.json';
import es from './locales/es/services.json';

// The staff services area (list, categories, review queue) is staff-side, so it
// ships in Catalan, Spanish and English (ADR-026). RAPP-200: Spanish was missing.
type Catalog = { readonly [key: string]: string | Catalog };

const leaves = (catalog: Catalog, prefix = ''): Map<string, string> => {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [k, v] of leaves(value, path)) out.set(k, v);
  }
  return out;
};

const placeholders = (text: string): string[] =>
  [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1] ?? '').sort();

test('staff services catalogs match in Catalan, Spanish and English', () => {
  const reference = leaves(ca as Catalog);
  for (const catalog of [es, en] as Catalog[]) {
    const current = leaves(catalog);
    expect([...current.keys()].sort()).toEqual([...reference.keys()].sort());
    for (const [key, text] of current) {
      expect(text.trim().length > 0).toBe(true);
      expect(placeholders(text)).toEqual(placeholders(reference.get(key) ?? ''));
    }
  }
});
