/**
 * Her answers to the questions staff added (RAPP-307), on the participant
 * page, grouped by screen. A seasonal question shows every season apart. The
 * database leaves out an answer above the reader's level (Personal needs
 * participants.view_personal, Sensitive participants.view_sensitive).
 *
 * Staff with participants.view_personal complete or correct the current
 * answers here, staff-only questions included. A Sensitive question is left
 * out of the form for someone who cannot read it.
 */

import { CustomAnswerFields, readCustomAnswers } from '@/components/intake/custom-answer-fields';
import { SignatureDrawing } from '@/components/participants/participant-authorization-panel';
import { Button } from '@/components/ui/button';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { SignatureStrokes } from '@ramassa/shared/equipment';
import { getErrorMessageKey, isAppError } from '@ramassa/shared/errors';
import {
  answerText,
  customAnswerError,
  screensFor,
  textIn,
  type CustomAnswers,
  type CustomAnswerValue,
  type CustomQuestion,
  type FileAnswer,
  type IntakeCatalog,
  type ParticipantCustomAnswer,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export interface ParticipantCustomAnswersProps {
  readonly catalog: IntakeCatalog;
  readonly answers: readonly ParticipantCustomAnswer[];
  readonly canEdit: boolean;
  readonly canEditSensitive: boolean;
  readonly onSave: (answers: Readonly<Record<string, CustomAnswerValue | null>>) => Promise<void>;
  /**
   * Opens one of her private answer files (RAPP-610); undefined when this
   * deployment has no media service, and the page says so.
   */
  readonly onOpenFile?: (objectKey: string) => Promise<void>;
}

/** A signature reads "signed"; staff who may read the answer open the drawing. */
function SignatureAnswer({
  strokes,
  label,
}: {
  readonly strokes: unknown;
  readonly label: string;
}) {
  const { t } = useTranslation('settings');
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-start">
        {t('questions.answers.signed')} · {t('questions.answers.viewSignature')}
      </summary>
      <div className="mt-2">
        <SignatureDrawing strokes={strokes as SignatureStrokes} label={label} />
      </div>
    </details>
  );
}

/** A file reads by its name, with a private link for staff who may read the answer. */
function FileAnswerLink({
  file,
  onOpenFile,
}: {
  readonly file: FileAnswer;
  readonly onOpenFile: ((objectKey: string) => Promise<void>) | undefined;
}) {
  const { t } = useTranslation('settings');
  const [failed, setFailed] = useState(false);
  if (onOpenFile === undefined) {
    return (
      <span>
        {file.name} ·{' '}
        <span className="text-muted-foreground">{t('questions.answers.fileUnavailable')}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span>{file.name}</span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setFailed(false);
          onOpenFile(file.key).catch(() => setFailed(true));
        }}
      >
        {t('questions.answers.openFile')}
      </Button>
      {failed ? (
        <span role="alert" className="text-destructive">
          {t('questions.answers.fileFailed')}
        </span>
      ) : null}
    </span>
  );
}

