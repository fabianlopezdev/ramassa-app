import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('shared primary action exposes its disabled and busy states', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/auth-submit-button.case.tsx`);
}, 30_000);
