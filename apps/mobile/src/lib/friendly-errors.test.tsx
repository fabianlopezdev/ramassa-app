import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../tests/setup/run-isolated-test';

test('mobile failures show translated guidance while retaining internal reports', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/friendly-errors.case.tsx`);
}, 30_000);
