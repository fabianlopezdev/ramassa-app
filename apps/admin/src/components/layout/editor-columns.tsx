/**
 * An editor and its preview side by side (RAPP-641, RAPP-652): the form on
 * the start side, written in one language at a time, and the preview kept in
 * view on the end side while the form scrolls. The preview follows the
 * editing language when it changes; its own switch stays free.
 */

import { EditingLanguageContext } from '@/components/fields/language-fields';
import { LanguageTabs } from '@/components/onboarding/language-tabs';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { LanguageCode } from '@ramassa/shared/schemas';

export function EditorColumns({
  language,
  onLanguageChange,
  previewLanguage,
  onPreviewLanguageChange,
  previewLabel,
  previewLanguageLabel,
  form,
  preview,
  previewLanguageTestId = 'phone-language',
}: {
  readonly language: LanguageCode;
  readonly onLanguageChange: (language: LanguageCode) => void;
  readonly previewLanguage: LanguageCode;
  readonly onPreviewLanguageChange: (language: LanguageCode) => void;
  /** The preview's name for assistive technology. */
  readonly previewLabel: string;
  readonly previewLanguageLabel: string;
  readonly form: ReactNode;
  readonly preview: ReactNode;
  readonly previewLanguageTestId?: string;
}) {
  const { t } = useTranslation('settings');
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,56rem)_22rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <LanguageTabs
          value={language}
          onChange={(next) => {
            onLanguageChange(next);
            // The preview follows, so staff see what they type.
            onPreviewLanguageChange(next);
          }}
          label={t('onboardingBoard.editingLanguage')}
          testId="editor-language"
        />
        <EditingLanguageContext.Provider value={language}>{form}</EditingLanguageContext.Provider>
      </div>
      <aside
        className="flex flex-col items-center gap-6 lg:sticky lg:top-6"
        aria-label={previewLabel}
      >
        <LanguageTabs
          value={previewLanguage}
          onChange={onPreviewLanguageChange}
          label={previewLanguageLabel}
          testId={previewLanguageTestId}
        />
        {preview}
      </aside>
    </div>
  );
}
