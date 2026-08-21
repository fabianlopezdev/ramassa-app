import { MultilingualEditor } from '@/components/content/multilingual-editor';
import { TranslationReviewPanel } from '@/components/content/translation-review-panel';
import { AudiencePicker } from '@/components/notifications/audience-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { requestCatalanTranslation } from '@/lib/translation-worker';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupportedLanguage } from '@ramassa/shared/i18n';
import type {
  CustomNotificationGroup,
  NotificationAudience,
  NotificationAudienceOptions,
} from '@ramassa/shared/notifications';
import {
  aggregateSurveyResults,
  fetchSurveyResponses,
  resolveSurveyCopy,
  saveSurvey,
  streamSurveyCsv,
  surveyLocalizedTextSchema,
  type StaffSurvey,
  type SurveyChoice,
  type SurveyLocalizedText,
  type SurveyQuestion,
  type SurveyQuestionType,
  type SurveyResponse,
} from '@ramassa/shared/surveys';
import type {
  CreateTranslationReviewOptions,
  TranslationReview,
} from '@ramassa/shared/translation';
import { useTranslationReview } from '@ramassa/shared/translation/react';

const ALL_LANGUAGES = ['ca', 'es', 'en', 'ar', 'fa'] as const;
const QUESTION_TYPES = ['rating', 'multiple_choice', 'yes_no', 'free_text'] as const;
const STAR_SYMBOL = String.fromCodePoint(0x2605);

interface DraftQuestion {
  readonly id: string;
  readonly type: SurveyQuestionType;
  readonly source: string;
  readonly prompt: SurveyLocalizedText | null;
  readonly options: readonly SurveyChoice[] | null;
  readonly required: boolean;
}

function blankCopy(): SurveyLocalizedText {
  return { ca: '', es: '', en: '', ar: '', fa: '' };
}

function newQuestion(type: SurveyQuestionType = 'rating'): DraftQuestion {
  return {
    id: crypto.randomUUID(),
    type,
    source: '',
    prompt: null,
    options:
      type === 'multiple_choice'
        ? [
            { id: 'option_1', label: blankCopy() },
            { id: 'option_2', label: blankCopy() },
          ]
        : null,
    required: type !== 'free_text',
  };
}

function startGeneratedReview(
  review: TranslationReview,
  start: (options: CreateTranslationReviewOptions) => void,
) {
  start({
    sourceLanguage: review.sourceLanguage,
    sourceText: review.sourceText,
    translations: Object.fromEntries(
      review.suggestions.map((suggestion) => [suggestion.language, suggestion.machineText]),
    ),
  });
}

function approveAll(
  review: TranslationReview | undefined,
  approve: (language: SupportedLanguage) => void,
) {
  for (const suggestion of review?.suggestions ?? []) approve(suggestion.language);
}

function reviewedCopy(source: string, review: TranslationReview | undefined) {
  return surveyLocalizedTextSchema.parse({
    ca: source,
    ...Object.fromEntries(
      (review?.suggestions ?? [])
        .filter((suggestion) => suggestion.status === 'approved')
        .map((suggestion) => [suggestion.language, suggestion.reviewedText]),
    ),
  });
}

function QuestionPromptEditor({
  question,
  onUpdate,
}: {
  readonly question: DraftQuestion;
  readonly onUpdate: (id: string, patch: Partial<DraftQuestion>) => void;
}) {
  const { t } = useTranslation('surveys');
  const review = useTranslationReview();
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    onUpdate(question.id, {
      prompt: review.isPublishable ? reviewedCopy(question.source, review.review) : null,
    });
  }, [onUpdate, question.id, question.source, review.isPublishable, review.review]);

  async function generate() {
    setGenerating(true);
    try {
      const result = await requestCatalanTranslation(question.source);
      if (result.ok) startGeneratedReview(result.value, review.start);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-3">
      <MultilingualEditor
        fieldId={`survey-question-${question.id}`}
        sourceLabel={t('prompt')}
        sourceValue={question.source}
        review={review.review}
        maxLength={1000}
        onSourceChange={(value) => {
          onUpdate(question.id, { source: value, prompt: null });
          review.reset();
        }}
        onTranslationChange={review.edit}
        translationNamespace="surveys"
      />
      <TranslationReviewPanel
        fieldId={`survey-question-${question.id}`}
        review={review.review}
        onApprove={review.approve}
        onReject={review.reject}
        onApproveAll={() => approveAll(review.review, review.approve)}
        translationNamespace="surveys"
      />
      <Button
        type="button"
        variant="secondary"
        disabled={question.source.trim().length === 0 || generating}
        onClick={() => void generate()}
      >
        {generating ? t('generating') : t('generateTranslations')}
      </Button>
    </div>
  );
}

