import { expect, test } from 'bun:test';
import { metroSchemesFromManifest } from './servers';

test('the Metro identity recognises this app anywhere in the manifest scheme list', () => {
  expect(
    metroSchemesFromManifest({
      extra: { expoClient: { scheme: ['another-app', 'ramassa'] } },
    }),
  ).toEqual(['another-app', 'ramassa']);
});

test('an invalid Expo manifest is not trusted as a Metro identity', () => {
  expect(metroSchemesFromManifest({ extra: { expoClient: { scheme: 42 } } })).toBeUndefined();
  expect(metroSchemesFromManifest({ status: 'packager-status:running' })).toBeUndefined();
});
