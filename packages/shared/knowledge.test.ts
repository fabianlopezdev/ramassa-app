import { describe, expect, test } from 'bun:test';
import {
  applyStepImageUrls,
  canTransitionStoryStatus,
  hasAlignedKnowledgeBlocks,
  knowledgeArticleInputSchema,
  knowledgeCategoryInputSchema,
  nextStoryPublicationState,
  normalizeVideoEmbedUrl,
  participantStoryEditableDraft,
  resendParticipantStory,
  resolveLocalizedKnowledgeBlocks,
  translateKnowledgeBody,
  type KnowledgeBlock,
} from './knowledge';

const completeTitle = {
  ca: 'Guia del dret d’asil',
  es: 'Guía del derecho de asilo',
  en: 'Asylum rights guide',
  fr: 'Guide du droit d’asile',
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
  fr: [
    { type: 'paragraph', text: 'Ce qu’il faut apporter au premier rendez-vous.' },
    {
      type: 'step',
      title: 'Prépare tes documents',
      text: 'Rassemble ton passeport et le récépissé.',
      imageUrl: 'ramassa/knowledge/documents.webp',
      imageAlt: 'Documents prêts sur une table',
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
  test('publishes aligned structured blocks in every language', () => {
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

describe('a story the team sent back for changes (RAPP-814)', () => {
  const sentBack: Parameters<typeof participantStoryEditableDraft>[0] = {
    story_status: 'changes_requested',
    submission_language: 'ar',
    title: { ar: 'قصتي', ca: 'La meva història' },
    body: {
      ar: [
        { type: 'paragraph', text: 'الفقرة الأولى' },
        { type: 'paragraph', text: 'الفقرة الثانية' },
      ],
      ca: [{ type: 'paragraph', text: 'Primer paràgraf' }],
    },
  };

  test('her edit starts from her own title and text, in the language she wrote it', () => {
    expect(participantStoryEditableDraft(sentBack)).toEqual({
      title: 'قصتي',
      story: 'الفقرة الأولى\n\nالفقرة الثانية',
    });
  });

  test('a step block keeps its title and text in her draft', () => {
    expect(
      participantStoryEditableDraft({
        ...sentBack,
        body: {
          ar: [
            {
              type: 'step',
              title: 'الخطوة',
              text: 'النص',
              imageUrl: null,
              imageAlt: null,
            },
          ],
        },
      })?.story,
    ).toBe('الخطوة\n\nالنص');
  });

  test('only a story waiting for changes, with a known language, is editable', () => {
    for (const status of ['submitted', 'in_review', 'published', 'rejected'] as const) {
      expect(participantStoryEditableDraft({ ...sentBack, story_status: status })).toBeNull();
    }
    expect(participantStoryEditableDraft({ ...sentBack, submission_language: null })).toBeNull();
  });

  test('the resend goes through the database function with her trimmed text', async () => {
    let rpcName: string | undefined;
    let rpcArgs: unknown;
    const rpc = async (name: string, args: unknown) => {
      rpcName = name;
      rpcArgs = args;
      return { data: null, error: null };
    };
    await resendParticipantStory({ rpc } as never, {
      storyId: '5eed0000-0000-4000-8814-000000000001',
      title: '  قصتي الجديدة ',
      story: ' النص الجديد ',
    });
    expect(rpcName).toBe('resend_participant_story');
    expect(rpcArgs).toEqual({
      p_story_id: '5eed0000-0000-4000-8814-000000000001',
      p_title: 'قصتي الجديدة',
      p_story: 'النص الجديد',
    });
  });

  test('a refused resend is a typed database error', async () => {
    const rpc = async () => ({ data: null, error: { message: 'No story of hers is waiting' } });
    await expect(
      resendParticipantStory({ rpc } as never, {
        storyId: '5eed0000-0000-4000-8814-000000000001',
        title: 'Títol',
        story: 'Text',
      }),
    ).rejects.toMatchObject({ code: 'DB-1' });
  });

  test('a blank title never reaches the database', async () => {
    let called = false;
    const rpc = async () => {
      called = true;
      return { data: null, error: null };
    };
    await expect(
      resendParticipantStory({ rpc } as never, {
        storyId: '5eed0000-0000-4000-8814-000000000001',
        title: '   ',
        story: 'Text',
      }),
    ).rejects.toBeDefined();
    expect(called).toBe(false);
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

describe('the shared body translation (RAPP-343)', () => {
  test('every language gets the same blocks, a step keeps its image', async () => {
    const calls: string[] = [];
    const body = await translateKnowledgeBody(
      [
        { type: 'paragraph', text: 'Hola' },
        { type: 'step', title: 'Pas', text: 'Fes-ho', imageUrl: 'k/a.webp', imageAlt: 'Foto' },
      ],
      'ca',
      async (text, from, to) => {
        calls.push(`${from}:${text}`);
        return Object.fromEntries(to.map((language) => [language, `[${language}] ${text}`]));
      },
    );
    expect(calls.sort()).toEqual(['ca:Fes-ho', 'ca:Foto', 'ca:Hola', 'ca:Pas']);
    expect(hasAlignedKnowledgeBlocks(body)).toBe(true);
    expect(body.ar?.[1]).toEqual({
      type: 'step',
      title: '[ar] Pas',
      text: '[ar] Fes-ho',
      imageUrl: 'k/a.webp',
      imageAlt: '[ar] Foto',
    });
  });

  test('a story written in Farsi is translated from Farsi', async () => {
    const body = await translateKnowledgeBody(
      [{ type: 'paragraph', text: 'سلام' }],
      'fa',
      async (text, _from, to) =>
        Object.fromEntries(to.map((language) => [language, `${language}`])),
    );
    expect(body.fa).toEqual([{ type: 'paragraph', text: 'سلام' }]);
    expect(body.ca).toEqual([{ type: 'paragraph', text: 'ca' }]);
  });

  test('uploaded step images go into every language by position', () => {
    const step = { type: 'step', title: 'T', text: 'X', imageUrl: null, imageAlt: null } as const;
    const body = applyStepImageUrls(
      {
        ca: [{ type: 'paragraph', text: 'P' }, step],
        es: [{ type: 'paragraph', text: 'P' }, step],
      },
      { 1: 'k/new.webp' },
    );
    expect(body.es?.[1]).toMatchObject({ imageUrl: 'k/new.webp' });
    expect(body.ca?.[0]).toEqual({ type: 'paragraph', text: 'P' });
  });

  test('a story publishes from review, and a published one stays published when corrected', () => {
    expect(nextStoryPublicationState(null, true)).toBeNull();
    expect(nextStoryPublicationState('submitted', false)).toBe('submitted');
    expect(nextStoryPublicationState('in_review', true)).toBe('published');
    expect(nextStoryPublicationState('published', true)).toBe('published');
    expect(() => nextStoryPublicationState('submitted', true)).toThrow();
    expect(() => nextStoryPublicationState('rejected', true)).toThrow();
  });
});

describe('guide category input (RAPP-869)', () => {
  const category = { name: completeTitle, slug: 'rights-asylum', icon: 'scale', color: 'indigo' };

  test('a category with its name in every language and a palette colour is accepted', () => {
    expect(knowledgeCategoryInputSchema.safeParse(category).success).toBe(true);
  });

  test('a colour outside the category palette is refused', () => {
    expect(knowledgeCategoryInputSchema.safeParse({ ...category, color: 'primary' }).success).toBe(
      false,
    );
  });

  test('a name missing a language is refused, as the database check does', () => {
    const withoutFrench = { ...completeTitle, fr: undefined };
    expect(
      knowledgeCategoryInputSchema.safeParse({ ...category, name: withoutFrench }).success,
    ).toBe(false);
  });
});
