import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('custom questions use full-width equal choices with existing selection behavior', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/custom-question-field.case.tsx`);
}, 30_000);
