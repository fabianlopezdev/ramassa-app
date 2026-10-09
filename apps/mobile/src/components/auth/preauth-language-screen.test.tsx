import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('preauth-language-screen native component suite', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/preauth-language-screen.case.tsx`);
}, 30_000);
