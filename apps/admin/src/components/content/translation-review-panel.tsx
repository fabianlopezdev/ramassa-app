import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { LANGUAGE_NATIVE_NAMES, type SupportedLanguage } from '@ramassa/shared/i18n';
import type { TranslationReview } from '@ramassa/shared/translation';

export interface TranslationReviewPanelProps {
  readonly fieldId: string;
  readonly review: TranslationReview | undefined;
  readonly onApprove: (language: SupportedLanguage) => void;
  readonly onReject: (language: SupportedLanguage) => void;
  readonly onApproveAll: () => void;
}

export function TranslationReviewPanel({
  fieldId,
  review,
  onApprove,
  onReject,
  onApproveAll,
}: TranslationReviewPanelProps) {
  const { t } = useTranslation('announcements');
  if (review === undefined) return null;

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4">
      <p className="text-sm text-muted-foreground">{t('translationHelp')}</p>
      <ul className="grid gap-3 md:grid-cols-2">
        {review.suggestions.map((suggestion) => {
          const language = suggestion.language as SupportedLanguage;
          return (
            <li key={language} className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{LANGUAGE_NATIVE_NAMES[language]}</span>
              <Badge
                variant={suggestion.status === 'rejected' ? 'destructive' : 'outline'}
                data-testid={`${fieldId}-status-${language}-${suggestion.status}`}
              >
                {t(`reviewStatus${capitalize(suggestion.status)}`)}
              </Badge>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid={`${fieldId}-reject-${language}`}
                  onClick={() => onReject(language)}
                >
                  {t('reject')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  data-testid={`${fieldId}-approve-${language}`}
                  onClick={() => onApprove(language)}
                >
                  {t('approve')}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <Button
        type="button"
        variant="secondary"
        data-testid={`${fieldId}-approve-all`}
        onClick={onApproveAll}
      >
        {t('approveAll')}
      </Button>
    </section>
  );
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
