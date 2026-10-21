import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('leaving terms requires confirmation and preserves saved answers', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/terms-decline.case.tsx`);
}, 30000);
