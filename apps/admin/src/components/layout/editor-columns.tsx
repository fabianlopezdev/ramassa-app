/**
 * An editor and its preview side by side (RAPP-641, RAPP-652): the form on
 * the start side, written in one language at a time, and the preview kept in
 * view on the end side while the form scrolls. The preview follows the
 * editing language when it changes; its own switch stays free. Next to the
 * editing language, a button translates the screen from Catalan (RAPP-750).
 */

import { EditingLanguageContext } from '@/components/fields/language-fields';
import {
  TranslatableRegisterProvider,
  TranslatableSource,
  TranslateFromCatalanButton,
  useTranslatableRegister,
  type TranslatableTexts,
} from '@/components/layout/translate-from-catalan';
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
  previewNote,
  form,
  preview,
  previewFooter,
  previewLanguageTestId = 'phone-language',
  translatable,
}: {
  readonly language: LanguageCode;
  readonly onLanguageChange: (language: LanguageCode) => void;
  readonly previewLanguage: LanguageCode;
  readonly onPreviewLanguageChange: (language: LanguageCode) => void;
  /** The preview's name for assistive technology. */
  readonly previewLabel: string;
  readonly previewLanguageLabel: string;
  /** One line under the preview's languages, such as the phone being an approximation (RAPP-704). */
  readonly previewNote?: string;
  readonly form: ReactNode;
  readonly preview: ReactNode;
  /** Under the preview, such as the button that adds a dependent screen (RAPP-718). */
  readonly previewFooter?: ReactNode;
  readonly previewLanguageTestId?: string;
  /** The texts the editor itself holds; its sections offer their own. */
  readonly translatable?: TranslatableTexts;
}) {
  const { t } = useTranslation('settings');
  const register = useTranslatableRegister();
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,56rem)_22rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
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
          <TranslateFromCatalanButton target={language} run={register.run} />
        </div>
        <TranslatableRegisterProvider register={register.register}>
          {translatable === undefined ? null : <TranslatableSource source={translatable} />}
          <EditingLanguageContext.Provider value={language}>{form}</EditingLanguageContext.Provider>
        </TranslatableRegisterProvider>
      </div>
      <aside
        className="flex flex-col items-center gap-6 lg:sticky lg:top-20 lg:h-[calc(100dvh-6rem)]"
        aria-label={previewLabel}
      >
        <div className="flex shrink-0 flex-col items-center gap-4">
          <LanguageTabs
            value={previewLanguage}
            onChange={onPreviewLanguageChange}
            label={previewLanguageLabel}
            testId={previewLanguageTestId}
          />
          {previewNote === undefined ? null : (
            <p className="max-w-[20rem] text-center text-xs leading-5 text-muted-foreground">
              {previewNote}
            </p>
          )}
        </div>
        <div className="w-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:[container-type:size] lg:[--editor-phone-width:min(20rem,calc((100cqh_-_1.25rem)*9/19_+_1.25rem))]">
          {preview}
        </div>
        {previewFooter == null ? null : <div className="w-full shrink-0">{previewFooter}</div>}
      </aside>
    </div>
  );
}
