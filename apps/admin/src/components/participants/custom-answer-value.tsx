/**
 * Her answer to a Ramassà field in words (RAPP-307, RAPP-610): an option's
 * label in the reader's language, a date and a number in her locale; a file
 * reads by its name with a private link, when the deployment has the media
 * service.
 */

import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  answerText,
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
  };
}

export function CustomAnswerValueView({
  question,
  value,
  language,
  onOpenFile,
}: {
  readonly question: CustomQuestion;
  readonly value: CustomAnswerValue;
  readonly language: LanguageCode;
  /** Opens one of her private files (RAPP-610); undefined without the media service. */
  readonly onOpenFile?: (objectKey: string) => Promise<void>;
}) {
  const words = useAnswerWords();
  if (question.type === 'file_upload' && typeof value === 'object' && !Array.isArray(value)) {
    return <FileAnswerLink file={value as FileAnswer} onOpenFile={onOpenFile} />;
  }
  return <>{answerText(question, value, language, words)}</>;
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
