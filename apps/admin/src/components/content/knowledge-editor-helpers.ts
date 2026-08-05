import { requestCatalanTranslation } from '@/lib/translation-worker';
import { AppError } from '@ramassa/shared/errors';
import type {
  KnowledgeBlock,
  LocalizedKnowledgeBody,
  StoryStatus,
} from '@ramassa/shared/knowledge';
import type { TranslationReview } from '@ramassa/shared/translation';

const TARGET_LANGUAGES = ['es', 'en', 'ar', 'fa'] as const;

function reviewedTextByLanguage(review: TranslationReview) {
  return Object.fromEntries(
    review.suggestions.map((suggestion) => [suggestion.language, suggestion.reviewedText]),
  ) as Record<(typeof TARGET_LANGUAGES)[number], string>;
}

async function translateText(source: string) {
  const result = await requestCatalanTranslation(source);
  if (!result.ok) throw result.error;
  return reviewedTextByLanguage(result.value);
}

export async function translateKnowledgeBody(
  sourceBlocks: readonly KnowledgeBlock[],
): Promise<LocalizedKnowledgeBody> {
  const translatedBlocks = await Promise.all(
    sourceBlocks.map(async (block) => {
      if (block.type === 'paragraph') {
        return { type: 'paragraph', source: block, text: await translateText(block.text) } as const;
      }
      const [title, text, imageAlt] = await Promise.all([
        translateText(block.title),
        translateText(block.text),
        block.imageAlt === null ? null : translateText(block.imageAlt),
      ]);
      return { type: 'step', source: block, title, text, imageAlt } as const;
    }),
  );

  const body: Record<string, KnowledgeBlock[]> = { ca: [...sourceBlocks] };
  for (const language of TARGET_LANGUAGES) {
    body[language] = translatedBlocks.map((translated) => {
      if (translated.type === 'paragraph') {
        return { type: 'paragraph', text: translated.text[language] };
      }
      return {
        type: 'step',
        title: translated.title[language],
        text: translated.text[language],
        imageUrl: translated.source.imageUrl,
        imageAlt: translated.imageAlt?.[language] ?? null,
      };
    });
  }
  return body as LocalizedKnowledgeBody;
}

export function applyStepImageUrls(
  body: LocalizedKnowledgeBody,
  imageUrls: Readonly<Record<number, string>>,
): LocalizedKnowledgeBody {
  return Object.fromEntries(
    Object.entries(body).map(([language, blocks]) => [
      language,
      blocks?.map((block, index) =>
        block.type === 'step' && imageUrls[index] !== undefined
          ? { ...block, imageUrl: imageUrls[index]! }
          : block,
      ),
    ]),
  ) as LocalizedKnowledgeBody;
}

export function nextStoryPublicationState(
  currentStatus: StoryStatus | null,
  publishing: boolean,
): StoryStatus | null {
  if (currentStatus === null) return null;
  if (!publishing) return currentStatus;
  if (currentStatus !== 'in_review') throw new AppError('VALIDATION-1');
  return 'published';
}

export function localDateTime(iso: string | null): string {
  if (iso === null) return '';
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
