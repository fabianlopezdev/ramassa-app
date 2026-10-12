/**
 * Permission changes reach an open session at once (RAPP-237). Every permission
 * write moves the person's single team_member_access row, and that table is in
 * the Realtime publication; row security lets her read her own row, so this
 * channel hears only her changes. The caller reloads her permissions.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { realtimeTopic } from '../lib/realtime-topic';
import type { Database } from '../types/database';

export function subscribeToOwnPermissionChanges(
  client: SupabaseClient<Database>,
  profileId: string,
  onChange: () => void,
): () => void {
  // The id goes into a filter string, so anything but a uuid opens nothing.
  const parsed = z.uuid().safeParse(profileId);
  if (!parsed.success) return () => undefined;
  const id = parsed.data;
  const channel = client
    .channel(realtimeTopic(`permissions:${id}`))
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'team_member_access', filter: `profile_id=eq.${id}` },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}

/** Same codes, in any order. */
export function isSamePermissionSet(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean {
  if (left.size !== right.size) return false;
  for (const code of left) if (!right.has(code)) return false;
  return true;
}
