/**
 * The five languages as one compact switch (RAPP-641): the screen editor
 * writes in one at a time and its phone shows one, Arabic and Farsi right to
 * left. Codes keep the switch the same width whatever the language.
 */

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
    <Tabs value={value} onValueChange={(next) => onChange(next as LanguageCode)}>
      <TabsList aria-label={label} data-testid={testId}>
        {SUPPORTED_LANGUAGES.map((code) => (
          <TabsTrigger
            key={code}
            value={code}
            title={LANGUAGE_NATIVE_NAMES[code]}
            aria-label={LANGUAGE_NATIVE_NAMES[code]}
            className="w-10 flex-none text-xs uppercase"
          >
            {code}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
