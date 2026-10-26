/**
 * Her answer to a Ramassà field in words (RAPP-307, RAPP-610): an option's
 * label in the reader's language, a date and a number in her locale, a
 * consent with its time. A consent she signed reads "accepted, signed on" its
 * day and opens the drawing (RAPP-671); a file reads by its name with a private
 * link, when the deployment has the media service.
 */

import { SignatureDrawing } from '@/components/participants/participant-authorization-panel';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SignatureStrokes } from '@ramassa/shared/equipment';
import {
  answerText,
  consentSignature,
  textIn,
  type CustomAnswerValue,
  type CustomQuestion,
  type FileAnswer,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

/** The words her answers are read with. */
export function useAnswerWords() {
  const { t } = useTranslation('settings');
  return {
    yes: t('settings:questions.answers.yes'),
    no: t('settings:questions.answers.no'),
    maybe: t('settings:questions.answers.maybe'),
    archived: t('settings:questions.archivedOption'),
    signedOn: (date: string) => t('settings:questions.answers.signedOn', { date }),
  };
}

export function CustomAnswerValueView({
  question,
  value,
  answeredAt,
  language,
  onOpenFile,
}: {
  readonly question: CustomQuestion;
  readonly value: CustomAnswerValue;
  readonly answeredAt: string;
  readonly language: LanguageCode;
  /** Opens one of her private files (RAPP-610); undefined without the media service. */
  readonly onOpenFile?: (objectKey: string) => Promise<void>;
}) {
  const words = useAnswerWords();
  const signature = question.type === 'consent' ? consentSignature(value) : null;
  if (signature !== null) {
    return (
      <SignatureAnswer
        text={answerText(question, value, language, words)}
        strokes={signature}
        label={textIn(question.label, language)}
      />
    );
  }
  if (question.type === 'file_upload' && typeof value === 'object' && !Array.isArray(value)) {
    return <FileAnswerLink file={value as FileAnswer} onOpenFile={onOpenFile} />;
  }
  return <>{answerText(question, value, language, words, { answeredAt })}</>;
}

/**
 * A signed consent reads "accepted, signed on" its day; staff who may read the
 * answer open the drawing in a dialog, so the row keeps its height.
 */
function SignatureAnswer({
  text,
  strokes,
  label,
}: {
  readonly text: string;
  readonly strokes: SignatureStrokes;
  readonly label: string;
}) {
  const { t } = useTranslation('settings');
  return (
    <span className="inline-flex items-center gap-2">
      <span>{text}</span>
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" size="xs" variant="outline">
            {t('questions.answers.viewSignature')}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription className="sr-only">{text}</DialogDescription>
          <SignatureDrawing strokes={strokes} label={label} />
        </DialogContent>
      </Dialog>
    </span>
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
    <span className="inline-flex items-center gap-2">
      <span className="truncate">{file.name}</span>
      <Button
        type="button"
        size="xs"
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
