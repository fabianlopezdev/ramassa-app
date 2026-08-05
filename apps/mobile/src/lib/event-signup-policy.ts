import { AppError } from '@ramassa/shared/errors';

export interface EventSignupActionAvailability {
  readonly hasEvent: boolean;
  readonly hasNextState: boolean;
  readonly isFull: boolean;
  readonly hasActiveSignup: boolean;
}

/**
 * Capacity is authoritative only at the database boundary. A full-looking event
 * remains actionable so the player receives the typed server result if a place
 * changed between the read and the tap.
 */
export function isEventSignupActionDisabled(availability: EventSignupActionAvailability): boolean {
  return !availability.hasEvent || !availability.hasNextState;
}

/** Signup changes are never queued because capacity can change while offline. */
export function requireEventSignupOnline(isOnline: boolean): void {
  if (!isOnline) throw new AppError('NETWORK-1');
}
