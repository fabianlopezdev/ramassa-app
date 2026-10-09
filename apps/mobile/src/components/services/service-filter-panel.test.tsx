import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('the services filter panel keeps its behaviour', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/service-filter-panel.case.tsx`);
}, 30_000);
