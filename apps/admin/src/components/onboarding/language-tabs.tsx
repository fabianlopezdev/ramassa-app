/**
 * The five languages as one compact switch (RAPP-641): the screen editor
 * writes in one at a time and its phone shows one, Arabic and Farsi right to
 * left. Codes keep the switch the same width whatever the language.
 *
 * A single-choice toggle group: tabs would point each trigger at a panel this
 * switch does not own, which screen readers announce as a broken reference.
 */

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n/languages';
import type { LanguageCode } from '@ramassa/shared/schemas';

export function LanguageTabs({
  value,
  onChange,
  label,
  testId,
}: {
  readonly value: LanguageCode;
  readonly onChange: (language: LanguageCode) => void;
  readonly label: string;
  readonly testId?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={0}
      value={value}
      // Pressing the chosen language again keeps it.
      onValueChange={(next) => (next === '' ? undefined : onChange(next as LanguageCode))}
      aria-label={label}
      data-testid={testId}
    >
      {SUPPORTED_LANGUAGES.map((code) => (
        <ToggleGroupItem
          key={code}
          value={code}
          title={LANGUAGE_NATIVE_NAMES[code]}
          aria-label={LANGUAGE_NATIVE_NAMES[code]}
          className="w-10 flex-none text-xs uppercase"
        >
          {code}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
