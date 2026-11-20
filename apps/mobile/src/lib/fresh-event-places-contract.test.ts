import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'bun:test';

// An activity says it is full before she taps (RAPP-883): its screen asks for
// the places when it opens, when she comes back and while she reads.
const read = (path: string) => readFileSync(join(import.meta.dir, '..', path), 'utf8');

test('the activity screen reads its places through the fresh hook', () => {
  const screen = read('app/(app)/event/[id].tsx');
  expect(screen).toContain('useFreshPlayerEvents()');
  expect(screen).not.toMatch(/=\s*usePlayerEvents\(\)/);
});

test('the fresh hook asks again on focus, on the app coming back and on a short timer', () => {
  const hook = read('lib/use-fresh-player-events.ts');
  expect(hook).toContain('export const EVENT_PLACES_REFRESH_MS = 15_000;');
  expect(hook).toContain('useFocusEffect(');
  expect(hook).toContain("AppState.addEventListener('change'");
  expect(hook).toMatch(/refetchInterval: isFocused \? EVENT_PLACES_REFRESH_MS : false/);
});
