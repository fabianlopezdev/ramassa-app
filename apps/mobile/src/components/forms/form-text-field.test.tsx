import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('shared fields preserve editing, error feedback and accessible sizing', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/form-text-field.case.tsx`);
}, 30_000);
