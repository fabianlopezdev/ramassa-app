import { act, renderHook } from '@testing-library/react';
import { describe, expect, test } from 'bun:test';
import { useTranslationReview } from './react';

const translations = {
  es: 'Entrenamiento cancelado',
  en: 'Training cancelled',
  ar: 'تم إلغاء التدريب',
  fa: 'تمرین لغو شد',
} as const;

describe('useTranslationReview', () => {
  test('connects generation, editing, approval, and rejection without auto-publishing', () => {
    const { result } = renderHook(() => useTranslationReview());

    act(() => {
      result.current.start({
        sourceLanguage: 'ca',
        sourceText: 'Entrenament cancel·lat',
        translations,
      });
    });
    expect(result.current.review?.suggestions.every((item) => item.status === 'draft')).toBe(true);
    expect(result.current.isPublishable).toBe(false);

    act(() => {
      result.current.edit('en', 'Training has been cancelled');
      result.current.approve('es');
      result.current.reject('fa');
    });

    const english = result.current.review?.suggestions.find((item) => item.language === 'en');
    expect(english?.machineText).toBe('Training cancelled');
    expect(english?.reviewedText).toBe('Training has been cancelled');
    expect(result.current.approvedTranslations).toEqual({ es: 'Entrenamiento cancelado' });
    expect(result.current.isPublishable).toBe(false);
  });

  test('becomes publishable only after every generated suggestion is approved', () => {
    const { result } = renderHook(() =>
      useTranslationReview({
        sourceLanguage: 'ca',
        sourceText: 'Entrenament cancel·lat',
        translations,
      }),
    );

    act(() => {
      for (const language of ['es', 'en', 'ar', 'fa'] as const) {
        result.current.approve(language);
      }
    });

    expect(result.current.isPublishable).toBe(true);
    expect(result.current.approvedTranslations).toEqual(translations);
  });
});
