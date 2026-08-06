import { join, relative } from 'node:path';
import { expect, test } from 'bun:test';

async function observeI18nEntrypoint() {
  let countryCatalogueLoaded = false;
  const loadedLocaleCatalogues = new Set<string>();

  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, 'index.ts')],
    packages: 'external',
    target: 'bun',
    plugins: [
      {
        name: 'observe-i18n-catalogues',
        setup(build) {
          build.onLoad({ filter: /\.json$/ }, ({ path }) => {
            if (path.endsWith('countries.json')) countryCatalogueLoaded = true;
            if (path.includes('/locales/')) {
              loadedLocaleCatalogues.add(relative(import.meta.dir, path));
            }
            return undefined;
          });
        },
      },
    ],
  });

  return { result, countryCatalogueLoaded, loadedLocaleCatalogues };
}

test('the main i18n entrypoint does not load the country catalogue', async () => {
  const { result, countryCatalogueLoaded } = await observeI18nEntrypoint();

  expect(result.success).toBe(true);
  expect(countryCatalogueLoaded).toBe(false);
});

test('the main i18n entrypoint keeps every offline locale catalogue eager', async () => {
  const expectedLocaleCatalogues = await Array.fromAsync(
    new Bun.Glob('locales/*/*.json').scan({ cwd: import.meta.dir }),
  );
  const { result, loadedLocaleCatalogues } = await observeI18nEntrypoint();

  expect(result.success).toBe(true);
  expect([...loadedLocaleCatalogues].sort()).toEqual(expectedLocaleCatalogues.sort());
});
