import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Glob } from 'bun';
import { expect, test } from 'bun:test';

// Bun keeps `mock.module` results for the rest of a `bun test` run, so a stub
// in one file leaks into files that run after it (RAPP-222). Any suite that
// mocks a module lives in a `*.case.ts(x)` file and runs in its own process
// through `tests/setup/run-isolated-test.ts`.
test('no regular test file mocks a module', () => {
  const root = resolve(import.meta.dir, '..');
  const testFiles = new Glob('{apps,packages,scripts,tests,workers}/**/*.test.{ts,tsx}');
  const offenders: string[] = [];
  for (const path of testFiles.scanSync({ cwd: root })) {
    if (path.includes('node_modules/') || path === 'tests/module-mock-isolation.test.ts') continue;
    if (/\bmock\.module\(/.test(readFileSync(resolve(root, path), 'utf8'))) {
      offenders.push(path);
    }
  }
  expect(offenders).toEqual([]);
});
