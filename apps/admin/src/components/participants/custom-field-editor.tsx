/**
 * Editing her answer to a Ramassà field from her page (RAPP-653), with the
 * one input each type has (`CustomAnswerInput`) and the words her onboarding
 * uses when an answer does not fit. Saved through
 * `set_participant_custom_answers`, which names the team member as its source
 * and refuses a Sensible field to a reader who cannot read it.
 */

import {
  customAnswerErrorsOf,
  CustomAnswerInput,
  readCustomAnswersOf,
} from '@/components/intake/custom-answer-fields';
import { EditorForm } from '@/components/participants/builtin-field-editor';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getErrorMessageKey, isAppError } from '@ramassa/shared/errors';
import type { CustomAnswerValue, CustomQuestion } from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

const PREFIX = 'fitxa-answer';

export function CustomFieldEditor({
  question,
  value,
  language,
  onSave,
  onCancel,
}: {
  readonly question: CustomQuestion;
  readonly value: CustomAnswerValue | undefined;
  readonly language: LanguageCode;
  /** Null clears her answer. */
  readonly onSave: (value: CustomAnswerValue | null) => Promise<void>;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation(['participants', 'onboarding', 'settings', 'errors']);
  const formRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function submit() {
    const form = formRef.current?.closest('form');
    if (form == null) return;
    const answers = readCustomAnswersOf(new FormData(form), [question], PREFIX);
    const misfit = customAnswerErrorsOf([question], answers, t)[question.id];
    setError(misfit);
    setMessage(null);
    if (misfit !== undefined) return;
    const next = answers[question.id] ?? null;
    if (JSON.stringify(next) === JSON.stringify(value ?? null)) {
      onCancel();
      return;
    }
    setIsSaving(true);
    try {
      await onSave(next);
    } catch (thrown) {
      setMessage(
        isAppError(thrown) ? t(getErrorMessageKey(thrown.code)) : t('settings:questions.failed'),
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <EditorForm
      onSubmit={() => void submit()}
      onCancel={onCancel}
      isSubmitting={isSaving}
      message={message}
    >
      <div ref={formRef}>
        <CustomAnswerInput
          question={question}
          value={value}
          prefix={PREFIX}
          language={language}
          error={error}
        />
      </div>
    </EditorForm>
  );
}
