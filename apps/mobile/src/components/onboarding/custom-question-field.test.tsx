import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('custom questions use full-width equal choices, and every type its own control (RAPP-610)', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/custom-question-field.case.tsx`);
}, 30_000);
