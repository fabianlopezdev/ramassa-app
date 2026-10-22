import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('the summary groups follow the flow staff arranged (RAPP-612)', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/summary-order.case.tsx`);
}, 30000);
