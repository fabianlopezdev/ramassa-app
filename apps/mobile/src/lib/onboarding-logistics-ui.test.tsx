import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../tests/setup/run-isolated-test';

test('contact and equipment validate independently and preserve each other on forward/back', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/onboarding-logistics-ui.case.tsx`);
}, 30_000);
