import { createMMKV, type MMKV } from 'react-native-mmkv';

/**
 * The app-wide MMKV instance. Adapters built from it (language storage now,
 * Supabase session storage when auth lands) are what the shared factories
 * receive; nothing outside `src/lib` touches MMKV directly.
 */
export const mmkvStorage: MMKV = createMMKV();
