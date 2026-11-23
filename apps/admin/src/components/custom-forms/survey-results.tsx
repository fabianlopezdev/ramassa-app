/**
 * A survey's results (RAPP-929), on its Respostes page above who answered:
 * each question in her order with how many answered it. A rating shows its
 * average and how many gave each score, a choice how many picked each option,
 * yes and no their counts, a text question the answers written. Descarrega CSV
 * gives one row per response with every answer in words.
 */
import { useStepUp } from '@/components/auth/step-up';
import { EditorSection } from '@/components/layout/editor-section';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { isAppError } from '@ramassa/shared/errors';
import {
  createSurveyResultsExport,
  customFormScreenQuestions,
  formScreensInOrder,
  RATING_MAX,
  RATING_MIN,
  summarizeSurveyAnswers,
  textIn,
  type CustomForm,
  type CustomQuestion,
  type IntakeCatalog,
  type SurveyQuestionSummary,
  type SurveyResultRow,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

/** The survey's questions, screen by screen in her order. */
function surveyQuestions(catalog: IntakeCatalog, form: CustomForm): readonly CustomQuestion[] {
  return formScreensInOrder(catalog, form).flatMap((screen) =>
    customFormScreenQuestions(catalog, screen.id),
  );
}

/** The values a question's bars count, in order, with their words. */
function bars(
  question: CustomQuestion,
  language: LanguageCode,
  words: { readonly yes: string; readonly no: string; readonly maybe: string },
): readonly { readonly key: string; readonly label: string }[] {
  switch (question.type) {
    case 'rating':
      return Array.from({ length: RATING_MAX - RATING_MIN + 1 }, (_, index) => {
        const value = String(RATING_MIN + index);
        return { key: value, label: value };
      });
    case 'yes_no':
      return [
        { key: 'yes', label: words.yes },
        { key: 'no', label: words.no },
      ];
    case 'yes_no_maybe':
      return [
        { key: 'yes', label: words.yes },
        { key: 'no', label: words.no },
        { key: 'maybe', label: words.maybe },
      ];
    case 'single_choice':
    case 'multiple_choice':
      return question.options.map((option) => ({
        key: option.id,
        label: textIn(option.label, language),
      }));
    default:
      return [];
  }
}

function answerWords(
  question: CustomQuestion,
  value: unknown,
  language: LanguageCode,
  words: { readonly yes: string; readonly no: string; readonly maybe: string },
): string {
  if (value === undefined || value === null) return '';
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((each) => {
      const known = bars(question, language, words).find((bar) => bar.key === String(each));
      return known?.label ?? String(each);
    })
    .join(', ');
}

/** Opens the CSV in Excel with its accents right. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/** A CSV cell, quoted when it holds a separator, a quote or a line break. */
function csvCell(value: string): string {
  return /[",\n;]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function SurveyResults({
  catalog,
  form,
  rows,
}: {
  readonly catalog: IntakeCatalog;
  readonly form: CustomForm;
  readonly rows: readonly SurveyResultRow[];
}) {
  const { t, i18n } = useTranslation(['settings', 'onboarding', 'admin', 'errors']);
  const withStepUp = useStepUp();
  const [isExporting, setExporting] = useState(false);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const words = {
    yes: t('onboarding:yesOption'),
    no: t('onboarding:noOption'),
    maybe: t('onboarding:customMaybeOption'),
  };
  const questions = surveyQuestions(catalog, form);
  const summaries = summarizeSurveyAnswers(
    questions.map((question) => ({ fieldId: question.id, type: question.type })),
    rows,
  );
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 1 });

  // The CSV names every player who answered, so it comes from the server after
  // a recent authenticator code, with an audit row per export (RAPP-946).
  async function downloadCsv() {
    setExporting(true);
    let exported: readonly SurveyResultRow[];
    try {
      exported = await withStepUp(() => createSurveyResultsExport(supabase, form.id));
    } catch (thrown) {
      toast.error(
        isAppError(thrown) && thrown.code === 'AUTH-9' ? t('errors:AUTH-9') : t('admin:exportFailed'),
      );
      return;
    } finally {
      setExporting(false);
    }
    const header = [
      t('surveyResults.player'),
      t('surveyResults.answeredAt'),
      ...questions.map((question) => textIn(question.label, language)),
    ];
    const lines = exported.map((row) => [
      row.displayName ?? '',
      row.answeredAt === null ? '' : new Date(row.answeredAt).toLocaleString(language),
      ...questions.map((question) =>
        answerWords(question, row.answers[question.id], language, words),
      ),
    ]);
    const csv = [header, ...lines].map((line) => line.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`${BYTE_ORDER_MARK}${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${textIn(form.name, language) || 'enquesta'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <EditorSection
      title={
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-start">
          <span className="text-base font-semibold">{t('surveyResults.title')}</span>
          <span className="text-sm text-muted-foreground">
            {t('surveyResults.answered', { count: rows.length })}
          </span>
        </span>
      }
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rows.length === 0 || isExporting}
          onClick={() => void downloadCsv()}
          data-testid="survey-results-csv"
        >
          <Download aria-hidden data-icon="inline-start" />
          {t('surveyResults.csv')}
        </Button>
      }
      testId="survey-results"
    >
      {questions.length === 0 ? (
        <p className="text-start text-sm text-muted-foreground">{t('surveyResults.noQuestions')}</p>
      ) : (
        <ol className="flex flex-col gap-6">
          {questions.map((question, index) => (
            <QuestionResult
              key={question.id}
              question={question}
              summary={summaries[index]}
              barsOf={bars(question, language, words)}
              language={language}
              formatNumber={(value) => number.format(value)}
            />
          ))}
        </ol>
      )}
    </EditorSection>
  );
}

function QuestionResult({
  question,
  summary,
  barsOf,
  language,
  formatNumber,
}: {
  readonly question: CustomQuestion;
  readonly summary: SurveyQuestionSummary | undefined;
  readonly barsOf: readonly { readonly key: string; readonly label: string }[];
  readonly language: LanguageCode;
  readonly formatNumber: (value: number) => string;
}) {
  const { t } = useTranslation('settings');
  const answered = summary?.answered ?? 0;
  const top = Math.max(1, ...barsOf.map((bar) => summary?.counts[bar.key] ?? 0));
  return (
    <li className="flex flex-col gap-3" data-testid={`survey-result-${question.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-start text-sm font-semibold">{textIn(question.label, language)}</h3>
        <span className="text-sm text-muted-foreground">
          {summary?.average === null || summary?.average === undefined
            ? t('surveyResults.answered', { count: answered })
            : t('surveyResults.average', {
                average: formatNumber(summary.average),
                count: answered,
              })}
        </span>
      </div>
      {barsOf.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {barsOf.map((bar) => {
            const count = summary?.counts[bar.key] ?? 0;
            return (
              <li
                key={bar.key}
                className="grid grid-cols-[minmax(0,12rem)_1fr_3rem] items-center gap-3"
              >
                <span className="truncate text-start text-sm">{bar.label}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${(count / top) * 100}%` }}
                  />
                </span>
                <span className="text-end text-sm tabular-nums text-muted-foreground">{count}</span>
              </li>
            );
          })}
        </ul>
      ) : summary === undefined || summary.texts.length === 0 ? (
        <p className="text-start text-sm text-muted-foreground">{t('surveyResults.noAnswers')}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {summary.texts.map((text, index) => (
            <li key={index} className="px-3 py-2 text-start text-sm">
              {text}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
