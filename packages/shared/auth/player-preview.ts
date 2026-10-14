/**
 * Starting the player preview (RAPP-371, ADR-027). The database checks that the
 * caller is a team member with a verified second factor, and returns the
 * address and a new password of the organization's preview account. The app
 * signs in with them on a second client, so the caller's own session is
 * untouched.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError, databaseErrorCode } from '../errors';
import type { Database } from '../types/database';

const playerPreviewCredentialsSchema = z.object({
  email: z.string().trim().min(3).max(320),
  password: z.string().min(16).max(72),
});

export type PlayerPreviewCredentials = z.infer<typeof playerPreviewCredentialsSchema>;

export async function startPlayerPreview(
  client: SupabaseClient<Database>,
): Promise<PlayerPreviewCredentials> {
  const { data, error } = await client.rpc('start_player_preview');
  if (error) {
    throw new AppError(databaseErrorCode(error.message, error.code), { message: error.message });
  }
  return playerPreviewCredentialsSchema.parse(data);
}
