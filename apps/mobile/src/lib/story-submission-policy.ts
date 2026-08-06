import { AppError } from '@ramassa/shared/errors';

/**
 * Consent and authenticated media uploads are one online transaction from the
 * player's point of view. They are never queued for a later identity or sent
 * without showing the player a clear connection failure.
 */
export function requireStorySubmissionOnline(isOnline: boolean): void {
  if (!isOnline) throw new AppError('NETWORK-1');
}
