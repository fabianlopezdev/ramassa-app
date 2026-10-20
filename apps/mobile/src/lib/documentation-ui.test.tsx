import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../tests/setup/run-isolated-test';

test('document choice and details preserve branching and saved answers', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/documentation-ui.case.tsx`);
}, 30_000);
