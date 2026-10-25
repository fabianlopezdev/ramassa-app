/**
 * Editing her answer to one field from her page (RAPP-653, RAPP-664). Every
 * field has this one editor, the app's fields and the team's alike: the one
 * input its type has (`CustomAnswerInput`), the words her onboarding uses
 * when an answer does not fit, and the fields that go with it in the same
 * form (a detail shown on one answer, the document's number with its type),
 * each asked only while it applies.
 *
 * Her names stay on her account (D2): their editor is a text input like any
 * short text, saved as her name.
 */

import {
  customAnswerErrorsOf,
  CustomAnswerInput,
  readCustomAnswersOf,
} from '@/components/intake/custom-answer-fields';
import { Button } from '@/components/ui/button';
import { type EditPartner } from '@/lib/participant-fitxa';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getErrorMessageKey, isAppError } from '@ramassa/shared/errors';
import type { CustomAnswerValue, CustomQuestion } from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

const PREFIX = 'fitxa-answer';

/** What one editor saves: each field it asked by id, null to clear. */
export type FieldAnswerChanges = Readonly<Record<string, CustomAnswerValue | null>>;

export interface FieldAnswerEditorProps {
  /** The field as a question, and her answer to it. */
  readonly question: CustomQuestion;
  readonly value: CustomAnswerValue | undefined;
  /** The fields that go with it, as questions, with her answers; only those she may read. */
  readonly partners?: readonly (EditPartner & {
    readonly question: CustomQuestion;
    readonly value: CustomAnswerValue | undefined;
  })[];
  /** An answer is required: her names are never empty. */
  readonly isRequired?: boolean;
  readonly language: LanguageCode;
  readonly onSave: (changes: FieldAnswerChanges) => Promise<void>;
  readonly onCancel: () => void;
}

export function FieldAnswerEditor({
  question,
  value,
  partners = [],
  isRequired = false,
  language,
  onSave,
  onCancel,
}: FieldAnswerEditorProps) {
  const { t } = useTranslation(['participants', 'onboarding', 'profile', 'settings', 'errors']);
  const formRef = useRef<HTMLDivElement>(null);
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // The main answer as she is choosing it, to know which partner applies.
  const [chosen, setChosen] = useState<CustomAnswerValue | null | undefined>(value);
  const asked = partners.filter((partner) => partner.asksWhen(chosen));
  const questions = [question, ...asked.map((partner) => partner.question)];

  function read() {
    const form = formRef.current?.closest('form');
    return form == null ? null : readCustomAnswersOf(new FormData(form), questions, PREFIX);
  }

  async function submit() {
    const answers = read();
    if (answers === null) return;
    const misfits = customAnswerErrorsOf(questions, answers, t);
    if (isRequired && answers[question.id] == null) {
      misfits[question.id] = t('onboarding:errorRequired');
    }
    setErrors(misfits);
    setMessage(null);
    if (Object.keys(misfits).length > 0) return;
    const before: Record<string, CustomAnswerValue | null> = {
      [question.id]: value ?? null,
      ...Object.fromEntries(asked.map((partner) => [partner.question.id, partner.value ?? null])),
    };
    if (JSON.stringify(answers) === JSON.stringify(before)) {
      onCancel();
      return;
    }
    setIsSaving(true);
    try {
      await onSave(answers);
    } catch (thrown) {
      setMessage(isAppError(thrown) ? t(getErrorMessageKey(thrown.code)) : t('profile:saveFailed'));
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
      <div
        ref={formRef}
        className="grid gap-4"
        onChange={() => setChosen(read()?.[question.id] ?? null)}
      >
        <CustomAnswerInput
          question={question}
          value={value}
          prefix={PREFIX}
          language={language}
          error={errors[question.id]}
        />
        {asked.map((partner) => (
          <CustomAnswerInput
            key={partner.question.id}
            question={partner.question}
            value={partner.value}
            prefix={PREFIX}
            language={language}
            error={errors[partner.question.id]}
          />
        ))}
      </div>
    </EditorForm>
  );
}

/** The inputs, then Save and Cancel, and what went wrong next to them. */
export function EditorForm({
  children,
  onSubmit,
  onCancel,
  isSubmitting,
  message,
}: {
  readonly children: ReactNode;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
  readonly isSubmitting: boolean;
  readonly message: string | null;
}) {
  const { t } = useTranslation('profile');
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="grid gap-4 sm:max-w-md">{children}</div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {t('profile:saveAction')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t('profile:cancelAction')}
        </Button>
        {message === null ? null : (
          <p aria-live="polite" className="text-start text-sm text-destructive">
            {message}
          </p>
        )}
      </div>
    </form>
  );
}
