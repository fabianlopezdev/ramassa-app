import { expect, test } from 'bun:test';
import ar from './locales/ar/entity-management.json';
import ca from './locales/ca/entity-management.json';
import en from './locales/en/entity-management.json';
import es from './locales/es/entity-management.json';
import fa from './locales/fa/entity-management.json';

test('entity tracking and management catalogs match in all five languages', () => {
  const expectedKeys = Object.keys(ca).sort();
  const expectedStatusKeys = Object.keys(ca.status).sort();
  for (const catalog of [es, en, ar, fa]) {
    expect(Object.keys(catalog).sort()).toEqual(expectedKeys);
    expect(Object.keys(catalog.status).sort()).toEqual(expectedStatusKeys);
    expect(
      Object.entries(catalog).every(
        ([, value]) => typeof value !== 'string' || value.trim().length > 0,
      ),
    ).toBe(true);
  }
});
