import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from './errors';
import { tokens } from './tokens';
import type { Database } from './types/database';

export const MEDIA_CONSENT_VERSION = 'gallery-consent-v1';
export const MEDIA_CAPTION_MAX_LENGTH = 500;
export const mediaPrivacySchema = z.enum(['community', 'staff_only']);
export const mediaFileTypeSchema = z.enum(['image', 'video']);
export type MediaPrivacy = z.infer<typeof mediaPrivacySchema>;
export type MediaFileType = z.infer<typeof mediaFileTypeSchema>;

const UUID_PATH_SEGMENT = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}';
const galleryFileObjectKeySchema = z
  .string()
  .regex(
    new RegExp(
      `^${UUID_PATH_SEGMENT}/gallery/${UUID_PATH_SEGMENT}/[0-9]{4}/(?:0[1-9]|1[0-2])/[0-9a-f]{32}\\.(?:jpg|png|webp|mp4|mov|pdf)$`,
      'i',
    ),
  );
const galleryThumbnailObjectKeySchema = z
  .string()
  .regex(
    new RegExp(
      `^${UUID_PATH_SEGMENT}/gallery/${UUID_PATH_SEGMENT}/[0-9]{4}/(?:0[1-9]|1[0-2])/[0-9a-f]{32}\\.(?:jpg|png|webp)$`,
      'i',
    ),
  );

export const mediaItemInputSchema = z
  .object({
    fileObjectKey: galleryFileObjectKeySchema,
    thumbnailObjectKey: galleryThumbnailObjectKeySchema.nullable(),
    fileType: mediaFileTypeSchema,
    fileSize: z.int().positive(),
    caption: z
      .string()
      .trim()
      .max(MEDIA_CAPTION_MAX_LENGTH)
      .transform((value) => value || null),
    privacyLevel: mediaPrivacySchema,
    consentAcknowledged: z.literal(true),
    consentVersion: z.string().trim().min(1).max(64),
  })
  .superRefine((value, context) => {
    const maximum =
      value.fileType === 'video' ? tokens.upload.maxVideoBytes : tokens.upload.maxImageBytes;
    if (value.fileSize > maximum) {
      context.addIssue({
        code: 'too_big',
        origin: 'number',
        maximum,
        inclusive: true,
        path: ['fileSize'],
        message: `Media exceeds the ${maximum}-byte limit`,
      });
    }
  });

export type MediaItemInput = z.input<typeof mediaItemInputSchema>;

const mediaItemRowSchema = z.object({
  id: z.uuid(),
  org_id: z.uuid(),
  uploaded_by: z.uuid(),
  uploader_first_name: z.string().min(1),
  file_url: galleryFileObjectKeySchema,
  thumbnail_url: galleryThumbnailObjectKeySchema.nullable(),
  file_type: mediaFileTypeSchema,
  file_size: z.number().int().positive(),
  caption: z.string().nullable(),
  privacy_level: mediaPrivacySchema,
  moderation_state: z.enum(['visible', 'hidden_pending_review', 'hidden']),
  flag_count: z.number().int().nonnegative(),
  consent_acknowledged_at: z.iso.datetime({ offset: true }),
  consent_version: z.string().min(1),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

export type MediaItemRow = z.infer<typeof mediaItemRowSchema>;

const MEDIA_ITEM_COLUMNS =
  'id, org_id, uploaded_by, uploader_first_name, file_url, thumbnail_url, file_type, file_size, caption, privacy_level, moderation_state, flag_count, consent_acknowledged_at, consent_version, created_at, updated_at';

export async function fetchMediaItems(
  client: SupabaseClient<Database>,
  options: { readonly signal?: AbortSignal } = {},
): Promise<readonly MediaItemRow[]> {
  let query = client
    .from('media_items')
    .select(MEDIA_ITEM_COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  if (options.signal !== undefined) query = query.abortSignal(options.signal);
  const { data, error } = await query;
  if (error !== null) throw new AppError('DB-1', { message: error.message });
  return mediaItemRowSchema.array().parse(data ?? []);
}

export async function fetchMediaItem(
  client: SupabaseClient<Database>,
  mediaItemId: string,
  options: { readonly signal?: AbortSignal } = {},
): Promise<MediaItemRow> {
  let query = client
    .from('media_items')
    .select(MEDIA_ITEM_COLUMNS)
    .eq('id', z.uuid().parse(mediaItemId));
  if (options.signal !== undefined) query = query.abortSignal(options.signal);
  const { data, error } = await query.single();
  if (error !== null) throw new AppError('DB-1', { message: error.message });
  return mediaItemRowSchema.parse(data);
}

export async function createMediaItem(
  client: SupabaseClient<Database>,
  rawInput: MediaItemInput,
): Promise<string> {
  const input = mediaItemInputSchema.parse(rawInput);
  const { data, error } = await client.rpc('create_media_item', {
    p_file_url: input.fileObjectKey,
    p_thumbnail_url: input.thumbnailObjectKey,
    p_file_type: input.fileType,
    p_file_size: input.fileSize,
    p_caption: input.caption,
    p_privacy_level: input.privacyLevel,
    p_consent_acknowledged: input.consentAcknowledged,
    p_consent_version: input.consentVersion,
  } as never);
  if (error !== null) throw new AppError('DB-1', { message: error.message });
  return z.uuid().parse(data);
}

export async function setMediaItemPrivacy(
  client: SupabaseClient<Database>,
  mediaItemId: string,
  privacyLevel: MediaPrivacy,
): Promise<void> {
  const { error } = await client.rpc('set_media_item_privacy', {
    p_media_item_id: z.uuid().parse(mediaItemId),
    p_privacy_level: mediaPrivacySchema.parse(privacyLevel),
  });
  if (error !== null) throw new AppError('DB-1', { message: error.message });
}
