import { expect, test } from 'bun:test';
import type { MmkvLike } from '@ramassa/shared/supabase';
import { getOrCreateDeviceId } from './device-id';

function inMemoryStorage(seed: Record<string, string> = {}): MmkvLike {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    getString: (key) => store.get(key),
    set: (key, value) => void store.set(key, value),
    remove: (key) => store.delete(key),
  };
}

test('the first launch mints and persists an install id', () => {
  const storage = inMemoryStorage();
  const id = getOrCreateDeviceId(storage, () => 'generated-1');
  expect(id).toBe('generated-1');
  // Persisted, so the next launch reuses it.
  expect(storage.getString('ramassa.deviceId')).toBe('generated-1');
});

test('later launches reuse the SAME id, which is what makes dedupe work', () => {
  const storage = inMemoryStorage();
  const first = getOrCreateDeviceId(storage, () => 'generated-1');
  const second = getOrCreateDeviceId(storage, () => 'generated-2-should-not-be-used');
  expect(second).toBe(first);
});

test('a stored id is never regenerated, so a device cannot orphan its own token row', () => {
  // Regression guard: if this returned a fresh id per launch, every app start
  // would insert a NEW push_tokens row and the old one would linger forever as
  // an undeliverable duplicate.
  const storage = inMemoryStorage({ 'ramassa.deviceId': 'existing-id' });
  let generatorCalls = 0;
  const id = getOrCreateDeviceId(storage, () => {
    generatorCalls += 1;
    return 'fresh';
  });
  expect(id).toBe('existing-id');
  expect(generatorCalls).toBe(0);
});

test('an empty stored value is treated as absent, not as a valid id', () => {
  const storage = inMemoryStorage({ 'ramassa.deviceId': '' });
  expect(getOrCreateDeviceId(storage, () => 'generated-1')).toBe('generated-1');
});
