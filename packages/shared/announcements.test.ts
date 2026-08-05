import { describe, expect, test } from 'bun:test';
import {
  announcementInputSchema,
  areAnnouncementTranslationsApproved,
  getAnnouncementLifecycle,
  isContentVisible,
} from './announcements';
import {
  approveTranslation,
  createTranslationReview,
  type TranslationReview,
} from './translation/index';

const now = new Date('2026-08-04T12:00:00.000Z');

const completeText = {
  ca: 'Entrenament cancel·lat',
  es: 'Entrenamiento cancelado',
  en: 'Training cancelled',
  ar: 'تم إلغاء التدريب',
  fa: 'تمرین لغو شد',
} as const;

function approvedReview(sourceText: string): TranslationReview {
  let review = createTranslationReview({
    sourceLanguage: 'ca',
    sourceText,
    translations: {
      es: completeText.es,
      en: completeText.en,
      ar: completeText.ar,
      fa: completeText.fa,
    },
  });
  for (const language of ['es', 'en', 'ar', 'fa'] as const) {
    review = approveTranslation(review, language);
  }
  return review;
}

describe('publishable content visibility', () => {
  test('a draft is never visible even when its date window is live', () => {
    expect(
      isContentVisible(
        {
          status: 'draft',
          publishedAt: '2026-08-04T11:00:00.000Z',
          expiresAt: null,
        },
        now,
      ),
    ).toBe(false);
  });

  test('pre-publish, live, expired, and null-expiry windows follow one boundary rule', () => {
    expect(
      isContentVisible(
        {
          status: 'published',
          publishedAt: '2026-08-04T12:00:01.000Z',
          expiresAt: null,
        },
        now,
      ),
    ).toBe(false);
    expect(
      isContentVisible(
        {
          status: 'published',
          publishedAt: '2026-08-04T12:00:00.000Z',
          expiresAt: null,
        },
        now,
      ),
    ).toBe(true);
    expect(
      isContentVisible(
        {
          status: 'published',
          publishedAt: '2026-08-04T11:00:00.000Z',
          expiresAt: '2026-08-04T12:00:00.000Z',
        },
        now,
      ),
    ).toBe(false);
  });

  test('the list lifecycle uses the same visibility boundaries', () => {
    expect(
      getAnnouncementLifecycle({ status: 'draft', publishedAt: null, expiresAt: null }, now),
    ).toBe('draft');
    expect(
      getAnnouncementLifecycle(
        { status: 'published', publishedAt: '2026-08-05T12:00:00.000Z', expiresAt: null },
        now,
      ),
    ).toBe('scheduled');
    expect(
      getAnnouncementLifecycle(
        {
          status: 'published',
          publishedAt: '2026-08-03T12:00:00.000Z',
          expiresAt: '2026-08-04T12:00:00.000Z',
        },
        now,
      ),
    ).toBe('expired');
    expect(
      getAnnouncementLifecycle(
        { status: 'published', publishedAt: '2026-08-03T12:00:00.000Z', expiresAt: null },
        now,
      ),
    ).toBe('published');
  });
});

describe('announcement publication validation', () => {
  test('a Catalan-only draft can be saved before translation', () => {
    expect(
      announcementInputSchema.safeParse({
        category: 'training',
        title: { ca: completeText.ca },
        body: { ca: 'Ens veiem dijous.' },
        imageUrl: null,
        imageAlt: null,
        isPinned: false,
        status: 'draft',
        publishedAt: null,
        expiresAt: null,
      }).success,
    ).toBe(true);
  });

  test('publishing refuses a missing language and an invalid schedule', () => {
    const incomplete = { ...completeText, fa: undefined };
    expect(
      announcementInputSchema.safeParse({
        category: 'info',
        title: incomplete,
        body: completeText,
        imageUrl: null,
        imageAlt: null,
        isPinned: false,
        status: 'published',
        publishedAt: now.toISOString(),
        expiresAt: null,
      }).success,
    ).toBe(false);
    expect(
      announcementInputSchema.safeParse({
        category: 'info',
        title: completeText,
        body: completeText,
        imageUrl: null,
        imageAlt: null,
        isPinned: false,
        status: 'published',
        publishedAt: '2026-08-05T12:00:00.000Z',
        expiresAt: '2026-08-05T11:59:59.000Z',
      }).success,
    ).toBe(false);
  });

  test('an attached image requires alt text in every published language', () => {
    expect(
      announcementInputSchema.safeParse({
        category: 'social',
        title: completeText,
        body: completeText,
        imageUrl: 'org/announcements/staff/photo.jpg',
        imageAlt: { ca: 'Jugadores al camp' },
        isPinned: true,
        status: 'published',
        publishedAt: now.toISOString(),
        expiresAt: null,
      }).success,
    ).toBe(false);
    expect(
      announcementInputSchema.safeParse({
        category: 'social',
        title: completeText,
        body: completeText,
        imageUrl: 'org/announcements/staff/photo.jpg',
        imageAlt: completeText,
        isPinned: true,
        status: 'published',
        publishedAt: now.toISOString(),
        expiresAt: null,
      }).success,
    ).toBe(true);
  });
});

describe('announcement review state', () => {
  test('generated drafts cannot publish until title and body are approved', () => {
    const titleReview = createTranslationReview({
      sourceLanguage: 'ca',
      sourceText: completeText.ca,
      translations: completeText,
    });
    const bodyReview = approvedReview('Ens veiem dijous.');

    expect(
      areAnnouncementTranslationsApproved({ titleReview, bodyReview, imageAltReview: undefined }),
    ).toBe(false);
    expect(
      areAnnouncementTranslationsApproved({
        titleReview: approvedReview(completeText.ca),
        bodyReview,
        imageAltReview: undefined,
      }),
    ).toBe(true);
  });

  test('adding an image adds alt text review to the publication gate', () => {
    const titleReview = approvedReview(completeText.ca);
    const bodyReview = approvedReview('Ens veiem dijous.');
    const imageAltReview = createTranslationReview({
      sourceLanguage: 'ca',
      sourceText: 'Jugadores al camp',
      translations: completeText,
    });

    expect(areAnnouncementTranslationsApproved({ titleReview, bodyReview, imageAltReview })).toBe(
      false,
    );
    expect(
      areAnnouncementTranslationsApproved({
        titleReview,
        bodyReview,
        imageAltReview: approvedReview('Jugadores al camp'),
      }),
    ).toBe(true);
  });
});
