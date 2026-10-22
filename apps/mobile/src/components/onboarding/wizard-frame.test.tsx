import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('wizard progress is omitted only while correcting answers, and staff wording shows', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/wizard-frame.case.tsx`);
}, 30000);
