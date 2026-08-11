import { describe, expect, test } from 'bun:test';
import { AppError } from '@ramassa/shared/errors';
import {
  createProtectedStorage,
  createStorageEncryptionKey,
  rebuildLegacyPreferencesStorage,
  type ProtectedStorageFactory,
  type StorageKeyVault,
  type StorageLike,
} from './storage-security';

class FakeStorage implements StorageLike {
  readonly values = new Map<string, string>();
  trimCount = 0;

  constructor(initial: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initial)) this.values.set(key, value);
  }

  getAllKeys(): string[] {
    return [...this.values.keys()];
  }

  getString(key: string): string | undefined {
    return this.values.get(key);
  }

  set(key: string, value: string): void {
    this.values.set(key, value);
  }

  remove(key: string): boolean {
    return this.values.delete(key);
  }

  trim(): void {
    this.trimCount += 1;
  }
}

function fakeVault(initial: Record<string, string> = {}): StorageKeyVault & {
  readonly values: Map<string, string>;
} {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get: (key) => values.get(key) ?? null,
    set: (key, value) => void values.set(key, value),
  };
}

function fakeFactory(options: {
  exists: boolean;
  readableKey?: string;
  initial?: Record<string, string>;
}): ProtectedStorageFactory & {
  readonly createdWith: string[];
  deleteCount: number;
  latestStorage(): FakeStorage;
} {
  let exists = options.exists;
  let storage = new FakeStorage(options.initial);
  const createdWith: string[] = [];
  const factory = {
    createdWith,
    deleteCount: 0,
    exists: () => exists,
    create: ({
      encryptionKey,
      encryptionType,
    }: Parameters<ProtectedStorageFactory['create']>[0]) => {
      createdWith.push(`${encryptionType}:${encryptionKey}`);
      if (exists && options.readableKey !== undefined && encryptionKey !== options.readableKey) {
        storage = new FakeStorage();
      }
      exists = true;
      return storage;
    },
    delete: () => {
      factory.deleteCount += 1;
      exists = false;
      storage = new FakeStorage();
      return true;
    },
    latestStorage: () => storage,
  };
  return factory;
}

const fixedRandomBytes = (count: number): Uint8Array =>
  Uint8Array.from({ length: count }, (_, index) => index);

describe('createStorageEncryptionKey', () => {
  test('requests 24 random bytes and returns exactly 32 ASCII bytes for MMKV AES-256', () => {
    let requested = 0;
    const key = createStorageEncryptionKey((count) => {
      requested = count;
      return fixedRandomBytes(count);
    });

    expect(requested).toBe(24);
    expect(key).toBe('AAECAwQFBgcICQoLDA0ODxAREhMUFRYX');
    expect(new TextEncoder().encode(key)).toHaveLength(32);
    expect(key).toMatch(/^[A-Za-z0-9+/]{32}$/);
  });

  test('rejects a random source that returns the wrong byte count', () => {
    expect(() => createStorageEncryptionKey(() => new Uint8Array(23))).toThrow();
  });
});

