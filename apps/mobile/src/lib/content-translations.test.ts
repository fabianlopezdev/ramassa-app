import { describe, expect, test } from 'bun:test';
import type { TranslationReview } from '@ramassa/shared/translation';
import { draftLocalizedContent } from './content-translations';

const review: TranslationReview = {
  sourceLanguage: 'ca',
  sourceText: 'Entrenament',
  suggestions: [
    { language: 'es', machineText: 'Entreno', reviewedText: 'Entrenamiento', status: 'approved' },
    { language: 'ar', machineText: 'تدريب', reviewedText: 'تدريب', status: 'draft' },
    { language: 'fa', machineText: 'تمرین', reviewedText: '  ', status: 'draft' },
  ],
};

describe('draftLocalizedContent', () => {
  test('the source and every current translation, approved or not', () => {
    expect(draftLocalizedContent('Entrenament nou', review)).toEqual({
      ca: 'Entrenament nou',
      es: 'Entrenamiento',
      ar: 'تدريب',
    });
  });

  test('without a review, only the Catalan source', () => {
    expect(draftLocalizedContent('Entrenament', undefined)).toEqual({ ca: 'Entrenament' });
  });
});
