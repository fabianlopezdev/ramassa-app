import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('checkmark draws sequentially and respects reduced motion', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/drawn-checkmark.case.tsx`);
}, 30_000);
