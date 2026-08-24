import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'bun:test';

const packageEntry = fileURLToPath(import.meta.resolve('image-size'));
const packageDist = dirname(packageEntry);

test('the patched ICNS parser rejects entries that cannot advance past their header', () => {
  const source = readFileSync(join(packageDist, 'types', 'icns.js'), 'utf8');
  const guards = source.match(/imageHeader\[1\] < SIZE_HEADER/g) ?? [];

  expect(guards).toHaveLength(2);
});

test('the patched JXL parser rejects partial-stream boxes shorter than their header', () => {
  const source = readFileSync(join(packageDist, 'types', 'jxl.js'), 'utf8');

  expect(source).toContain('jxlpBox.size < 12');
});
