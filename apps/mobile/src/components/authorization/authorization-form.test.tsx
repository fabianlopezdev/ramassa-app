import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('season signing shares the onboarding layout and preserves explicit consent', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/authorization-form.case.tsx`);
}, 30000);
