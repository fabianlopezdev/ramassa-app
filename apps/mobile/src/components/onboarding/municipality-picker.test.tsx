import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('municipality uses one field, supports clearing a selection, and safely closes its picker', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/municipality-picker.case.tsx`);
}, 30_000);
