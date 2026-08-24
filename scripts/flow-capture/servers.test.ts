import { expect, test } from 'bun:test';
import { metroSchemesFromManifest, resolveWebExportAssetPath } from './servers';

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

test('the web export resolver keeps valid assets inside the export root', () => {
  expect(resolveWebExportAssetPath('/workspace/mobile/dist', '/assets/index.js')).toBe(
    '/workspace/mobile/dist/assets/index.js',
  );
});

test('the web export resolver rejects encoded traversal and malformed paths', () => {
  expect(
    resolveWebExportAssetPath('/workspace/mobile/dist', '/%2e%2e%2fpackage.json'),
  ).toBeUndefined();
  expect(
    resolveWebExportAssetPath('/workspace/mobile/dist', '/assets/%2e%2e%2f%2e%2e%2f.env'),
  ).toBeUndefined();
  expect(resolveWebExportAssetPath('/workspace/mobile/dist', '/%E0%A4%A')).toBeUndefined();
});
