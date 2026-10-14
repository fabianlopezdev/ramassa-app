/**
 * Set just before the player preview swaps the app's tree (RAPP-371), so what
 * mounts next knows she is holding the phone: the app lock continues her
 * unlocked session, and the push prompt she already saw is not shown again. A
 * restart clears it with the rest of the JavaScript state.
 */
type HandoverConsumer = 'app-lock' | 'push-rationale';

const pending = new Set<HandoverConsumer>();

export function markPreviewHandover(): void {
  pending.add('app-lock');
  pending.add('push-rationale');
}

/** True once per consumer, for the first one that mounts after a hand-over. */
export function takePreviewHandover(consumer: HandoverConsumer): boolean {
  return pending.delete(consumer);
}
