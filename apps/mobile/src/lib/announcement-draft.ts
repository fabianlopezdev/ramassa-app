/**
 * An announcement being written on the phone is kept on the device (RAPP-341),
 * through the shared draft store (`content-draft.ts`). A picked photo that is
 * not uploaded yet is not kept: the file may be gone when she comes back.
 */
import { z } from 'zod';
import { ANNOUNCEMENT_CATEGORIES } from '@ramassa/shared/announcements';
import { createDraftStore } from './content-draft';

export const PUBLISH_MODES = ['draft', 'now', 'scheduled'] as const;
export type PublishMode = (typeof PUBLISH_MODES)[number];

const translationsSchema = z.record(z.string(), z.string());

const announcementDraftSchema = z.object({
  category: z.enum(ANNOUNCEMENT_CATEGORIES),
  title: z.string(),
  body: z.string(),
  imageAlt: z.string(),
  imageUrl: z.string().nullable(),
  isPinned: z.boolean(),
  mode: z.enum(PUBLISH_MODES),
  publishedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  /** The corrected translations per language; she approves them again on return. */
  titleTranslations: translationsSchema.optional(),
  bodyTranslations: translationsSchema.optional(),
  imageAltTranslations: translationsSchema.optional(),
});

export type AnnouncementDraft = z.infer<typeof announcementDraftSchema>;

const store = createDraftStore('announcement', announcementDraftSchema);

export const readAnnouncementDraft = store.read;
export const writeAnnouncementDraft = store.write;
export const clearAnnouncementDraft = store.clear;
