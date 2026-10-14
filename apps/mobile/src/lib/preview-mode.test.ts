import { describe, expect, test } from 'bun:test';
import { createPreviewModeStore, type PreviewModeStorage } from './preview-mode';

function memoryStorage(): PreviewModeStorage & { readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getString: (key) => values.get(key),
    set: (key, value) => void values.set(key, value),
    remove: (key) => values.delete(key),
  };
}

describe('createPreviewModeStore', () => {
  test('starts, gives the first screen once, and ends', () => {
    const storage = memoryStorage();
    const store = createPreviewModeStore(storage);
    let changes = 0;
    store.subscribe(() => {
      changes += 1;
    });
    expect(store.isActive()).toBe(false);

    store.start('/announcement/5eed0000-0000-4000-8001-000000000002', 'es');
    expect(store.isActive()).toBe(true);
    expect(store.takeTarget()).toBe('/announcement/5eed0000-0000-4000-8001-000000000002');
    expect(store.takeTarget()).toBeNull();
    expect(store.returnLanguage()).toBe('es');

    store.end();
    expect(store.isActive()).toBe(false);
    expect(store.returnLanguage()).toBeNull();
    expect(storage.values.size).toBe(0);
    expect(changes).toBe(2);
  });

  test('comes back after a restart, as a right-to-left language needs', () => {
    const storage = memoryStorage();
    createPreviewModeStore(storage).start(null, 'ca');
    const afterRestart = createPreviewModeStore(storage);
    expect(afterRestart.isActive()).toBe(true);
    expect(afterRestart.returnLanguage()).toBe('ca');
  });

  test('opens only an app path', () => {
    const storage = memoryStorage();
    const store = createPreviewModeStore(storage);
    store.start('https://example.test/phish', 'ca');
    expect(store.takeTarget()).toBeNull();
  });

  test('unreadable stored state is no preview', () => {
    const storage = memoryStorage();
    storage.set('ramassa.player-preview.v1', '{not json');
    expect(createPreviewModeStore(storage).isActive()).toBe(false);
  });
});
