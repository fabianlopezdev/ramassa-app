import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('raised card press handles cancellation, RTL and reduced motion', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/pressable-depth.case.tsx`);
}, 30_000);
