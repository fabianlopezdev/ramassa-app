/**
 * The note under the wizard's document step (RAPP-302): why Ramassà asks for an
 * identity document and what it is used for. The step is optional, and this is
 * where staff tell the women and the referring entities so.
 *
 * Multilingual like other staff content. Catalan is required once anything is
 * written, because every other language falls back to it. Leaving every box
 * empty removes the note, and then the step shows no extra line.
 */

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n/languages';
import {
  DOCUMENT_EXPLANATION_MAX_LENGTH,
  documentExplanationDraftSchema,
  type DocumentExplanationDraft,
} from '@ramassa/shared/intake';
import type { LocalizedText } from '@ramassa/shared/schemas';

export interface DocumentExplanationFormProps {
  readonly explanation: LocalizedText | null;
  readonly onSave: (explanation: LocalizedText | null) => Promise<void>;
}

type Status = 'idle' | 'saving' | 'saved' | 'catalanRequired' | 'tooLong' | 'failed';

export function DocumentExplanationForm({ explanation, onSave }: DocumentExplanationFormProps) {
  const { t } = useTranslation('settings');
  const [status, setStatus] = useState<Status>('idle');

  // Read from the form on submit, like the other settings forms: the boxes
  // keep their own text while staff type.
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const draft: DocumentExplanationDraft = Object.fromEntries(
      SUPPORTED_LANGUAGES.map((language) => [
        language,
        String(fields.get(`document-explanation-${language}`) ?? ''),
      ]),
    );
    const parsed = documentExplanationDraftSchema.safeParse(draft);
    if (!parsed.success) {
      const tooLong = parsed.error.issues.some((issue) => issue.message === 'too long');
      setStatus(tooLong ? 'tooLong' : 'catalanRequired');
      return;
    }
    setStatus('saving');
    try {
      await onSave(parsed.data);
      setStatus('saved');
    } catch {
      setStatus('failed');
    }
  }

  const message =
    status === 'saved'
      ? t('documentExplanationSaved')
      : status === 'catalanRequired'
        ? t('documentExplanationCatalanRequired')
        : status === 'tooLong'
          ? t('documentExplanationTooLong', { max: DOCUMENT_EXPLANATION_MAX_LENGTH })
          : status === 'failed'
            ? t('documentExplanationFailed')
            : null;

  return (
    <form
      className="grid gap-4 rounded-xl border bg-card p-5"
      onSubmit={(event) => void submit(event)}
      onChange={() => setStatus('idle')}
      data-testid="document-explanation-form"
      noValidate
    >
      <div className="grid gap-1">
        <h3 className="text-start text-base font-semibold">{t('documentExplanationTitle')}</h3>
        <p className="text-start text-sm text-muted-foreground">{t('documentExplanationIntro')}</p>
      </div>
      {SUPPORTED_LANGUAGES.map((language) => (
        <label key={language} className="grid gap-1.5 text-sm font-medium">
          <span>
            {LANGUAGE_NATIVE_NAMES[language]}
            {language === 'ca' ? ` (${t('documentExplanationFallback')})` : ''}
          </span>
          <Textarea
            id={`document-explanation-${language}`}
            name={`document-explanation-${language}`}
            lang={language}
            dir={language === 'ar' || language === 'fa' ? 'rtl' : 'ltr'}
            defaultValue={explanation?.[language] ?? ''}
            maxLength={DOCUMENT_EXPLANATION_MAX_LENGTH}
            aria-invalid={status === 'catalanRequired' && language === 'ca'}
          />
        </label>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="w-fit" disabled={status === 'saving'}>
          {status === 'saving' ? t('working') : t('documentExplanationSave')}
        </Button>
        {message === null ? null : (
          <p
            aria-live="polite"
            className={
              status === 'saved'
                ? 'text-start text-sm text-muted-foreground'
                : 'text-start text-sm text-destructive'
            }
          >
            {message}
          </p>
        )}
      </div>
    </form>
  );
}
