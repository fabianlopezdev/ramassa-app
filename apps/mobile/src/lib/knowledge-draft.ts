/**
 * A knowledge resource being written on the phone (RAPP-343): the form kept on
 * the device through the shared draft store, the block steps of the native
 * editor, and the step from the form to the resource the database stores, with
 * the web admin's rules.
 *
 * The source blocks (Catalan, or the story's own language) carry the
 * structure. Any change to them drops the translated bodies, which must be
 * generated and approved again, as on the web admin. A translated body keeps
 * the structure and only its text changes. Without `knowledge.publish` the
 * publication goes back exactly as stored.
 */
import { z } from 'zod';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@ramassa/shared/i18n';
import {
  KNOWLEDGE_CONTENT_TYPES,
  knowledgeBlocksSchema,
  nextStoryPublicationState,
  type KnowledgeArticleInput,
  type KnowledgeArticleListRow,
  type KnowledgeBlock,
  type KnowledgeContentType,
  type LocalizedKnowledgeBody,
} from '@ramassa/shared/knowledge';
import { languageCodeSchema } from '@ramassa/shared/schemas';
import {
  isTranslationReviewPublishable,
  type TranslationReview,
} from '@ramassa/shared/translation';
import { PUBLISH_MODES, type PublishMode } from './announcement-draft';
import { createDraftStore } from './content-draft';

const formBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paragraph'), text: z.string() }),
  z.object({
    type: z.literal('step'),
    title: z.string(),
    text: z.string(),
    imageUrl: z.string().nullable(),
    imageAlt: z.string(),
  }),
]);

export type FormBlock = z.infer<typeof formBlockSchema>;
export type FormBlockType = FormBlock['type'];

const knowledgeDraftSchema = z.object({
  categoryId: z.string(),
  contentType: z.enum(KNOWLEDGE_CONTENT_TYPES),
  title: z.string(),
  body: z.partialRecord(languageCodeSchema, z.array(formBlockSchema)),
  approvedLanguages: z.array(languageCodeSchema),
  videoUrl: z.string(),
  externalUrl: z.string(),
  reviewerNote: z.string(),
  mode: z.enum(PUBLISH_MODES),
  publishedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  titleTranslations: z.record(z.string(), z.string()).optional(),
});

export type KnowledgeDraft = z.infer<typeof knowledgeDraftSchema>;

const store = createDraftStore('knowledge', knowledgeDraftSchema);

export const readKnowledgeDraft = store.read;
export const writeKnowledgeDraft = store.write;
export const clearKnowledgeDraft = store.clear;

/** Staff write in Catalan; a participant story keeps the language it was written in. */
export function knowledgeSourceLanguage(
  article: KnowledgeArticleListRow | undefined,
): SupportedLanguage {
  return article?.submission_language ?? 'ca';
}

export function knowledgeTargetLanguages(source: SupportedLanguage): readonly SupportedLanguage[] {
  return SUPPORTED_LANGUAGES.filter((language) => language !== source);
}

function toFormBlock(block: KnowledgeBlock): FormBlock {
  return block.type === 'paragraph' ? block : { ...block, imageAlt: block.imageAlt ?? '' };
}

export function initialKnowledgeMode(
  article: KnowledgeArticleListRow | undefined,
  now = new Date(),
): PublishMode {
  if (article?.is_published !== true) return 'draft';
  return article.published_at !== null && new Date(article.published_at).getTime() > now.getTime()
    ? 'scheduled'
    : 'now';
}

/** The form for a new resource (first category, one empty paragraph) or a stored one. */
export function startingKnowledgeDraft(
  article: KnowledgeArticleListRow | undefined,
  firstCategoryId: string,
  now = new Date(),
): KnowledgeDraft {
  const source = knowledgeSourceLanguage(article);
  const body = Object.fromEntries(
    Object.entries(article?.body ?? { [source]: [{ type: 'paragraph', text: '' }] }).map(
      ([language, blocks]) => [language, (blocks as KnowledgeBlock[]).map(toFormBlock)],
    ),
  );
  return {
    categoryId: article?.category_id ?? firstCategoryId,
    contentType: article?.content_type ?? 'article',
    title: article?.title[source] ?? '',
    body,
    // Stored translations were approved when they were published.
    approvedLanguages: knowledgeTargetLanguages(source).filter(
      (language) => article?.body[language] !== undefined,
    ),
    videoUrl: article?.video_url ?? '',
    externalUrl: article?.external_url ?? '',
    reviewerNote: article?.reviewer_note ?? '',
    mode: initialKnowledgeMode(article, now),
    publishedAt: article?.published_at ?? null,
    expiresAt: article?.expires_at ?? null,
  };
}

