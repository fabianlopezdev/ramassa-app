import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('needs categories and detail routes preserve conditional navigation', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/support-needs-flow.case.tsx`);
}, 30000);
