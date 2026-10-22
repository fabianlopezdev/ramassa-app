import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('a new app terms version is accepted on its own screen (RAPP-613)', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/terms-update.case.tsx`);
}, 30000);