// The block steps of the source body ---------------------------------------------------------

export function emptyBlock(type: FormBlockType): FormBlock {
  return type === 'paragraph'
    ? { type: 'paragraph', text: '' }
    : { type: 'step', title: '', text: '', imageUrl: null, imageAlt: '' };
}

/** New positions after a move: entry i is the old index now at position i. */
function moveOrder(length: number, index: number, offset: -1 | 1): readonly number[] | null {
  const destination = index + offset;
  if (index < 0 || index >= length || destination < 0 || destination >= length) return null;
  const order = Array.from({ length }, (_unused, position) => position);
  [order[index], order[destination]] = [destination, index];
  return order;
}

export function moveBlock<T>(blocks: readonly T[], index: number, offset: -1 | 1): readonly T[] {
  const order = moveOrder(blocks.length, index, offset);
  return order === null ? blocks : order.map((from) => blocks[from] as T);
}

export function removeBlock<T>(blocks: readonly T[], index: number): readonly T[] {
  return blocks.filter((_block, position) => position !== index);
}

/** Photos picked for steps but not uploaded yet, by block position, follow their block. */
export function movePendingImages<T>(
  images: Readonly<Record<number, T>>,
  length: number,
  index: number,
  offset: -1 | 1,
): Record<number, T> {
  const order = moveOrder(length, index, offset);
  if (order === null) return { ...images };
  return Object.fromEntries(
    order.flatMap((from, to) => (images[from] === undefined ? [] : [[to, images[from]]])),
  );
}

export function removePendingImage<T>(
  images: Readonly<Record<number, T>>,
  index: number,
): Record<number, T> {
  return Object.fromEntries(
    Object.entries(images).flatMap(([raw, image]) => {
      const position = Number(raw);
      if (position === index) return [];
      return [[position > index ? position - 1 : position, image]];
    }),
  );
}

/** A change to the source blocks: the translations no longer match and are dropped. */
export function withSourceBlocks(
  form: KnowledgeDraft,
  source: SupportedLanguage,
  blocks: readonly FormBlock[],
): KnowledgeDraft {
  return { ...form, body: { [source]: [...blocks] }, approvedLanguages: [] };
}

/** A corrected translation needs approving again. */
export function withTranslatedBlocks(
  form: KnowledgeDraft,
  language: SupportedLanguage,
  blocks: readonly FormBlock[],
): KnowledgeDraft {
  return {
    ...form,
    body: { ...form.body, [language]: [...blocks] },
    approvedLanguages: form.approvedLanguages.filter((approved) => approved !== language),
  };
}

function fromStoredBody(body: LocalizedKnowledgeBody): KnowledgeDraft['body'] {
  return Object.fromEntries(
    Object.entries(body).map(([language, blocks]) => [
      language,
      (blocks as KnowledgeBlock[]).map(toFormBlock),
    ]),
  );
}

// From the form to the stored resource -------------------------------------------------------

function toStoredBlock(block: FormBlock): KnowledgeBlock {
  if (block.type === 'paragraph') return { type: 'paragraph', text: block.text.trim() };
  const imageAlt = block.imageAlt.trim();
  return {
    type: 'step',
    title: block.title.trim(),
    text: block.text.trim(),
    imageUrl: block.imageUrl,
    imageAlt: imageAlt.length === 0 ? null : imageAlt,
  };
}

/** A stand-in key for a chosen photo that is not uploaded yet, so checks see a step image. */
export const PENDING_IMAGE = 'pending-upload';

/**
 * The source blocks as stored blocks, with chosen photos as stand-ins, ready to
 * check and translate. Null while a block is incomplete.
 */
export function completeSourceBlocks(
  blocks: readonly FormBlock[],
  pendingPhotos: ReadonlySet<number>,
): readonly KnowledgeBlock[] | null {
  const stored = blocks.map((block, index) => {
    const next = toStoredBlock(block);
    return next.type === 'step' && pendingPhotos.has(index)
      ? { ...next, imageUrl: PENDING_IMAGE }
      : next;
  });
  return knowledgeBlocksSchema.safeParse(stored).success ? stored : null;
}

/**
 * A generated body back in the form. Each translated step keeps the source
 * step's real image, so a stand-in never reaches the database.
 */
