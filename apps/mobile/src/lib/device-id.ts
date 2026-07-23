/**
 * The per-install device id that dedupes push tokens (RAPP-17).
 *
 * `push_tokens` is unique on (user_id, device_id), so this value decides whether
 * a rotated Expo token UPDATES the device's existing row or inserts a duplicate
 * that nothing can ever deliver to. It must therefore be stable for the life of
 * the install, which is why it is persisted rather than derived.
 *
 * Client-generated on purpose: iOS and Android no longer expose a stable
 * hardware identifier to apps, and the RGPD-conscious option is a value that
 * means nothing outside this install and dies with it.
 *
 * NOT a secret and NOT a security boundary: it only groups a user's own rows,
 * and RLS already restricts every write to `auth.uid()`. So the fallback
 * generator below does not need to be cryptographically strong.
 */

import type { MmkvLike } from '@ramassa/shared/supabase';

const DEVICE_ID_KEY = 'ramassa.deviceId';

/**
 * `crypto.randomUUID` when the runtime has it, else a random hex string. Hermes
 * does not ship WebCrypto by default and the app has no crypto dependency, so
 * the fallback keeps this working without pulling one in for a dedupe key.
 */
export function generateDeviceId(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }
  return Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, '0'),
  ).join('-');
}

export function getOrCreateDeviceId(
  storage: MmkvLike,
  generateId: () => string = generateDeviceId,
): string {
  const existing = storage.getString(DEVICE_ID_KEY);
  // An empty string is a corrupt write, not an id: mint a real one.
  if (existing) {
    return existing;
  }
  const created = generateId();
  storage.set(DEVICE_ID_KEY, created);
  return created;
}
