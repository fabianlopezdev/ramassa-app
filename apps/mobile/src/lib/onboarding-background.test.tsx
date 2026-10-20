import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../tests/setup/run-isolated-test';

test('background form gives birth date feedback and retains the simple country field', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/onboarding-background.case.tsx`);
}, 30_000);
