import { AppError } from '@ramassa/shared/errors';

export interface StorageLike {
  getAllKeys(): string[];
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): boolean;
  trim(): void;
}

export interface StorageKeyVault {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

interface ProtectedStorageConfiguration {
  id: string;
  encryptionKey: string;
  encryptionType: 'AES-256';
  recoveryStrategy: 'discard-on-error';
}

// Deleting a store frees its native MMKV instance, but every JS handle opened
// on it keeps a raw pointer to it. react-native-mmkv's createMMKV also registers
// each handle with AppState, which calls checkContentChanged() on it when the
// app becomes active, so a deleted store with a live handle aborts the app on
// the next foreground (RAPP-501). `inspect` opens a handle with no listeners,
// for a store that might be deleted. `create` opens the live handle, and its
// id is never deleted afterwards.
export interface ProtectedStorageFactory {
  exists(id: string): boolean;
  inspect(configuration: ProtectedStorageConfiguration): StorageLike;
  create(configuration: ProtectedStorageConfiguration): StorageLike;
  delete(id: string): boolean;
}

export interface LegacyPreferencesStore {
  inspect(): StorageLike;
  open(): StorageLike;
  delete(): void;
}

export type ProtectedStorageRecovery =
  'fresh' | 'reopened' | 'reset-invalid-key' | 'reset-missing-key' | 'reset-unreadable-store';

const ENCRYPTION_KEY_RANDOM_BYTES = 24;
const ENCRYPTION_KEY_ASCII_BYTES = 32;
const STORAGE_KEY_SENTINEL = 'ramassa.storage-key-check.v1';
const STORAGE_KEY_SENTINEL_VALUE = 'protected';
const LEGACY_RESET_MARKER = 'ramassa.secure-storage-reset.v1';
const LEGACY_RESET_COMPLETE = 'complete';

const LOW_SENSITIVITY_KEYS = new Set([
  'ramassa.language',
  'ramassa.haptics.enabled',
  'ramassa.deviceId',
]);

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeBase64(bytes: Uint8Array): string {
  let result = '';

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const combined = (first << 16) | (second << 8) | third;

    result += BASE64_ALPHABET[(combined >>> 18) & 63];
    result += BASE64_ALPHABET[(combined >>> 12) & 63];
    result += index + 1 < bytes.length ? BASE64_ALPHABET[(combined >>> 6) & 63] : '=';
    result += index + 2 < bytes.length ? BASE64_ALPHABET[combined & 63] : '=';
  }

  return result;
}

function isValidEncryptionKey(value: string | null): value is string {
  return (
    value !== null &&
    value.length === ENCRYPTION_KEY_ASCII_BYTES &&
    /^[A-Za-z0-9+/]{32}$/.test(value)
  );
}

export function createStorageEncryptionKey(randomBytes: (count: number) => Uint8Array): string {
  const bytes = randomBytes(ENCRYPTION_KEY_RANDOM_BYTES);
  if (bytes.length !== ENCRYPTION_KEY_RANDOM_BYTES) {
    throw new AppError('UNEXPECTED-1', {
      message: 'Storage encryption key generation returned an unexpected byte count.',
    });
  }

  const key = encodeBase64(bytes);
  if (!isValidEncryptionKey(key)) {
    throw new AppError('UNEXPECTED-1', {
      message: 'Storage encryption key generation returned invalid key material.',
    });
  }
  return key;
}

function encryptedStoreConfiguration(
  id: string,
  encryptionKey: string,
): ProtectedStorageConfiguration {
  return {
    id,
    encryptionKey,
    encryptionType: 'AES-256',
    recoveryStrategy: 'discard-on-error',
  };
}

function createEncryptedStore(
  factory: ProtectedStorageFactory,
  id: string,
  encryptionKey: string,
): StorageLike {
  return factory.create(encryptedStoreConfiguration(id, encryptionKey));
}

function replaceStore(options: {
  factory: ProtectedStorageFactory;
  id: string;
  keyName: string;
  vault: StorageKeyVault;
  randomBytes: (count: number) => Uint8Array;
}): StorageLike {
  options.factory.delete(options.id);
  const encryptionKey = createStorageEncryptionKey(options.randomBytes);
  options.vault.set(options.keyName, encryptionKey);
  const storage = createEncryptedStore(options.factory, options.id, encryptionKey);
  storage.set(STORAGE_KEY_SENTINEL, STORAGE_KEY_SENTINEL_VALUE);
  return storage;
}

export function createProtectedStorage(options: {
  id: string;
  keyName: string;
  vault: StorageKeyVault;
  factory: ProtectedStorageFactory;
  randomBytes: (count: number) => Uint8Array;
}): { storage: StorageLike; recovery: ProtectedStorageRecovery } {
  const storeExists = options.factory.exists(options.id);
  const storedKey = options.vault.get(options.keyName);

  if (storeExists && storedKey === null) {
    return { storage: replaceStore(options), recovery: 'reset-missing-key' };
  }

  if (storeExists && !isValidEncryptionKey(storedKey)) {
    return { storage: replaceStore(options), recovery: 'reset-invalid-key' };
  }

  if (!storeExists) {
    const encryptionKey = isValidEncryptionKey(storedKey)
      ? storedKey
      : createStorageEncryptionKey(options.randomBytes);
    if (!isValidEncryptionKey(storedKey)) options.vault.set(options.keyName, encryptionKey);
    const storage = createEncryptedStore(options.factory, options.id, encryptionKey);
    storage.set(STORAGE_KEY_SENTINEL, STORAGE_KEY_SENTINEL_VALUE);
    return { storage, recovery: 'fresh' };
  }

  if (!isValidEncryptionKey(storedKey)) {
    return { storage: replaceStore(options), recovery: 'reset-invalid-key' };
  }

  const probe = options.factory.inspect(encryptedStoreConfiguration(options.id, storedKey));
  if (probe.getString(STORAGE_KEY_SENTINEL) !== STORAGE_KEY_SENTINEL_VALUE) {
    return { storage: replaceStore(options), recovery: 'reset-unreadable-store' };
  }

  return {
    storage: createEncryptedStore(options.factory, options.id, storedKey),
    recovery: 'reopened',
  };
}

function isLowSensitivityKey(key: string): boolean {
  return LOW_SENSITIVITY_KEYS.has(key) || key.startsWith('ramassa.pushToken.');
}

export function rebuildLegacyPreferencesStorage(store: LegacyPreferencesStore): {
  storage: StorageLike;
  reset: boolean;
} {
  const legacy = store.inspect();
  if (legacy.getString(LEGACY_RESET_MARKER) === LEGACY_RESET_COMPLETE) {
    return { storage: store.open(), reset: false };
  }

  const preserved = legacy
    .getAllKeys()
    .filter(isLowSensitivityKey)
    .flatMap((key) => {
      const value = legacy.getString(key);
      return value === undefined ? [] : [[key, value] as const];
    });
  // Delete the file so the legacy plaintext values are gone from disk.
  // MMKV clearAll() only truncates, which leaves them in the first page.
  store.delete();
  const replacement = store.open();
  for (const [key, value] of preserved) replacement.set(key, value);
  replacement.set(LEGACY_RESET_MARKER, LEGACY_RESET_COMPLETE);
  return { storage: replacement, reset: true };
}
