import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('country picker opens, searches, selects and cancels without changing saved answers', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/country-picker.case.tsx`);
}, 30_000);
