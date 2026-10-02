import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('email forms keep validation when actions move to the footer', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/email-otp-form.case.tsx`);
}, 30_000);
