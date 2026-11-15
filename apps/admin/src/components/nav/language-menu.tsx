/**
 * The top bar's language choice (RAPP-632): Catalan, Spanish or English, the
 * current one marked. A compact menu beside the user button, replacing the
 * sidebar's dropdown. The choice is saved in the language cookie and applies
 * at once (RAPP-238); the login page keeps its row of three (RAPP-626).
 */
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  LANGUAGE_NATIVE_NAMES,
  STAFF_LANGUAGES,
  staffLanguageFor,
  useLanguage,
  type SupportedLanguage,
} from '@ramassa/shared/i18n';

export type TopBarTone = 'light' | 'brand';

/** Trigger colours for a light top bar or the brand-coloured portal bar. */
export const TOP_BAR_TRIGGER_TONE: Record<TopBarTone, string> = {
  light: 'text-foreground hover:bg-accent hover:text-accent-foreground',
  brand:
    'text-primary-foreground hover:bg-white/10 hover:text-primary-foreground aria-expanded:bg-white/15 focus-visible:ring-secondary',
};

export function LanguageMenu({ tone = 'light' }: { readonly tone?: TopBarTone }) {
  const { t } = useTranslation('common');
  const { language, setLanguage } = useLanguage();
  const current = staffLanguageFor(language);
  const label = t('interfaceLanguageLabel');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="lg"
          data-testid="language-menu"
          aria-label={`${label}: ${LANGUAGE_NATIVE_NAMES[current]}`}
          className={cn('rounded-full px-3', TOP_BAR_TRIGGER_TONE[tone])}
        >
          <Languages aria-hidden="true" />
          <span className="hidden sm:inline" lang={current}>
            {LANGUAGE_NATIVE_NAMES[current]}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(next) => void setLanguage(next as SupportedLanguage)}
        >
          {STAFF_LANGUAGES.map((code) => (
            <DropdownMenuRadioItem
              key={code}
              value={code}
              lang={code}
              data-testid={`language-menu-${code}`}
            >
              {LANGUAGE_NATIVE_NAMES[code]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
