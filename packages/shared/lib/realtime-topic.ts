/**
 * A Realtime channel name that is new for every subscription (RAPP-245).
 *
 * supabase-js hands back the existing channel when a second subscriber asks
 * for the same name, and adding a listener to a channel that is already
 * subscribed throws ("cannot add postgres_changes callbacks ... after
 * subscribe()"). Two parts of one screen that both want the unread count did
 * exactly that, and the screen crashed. A sequence number per subscription
 * keeps every subscriber on its own channel.
 */
let sequence = 0;

export function realtimeTopic(base: string): string {
  sequence += 1;
  return `${base}#${sequence}`;
}
