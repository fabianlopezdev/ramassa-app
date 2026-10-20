import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../tests/setup/run-isolated-test';

test('wizard entrances run once per screen per session', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/onboarding-entrance.case.tsx`);
}, 30_000);
