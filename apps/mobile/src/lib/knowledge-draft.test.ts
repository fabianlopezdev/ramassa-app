import { describe, expect, test } from 'bun:test';
import {
  knowledgeArticleInputSchema,
  type KnowledgeArticleListRow,
} from '@ramassa/shared/knowledge';
import { createTranslationReview, type TranslationReview } from '@ramassa/shared/translation';
import {
  areKnowledgeTranslationsApproved,
  completeSourceBlocks,
  emptyBlock,
  generatedBody,
  moveBlock,
  movePendingImages,
  PENDING_IMAGE,
  readKnowledgeDraft,
  removeBlock,
  removePendingImage,
  startingKnowledgeDraft,
  toKnowledgeInput,
  withSourceBlocks,
  withTranslatedBlocks,
  writeKnowledgeDraft,
  type KnowledgeDraft,
} from './knowledge-draft';

const NOW = new Date('2026-10-14T10:00:00.000Z');
const CATEGORY = '11111111-1111-4111-8111-111111111111';
const AUTHOR = '33333333-3333-4333-8333-333333333333';
const TARGETS = ['es', 'en', 'ar', 'fa'] as const;

function approvedTitle(text: string, from = 'ca' as const): TranslationReview {
  const review = createTranslationReview({
    sourceLanguage: from,
    sourceText: text,
    translations: Object.fromEntries(
      TARGETS.map((language) => [language, `[${language}] ${text}`]),
    ),
  });
  return {
    ...review,
    suggestions: review.suggestions.map((s) => ({ ...s, status: 'approved' as const })),
  };
}

function translatedForm(): KnowledgeDraft {
  const source = [
    { type: 'paragraph' as const, text: ' Hola ' },
    { type: 'step' as const, title: 'Pas', text: 'Fes-ho', imageUrl: null, imageAlt: '' },
  ];
  let form = withSourceBlocks(
    { ...startingKnowledgeDraft(undefined, CATEGORY, NOW), title: 'Guia' },
    'ca',
    source,
  );
  for (const language of TARGETS) {
    form = withTranslatedBlocks(
      form,
      language,
      source.map((block) =>
        block.type === 'paragraph'
          ? { ...block, text: `[${language}] Hola` }
          : { ...block, title: `[${language}] Pas`, text: `[${language}] Fes-ho` },
      ),
    );
  }
  return { ...form, approvedLanguages: [...TARGETS] };
}

