import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('Other situation follow-up preserves navigation and explanation', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/applicant-status-flow.case.tsx`);
}, 30_000);
