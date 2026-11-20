import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'bun:test';

/**
 * Every screen has the shared entrance (RAPP-875). The signed-in stack gives it
 * to the screens it opens; a tab bar opens its screens itself, so each tab is
 * wrapped where it is exported. A new tab without the wrapper fails here.
 */
const appRoot = fileURLToPath(new URL('../app/(app)/', import.meta.url));
const tabGroups = ['(tabs)', '(team)', '(entity)'];

test('the signed-in stack opens every screen through the shared entrance', async () => {
  const layout = await readFile(`${appRoot}_layout.tsx`, 'utf8');
  expect(layout).toContain('screenLayout={screenEntranceLayout}');
});

test('every tab is exported through the shared entrance under its route name', async () => {
  for (const group of tabGroups) {
    const files = (await readdir(`${appRoot}${group}`)).filter(
      (file) => file.endsWith('.tsx') && file !== '_layout.tsx',
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = await readFile(`${appRoot}${group}/${file}`, 'utf8');
      const route = file.slice(0, -'.tsx'.length);
      expect(
        `${group}/${file}: ${source.includes(`export default withScreenEntrance('${route}',`)}`,
      ).toBe(`${group}/${file}: true`);
    }
  }
});
