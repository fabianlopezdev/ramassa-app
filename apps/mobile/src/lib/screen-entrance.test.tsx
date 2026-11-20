import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../tests/setup/run-isolated-test';

test('entrances run once per screen per use of the app', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/screen-entrance.case.tsx`);
}, 30_000);
