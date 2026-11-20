import { AppError } from '@ramassa/shared/errors';

export interface EventSignupActionAvailability {
  readonly hasEvent: boolean;
  readonly hasNextState: boolean;
  readonly isFull: boolean;
  readonly hasActiveSignup: boolean;
}

/**
 * A full activity turns the action off for a player who has not joined
 * (RAPP-883), so she is not invited to tap and then refused. One who has
 * joined keeps it, to cancel. The screen keeps its places fresh
 * (`useFreshPlayerEvents`); the database still has the last word when two
 * players tap in the same seconds, and answers `EVENTS-1`.
 */
export function isEventSignupActionDisabled(availability: EventSignupActionAvailability): boolean {
  if (!availability.hasEvent || !availability.hasNextState) return true;
  return availability.isFull && !availability.hasActiveSignup;
}

/** Signup changes are never queued because capacity can change while offline. */
export function requireEventSignupOnline(isOnline: boolean): void {
  if (!isOnline) throw new AppError('NETWORK-1');
}
