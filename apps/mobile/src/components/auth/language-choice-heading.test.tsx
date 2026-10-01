import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('language-choice-heading native component suite', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/language-choice-heading.case.tsx`);
}, 30_000);
