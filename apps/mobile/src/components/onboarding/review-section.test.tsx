import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('review sections retain edit navigation and readable accessible values', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/review-section.case.tsx`);
}, 30000);
