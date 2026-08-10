import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from 'react-i18next';
import {
  getLanguageDirection,
  LANGUAGE_NATIVE_NAMES,
  type SupportedLanguage,
} from '@ramassa/shared/i18n';
import type { TranslationReview } from '@ramassa/shared/translation';

export interface MultilingualEditorProps {
  readonly fieldId: string;
  readonly sourceLabel: string;
  readonly sourceValue: string;
  readonly sourceLanguage?: SupportedLanguage;
  readonly review: TranslationReview | undefined;
  readonly maxLength: number;
  readonly onSourceChange: (value: string) => void;
  readonly onTranslationChange: (language: SupportedLanguage, value: string) => void;
  readonly translationNamespace?: 'announcements' | 'knowledge' | 'services';
}

export function MultilingualEditor({
  fieldId,
  sourceLabel,
  sourceValue,
  sourceLanguage = 'ca',
  review,
  maxLength,
  onSourceChange,
  onTranslationChange,
  translationNamespace = 'announcements',
}: MultilingualEditorProps) {
  const { t } = useTranslation(translationNamespace);

  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${fieldId}-source`} className="text-sm font-medium">
          {sourceLabel}
        </label>
        <Textarea
          id={`${fieldId}-source`}
          data-testid={`${fieldId}-source`}
          dir={getLanguageDirection(sourceLanguage)}
          value={sourceValue}
          maxLength={maxLength}
          onChange={(event) => onSourceChange(event.target.value)}
        />
      </div>

      {review?.suggestions.map((suggestion) => {
        const language = suggestion.language as SupportedLanguage;
        return (
          <div key={language} className="flex flex-col gap-2">
            <label htmlFor={`${fieldId}-draft-${language}`} className="text-sm font-medium">
              {t('languageDraft', { language: LANGUAGE_NATIVE_NAMES[language] })}
            </label>
            <Textarea
              id={`${fieldId}-draft-${language}`}
              data-testid={`${fieldId}-draft-${language}`}
              dir={getLanguageDirection(language)}
              value={suggestion.reviewedText}
              maxLength={maxLength}
              onChange={(event) => onTranslationChange(language, event.target.value)}
            />
          </div>
        );
      })}
    </fieldset>
  );
}
