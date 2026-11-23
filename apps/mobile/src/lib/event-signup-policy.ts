import { AppError } from '@ramassa/shared/errors';
import type { EventSignupAnswer } from '@ramassa/shared/events';

export interface EventAnswerAvailability {
  /** The answer the button gives. */
  readonly answer: EventSignupAnswer;
  /** The answer she has given, or null before she answers. */
  readonly currentAnswer: EventSignupAnswer | null;
  readonly isFull: boolean;
}

/**
 * A full activity turns "yes" off for a player who has not said yes
 * (RAPP-883), so she is not invited to tap and then refused. "No" stays on,
 * because a no takes no place (RAPP-908); one who said yes keeps both, to
 * change her answer. The screen keeps its places fresh
 * (`useFreshPlayerEvents`); the database still has the last word when two
 * players tap in the same seconds, and answers `EVENTS-1`.
 */
export function isEventAnswerDisabled(availability: EventAnswerAvailability): boolean {
  return (
    availability.answer === 'yes' && availability.isFull && availability.currentAnswer !== 'yes'
  );
}

/** Signup changes are never queued because capacity can change while offline. */
export function requireEventSignupOnline(isOnline: boolean): void {
  if (!isOnline) throw new AppError('NETWORK-1');
}
