/**
 * The login's language choice (RAPP-626): Catalan, Spanish and English side by
 * side, one tap to switch. A radio group, so arrow keys move along the row
 * (https://www.w3.org/WAI/ARIA/apg/patterns/radio/). Inside the app the top
 * bar has the compact LanguageMenu (RAPP-632).
 */
import { useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LANGUAGE_NATIVE_NAMES,
  STAFF_LANGUAGES,
  staffLanguageFor,
  useLanguage,
  type SupportedLanguage,
} from '@ramassa/shared/i18n';

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp']);

export interface LanguageChoiceButtonsProps {
  readonly current: SupportedLanguage;
  readonly onChoose: (language: SupportedLanguage) => void;
  readonly label: string;
  readonly className?: string;
}

export function LanguageChoiceButtons({
  current,
  onChoose,
  label,
  className = '',
}: LanguageChoiceButtonsProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (index: number) => {
    const count = STAFF_LANGUAGES.length;
    const target = (index + count) % count;
    onChoose(STAFF_LANGUAGES[target] as SupportedLanguage);
    buttons.current[target]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (NEXT_KEYS.has(event.key)) {
      event.preventDefault();
      move(index + 1);
    } else if (PREVIOUS_KEYS.has(event.key)) {
      event.preventDefault();
      move(index - 1);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-testid="language-choice"
      className={`flex flex-wrap items-center justify-center gap-1 ${className}`}
    >
      {STAFF_LANGUAGES.map((code, index) => {
        const checked = code === current;
        return (
          <button
            key={code}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            lang={code}
            onClick={() => onChoose(code)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={
              checked
                ? 'min-h-11 rounded-full bg-primary/10 px-4 text-sm font-semibold text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none'
                : 'min-h-11 rounded-full px-4 text-sm text-muted-foreground hover:text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none'
            }
          >
            {LANGUAGE_NATIVE_NAMES[code]}
          </button>
        );
      })}
    </div>
  );
}

export function LanguageChoiceRow({ className = '' }: { readonly className?: string }) {
  const { t } = useTranslation('common');
  const { language, setLanguage } = useLanguage();
  return (
    <LanguageChoiceButtons
      current={staffLanguageFor(language)}
      onChoose={(next) => void setLanguage(next)}
      label={t('interfaceLanguageLabel')}
      className={className}
    />
  );
}
