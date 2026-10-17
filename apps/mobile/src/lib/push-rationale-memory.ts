/**
 * "Not now" on the notification explanation, kept for the rest of the app run
 * per account (RAPP-530). The layout that asks is mounted again, and the session
 * object changes on a token refresh, around signing mode and other round trips;
 * kept only in component state, her "not now" was forgotten each time and the
 * explanation came back. The next app start may ask again: that is the later,
 * better moment the decline keeps the one system prompt for.
 */
const declined = new Set<string>();

export function declinePushRationale(userId: string | null): void {
  if (userId !== null) declined.add(userId);
}

export function hasDeclinedPushRationale(userId: string | null): boolean {
  return userId !== null && declined.has(userId);
}
