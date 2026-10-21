import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('consent picker exposes an empty checkbox and animates its checked state', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/consent-row.case.tsx`);
}, 30000);
