import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('intake loading keeps drafts private and explains offline pauses', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/intake-loading.case.tsx`);
}, 30_000);
