import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../tests/setup/run-isolated-test';

test('push rationale respects onboarding, navigation, and account changes', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/use-push-registration.case.tsx`);
}, 30_000);
