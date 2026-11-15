import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('the Dades legals panel keeps its behaviour', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/legal-data-panel.case.tsx`);
}, 30_000);
