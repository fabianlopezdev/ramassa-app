import { requestTranslation } from '@/lib/translation-worker';
import type { SupportedLanguage } from '@ramassa/shared/i18n';
import {
  translateKnowledgeBody as sharedTranslateKnowledgeBody,
  type KnowledgeBlock,
  type LocalizedKnowledgeBody,
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

/** The shared body translation through the web admin's Worker call. */
export function translateKnowledgeBody(
  sourceBlocks: readonly KnowledgeBlock[],
  sourceLanguage: SupportedLanguage,
): Promise<LocalizedKnowledgeBody> {
  return sharedTranslateKnowledgeBody(sourceBlocks, sourceLanguage, translateText);
}

export function localDateTime(iso: string | null): string {
  if (iso === null) return '';
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
