import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('the summary ends her review of the screens saved as a Nova versió (RAPP-697)', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/summary-review.case.tsx`);
}, 30000);