export function ParticipantCustomAnswers({
  catalog,
  answers,
  canEdit,
  canEditSensitive,
  onSave,
  onOpenFile,
}: ParticipantCustomAnswersProps) {
  const { t, i18n } = useTranslation(['settings', 'participants', 'errors']);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every screen with a question answered or answerable, archived ones too when answered.
  const answeredIds = new Set(answers.map((answer) => answer.questionId));
  const shown = catalog.screens
    .map((screen) => ({
      ...screen,
      questions: screen.questions.filter(
        (question) => answeredIds.has(question.id) || (!question.isArchived && !screen.isArchived),
      ),
    }))
    .filter((screen) => screen.questions.length > 0);
  if (shown.length === 0) return null;

  const words = {
    yes: t('settings:questions.answers.yes'),
    no: t('settings:questions.answers.no'),
    maybe: t('settings:questions.answers.maybe'),
    archived: t('settings:questions.archivedOption'),
    signed: t('settings:questions.answers.signed'),
  };
  const renderAnswer = (question: CustomQuestion, row: ParticipantCustomAnswer) => {
    if (question.type === 'signature')
      return <SignatureAnswer strokes={row.value} label={textIn(question.label, language)} />;
    if (
      question.type === 'file_upload' &&
      typeof row.value === 'object' &&
      !Array.isArray(row.value)
    )
      return <FileAnswerLink file={row.value as FileAnswer} onOpenFile={onOpenFile} />;
    return answerText(question, row.value, language, words, { answeredAt: row.answeredAt });
  };
  // The current value of each question: no season, or the newest season.
  const current: CustomAnswers = Object.fromEntries(
    answers
      .filter(
        (answer, index, all) =>
          all.findIndex((other) => other.questionId === answer.questionId) === index,
      )
      .map((answer) => [answer.questionId, answer.value]),
  );
  const editable = screensFor(
    catalog,
    (question) => question.privacy !== 'sensitive' || canEditSensitive,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      // Only what changed: an answer kept on an archived option is not sent again,
      // because the database offers archived options to nobody.
      const read = readCustomAnswers(new FormData(event.currentTarget), editable, 'custom-answer');

      const changed = Object.fromEntries(
        Object.entries(read).filter(
          ([id, value]) => JSON.stringify(value) !== JSON.stringify(current[id] ?? null),
        ),
      );
      // The shared check before the database's own (RAPP-610), on what changed:
      // name each answer that does not fit its question.
      const misfit = editable
        .flatMap((screen) => screen.questions)
        .filter(
          (question) =>
            question.id in changed &&
            customAnswerError(question, changed[question.id] ?? null) !== null,
        );
      if (misfit.length > 0) {
        setError(
          t('settings:questions.answers.doesNotFit', {
            questions: misfit.map((question) => textIn(question.label, language)).join(', '),
          }),
        );
        return;
      }
      if (Object.keys(changed).length > 0) await onSave(changed);
      setIsEditing(false);
    } catch (thrown) {
      setError(
        isAppError(thrown) ? t(getErrorMessageKey(thrown.code)) : t('settings:questions.failed'),
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="custom-answers-title"
      className="flex flex-col gap-4 rounded-xl border bg-card p-5"
      data-testid="participant-custom-answers"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="custom-answers-title" className="text-start text-lg font-semibold">
          {t('settings:questions.answersTitle')}
        </h2>
        {canEdit && !isEditing ? (
          <Button type="button" variant="outline" onClick={() => setIsEditing(true)}>
            {t('settings:questions.editAnswers')}
          </Button>
        ) : null}
      </div>

      {isEditing ? (
        <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
          <CustomAnswerFields
            screens={editable}
            values={current}
            prefix="custom-answer"
            language={language}
          />
          {error === null ? null : (
            <p aria-live="polite" className="text-start text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={isSaving}>
              {t('settings:questions.saveAnswers')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setIsEditing(false)}>
              {t('settings:questions.cancel')}
            </Button>
          </div>
        </form>
      ) : (
        shown.map((screen) => (
          <div key={screen.id} className="flex flex-col gap-2">
            <h3 className="text-start text-sm font-semibold">{textIn(screen.title, language)}</h3>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              {screen.questions.map((question) => {
                const rows = answers.filter((answer) => answer.questionId === question.id);
                return (
                  <div key={question.id} className="contents">
                    <dt className="text-start text-sm text-muted-foreground">
                      {textIn(question.label, language)}
                    </dt>
                    <dd className="text-start text-sm" data-testid={`custom-answer-${question.id}`}>
                      {rows.length === 0
                        ? t('settings:questions.notAnswered')
                        : rows.map((row) => (
                            <div key={`${row.questionId}-${row.seasonId ?? 'none'}`} dir="auto">
                              {row.seasonName === null ? '' : `${row.seasonName}: `}
                              {renderAnswer(question, row)}
                            </div>
                          ))}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ))
      )}
    </section>
  );
}
