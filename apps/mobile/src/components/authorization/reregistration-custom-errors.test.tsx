import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('re-registration names what does not fit, as the wizard does (RAPP-610)', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/reregistration-custom-errors.case.tsx`);
}, 30000);
