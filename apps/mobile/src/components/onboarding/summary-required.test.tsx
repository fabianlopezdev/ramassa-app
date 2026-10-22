import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('the summary refuses to confirm while a required answer is missing (RAPP-612)', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/summary-required.case.tsx`);
}, 30000);
