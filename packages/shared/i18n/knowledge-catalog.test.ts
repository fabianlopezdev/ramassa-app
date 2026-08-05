import { expect, test } from 'bun:test';
import ar from './locales/ar/knowledge.json';
import ca from './locales/ca/knowledge.json';
import en from './locales/en/knowledge.json';
import es from './locales/es/knowledge.json';
import fa from './locales/fa/knowledge.json';

test('knowledge base catalogs expose the same keys in all five languages', () => {
  const expected = Object.keys(ca).sort();
  for (const catalog of [es, en, ar, fa]) {
    expect(Object.keys(catalog).sort()).toEqual(expected);
  }
});
