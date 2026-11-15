/**
 * A consent of Dades legals in the five languages (RAPP-699): its name, which
 * the team reads, and the text she ticks. Catalan is required for both, the
 * language every other one falls back to. The same form adds a consent on
 * Dades legals and rewords one there or from a screen that asks it.
 *
 * A text saved here reaches players with the form's next Desa: a published
 * authorization keeps the text it showed.
 */

import { ErrorLine, useAction } from '@/components/fields/field-form';
import {
  EditingLanguageContext,
  LanguageFields,
  textFromForm,
} from '@/components/fields/language-fields';
import { LanguageTabs } from '@/components/onboarding/language-tabs';
import { Button } from '@/components/ui/button';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { BuilderText, Consent } from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export interface ConsentDraft {
  readonly name: BuilderText;
  readonly body: BuilderText;
}

export function ConsentForm({
  consent,
  onSave,
  onCancel,
  secondaryAction,
  testId = 'consent-form',
}: {
  /** The saved consent; null for a new one. */
  readonly consent: Pick<Consent, 'name' | 'body'> | null;
  readonly onSave: (draft: ConsentDraft) => Promise<unknown>;
  readonly onCancel: () => void;
  /** An action at the start of the buttons row: archive, or edit elsewhere. */
  readonly secondaryAction?: ReactNode;
  readonly testId?: string;
}) {
  const { t } = useTranslation('settings');
  const action = useAction();
  const [language, setLanguage] = useState<LanguageCode>('ca');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const draft = {
      name: textFromForm(fields, 'consent-name'),
      body: textFromForm(fields, 'consent-body'),
    };
    if ((draft.name.ca ?? '') === '' || (draft.body.ca ?? '') === '') {
      setLanguage('ca');
      action.setError(t('questions.catalanNeeded'));
      return;
    }
    if (
      await action.run(async () => {
        await onSave(draft);
      })
    )
      onCancel();
  }

  return (
    <form
      className="flex w-full flex-col gap-3"
      data-testid={testId}
      onSubmit={(event) => void submit(event)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <LanguageTabs
        value={language}
        onChange={setLanguage}
        label={t('onboardingBoard.editingLanguage')}
        testId={`${testId}-language`}
      />
      <EditingLanguageContext.Provider value={language}>
        <LanguageFields
          name="consent-name"
          legend={t('legalData.consentName')}
          value={consent?.name}
          isCatalanRequired
        />
        <LanguageFields
          name="consent-body"
          legend={t('legalData.consentText')}
          value={consent?.body}
          isCatalanRequired
          isLong
        />
      </EditingLanguageContext.Provider>
      <ErrorLine message={action.error} />
      <div className="flex flex-wrap items-center gap-2">
        {secondaryAction}
        <span className="flex-1" />
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          {t('questions.cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={action.isBusy} data-testid={`${testId}-save`}>
          {t('legalData.saveConsent')}
        </Button>
      </div>
    </form>
  );
}
