/**
 * One Catalan text with its own translation review (RAPP-384), for forms with
 * a changing number of texts, such as a survey's questions and choices. The
 * review is a hook, so each text gets its own component; it reports to the
 * form how to start its drafts and, once all four are approved, its five
 * languages. On removal it reports nothing.
 */
import { MultilingualField } from '@/components/content/multilingual-field';
import { reviewHandlers } from '@/lib/content-translations';
import { useEffect, useMemo } from 'react';
import { localizedTextFromReview } from '@ramassa/shared/announcements';
import { surveyLocalizedTextSchema, type SurveyLocalizedText } from '@ramassa/shared/surveys';
import type { CreateTranslationReviewOptions } from '@ramassa/shared/translation';
import { useTranslationReview } from '@ramassa/shared/translation/react';

export interface ReviewedText {
  readonly start: (options: CreateTranslationReviewOptions) => void;
  /** The five languages when every translation is approved, else null. */
  readonly copy: SurveyLocalizedText | null;
}

export function ReviewedField({
  reviewKey,
  testIDPrefix,
  label,
  value,
  onChangeText,
  onTouch,
  onReport,
  maxLength,
  multiline = false,
}: {
  readonly reviewKey: string;
  readonly testIDPrefix: string;
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly onTouch: () => void;
  readonly onReport: (key: string, text: ReviewedText | null) => void;
  readonly maxLength: number;
  readonly multiline?: boolean;
}) {
  const review = useTranslationReview();
  const copy = useMemo(() => {
    if (!review.isPublishable) return null;
    const parsed = surveyLocalizedTextSchema.safeParse(
      localizedTextFromReview(value, review.review),
    );
    return parsed.success ? parsed.data : null;
  }, [review.isPublishable, review.review, value]);
  const { start } = review;

  useEffect(() => {
    onReport(reviewKey, { start, copy });
  }, [copy, onReport, reviewKey, start]);
  useEffect(() => () => onReport(reviewKey, null), [onReport, reviewKey]);

  return (
    <MultilingualField
      testIDPrefix={testIDPrefix}
      label={label}
      value={value}
      onChangeText={(next) => {
        onTouch();
        onChangeText(next);
      }}
      maxLength={maxLength}
      multiline={multiline}
      {...reviewHandlers(review, onTouch)}
    />
  );
}
