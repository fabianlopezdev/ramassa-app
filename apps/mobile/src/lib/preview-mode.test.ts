import { describe, expect, test } from 'bun:test';
import {
  createPreviewModeStore,
  endPreviewForSignIn,
  type PreviewModeStorage,
} from './preview-mode';

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

describe('a preview opened from the web admin (RAPP-372)', () => {
  test('closes its tab when it ends; one from the app does not', () => {
    const storage = memoryStorage();
    const store = createPreviewModeStore(storage);
    store.start(null, 'ca');
    expect(store.closesOnExit()).toBe(false);
    store.start('/service/x', 'ca', true);
    expect(store.closesOnExit()).toBe(true);
    store.end();
    expect(store.closesOnExit()).toBe(false);
  });
});

// RAPP-420: a sign-in leaves no other session of this app on the phone.
describe('endPreviewForSignIn', () => {
  test('ends a preview left on the phone and signs its session out', async () => {
    const storage = memoryStorage();
    const store = createPreviewModeStore(storage);
    store.start(null, 'ca');
    let previewSignOuts = 0;

    await endPreviewForSignIn(store, async () => {
      previewSignOuts += 1;
    });

    expect(store.isActive()).toBe(false);
    expect(storage.values.size).toBe(0);
    expect(previewSignOuts).toBe(1);
  });

  test('signs a stored preview session out even when no preview shows', async () => {
    const store = createPreviewModeStore(memoryStorage());
    let changes = 0;
    store.subscribe(() => {
      changes += 1;
    });
    let previewSignOuts = 0;

    await endPreviewForSignIn(store, async () => {
      previewSignOuts += 1;
    });

    expect(changes).toBe(0);
    expect(previewSignOuts).toBe(1);
  });
});
