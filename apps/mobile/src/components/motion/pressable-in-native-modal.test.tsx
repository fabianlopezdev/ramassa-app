import { test } from 'bun:test';
import { assertIsolatedTestPasses } from '../../../../../tests/setup/run-isolated-test';

test('shared press controls inside a native Modal use the platform pressable', () => {
  assertIsolatedTestPasses(`${import.meta.dir}/pressable-in-native-modal.case.tsx`);
}, 30_000);
