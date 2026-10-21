import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('the phone invite shows what she will be asked (RAPP-618)', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/invite-questions-step.case.tsx`);
}, 30_000);
