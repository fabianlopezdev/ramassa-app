import { describe, expect, test } from 'bun:test';
import {
  canTransitionStoryStatus,
  knowledgeArticleInputSchema,
  normalizeVideoEmbedUrl,
  resolveLocalizedKnowledgeBlocks,
  type KnowledgeBlock,
} from './knowledge';

const completeTitle = {
  ca: 'Guia del dret d’asil',
  es: 'Guía del derecho de asilo',
  en: 'Asylum rights guide',
  ar: 'دليل حق اللجوء',
  fa: 'راهنمای حق پناهندگی',
} as const;

const translatedBlocks: Readonly<Record<keyof typeof completeTitle, readonly KnowledgeBlock[]>> = {
  ca: [
    { type: 'paragraph', text: 'Què has de portar a la primera cita.' },
    {
      type: 'step',
      title: 'Prepara els documents',
      text: 'Reuneix el passaport i el resguard.',
      imageUrl: 'ramassa/knowledge/documents.webp',
      imageAlt: 'Documents preparats sobre una taula',
    },
  ],
  es: [
    { type: 'paragraph', text: 'Qué debes llevar a la primera cita.' },
    {
      type: 'step',
      title: 'Prepara los documentos',
      text: 'Reúne el pasaporte y el resguardo.',
      imageUrl: 'ramassa/knowledge/documents.webp',
      imageAlt: 'Documentos preparados sobre una mesa',
    },
  ],
  en: [
    { type: 'paragraph', text: 'What to take to your first appointment.' },
    {
      type: 'step',
      title: 'Prepare your documents',
      text: 'Collect your passport and receipt.',
      imageUrl: 'ramassa/knowledge/documents.webp',
      imageAlt: 'Documents prepared on a table',
    },
  ],
  ar: [
    { type: 'paragraph', text: 'ما يجب إحضاره إلى الموعد الأول.' },
    {
      type: 'step',
      title: 'حضّري الوثائق',
      text: 'اجمعي جواز السفر والإيصال.',
      imageUrl: 'ramassa/knowledge/documents.webp',
      imageAlt: 'وثائق جاهزة على طاولة',
    },
  ],
  fa: [
    { type: 'paragraph', text: 'برای اولین قرار چه چیزهایی ببرید.' },
    {
      type: 'step',
      title: 'مدارک را آماده کنید',
      text: 'گذرنامه و رسید را جمع کنید.',
      imageUrl: 'ramassa/knowledge/documents.webp',
      imageAlt: 'مدارک آماده روی میز',
    },
  ],
};

describe('knowledge article validation', () => {
  test('publishes aligned structured blocks in all five languages', () => {
    const result = knowledgeArticleInputSchema.safeParse({
      categoryId: '5eed0000-0000-4000-8004-000000000001',
      title: completeTitle,
      body: translatedBlocks,
      imageUrl: null,
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      externalUrl: null,
      contentType: 'tutorial',
      storyStatus: null,
      authorId: null,
      reviewerNote: null,
      isPublished: true,
      publishedAt: '2026-08-05T14:00:00.000Z',
      expiresAt: null,
    });

    expect(result.success).toBe(true);
  });

  test('rejects translation blocks whose structure drifts from Catalan', () => {
    const result = knowledgeArticleInputSchema.safeParse({
      categoryId: '5eed0000-0000-4000-8004-000000000001',
      title: completeTitle,
      body: { ...translatedBlocks, en: translatedBlocks.en.slice(0, 1) },
      imageUrl: null,
      videoUrl: null,
      externalUrl: null,
      contentType: 'article',
      storyStatus: null,
      authorId: null,
      reviewerNote: null,
      isPublished: true,
      publishedAt: '2026-08-05T14:00:00.000Z',
      expiresAt: null,
    });

    expect(result.success).toBe(false);
  });

  test('participant stories require an author and cannot publish outside the review state', () => {
    const base = {
      categoryId: '5eed0000-0000-4000-8004-000000000004',
      title: { ca: 'La meva història' },
      body: { ca: [{ type: 'paragraph' as const, text: 'Vaig trobar un equip.' }] },
      imageUrl: null,
      videoUrl: null,
      externalUrl: null,
      contentType: 'participant_story' as const,
      storyStatus: 'submitted' as const,
      reviewerNote: null,
      isPublished: false,
      publishedAt: null,
      expiresAt: null,
    };

    expect(knowledgeArticleInputSchema.safeParse({ ...base, authorId: null }).success).toBe(false);
    expect(
      knowledgeArticleInputSchema.safeParse({
        ...base,
        authorId: '5eed0000-0000-4000-8000-000000000011',
        isPublished: true,
        publishedAt: '2026-08-05T14:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('video embed allowlist', () => {
  test('normalizes YouTube and Vimeo links to their embed origins', () => {
    expect(normalizeVideoEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
    expect(normalizeVideoEmbedUrl('https://vimeo.com/76979871')).toBe(
      'https://player.vimeo.com/video/76979871',
    );
  });

  test('refuses deceptive hosts, scripts, and arbitrary iframe targets', () => {
    for (const url of [
      'javascript:alert(document.domain)',
      'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
      'https://example.com/embed/video',
      'https://www.youtube.com/watch?v=<script>',
    ]) {
      expect(normalizeVideoEmbedUrl(url)).toBeNull();
    }
  });
});

describe('participant story state machine', () => {
  test('submitted stories enter review before any terminal outcome', () => {
    expect(canTransitionStoryStatus('submitted', 'in_review')).toBe(true);
    expect(canTransitionStoryStatus('submitted', 'published')).toBe(false);
    expect(canTransitionStoryStatus('submitted', 'rejected')).toBe(false);
  });

  test('review supports publish, request-changes, and decline outcomes', () => {
    expect(canTransitionStoryStatus('in_review', 'published')).toBe(true);
    expect(canTransitionStoryStatus('in_review', 'changes_requested')).toBe(true);
    expect(canTransitionStoryStatus('in_review', 'rejected')).toBe(true);
    expect(canTransitionStoryStatus('changes_requested', 'submitted')).toBe(true);
    expect(canTransitionStoryStatus('published', 'in_review')).toBe(false);
    expect(canTransitionStoryStatus('rejected', 'in_review')).toBe(false);
  });
});

describe('player knowledge localization', () => {
  test('resolves a participant story from its truthful Arabic source language', () => {
    const resolved = resolveLocalizedKnowledgeBlocks(
      { ar: [{ type: 'paragraph', text: 'هذه قصتي الأصلية.' }] } as never,
      'ar',
    );

    expect(resolved).toEqual({
      language: 'ar',
      blocks: [{ type: 'paragraph', text: 'هذه قصتي الأصلية.' }],
    });
  });
});
