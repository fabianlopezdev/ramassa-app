import { createMMKV, type MMKV } from 'react-native-mmkv';

export const preferencesStorage: MMKV = createMMKV({ id: 'ramassa.preferences.v1' });
export const authStorage: MMKV = createMMKV({ id: 'ramassa.auth.v1' });
export const privateStorage: MMKV = createMMKV({ id: 'ramassa.private.v1' });
