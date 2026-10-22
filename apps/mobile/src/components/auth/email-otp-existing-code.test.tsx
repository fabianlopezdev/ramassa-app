import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('a staging build offers the code step without an email (RAPP-616)', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/email-otp-existing-code.case.tsx`);
}, 30_000);
