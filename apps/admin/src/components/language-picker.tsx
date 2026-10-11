/**
 * The staff side's language (RAPP-238): Catalan, Spanish or English. The choice
 * is saved in the language cookie and applies at once; the document's `lang`
 * follows through the root's languageChanged listener.
 */
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LANGUAGE_NATIVE_NAMES,
  STAFF_LANGUAGES,
  staffLanguageFor,
  useLanguage,
  type SupportedLanguage,
} from '@ramassa/shared/i18n';

export function LanguagePicker({ className = '' }: { readonly className?: string }) {
  const { t } = useTranslation('common');
  const { language, setLanguage } = useLanguage();
  const id = useId();
  return (
    <div className={`flex items-center gap-2 text-sm ${className}`}>
      <label htmlFor={id} className="text-muted-foreground">
        {t('interfaceLanguageLabel')}
      </label>
      <select
        id={id}
        data-testid="language-picker"
        value={staffLanguageFor(language)}
        onChange={(event) => void setLanguage(event.target.value as SupportedLanguage)}
        className="h-11 rounded-md border border-input bg-background px-2 text-sm text-foreground"
      >
        {STAFF_LANGUAGES.map((code) => (
          <option key={code} value={code} lang={code}>
            {LANGUAGE_NATIVE_NAMES[code]}
          </option>
        ))}
      </select>
    </div>
  );
}
