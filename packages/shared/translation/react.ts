import { useCallback, useMemo, useState } from 'react';
import type { LanguageCode } from '../schemas/language';
import {
  approveTranslation,
  createTranslationReview,
  editTranslationDraft,
  getApprovedTranslations,
  isTranslationReviewPublishable,
  rejectTranslation,
  type CreateTranslationReviewOptions,
  type TranslationMap,
  type TranslationReview,
} from './index';

export interface UseTranslationReviewResult {
  readonly review: TranslationReview | undefined;
  readonly approvedTranslations: TranslationMap;
  readonly isPublishable: boolean;
  readonly start: (options: CreateTranslationReviewOptions) => void;
  readonly edit: (language: LanguageCode, reviewedText: string) => void;
  readonly approve: (language: LanguageCode) => void;
  readonly reject: (language: LanguageCode) => void;
  readonly reset: () => void;
}

export function useTranslationReview(
  initial?: CreateTranslationReviewOptions,
): UseTranslationReviewResult {
  const [review, setReview] = useState<TranslationReview | undefined>(() =>
    initial === undefined ? undefined : createTranslationReview(initial),
  );

  const start = useCallback((options: CreateTranslationReviewOptions) => {
    setReview(createTranslationReview(options));
  }, []);
  const edit = useCallback((language: LanguageCode, reviewedText: string) => {
    setReview((current) =>
      current === undefined ? undefined : editTranslationDraft(current, language, reviewedText),
    );
  }, []);
  const approve = useCallback((language: LanguageCode) => {
    setReview((current) =>
      current === undefined ? undefined : approveTranslation(current, language),
    );
  }, []);
  const reject = useCallback((language: LanguageCode) => {
    setReview((current) =>
      current === undefined ? undefined : rejectTranslation(current, language),
    );
  }, []);
  const reset = useCallback(() => setReview(undefined), []);

  const approvedTranslations = useMemo(
    () => (review === undefined ? {} : getApprovedTranslations(review)),
    [review],
  );
  const isPublishable = useMemo(
    () => review !== undefined && isTranslationReviewPublishable(review),
    [review],
  );

  return {
    review,
    approvedTranslations,
    isPublishable,
    start,
    edit,
    approve,
    reject,
    reset,
  };
}
