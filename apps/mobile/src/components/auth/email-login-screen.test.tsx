import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('email login and OTP keep the correct back navigation', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/email-login-screen.case.tsx`);
}, 30_000);
