import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { createMMKV, deleteMMKV, existsMMKV, type MMKV } from 'react-native-mmkv';
import {
  createProtectedStorage,
  rebuildLegacyPreferencesStorage,
  type ProtectedStorageFactory,
  type StorageKeyVault,
} from './storage-security';

const KEYCHAIN_SERVICE = 'ramassa.storage-keys.v1';

const keyVault: StorageKeyVault = {
  get: (key) =>
    SecureStore.getItem(key, {
      keychainService: KEYCHAIN_SERVICE,
    }),
  set: (key, value) =>
    SecureStore.setItem(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      keychainService: KEYCHAIN_SERVICE,
    }),
};

const protectedStorageFactory: ProtectedStorageFactory = {
  exists: existsMMKV,
  create: (configuration) => createMMKV(configuration),
  delete: deleteMMKV,
};

const randomBytes = (count: number): Uint8Array => Crypto.getRandomBytes(count);

const legacyPreferencesStorage = createMMKV();
export const preferencesStorage = rebuildLegacyPreferencesStorage(legacyPreferencesStorage, () => {
  deleteMMKV('mmkv.default');
  return createMMKV();
}).storage as MMKV;

export const authStorage = createProtectedStorage({
  id: 'ramassa.auth.v1',
  keyName: 'ramassa.auth.key.v1',
  vault: keyVault,
  factory: protectedStorageFactory,
  randomBytes,
}).storage as MMKV;

export const privateStorage = createProtectedStorage({
  id: 'ramassa.private.v1',
  keyName: 'ramassa.private.key.v1',
  vault: keyVault,
  factory: protectedStorageFactory,
  randomBytes,
}).storage as MMKV;
