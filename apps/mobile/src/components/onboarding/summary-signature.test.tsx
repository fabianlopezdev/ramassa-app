import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('the summary lists the signature blocks she signed (RAPP-690)', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/summary-signature.case.tsx`);
}, 30000);
