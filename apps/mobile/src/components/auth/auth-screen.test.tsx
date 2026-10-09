import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('auth form layout aligns headings and reserves bottom action space', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/auth-screen.case.tsx`);
}, 30_000);
