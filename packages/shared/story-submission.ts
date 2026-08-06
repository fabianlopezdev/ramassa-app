import { z } from 'zod';
import { languageCodeSchema } from './schemas/language';
import { uploadContentTypeSchema } from './schemas/upload';
import { tokens } from './tokens';

export const MAX_STORY_IMAGES = 3;
export const STORY_CONSENT_VERSION = 'story-publication-v1';

const storyTitleSchema = z.string().trim().min(1).max(200);
const storyTextSchema = z.string().trim().min(1).max(10_000);
const storyImageContentTypeSchema = uploadContentTypeSchema.extract([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const participantStoryAttachmentSchema = z.object({
  uri: z.string().trim().min(1),
  contentType: storyImageContentTypeSchema,
  byteLength: z.int().positive().max(tokens.upload.maxImageBytes),
  width: z.int().positive().max(tokens.upload.maxImageDimension),
  height: z.int().positive().max(tokens.upload.maxImageDimension),
});

export type ParticipantStoryAttachment = z.infer<typeof participantStoryAttachmentSchema>;

export const participantStoryDraftSchema = z.object({
  title: storyTitleSchema,
  story: storyTextSchema,
  images: z.array(participantStoryAttachmentSchema).max(MAX_STORY_IMAGES),
  publicationConsent: z.literal(true),
});

export type ParticipantStoryDraft = z.infer<typeof participantStoryDraftSchema>;

export const participantStorySubmissionSchema = z.object({
  categoryId: z.uuid(),
  authorId: z.uuid(),
  language: languageCodeSchema,
  title: storyTitleSchema,
  story: storyTextSchema,
  imageObjectKeys: z.array(z.string().trim().min(1).max(2_000)).max(MAX_STORY_IMAGES),
  publicationConsent: z.literal(true),
  consentVersion: z.literal(STORY_CONSENT_VERSION),
});

export type ParticipantStorySubmission = z.infer<typeof participantStorySubmissionSchema>;
