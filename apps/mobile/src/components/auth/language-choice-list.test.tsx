import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('language-choice-list native component suite', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/language-choice-list.case.tsx`);
}, 30_000);
