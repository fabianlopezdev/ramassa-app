import { describe, expect, test } from 'bun:test';
import {
  MAX_STORY_IMAGES,
  participantStoryDraftSchema,
  participantStorySubmissionSchema,
  STORY_CONSENT_VERSION,
} from './story-submission';
import { tokens } from './tokens';

const attachment = {
  uri: 'file:///story.jpg',
  contentType: 'image/jpeg' as const,
  byteLength: tokens.upload.maxImageBytes,
  width: 1200,
  height: 800,
};

describe('participant story validation', () => {
  test('accepts a story in the participant language with explicit publication consent', () => {
    expect(
      participantStorySubmissionSchema.safeParse({
        categoryId: '5eed0000-0000-4000-8004-000000000004',
        authorId: '5eed0000-0000-4000-8000-000000000011',
        language: 'ar',
        title: 'قصتي مع الفريق',
        story: 'وجدت مساحة آمنة للعب والتعلم مع الفريق.',
        imageObjectKeys: ['ramassa/stories/photo-1.jpg'],
        publicationConsent: true,
        consentVersion: STORY_CONSENT_VERSION,
      }).success,
    ).toBe(true);
  });

  test('requires consent and enforces title, story, and image-count caps', () => {
    const base = {
      categoryId: '5eed0000-0000-4000-8004-000000000004',
      authorId: '5eed0000-0000-4000-8000-000000000011',
      language: 'ca' as const,
      title: 'La meva història',
      story: 'Em vaig sentir part de l’equip.',
      imageObjectKeys: [],
      publicationConsent: true as const,
      consentVersion: STORY_CONSENT_VERSION,
    };

    expect(
      participantStorySubmissionSchema.safeParse({ ...base, publicationConsent: false }).success,
    ).toBe(false);
    expect(
      participantStorySubmissionSchema.safeParse({ ...base, title: 't'.repeat(201) }).success,
    ).toBe(false);
    expect(
      participantStorySubmissionSchema.safeParse({ ...base, story: 's'.repeat(10_001) }).success,
    ).toBe(false);
    expect(
      participantStorySubmissionSchema.safeParse({
        ...base,
        imageObjectKeys: Array.from({ length: MAX_STORY_IMAGES + 1 }, (_, index) => `key-${index}`),
      }).success,
    ).toBe(false);
  });

  test('rejects uncompressed, oversized, and excessive draft images', () => {
    expect(
      participantStoryDraftSchema.safeParse({
        title: 'A title',
        story: 'A complete story',
        images: [{ ...attachment, byteLength: tokens.upload.maxImageBytes + 1 }],
        publicationConsent: true,
      }).success,
    ).toBe(false);
    expect(
      participantStoryDraftSchema.safeParse({
        title: 'A title',
        story: 'A complete story',
        images: Array.from({ length: MAX_STORY_IMAGES + 1 }, () => attachment),
        publicationConsent: true,
      }).success,
    ).toBe(false);
  });
});
