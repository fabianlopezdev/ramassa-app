/**
 * An announcement being written on the phone is kept on the device (RAPP-341),
 * so a call, the app lock or a lost connection does not lose it. One draft per
 * person and per announcement (`new` for a new one), in the encrypted private
 * storage, removed once the save succeeds. A picked photo that is not uploaded
 * yet is not kept: the file may be gone when she comes back.
 */
import { z } from 'zod';
import { ANNOUNCEMENT_CATEGORIES } from '@ramassa/shared/announcements';

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

export interface DraftStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): boolean | void;
}

const draftKey = (userId: string, announcementId: string) =>
  `content.announcement-draft.${userId}.${announcementId}`;

export function readAnnouncementDraft(
  storage: DraftStorage,
  userId: string,
  announcementId: string,
): AnnouncementDraft | null {
  const raw = storage.getString(draftKey(userId, announcementId));
  if (raw === undefined) return null;
  try {
    const parsed = announcementDraftSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeAnnouncementDraft(
  storage: DraftStorage,
  userId: string,
  announcementId: string,
  draft: AnnouncementDraft,
): void {
  storage.set(draftKey(userId, announcementId), JSON.stringify(draft));
}

export function clearAnnouncementDraft(
  storage: DraftStorage,
  userId: string,
  announcementId: string,
): void {
  storage.remove(draftKey(userId, announcementId));
}
