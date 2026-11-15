/**
 * A section's name in the five languages (RAPP-650): the language switch, one
 * box in that language, Save and Cancel. It renames a section inline in its
 * header and names a new one in the add dialog. Catalan is required, the
 * language every other one falls back to.
 */

import { ErrorLine, useAction } from '@/components/fields/field-form';
import {
  EditingLanguageContext,
  LanguageFields,
  textFromForm,
} from '@/components/fields/language-fields';
import { LanguageTabs } from '@/components/onboarding/language-tabs';
import { Button } from '@/components/ui/button';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { BuilderText } from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export function SectionTitleForm({
  title,
  onSave,
  onCancel,
  testId = 'section-title-form',
}: {
  /** The saved name; null for a new section. */
  readonly title: BuilderText | null;
  readonly onSave: (title: BuilderText) => Promise<void>;
  readonly onCancel: () => void;
  readonly testId?: string;
}) {
  const { t } = useTranslation('settings');
  const action = useAction();
  const [language, setLanguage] = useState<LanguageCode>('ca');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = textFromForm(new FormData(event.currentTarget), 'section-title');
    if ((next.ca ?? '') === '') {
      setLanguage('ca');
      action.setError(t('questions.catalanNeeded'));
      return;
    }
    if (await action.run(() => onSave(next))) onCancel();
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
          name="section-title"
          legend={t('profileLayout.sectionName')}
          value={title}
          isCatalanRequired
        />
      </EditingLanguageContext.Provider>
      <ErrorLine message={action.error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          {t('questions.cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={action.isBusy} data-testid={`${testId}-save`}>
          {t('profileLayout.saveSection')}
        </Button>
      </div>
    </form>
  );
}
