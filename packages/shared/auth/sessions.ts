/**
 * Remote sign-out (RAPP-234). A sign-out "everywhere" sets the person's
 * sessions-valid-after time, so the database denies every access token issued
 * before it at once. The apps ask whether their own session is still current
 * and sign out on this device when it is not.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from '../errors';
import type { Database } from '../types/database';

type Client = SupabaseClient<Database>;

export async function signOutEverywhere(client: Client, profileId: string): Promise<void> {
  const { error } = await client.rpc('sign_out_everywhere', {
    p_profile_id: z.uuid().parse(profileId),
  });
  if (error) throw new AppError('DB-1', { message: error.message });
}

/**
 * False only when the database says this token was issued before a remote
 * sign-out. A failed check (offline) is not evidence of one, so it counts as
 * current: the database still denies a stale token on every request.
 */
export async function isSessionCurrent(client: Client): Promise<boolean> {
  const { data, error } = await client.rpc('my_session_is_current');
  if (error) return true;
  return data !== false;
}
