import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../tests/setup/run-isolated-test';

test('the data deletion request screen keeps its behaviour', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/profile-delete-data.case.tsx`);
}, 30_000);
