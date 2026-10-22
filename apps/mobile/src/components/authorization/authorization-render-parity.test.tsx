import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('the converted published version reads word for word as before, in five languages', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/authorization-render-parity.case.tsx`);
}, 30000);
