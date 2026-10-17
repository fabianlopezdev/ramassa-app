import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {
  createMMKV,
  deleteMMKV,
  existsMMKV,
  type Configuration,
  type MMKV,
} from 'react-native-mmkv';
import { NitroModules, type HybridObject } from 'react-native-nitro-modules';
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

// react-native-mmkv's own native factory, reached through Nitro because the
// package does not export it. Its createMMKV returns a bare handle: unlike the
// package's createMMKV it adds no AppState listeners, so a store opened with it
// can be deleted without leaving a handle that the next foreground calls into
// (RAPP-501).
interface NativeMMKVFactory extends HybridObject<{ ios: 'c++'; android: 'c++' }> {
  createMMKV(configuration: Configuration): MMKV;
}

let nativeFactory: NativeMMKVFactory | undefined;

function inspectMMKV(configuration: Configuration): MMKV {
  // existsMMKV initializes MMKV through react-native-mmkv first.
  existsMMKV(configuration.id);
  nativeFactory ??= NitroModules.createHybridObject<NativeMMKVFactory>('MMKVFactory');
  return nativeFactory.createMMKV(configuration);
}

const protectedStorageFactory: ProtectedStorageFactory = {
  exists: existsMMKV,
  inspect: (configuration) => inspectMMKV(configuration),
  create: (configuration) => createMMKV(configuration),
  delete: deleteMMKV,
};

const randomBytes = (count: number): Uint8Array => Crypto.getRandomBytes(count);

const LEGACY_PREFERENCES_ID = 'mmkv.default';

export const preferencesStorage = rebuildLegacyPreferencesStorage({
  inspect: () => inspectMMKV({ id: LEGACY_PREFERENCES_ID }),
  open: () => createMMKV({ id: LEGACY_PREFERENCES_ID }),
  delete: () => void deleteMMKV(LEGACY_PREFERENCES_ID),
}).storage as MMKV;

export const authStorage = createProtectedStorage({
  id: 'ramassa.auth.v1',
  keyName: 'ramassa.auth.key.v1',
  vault: keyVault,
  factory: protectedStorageFactory,
  randomBytes,
}).storage as MMKV;

// The preview player session (RAPP-371), apart from her own session so that
// leaving the preview leaves hers as it was. Kept on the device, because a
// right-to-left preview language restarts the app.
export const previewAuthStorage = createProtectedStorage({
  id: 'ramassa.preview-auth.v1',
  keyName: 'ramassa.preview-auth.key.v1',
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
