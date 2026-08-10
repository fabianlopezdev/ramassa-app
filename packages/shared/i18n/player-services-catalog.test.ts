import { expect, test } from 'bun:test';
import ar from './locales/ar/player-services.json';
import ca from './locales/ca/player-services.json';
import en from './locales/en/player-services.json';
import es from './locales/es/player-services.json';
import fa from './locales/fa/player-services.json';

test('player services catalogs expose the same copy in all five languages', () => {
  const expectedKeys = Object.keys(ca).sort();
  const expectedOptionKeys = Object.keys(ca.option).sort();
  for (const catalog of [es, en, ar, fa]) {
    expect(Object.keys(catalog).sort()).toEqual(expectedKeys);
    expect(Object.keys(catalog.option).sort()).toEqual(expectedOptionKeys);
  }
});
