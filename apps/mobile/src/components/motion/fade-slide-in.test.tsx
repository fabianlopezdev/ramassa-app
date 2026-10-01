import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('entrance waits for visible content and respects reduced motion', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/fade-slide-in.case.tsx`);
}, 30_000);