describe('the knowledge form (RAPP-343)', () => {
  test('a new resource starts with one empty paragraph in Catalan', () => {
    const form = startingKnowledgeDraft(undefined, CATEGORY, NOW);
    expect(form.body).toEqual({ ca: [{ type: 'paragraph', text: '' }] });
    expect([form.contentType, form.mode, form.approvedLanguages]).toEqual(['article', 'draft', []]);
  });

  test('blocks move and are removed, and picked photos follow their block', () => {
    const blocks = ['a', 'b', 'c'];
    expect(moveBlock(blocks, 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveBlock(blocks, 0, -1)).toEqual(blocks);
    expect(removeBlock(blocks, 1)).toEqual(['a', 'c']);
    expect(movePendingImages({ 2: 'photo' }, 3, 2, -1)).toEqual({ 1: 'photo' });
    expect(movePendingImages({ 0: 'x', 1: 'y' }, 3, 0, 1)).toEqual({ 0: 'y', 1: 'x' });
    expect(removePendingImage({ 0: 'x', 2: 'z' }, 1)).toEqual({ 0: 'x', 1: 'z' });
    expect(emptyBlock('step')).toEqual({
      type: 'step',
      title: '',
      text: '',
      imageUrl: null,
      imageAlt: '',
    });
  });

  test('a change to the source drops the translations; a corrected one needs approving', () => {
    const form = translatedForm();
    expect(Object.keys(withSourceBlocks(form, 'ca', form.body.ca ?? []).body)).toEqual(['ca']);
    const corrected = withTranslatedBlocks(form, 'ar', form.body.ar ?? []);
    expect(corrected.approvedLanguages).toEqual(['es', 'en', 'fa']);
    expect(areKnowledgeTranslationsApproved(corrected, approvedTitle('Guia'), 'ca')).toBe(false);
    expect(areKnowledgeTranslationsApproved(form, approvedTitle('Guia'), 'ca')).toBe(true);
  });

  test('a published resource stores five aligned languages and the uploaded step image', () => {
    const input = toKnowledgeInput({ ...translatedForm(), mode: 'now' }, approvedTitle('Guia'), {
      stored: undefined,
      canPublish: true,
      stepImageUrls: { 1: 'k/step.webp' },
      now: NOW,
    });
    expect(input.body.ca?.[0]).toEqual({ type: 'paragraph', text: 'Hola' });
    expect(input.body.fa?.[1]).toMatchObject({ imageUrl: 'k/step.webp', imageAlt: null });
    // A step image needs its description, so this one is refused until she writes it.
    expect(knowledgeArticleInputSchema.safeParse(input).success).toBe(false);
    const described = toKnowledgeInput(
      {
        ...translatedForm(),
        mode: 'now',
        body: Object.fromEntries(
          Object.entries(translatedForm().body).map(([language, blocks]) => [
            language,
            (blocks ?? []).map((block) =>
              block.type === 'step' ? { ...block, imageAlt: `${language} foto` } : block,
            ),
          ]),
        ),
      },
      approvedTitle('Guia'),
      { stored: undefined, canPublish: true, stepImageUrls: { 1: 'k/step.webp' }, now: NOW },
    );
    expect(knowledgeArticleInputSchema.safeParse(described).success).toBe(true);
    expect([described.isPublished, described.publishedAt]).toEqual([true, NOW.toISOString()]);
  });

  test('unapproved translations are not stored with a draft', () => {
    const form = { ...translatedForm(), approvedLanguages: ['es' as const] };
    const input = toKnowledgeInput(form, undefined, {
      stored: undefined,
      canPublish: true,
      now: NOW,
    });
    expect(Object.keys(input.body).sort()).toEqual(['ca', 'es']);
    expect([input.isPublished, input.publishedAt]).toEqual([false, null]);
  });

  test('a story in review is published from its own language and keeps its evidence', () => {
    const story = {
      id: '22222222-2222-4222-8222-222222222222',
      category_id: CATEGORY,
      title: { fa: 'داستان من' },
      body: { fa: [{ type: 'paragraph', text: 'سلام' }] },
      image_url: null,
      video_url: null,
      external_url: null,
      content_type: 'participant_story',
      story_status: 'in_review',
      submission_language: 'fa',
      story_image_urls: ['stories/a.webp'],
      publication_consent: true,
      publication_consent_at: '2026-10-01T08:00:00+00:00',
      publication_consent_version: 'v1',
      author_id: AUTHOR,
      reviewer_note: null,
      is_published: false,
      published_at: null,
      expires_at: null,
    } as unknown as KnowledgeArticleListRow;
    const form = startingKnowledgeDraft(story, 'other', NOW);
    expect([form.title, form.approvedLanguages]).toEqual(['داستان من', []]);
    const input = toKnowledgeInput({ ...form, mode: 'now', reviewerNote: ' Gràcies ' }, undefined, {
      stored: story,
      canPublish: true,
      now: NOW,
    });
    expect(input).toMatchObject({
      contentType: 'participant_story',
      storyStatus: 'published',
      authorId: AUTHOR,
      submissionLanguage: 'fa',
      storyImageUrls: ['stories/a.webp'],
      reviewerNote: 'Gràcies',
      title: { fa: 'داستان من' },
    });
  });

  test('without the publish permission the publication stays as stored', () => {
    const live = {
      ...({} as KnowledgeArticleListRow),
      content_type: 'article',
      story_status: null,
      is_published: true,
      published_at: '2026-10-01T08:00:00+00:00',
      expires_at: null,
      body: { ca: [{ type: 'paragraph', text: 'A' }] },
      title: { ca: 'A' },
      submission_language: null,
      story_image_urls: [],
    } as unknown as KnowledgeArticleListRow;
    const input = toKnowledgeInput(
      { ...startingKnowledgeDraft(live, CATEGORY, NOW), mode: 'draft' },
      undefined,
      { stored: live, canPublish: false, now: NOW },
    );
    expect([input.isPublished, input.publishedAt]).toEqual([true, '2026-10-01T08:00:00+00:00']);
  });

  test('a chosen photo counts as a step image for the check, and never reaches the body', () => {
    const blocks = [
      { type: 'step' as const, title: 'Pas', text: 'Fes-ho', imageUrl: null, imageAlt: 'Foto' },
    ];
    expect(completeSourceBlocks(blocks, new Set())).toBeNull();
    const complete = completeSourceBlocks(blocks, new Set([0]));
    expect(complete?.[0]).toMatchObject({ imageUrl: PENDING_IMAGE, imageAlt: 'Foto' });
    expect(completeSourceBlocks([{ type: 'paragraph', text: ' ' }], new Set())).toBeNull();
    const body = generatedBody(
      { ca: [...(complete ?? [])], es: [{ ...complete![0]!, title: '[es] Pas' } as never] },
      blocks,
    );
    expect(body.es?.[0]).toMatchObject({ title: '[es] Pas', imageUrl: null, imageAlt: 'Foto' });
  });

  test('the form is kept per person and per resource, and a broken draft is ignored', () => {
    const values = new Map<string, string>();
    const storage = {
      getString: (key: string) => values.get(key),
      set: (key: string, value: string) => void values.set(key, value),
      remove: (key: string) => values.delete(key),
    };
    writeKnowledgeDraft(storage, 'u1', 'new', translatedForm());
    expect(readKnowledgeDraft(storage, 'u1', 'new')?.body.ar?.[0]).toEqual({
      type: 'paragraph',
      text: '[ar] Hola',
    });
    values.set(
      'content.knowledge-draft.u1.new',
      JSON.stringify({ ...translatedForm(), mode: 'x' }),
    );
    expect(readKnowledgeDraft(storage, 'u1', 'new')).toBeNull();
  });
});
