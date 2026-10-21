import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('supporting entities use an added list with explicit removal', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/supporting-entities-field.case.tsx`);
}, 30000);
