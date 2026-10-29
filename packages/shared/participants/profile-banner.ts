import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError, databaseErrorCode } from '../errors';
import { PROFILE_BANNER_MAX_BYTES } from '../schemas/upload';
import type { Database } from '../types/database';

export const PROFILE_BANNER_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const profileBannerFileSchema = z.object({
  type: z.enum(PROFILE_BANNER_TYPES),
  size: z.number().int().positive().max(PROFILE_BANNER_MAX_BYTES),
});
const bannerSchema = z.object({
  objectKey: z.string().nullable(),
  canEdit: z.boolean(),
  canApplyAll: z.boolean(),
});
export type PlayerProfileBanner = z.infer<typeof bannerSchema>;

export async function fetchPlayerProfileBanner(
  client: SupabaseClient<Database>,
  profileId: string,
) {
  const { data, error } = await client.rpc('get_player_profile_banner', {
    p_profile_id: profileId,
  });
  if (error)
    throw new AppError(databaseErrorCode(error.message, error.code), { message: error.message });
  return bannerSchema.parse(data);
}

export async function savePlayerProfileBanner(
  client: SupabaseClient<Database>,
  profileId: string,
  objectKey: string,
  allPlayers: boolean,
) {
  const { data, error } = await client.rpc('set_player_profile_banner', {
    p_profile_id: profileId,
    p_object_key: objectKey,
    p_all_players: allPlayers,
  });
  if (error)
    throw new AppError(databaseErrorCode(error.message, error.code), { message: error.message });
  return bannerSchema.parse(data);
}