async function downloadCsv(filename: string, csv: ReadableStream<Uint8Array>) {
  const blob = await new Response(csv, {
    headers: { 'content-type': 'text/csv;charset=utf-8' },
  }).blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function resolveChoiceLabel(question: SurveyQuestion, choiceId: string, language: string): string {
  const choice = question.options?.find((option) => option.id === choiceId);
  return choice === undefined ? choiceId : resolveSurveyCopy(choice.label, language);
}

export function SurveyWorkspace({
  surveys,
  groups,
  options,
  onRefresh,
}: {
  readonly surveys: readonly StaffSurvey[];
  readonly groups: readonly CustomNotificationGroup[];
  readonly options: NotificationAudienceOptions;
  readonly onRefresh: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation('surveys');
  const resolvedLanguage = i18n?.resolvedLanguage ?? 'ca';
  const titleReview = useTranslationReview();
  const [title, setTitle] = useState('');
  const [eventId, setEventId] = useState('');
  const [publishedAt, setPublishedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [closesAt, setClosesAt] = useState('');
  const [audience, setAudience] = useState<NotificationAudience | null>({ kind: 'all' });
  const [questions, setQuestions] = useState<readonly DraftQuestion[]>([newQuestion()]);
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<'saved' | 'error' | null>(null);
  const [selectedSurveyId, setSelectedSurveyId] = useState(surveys[0]?.id ?? '');
  const [responses, setResponses] = useState<readonly SurveyResponse[]>([]);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const selectedSurvey = surveys.find((survey) => survey.id === selectedSurveyId) ?? surveys[0];

  const updateQuestion = useCallback((id: string, patch: Partial<DraftQuestion>) => {
    setQuestions((current) =>
      current.map((question) => (question.id === id ? { ...question, ...patch } : question)),
    );
  }, []);

  useEffect(() => {
    if (selectedSurvey === undefined) {
      setResponses([]);
      return;
    }
    let cancelled = false;
    setLoadingResponses(true);
    void fetchSurveyResponses(supabase, selectedSurvey.id)
      .then((result) => {
        if (!cancelled) setResponses(result);
      })
      .finally(() => {
        if (!cancelled) setLoadingResponses(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSurvey]);

  const aggregates = useMemo(
    () =>
      selectedSurvey === undefined
        ? null
        : aggregateSurveyResults(selectedSurvey.questions, responses),
    [responses, selectedSurvey],
  );
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(resolvedLanguage, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [resolvedLanguage],
  );
  const formatAnswer = useCallback(
    (question: SurveyQuestion, answer: SurveyResponse['answers'][string] | undefined) => {
      if (answer === undefined) return '';
      if (question.type === 'multiple_choice' && typeof answer === 'string') {
        return resolveChoiceLabel(question, answer, resolvedLanguage);
      }
      if (question.type === 'yes_no' && typeof answer === 'boolean') {
        return t(answer ? 'yes' : 'no');
      }
      if (question.type === 'rating' && typeof answer === 'number') {
        return t('ratingLabel', { count: answer });
      }
      return String(answer);
    },
    [resolvedLanguage, t],
  );

  async function generateTitle() {
    setGeneratingTitle(true);
    try {
      const result = await requestCatalanTranslation(title);
      if (result.ok) startGeneratedReview(result.value, titleReview.start);
    } finally {
      setGeneratingTitle(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      audience === null ||
      !titleReview.isPublishable ||
      questions.some((question) => question.prompt === null)
    ) {
      setNotice('error');
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      await saveSurvey(supabase, {
        title: reviewedCopy(title, titleReview.review),
        eventId: eventId.length === 0 ? null : eventId,
        publishedAt: new Date(publishedAt).toISOString(),
        closesAt: closesAt.length === 0 ? null : new Date(closesAt).toISOString(),
        audience,
        questions: questions.map((question, index) => ({
          id: question.id,
          type: question.type,
          prompt: question.prompt!,
          options: question.options,
          required: question.required,
          sortOrder: (index + 1) * 10,
        })),
      });
      setNotice('saved');
      await onRefresh();
    } catch {
      setNotice('error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-10 px-4 py-8 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-neutral-950">{t('title')}</h1>
        <p className="text-neutral-600">{t('intro')}</p>
      </header>

      <form
        onSubmit={submit}
        className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
      >
        <h2 className="text-xl font-semibold">{t('newSurvey')}</h2>
        <MultilingualEditor
          fieldId="survey-title"
          sourceLabel={t('surveyTitle')}
          sourceValue={title}
          review={titleReview.review}
          maxLength={160}
          onSourceChange={(value) => {
            setTitle(value);
            titleReview.reset();
          }}
          onTranslationChange={titleReview.edit}
          translationNamespace="surveys"
        />
        <TranslationReviewPanel
          fieldId="survey-title"
          review={titleReview.review}
          onApprove={titleReview.approve}
          onReject={titleReview.reject}
          onApproveAll={() => approveAll(titleReview.review, titleReview.approve)}
          translationNamespace="surveys"
        />
        <Button
          type="button"
          variant="secondary"
          disabled={title.trim().length === 0 || generatingTitle}
          onClick={() => void generateTitle()}
        >
          {generatingTitle ? t('generating') : t('generateTranslations')}
        </Button>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-2 text-sm font-medium">
            {t('eventLabel')}
            <select
              value={eventId}
              onChange={(event) => setEventId(event.target.value)}
              className="min-h-11 rounded-lg border border-neutral-300 bg-white px-3"
            >
              <option value="">{t('noEvent')}</option>
              {options.events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            {t('publishAt')}
            <Input
              type="datetime-local"
              value={publishedAt}
              onChange={(event) => setPublishedAt(event.target.value)}
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            {t('closesAt')}
            <Input
              type="datetime-local"
              value={closesAt}
              onChange={(event) => setClosesAt(event.target.value)}
            />
          </label>
        </div>

        <fieldset className="rounded-xl border border-neutral-200 p-4">
          <legend className="px-2 font-semibold">{t('notifications:audienceTitle')}</legend>
          <AudiencePicker
            idPrefix="survey"
            audience={audience}
            groups={groups}
            options={options}
            onChange={setAudience}
          />
        </fieldset>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">{t('questionsTitle')}</h3>
            <Button
              type="button"
              variant="outline"
              onClick={() => setQuestions((current) => [...current, newQuestion()])}
            >
              {t('addQuestion')}
            </Button>
          </div>
          {questions.map((question, index) => (
            <article
              key={question.id}
              data-testid={`survey-question-${index}`}
              className="space-y-4 rounded-xl border border-neutral-200 p-4"
            >
              <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <label className="grid gap-2 text-sm font-medium">
                  {t('questionType')}
                  <select
                    value={question.type}
                    onChange={(event) => {
                      const type = event.target.value as SurveyQuestionType;
                      updateQuestion(question.id, {
                        type,
                        required: type !== 'free_text',
                        options:
                          type === 'multiple_choice'
                            ? [
                                { id: 'option_1', label: blankCopy() },
                                { id: 'option_2', label: blankCopy() },
                              ]
                            : null,
                      });
                    }}
                    className="min-h-11 rounded-lg border border-neutral-300 bg-white px-3"
                  >
                    {QUESTION_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(type)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={question.required}
                    onChange={(event) =>
                      updateQuestion(question.id, { required: event.target.checked })
                    }
                  />
                  {t('required')}
                </label>
                <Button
                  type="button"
                  variant="outline"
                  disabled={questions.length === 1}
                  onClick={() =>
                    setQuestions((current) => current.filter((item) => item.id !== question.id))
                  }
                >
                  {t('removeQuestion')}
                </Button>
              </div>
              <QuestionPromptEditor question={question} onUpdate={updateQuestion} />
              {question.type === 'multiple_choice' ? (
                <fieldset className="space-y-3 rounded-lg bg-neutral-50 p-4">
                  <legend className="px-2 font-medium">{t('choices')}</legend>
                  {question.options?.map((option, optionIndex) => (
                    <div key={option.id} className="grid gap-2 md:grid-cols-5">
                      {ALL_LANGUAGES.map((language) => (
                        <Input
                          key={language}
                          aria-label={`${t('choicePlaceholder', { number: optionIndex + 1 })} ${language}`}
                          value={option.label[language]}
                          onChange={(event) =>
                            updateQuestion(question.id, {
                              options: question.options?.map((item) =>
                                item.id === option.id
                                  ? {
                                      ...item,
                                      label: { ...item.label, [language]: event.target.value },
                                    }
                                  : item,
                              ),
                            })
                          }
                          placeholder={`${t('choicePlaceholder', { number: optionIndex + 1 })} (${language})`}
                        />
                      ))}
                    </div>
                  ))}
                </fieldset>
              ) : null}
            </article>
          ))}
        </section>

        {notice === 'error' ? (
          <p role="alert" className="text-sm text-red-700">
            {titleReview.isPublishable ? t('error') : t('translationRequired')}
          </p>
        ) : null}
        {notice === 'saved' ? (
          <p role="status" className="text-sm text-green-700">
            {t('saved')}
          </p>
        ) : null}
        <Button type="submit" disabled={saving}>
          {saving ? t('saving') : t('savePublish')}
        </Button>
      </form>

      <section className="space-y-5" aria-labelledby="survey-results-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="survey-results-title" className="text-xl font-semibold">
            {t('results')}
          </h2>
          {selectedSurvey ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void downloadCsv(
                  `survey-${selectedSurvey.id}.csv`,
                  streamSurveyCsv(selectedSurvey.questions, responses),
                )
              }
            >
              {t('exportCsv')}
            </Button>
          ) : null}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {surveys.map((survey) => (
            <button
              key={survey.id}
              type="button"
              onClick={() => setSelectedSurveyId(survey.id)}
              className={`rounded-xl border p-4 text-start ${selectedSurvey?.id === survey.id ? 'border-primary bg-primary/5' : 'border-neutral-200 bg-white'}`}
            >
              <strong>{resolveSurveyCopy(survey.title, resolvedLanguage)}</strong>
              <span className="mt-2 block text-sm text-neutral-600">
                {t('responsesCount', { count: survey.responseCount })} ·{' '}
                {t('completedCount', { count: survey.completedCount })}
              </span>
              {survey.closesAt ? (
                <span className="mt-1 block text-xs text-neutral-500">
                  {t('closes', { date: dateFormatter.format(new Date(survey.closesAt)) })}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {loadingResponses ? <p>{t('common:loading')}</p> : null}
        {!loadingResponses && aggregates?.responseCount === 0 ? <p>{t('noResponses')}</p> : null}
        {selectedSurvey && aggregates && aggregates.responseCount > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {selectedSurvey.questions.map((question) => {
              const aggregate = aggregates.byQuestion[question.id];
              if (!aggregate) return null;
              return (
                <article
                  key={question.id}
                  className="rounded-xl border border-neutral-200 bg-white p-4"
                >
                  <h3 className="font-semibold">{question.prompt.ca}</h3>
                  {aggregate.type === 'rating' ? (
                    <div className="mt-3 space-y-2">
                      <strong className="text-2xl">
                        {t('ratingLabel', { count: aggregate.average.toFixed(1) })}
                      </strong>
                      {Object.entries(aggregate.counts).map(([rating, count]) => (
                        <div key={rating} className="flex items-center gap-2 text-sm">
                          <span className="w-8">
                            {rating}
                            {STAR_SYMBOL}
                          </span>
                          <span className="h-2 flex-1 rounded-full bg-neutral-100">
                            <span
                              className="block h-2 rounded-full bg-primary"
                              style={{ width: `${(count / aggregates.responseCount) * 100}%` }}
                            />
                          </span>
                          <span>{count}</span>
                        </div>
                      ))}
                    </div>
                  ) : aggregate.type === 'multiple_choice' ? (
                    <ul className="mt-3 space-y-2">
                      {Object.entries(aggregate.counts).map(([choice, count]) => (
                        <li
                          key={choice}
                          className="flex justify-between rounded-lg bg-neutral-50 p-2"
                        >
                          <span>{resolveChoiceLabel(question, choice, resolvedLanguage)}</span>
                          <strong>{count}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : aggregate.type === 'yes_no' ? (
                    <div className="mt-3 grid grid-cols-2 gap-3 text-center">
                      <div className="rounded-lg bg-green-50 p-3">
                        <strong>{t('yes')}</strong>
                        <br />
                        {aggregate.yes}
                      </div>
                      <div className="rounded-lg bg-neutral-50 p-3">
                        <strong>{t('no')}</strong>
                        <br />
                        {aggregate.no}
                      </div>
                    </div>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {aggregate.answers.map((answer) => (
                        <li key={answer.playerId} className="rounded-lg bg-neutral-50 p-3">
                          <strong>{answer.playerName}</strong>
                          <p>{answer.value}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        ) : null}

        {responses.length > 0 ? (
          <div className="space-y-3">
            <h3 className="font-semibold">{t('individualResponses')}</h3>
            {responses.map((response) => (
              <details
                key={response.id}
                className="rounded-xl border border-neutral-200 bg-white p-4"
              >
                <summary className="cursor-pointer font-medium">
                  {response.playerName} · {t(response.status)}
                </summary>
                <dl className="mt-3 grid gap-2 text-sm">
                  {selectedSurvey?.questions.map((question) => (
                    <div key={question.id}>
                      <dt className="font-medium">{question.prompt.ca}</dt>
                      <dd>{formatAnswer(question, response.answers[question.id])}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
