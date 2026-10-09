import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('organization-branding-provider native component suite', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/organization-branding-provider.case.tsx`);
}, 30_000);
