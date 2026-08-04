import { describe, expect, test } from 'bun:test';
import {
  approveTranslation,
  createTranslationReview,
  editTranslationDraft,
  getApprovedTranslations,
  isTranslationReviewPublishable,
  rejectTranslation,
  translationRequestSchema,
} from './index';

const generatedTranslations = {
  es: 'Entrenamiento cancelado',
  en: 'Training cancelled',
  ar: 'تم إلغاء التدريب',
  fa: 'تمرین لغو شد',
} as const;

describe('translation request validation', () => {
  test('accepts one source and the four other supported languages', () => {
    expect(
      translationRequestSchema.parse({
        text: 'Entrenament cancel·lat',
        from: 'ca',
        to: ['es', 'en', 'ar', 'fa'],
      }),
    ).toEqual({
      text: 'Entrenament cancel·lat',
      from: 'ca',
      to: ['es', 'en', 'ar', 'fa'],
    });
  });

  test('refuses duplicate targets and translating into the source language', () => {
    expect(
      translationRequestSchema.safeParse({ text: 'Text', from: 'ca', to: ['es', 'es'] }).success,
    ).toBe(false);
    expect(
      translationRequestSchema.safeParse({ text: 'Text', from: 'ca', to: ['ca'] }).success,
    ).toBe(false);
  });

  test('refuses empty and oversized content', () => {
    expect(translationRequestSchema.safeParse({ text: ' ', from: 'ca', to: ['es'] }).success).toBe(
      false,
    );
    expect(
      translationRequestSchema.safeParse({ text: 'a'.repeat(10_001), from: 'ca', to: ['es'] })
        .success,
    ).toBe(false);
  });
});

describe('translation review state machine', () => {
  test('provider output always starts as drafts and cannot publish', () => {
    const review = createTranslationReview({
      sourceLanguage: 'ca',
      sourceText: 'Entrenament cancel·lat',
      translations: generatedTranslations,
    });

    expect(review.suggestions.map((suggestion) => suggestion.status)).toEqual([
      'draft',
      'draft',
      'draft',
      'draft',
    ]);
    expect(isTranslationReviewPublishable(review)).toBe(false);
  });

  test('staff can edit then approve a suggestion without changing the machine draft', () => {
    const review = createTranslationReview({
      sourceLanguage: 'ca',
      sourceText: 'Entrenament cancel·lat',
      translations: generatedTranslations,
    });
    const edited = editTranslationDraft(review, 'en', 'Training has been cancelled');
    const approved = approveTranslation(edited, 'en');
    const suggestion = approved.suggestions.find((item) => item.language === 'en');

    expect(suggestion?.machineText).toBe('Training cancelled');
    expect(suggestion?.reviewedText).toBe('Training has been cancelled');
    expect(suggestion?.status).toBe('approved');
  });

  test('rejected suggestions never enter the approved translations', () => {
    let review = createTranslationReview({
      sourceLanguage: 'ca',
      sourceText: 'Entrenament cancel·lat',
      translations: generatedTranslations,
    });
    review = approveTranslation(review, 'es');
    review = rejectTranslation(review, 'ar');

    expect(getApprovedTranslations(review)).toEqual({ es: 'Entrenamiento cancelado' });
    expect(isTranslationReviewPublishable(review)).toBe(false);
  });

  test('publishing becomes possible only after every suggestion is approved', () => {
    let review = createTranslationReview({
      sourceLanguage: 'ca',
      sourceText: 'Entrenament cancel·lat',
      translations: generatedTranslations,
    });
    for (const language of ['es', 'en', 'ar', 'fa'] as const) {
      review = approveTranslation(review, language);
    }

    expect(isTranslationReviewPublishable(review)).toBe(true);
    expect(getApprovedTranslations(review)).toEqual(generatedTranslations);
  });
});
