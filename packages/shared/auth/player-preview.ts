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

/**
 * The web admin's hand-off to the player web app (RAPP-372). The admin opens
 * the player web app in a new tab; the tab says it is ready, and the admin
 * sends the credentials and the screen to open, only to the player origin.
 * The tab accepts them only from the admin origin.
 */
export const PLAYER_PREVIEW_READY = 'ramassa.player-preview.ready';
export const PLAYER_PREVIEW_HANDOFF = 'ramassa.player-preview.handoff';
export const PLAYER_PREVIEW_HANDOFF_PATH = '/preview-handoff';

export const playerPreviewHandoffSchema = z.object({
  type: z.literal(PLAYER_PREVIEW_HANDOFF),
  credentials: playerPreviewCredentialsSchema,
  // An app path only, never another site.
  target: z
    .string()
    .regex(/^\/(?!\/)[\w\-/]*$/)
    .nullable(),
});

export type PlayerPreviewHandoff = z.infer<typeof playerPreviewHandoffSchema>;

/** The origin of a configured address, which `postMessage` compares. */
export function originOf(url: string): string {
  return new URL(url).origin;
}

export async function startPlayerPreview(
  client: SupabaseClient<Database>,
): Promise<PlayerPreviewCredentials> {
  const { data, error } = await client.rpc('start_player_preview');
  if (error) {
    throw new AppError(databaseErrorCode(error.message, error.code), { message: error.message });
  }
  return playerPreviewCredentialsSchema.parse(data);
}
