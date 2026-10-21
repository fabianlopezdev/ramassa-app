import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('shared motion controls support assistive activation and block disabled actions', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/pressable-accessibility.case.tsx`);
}, 30_000);
