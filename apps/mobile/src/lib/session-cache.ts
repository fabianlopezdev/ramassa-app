/**
 * When cached server state has to be thrown away because the person changed.
 *
 * The React Query cache holds this participant's DECRYPTED profile row: legal
 * name, document number, phone, address. On a device shared between two women
 * (the SPEC's setting: phones are borrowed, and a social worker's tablet is
 * passed around), a cache that survives a sign-out serves the second woman the
 * first one's record while the refetch is still in flight. `staleTime: 0` does
 * not save it, because React Query renders cached data first and refetches
 * underneath.
 *
 * Pure and separate from the layout so the rule can be tested: this is a
 * privacy boundary, and it should not be provable only by borrowing a phone.
 */

/**
 * @param previousUserId the last signed-in id observed, or `undefined` when
 *   none has been observed yet (first run of the app, nothing is cached).
 * @param nextUserId the id now signed in, or null when signed out.
 */
export function shouldDropCachedServerState(
  previousUserId: string | null | undefined,
  nextUserId: string | null,
): boolean {
  // Nothing observed yet means nothing was fetched yet: there is no cache to
  // drop, and clearing here would throw away a warm start for no gain.
  if (previousUserId === undefined) {
    return false;
  }
  // Compared by ID, never by session object: supabase-js hands out a NEW
  // session on every token refresh, so an identity check on the object would
  // wipe the cache roughly hourly and read as an app that reloads by itself.
  return previousUserId !== nextUserId;
}