export function generatedBody(
  body: LocalizedKnowledgeBody,
  sourceBlocks: readonly FormBlock[],
): KnowledgeDraft['body'] {
  return Object.fromEntries(
    Object.entries(fromStoredBody(body)).map(([language, blocks]) => [
      language,
      (blocks ?? []).map((block, index) => {
        const source = sourceBlocks[index];
        return block.type === 'step' && source?.type === 'step'
          ? { ...block, imageUrl: source.imageUrl }
          : block;
      }),
    ]),
  );
}

/** True when saving would publish the resource (or keep it published). */
export function isKnowledgePublishing(
  form: KnowledgeDraft,
  stored: KnowledgeArticleListRow | undefined,
  canPublish: boolean,
): boolean {
  return canPublish ? form.mode !== 'draft' : stored?.is_published === true;
}

/** Every title draft and every translated body approved: what publishing needs. */
export function areKnowledgeTranslationsApproved(
  form: KnowledgeDraft,
  titleReview: TranslationReview | undefined,
  source: SupportedLanguage,
): boolean {
  return (
    titleReview !== undefined &&
    isTranslationReviewPublishable(titleReview) &&
    knowledgeTargetLanguages(source).every(
      (language) => form.approvedLanguages.includes(language) && form.body[language] !== undefined,
    )
  );
}

function publicationTime(
  form: KnowledgeDraft,
  stored: KnowledgeArticleListRow | undefined,
  now: Date,
) {
  if (form.mode === 'draft') return null;
  if (form.mode === 'scheduled') return form.publishedAt;
  // Already live: keep the time it went out.
  if (
    stored?.is_published === true &&
    stored.published_at !== null &&
    new Date(stored.published_at).getTime() <= now.getTime()
  ) {
    return stored.published_at;
  }
  return now.toISOString();
}

/**
 * The resource to store; `knowledgeArticleInputSchema` in the shared module
 * checks it. Uploaded step images replace the source steps' images by position
 * in every language. Throws VALIDATION-1 when a story would publish outside
 * review.
 */
export function toKnowledgeInput(
  form: KnowledgeDraft,
  titleReview: TranslationReview | undefined,
  context: {
    readonly stored: KnowledgeArticleListRow | undefined;
    readonly canPublish: boolean;
    readonly stepImageUrls?: Readonly<Record<number, string>>;
    readonly now?: Date;
  },
): KnowledgeArticleInput {
  const now = context.now ?? new Date();
  const { stored, canPublish } = context;
  const source = knowledgeSourceLanguage(stored);
  const publishing = isKnowledgePublishing(form, stored, canPublish);
  const images = context.stepImageUrls ?? {};
  // Only approved translations are stored, as for the title.
  const body = Object.fromEntries(
    Object.entries(form.body).flatMap(([language, blocks]) =>
      language === source || form.approvedLanguages.includes(language as SupportedLanguage)
        ? [
            [
              language,
              (blocks ?? []).map((block, index) => {
                const stored = toStoredBlock(block);
                return stored.type === 'step' && images[index] !== undefined
                  ? { ...stored, imageUrl: images[index] }
                  : stored;
              }),
            ],
          ]
        : [],
    ),
  ) as LocalizedKnowledgeBody;
  const isStory = stored?.content_type === 'participant_story';
  return {
    categoryId: form.categoryId,
    title: {
      [source]: form.title.trim(),
      ...Object.fromEntries(
        (titleReview?.suggestions ?? [])
          .filter((suggestion) => suggestion.status === 'approved')
          .map((suggestion) => [suggestion.language, suggestion.reviewedText]),
      ),
    },
    body,
    imageUrl: stored?.image_url ?? null,
    videoUrl: form.videoUrl.trim() || null,
    externalUrl: form.externalUrl.trim() || null,
    contentType: (isStory ? 'participant_story' : form.contentType) as KnowledgeContentType,
    storyStatus: nextStoryPublicationState(stored?.story_status ?? null, publishing),
    authorId: stored?.author_id ?? null,
    submissionLanguage: stored?.submission_language ?? null,
    storyImageUrls: [...(stored?.story_image_urls ?? [])],
    publicationConsent: stored?.publication_consent ?? null,
    publicationConsentAt: stored?.publication_consent_at ?? null,
    publicationConsentVersion: stored?.publication_consent_version ?? null,
    reviewerNote: isStory ? form.reviewerNote.trim() || null : null,
    isPublished: publishing,
    publishedAt: canPublish ? publicationTime(form, stored, now) : (stored?.published_at ?? null),
    expiresAt: canPublish ? (publishing ? form.expiresAt : null) : (stored?.expires_at ?? null),
  };
}
