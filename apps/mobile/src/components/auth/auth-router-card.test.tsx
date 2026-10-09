import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('the auth router card keeps its behaviour', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/auth-router-card.case.tsx`);
}, 30_000);
