import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('mentoring preference pickers keep their web behaviour', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/mentoring-preference-pickers.web.case.tsx`);
}, 30_000);
