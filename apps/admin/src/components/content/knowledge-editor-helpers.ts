import { requestTranslation } from '@/lib/translation-worker';
import { AppError } from '@ramassa/shared/errors';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@ramassa/shared/i18n';
import type {
  KnowledgeBlock,
  LocalizedKnowledgeBody,
  StoryStatus,
} from '@ramassa/shared/knowledge';
import type { TranslationReview } from '@ramassa/shared/translation';

function reviewedTextByLanguage(review: TranslationReview) {
  return Object.fromEntries(
    review.suggestions.map((suggestion) => [suggestion.language, suggestion.reviewedText]),
  ) as Partial<Record<SupportedLanguage, string>>;
}

async function translateText(
  source: string,
  sourceLanguage: SupportedLanguage,
  targetLanguages: readonly SupportedLanguage[],
) {
  const result = await requestTranslation(source, sourceLanguage, targetLanguages);
  if (!result.ok) throw result.error;
  return reviewedTextByLanguage(result.value);
}

export async function translateKnowledgeBody(
  sourceBlocks: readonly KnowledgeBlock[],
  sourceLanguage: SupportedLanguage,
): Promise<LocalizedKnowledgeBody> {
  const targetLanguages = SUPPORTED_LANGUAGES.filter((language) => language !== sourceLanguage);
  const translatedBlocks = await Promise.all(
    sourceBlocks.map(async (block) => {
      if (block.type === 'paragraph') {
        return {
          type: 'paragraph',
          source: block,
          text: await translateText(block.text, sourceLanguage, targetLanguages),
        } as const;
      }
      const [title, text, imageAlt] = await Promise.all([
        translateText(block.title, sourceLanguage, targetLanguages),
        translateText(block.text, sourceLanguage, targetLanguages),
        block.imageAlt === null
          ? null
          : translateText(block.imageAlt, sourceLanguage, targetLanguages),
      ]);
      return { type: 'step', source: block, title, text, imageAlt } as const;
    }),
  );

  const body: Partial<Record<SupportedLanguage, KnowledgeBlock[]>> = {
    [sourceLanguage]: [...sourceBlocks],
  };
  for (const language of targetLanguages) {
    body[language] = translatedBlocks.map((translated) => {
      if (translated.type === 'paragraph') {
        return { type: 'paragraph', text: translated.text[language]! };
      }
      return {
        type: 'step',
        title: translated.title[language]!,
        text: translated.text[language]!,
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
