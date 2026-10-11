import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('the staff language gate keeps its behaviour', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/staff-language-gate.case.tsx`);
}, 30_000);
