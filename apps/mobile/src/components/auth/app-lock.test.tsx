import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('the app lock gate keeps its behaviour', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/app-lock.case.tsx`);
}, 30_000);
