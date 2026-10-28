/**
 * The note under the wizard's document step (RAPP-302): why Ramassà asks for an
 * identity document and what it is used for. The step is optional, and this is
 * where staff tell the women and the referring entities so.
 *
 * Multilingual like other staff content. Catalan is required once anything is
 * written, because every other language falls back to it. Leaving every box
 * empty removes the note, and then the step shows no extra line.
 */

import { EditorSection } from '@/components/layout/editor-section';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getLanguageDirection } from '@ramassa/shared/i18n/languages';
import {
  DOCUMENT_EXPLANATION_MAX_LENGTH,
  documentExplanationDraftSchema,
} from '@ramassa/shared/intake';
import type { LanguageCode, LocalizedText } from '@ramassa/shared/schemas';

export interface DocumentExplanationFormProps {
  readonly explanation: LocalizedText | null;
  /** The language picked at the top of the screen's editor (RAPP-714). */
  readonly language: LanguageCode;
  readonly onSave: (explanation: LocalizedText | null) => Promise<void>;
}

type Status = 'idle' | 'saving' | 'saved' | 'catalanRequired' | 'tooLong' | 'failed';

/**
 * Written in one language at a time, the one picked at the top of the screen's
 * editor, like every other text on the screen (RAPP-714). The other languages
 * keep what was typed in them while staff switch.
 */
export function DocumentExplanationForm({
  explanation,
  language,
  onSave,
}: DocumentExplanationFormProps) {
  const { t } = useTranslation('settings');
  const [status, setStatus] = useState<Status>('idle');
  const [texts, setTexts] = useState<Record<string, string>>(() => ({ ...(explanation ?? {}) }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = documentExplanationDraftSchema.safeParse(texts);
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
      onSubmit={(event) => void submit(event)}
      data-testid="document-explanation-form"
      noValidate
    >
      <EditorSection
        title={t('documentExplanationTitle')}
        footer={
          <>
            {message === null ? null : (
              <p
                aria-live="polite"
                className={
                  status === 'saved'
                    ? 'me-auto text-start text-sm text-muted-foreground'
                    : 'me-auto text-start text-sm text-destructive'
                }
              >
                {message}
              </p>
            )}
            <Button type="submit" disabled={status === 'saving'}>
              {status === 'saving' ? t('working') : t('documentExplanationSave')}
            </Button>
          </>
        }
      >
        <Textarea
          id={`document-explanation-${language}`}
          aria-label={t('documentExplanationTitle')}
          lang={language}
          dir={getLanguageDirection(language)}
          rows={3}
          value={texts[language] ?? ''}
          maxLength={DOCUMENT_EXPLANATION_MAX_LENGTH}
          aria-invalid={status === 'catalanRequired' && language === 'ca'}
          onChange={(event) => {
            setStatus('idle');
            setTexts((current) => ({ ...current, [language]: event.target.value }));
          }}
        />
      </EditorSection>
    </form>
  );
}