describe('createProtectedStorage', () => {
  test('creates a fresh AES-256 store with a SecureStore-backed key and sentinel', () => {
    const vault = fakeVault();
    const factory = fakeFactory({ exists: false });

    const result = createProtectedStorage({
      id: 'ramassa.auth.v1',
      keyName: 'ramassa.auth.key.v1',
      vault,
      factory,
      randomBytes: fixedRandomBytes,
    });

    expect(result.recovery).toBe('fresh');
    expect(vault.values.get('ramassa.auth.key.v1')).toHaveLength(32);
    expect(factory.createdWith[0]).toStartWith('AES-256:');
    expect(result.storage.getString('ramassa.storage-key-check.v1')).toBe('protected');
  });

  test('reopens an existing store without rotating a valid key', () => {
    const existingKey = createStorageEncryptionKey(fixedRandomBytes);
    const vault = fakeVault({ 'ramassa.auth.key.v1': existingKey });
    const factory = fakeFactory({
      exists: true,
      readableKey: existingKey,
      initial: { 'ramassa.storage-key-check.v1': 'protected', session: 'opaque' },
    });

    const result = createProtectedStorage({
      id: 'ramassa.auth.v1',
      keyName: 'ramassa.auth.key.v1',
      vault,
      factory,
      randomBytes: fixedRandomBytes,
    });

    expect(result.recovery).toBe('reopened');
    expect(result.storage.getString('session')).toBe('opaque');
    expect(factory.deleteCount).toBe(0);
  });

  test('missing key for an existing store fails closed by deleting and recreating it', () => {
    const vault = fakeVault();
    const factory = fakeFactory({
      exists: true,
      initial: { 'ramassa.storage-key-check.v1': 'protected', session: 'must-not-survive' },
    });

    const result = createProtectedStorage({
      id: 'ramassa.auth.v1',
      keyName: 'ramassa.auth.key.v1',
      vault,
      factory,
      randomBytes: fixedRandomBytes,
    });

    expect(result.recovery).toBe('reset-missing-key');
    expect(factory.deleteCount).toBe(1);
    expect(result.storage.getString('session')).toBeUndefined();
  });

  test('invalid key material for an existing store is rotated without reading its contents', () => {
    const vault = fakeVault({ 'ramassa.private.key.v1': 'too-short' });
    const factory = fakeFactory({
      exists: true,
      initial: { 'ramassa.storage-key-check.v1': 'protected', draft: 'must-not-survive' },
    });

    const result = createProtectedStorage({
      id: 'ramassa.private.v1',
      keyName: 'ramassa.private.key.v1',
      vault,
      factory,
      randomBytes: fixedRandomBytes,
    });

    expect(result.recovery).toBe('reset-invalid-key');
    expect(factory.deleteCount).toBe(1);
    expect(result.storage.getString('draft')).toBeUndefined();
    expect(vault.values.get('ramassa.private.key.v1')).toHaveLength(32);
  });

  test('a valid-looking wrong key is detected by the encrypted sentinel and rotated', () => {
    const storedKey = '/'.repeat(32);
    const actualKey = createStorageEncryptionKey(fixedRandomBytes);
    const vault = fakeVault({ 'ramassa.auth.key.v1': storedKey });
    const factory = fakeFactory({
      exists: true,
      readableKey: actualKey,
      initial: { 'ramassa.storage-key-check.v1': 'protected', session: 'must-not-survive' },
    });

    const result = createProtectedStorage({
      id: 'ramassa.auth.v1',
      keyName: 'ramassa.auth.key.v1',
      vault,
      factory,
      randomBytes: fixedRandomBytes,
    });

    expect(result.recovery).toBe('reset-unreadable-store');
    expect(factory.deleteCount).toBe(1);
    expect(result.storage.getString('session')).toBeUndefined();
  });
});

describe('rebuildLegacyPreferencesStorage', () => {
  test('replaces the legacy file and restores only low-sensitivity preferences', () => {
    const storage = new FakeStorage({
      'sb-local-auth-token': 'session',
      'sb-local-auth-token-user': 'user',
      'ramassa.onboarding-draft': 'identity',
      'ramassa.messaging-outbox.v1': 'message',
      'ramassa.attendance-outbox.v1': 'attendance',
      'ramassa.query-cache.v1': 'user-scoped-cache',
      'ramassa.language': 'ca',
      'ramassa.haptics.enabled': 'true',
      'ramassa.deviceId': 'device',
      'ramassa.pushToken.lastWritten': 'push-token',
      'ramassa.attendance-coach.user-id': 'staff',
    });
    const replacement = new FakeStorage();
    let rebuildCount = 0;

    const result = rebuildLegacyPreferencesStorage(storage, () => {
      rebuildCount += 1;
      return replacement;
    });

    expect(result.reset).toBe(true);
    expect(result.storage).toBe(replacement);
    expect(rebuildCount).toBe(1);
    expect(replacement.getAllKeys().sort()).toEqual([
      'ramassa.deviceId',
      'ramassa.haptics.enabled',
      'ramassa.language',
      'ramassa.pushToken.lastWritten',
      'ramassa.secure-storage-reset.v1',
    ]);
    expect(storage.getString('sb-local-auth-token')).toBe('session');
  });

  test('the reset marker makes subsequent starts a no-op', () => {
    const storage = new FakeStorage({
      'ramassa.secure-storage-reset.v1': 'complete',
      'ramassa.language': 'ar',
    });

    const result = rebuildLegacyPreferencesStorage(storage, () => {
      throw new AppError('UNEXPECTED-1');
    });

    expect(result).toEqual({ storage, reset: false });
  });
});
