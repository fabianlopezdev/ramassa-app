import { z } from 'zod';
import { languageCodeSchema, type LanguageCode } from '../schemas/language';

export const MAX_TRANSLATION_TEXT_LENGTH = 10_000;

export const translationRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(MAX_TRANSLATION_TEXT_LENGTH),
    from: languageCodeSchema,
    to: languageCodeSchema.array().min(1).max(4),
  })
  .superRefine((request, context) => {
    if (new Set(request.to).size !== request.to.length) {
      context.addIssue({
        code: 'custom',
        message: 'Target languages must be unique',
        path: ['to'],
      });
    }
    if (request.to.includes(request.from)) {
      context.addIssue({
        code: 'custom',
        message: 'Source language cannot also be a target language',
        path: ['to'],
      });
    }
  });

export type TranslationRequest = z.infer<typeof translationRequestSchema>;
export type TranslationMap = Partial<Record<LanguageCode, string>>;

export interface TranslationUsage {
  readonly provider: string;
  readonly inputUnits: number;
  readonly outputUnits: number;
  readonly estimatedCostUsd: number;
}

export interface TranslationResult {
  readonly translations: TranslationMap;
  readonly usage: TranslationUsage;
}

export interface TranslationProvider {
  readonly name: string;
  readonly translate: (request: TranslationRequest) => Promise<TranslationResult>;
}

export type TranslationReviewStatus = 'draft' | 'approved' | 'rejected';

export interface TranslationSuggestion {
  readonly language: LanguageCode;
  readonly machineText: string;
  readonly reviewedText: string;
  readonly status: TranslationReviewStatus;
}

export interface TranslationReview {
  readonly sourceLanguage: LanguageCode;
  readonly sourceText: string;
  readonly suggestions: readonly TranslationSuggestion[];
}

export interface CreateTranslationReviewOptions {
  readonly sourceLanguage: LanguageCode;
  readonly sourceText: string;
  readonly translations: TranslationMap;
}

export function createTranslationReview(
  options: CreateTranslationReviewOptions,
): TranslationReview {
  return {
    sourceLanguage: options.sourceLanguage,
    sourceText: options.sourceText,
    suggestions: Object.entries(options.translations).map(([language, text]) => ({
      language: language as LanguageCode,
      machineText: text,
      reviewedText: text,
      status: 'draft',
    })),
  };
}

function updateSuggestion(
  review: TranslationReview,
  language: LanguageCode,
  update: (suggestion: TranslationSuggestion) => TranslationSuggestion,
): TranslationReview {
  return {
    ...review,
    suggestions: review.suggestions.map((suggestion) =>
      suggestion.language === language ? update(suggestion) : suggestion,
    ),
  };
}

export function editTranslationDraft(
  review: TranslationReview,
  language: LanguageCode,
  reviewedText: string,
): TranslationReview {
  const normalizedText = reviewedText.trim();
  if (normalizedText.length === 0 || normalizedText.length > MAX_TRANSLATION_TEXT_LENGTH) {
    return review;
  }
  return updateSuggestion(review, language, (suggestion) => ({
    ...suggestion,
    reviewedText: normalizedText,
    status: 'draft',
  }));
}

export function approveTranslation(
  review: TranslationReview,
  language: LanguageCode,
): TranslationReview {
  return updateSuggestion(review, language, (suggestion) => ({
    ...suggestion,
    status: suggestion.reviewedText.length > 0 ? 'approved' : 'draft',
  }));
}

export function rejectTranslation(
  review: TranslationReview,
  language: LanguageCode,
): TranslationReview {
  return updateSuggestion(review, language, (suggestion) => ({
    ...suggestion,
    status: 'rejected',
  }));
}

export function getApprovedTranslations(review: TranslationReview): TranslationMap {
  return Object.fromEntries(
    review.suggestions
      .filter((suggestion) => suggestion.status === 'approved')
      .map((suggestion) => [suggestion.language, suggestion.reviewedText]),
  );
}

export function isTranslationReviewPublishable(review: TranslationReview): boolean {
  return (
    review.suggestions.length > 0 &&
    review.suggestions.every((suggestion) => suggestion.status === 'approved')
  );
}
