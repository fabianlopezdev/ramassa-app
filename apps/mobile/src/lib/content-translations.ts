/**
 * The translation review steps the phone's content editors share (RAPP-341,
 * RAPP-342): stored or kept translations as a review to start from, a review's
 * texts to keep on the device, the unsaved text per language for the draft
 * preview (RAPP-373), a Worker result as a new review, and the review's
 * handlers for a `MultilingualField`.
 */
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@ramassa/shared/i18n';
import type {
  CreateTranslationReviewOptions,
  TranslationReview,
} from '@ramassa/shared/translation';
import { CATALAN_TRANSLATION_TARGETS } from '@ramassa/shared/translation/client';
import type { useTranslationReview } from '@ramassa/shared/translation/react';

type ReviewState = ReturnType<typeof useTranslationReview>;

/** The stored translations, or the restored draft's, as review options. */
export function reviewOptions(
  sourceText: string,
  translations: Partial<Record<string, string>> | null,
): CreateTranslationReviewOptions | undefined {
  if (translations === null) return undefined;
  const found = Object.fromEntries(
    CATALAN_TRANSLATION_TARGETS.flatMap((language) => {
      const text = translations[language];
      return typeof text === 'string' && text.length > 0 ? [[language, text]] : [];
    }),
  );
  if (Object.keys(found).length === 0) return undefined;
  return { sourceLanguage: 'ca', sourceText, translations: found };
}

/** A review's corrected texts per language, as the device draft keeps them. */
export function reviewTexts(
  review: TranslationReview | undefined,
): Record<string, string> | undefined {
  return review === undefined
    ? undefined
    : Object.fromEntries(review.suggestions.map((s) => [s.language, s.reviewedText]));
}

/**
 * The unsaved text in every language, as a player screen reads stored content:
 * the source and the review's current texts, approved or not, for the
 * player preview of a draft (RAPP-373). A language with no text yet is left
 * out, so the preview shows the fallback a player would get.
 */
export function draftLocalizedContent(
  sourceText: string,
  review: TranslationReview | undefined,
  // A participant story keeps the language it was written in.
  sourceLanguage: SupportedLanguage = 'ca',
): Partial<Record<SupportedLanguage, string>> {
  const texts = reviewTexts(review) ?? {};
  return {
    [sourceLanguage]: sourceText,
    ...Object.fromEntries(
      SUPPORTED_LANGUAGES.filter((language) => language !== sourceLanguage).flatMap((language) => {
        const text = texts[language];
        return typeof text === 'string' && text.trim().length > 0 ? [[language, text]] : [];
      }),
    ),
  };
}

/** A Worker result as the options of a new review of its machine drafts. */
export function generatedReviewOptions(
  generated: TranslationReview,
): CreateTranslationReviewOptions {
  return {
    sourceLanguage: generated.sourceLanguage,
    sourceText: generated.sourceText,
    translations: Object.fromEntries(
      generated.suggestions.map((suggestion) => [suggestion.language, suggestion.machineText]),
    ),
  };
}

/** The props a `MultilingualField` needs from its review; `onChange` marks the form touched. */
export function reviewHandlers(review: ReviewState, onChange: () => void) {
  return {
    review: review.review,
    onEdit: (language: SupportedLanguage, text: string) => {
      onChange();
      review.edit(language, text);
    },
    onApprove: (language: SupportedLanguage) => {
      onChange();
      review.approve(language);
    },
    onReject: (language: SupportedLanguage) => {
      onChange();
      review.reject(language);
    },
    onApproveAll: () => {
      onChange();
      for (const suggestion of review.review?.suggestions ?? []) {
        review.approve(suggestion.language);
      }
    },
  };
}
