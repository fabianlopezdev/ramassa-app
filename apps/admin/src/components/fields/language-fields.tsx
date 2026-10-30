/**
 * Text written in the five languages (RAPP-307, RAPP-641), shared by every
 * form that names a field, a question, a screen or a section.
 *
 * Inside an `EditingLanguageContext` a form shows one box per text, in the
 * language being edited; the other languages stay in the form, hidden, so
 * FormData still reads all five. Without it, each text shows its five boxes.
 * Arabic and Farsi write right to left. Each offers its Catalan to the editor's
 * translate button (RAPP-750).
 */

import { typeInto, useTranslatableTexts } from '@/components/layout/translate-from-catalan';
import { createContext, useContext, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n/languages';
import type { BuilderText } from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

const TEXT_INPUT_CLASS = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm';

/** The language a form writes in; null shows every language at once. */
export const EditingLanguageContext = createContext<LanguageCode | null>(null);

/** Reads `<name>.<language>` inputs back into localized text, empty languages left out. */
export function textFromForm(fields: FormData, name: string): BuilderText {
  return Object.fromEntries(
    SUPPORTED_LANGUAGES.flatMap((language) => {
      const value = fields.get(`${name}.${language}`);
      return typeof value === 'string' && value.trim() !== '' ? [[language, value.trim()]] : [];
    }),
  ) as BuilderText;
}

export function LanguageFields({
  name,
  legend,
  value,
  isCatalanRequired,
  isLong = false,
  placeholder,
}: {
  readonly name: string;
  readonly legend: string;
  readonly value: BuilderText | null | undefined;
  readonly isCatalanRequired: boolean;
  readonly isLong?: boolean;
  /** Shown in an empty box, per language: what she reads when nothing is written. */
  readonly placeholder?: (language: LanguageCode) => string;
}) {
  const { t } = useTranslation('settings');
  const editing = useContext(EditingLanguageContext);
  const boxes = useRef<HTMLElement | null>(null);
  const holdBoxes = (node: HTMLElement | null) => {
    boxes.current = node;
  };
  const boxIn = (language: LanguageCode) =>
    boxes.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      `[name="${name}.${language}"]`,
    ) ?? null;
  // Only a Catalan that changed since the field opened is translated (RAPP-751).
  const [openedCatalan] = useState((value?.ca ?? '').trim());
  const changedCatalan = (): string | null => {
    const now = boxIn('ca')?.value.trim() ?? '';
    return now !== '' && now !== openedCatalan ? now : null;
  };
  useTranslatableTexts({
    texts: () => {
      const text = changedCatalan();
      return text === null ? [] : [text];
    },
    apply: (target, drafts) => {
      const text = changedCatalan();
      const draft = text === null ? undefined : drafts.get(text);
      const box = boxIn(target);
      if (draft !== undefined && box !== null) typeInto(box, draft);
    },
  });
  const inputClass = isLong ? `${TEXT_INPUT_CLASS} h-auto min-h-16 py-2` : TEXT_INPUT_CLASS;
  if (editing !== null) {
    return (
      <div ref={holdBoxes} className="flex flex-col gap-1.5">
        <label htmlFor={`${name}.${editing}`} className="text-start text-sm font-medium">
          {legend}
          {editing === 'ca' && isCatalanRequired ? (
            <span className="text-muted-foreground"> ({t('questions.required')})</span>
          ) : null}
        </label>
        {SUPPORTED_LANGUAGES.map((language) => {
          const id = `${name}.${language}`;
          const shared = {
            id,
            name: id,
            defaultValue: value?.[language] ?? '',
            dir: language === 'ar' || language === 'fa' ? 'rtl' : 'auto',
            lang: language,
            hidden: language !== editing,
            placeholder: placeholder?.(language),
            className: inputClass,
          } as const;
          return isLong ? (
            <textarea key={language} {...shared} rows={2} />
          ) : (
            <input key={language} {...shared} type="text" />
          );
        })}
      </div>
    );
  }
  return (
    <fieldset ref={holdBoxes} className="flex flex-col gap-2 rounded-lg border p-3">
      <legend className="px-1 text-start text-sm font-medium">{legend}</legend>
      {SUPPORTED_LANGUAGES.map((language) => {
        const id = `${name}.${language}`;
        const label = `${LANGUAGE_NATIVE_NAMES[language]}${
          language === 'ca' && isCatalanRequired ? ` (${t('questions.required')})` : ''
        }`;
        const shared = {
          id,
          name: id,
          defaultValue: value?.[language] ?? '',
          dir: language === 'ar' || language === 'fa' ? 'rtl' : 'auto',
          lang: language,
          required: language === 'ca' && isCatalanRequired,
          placeholder: placeholder?.(language),
          className: inputClass,
        } as const;
        return (
          <label key={language} htmlFor={id} className="flex flex-col gap-1 text-xs font-medium">
            <span className="text-start">{label}</span>
            {isLong ? <textarea {...shared} rows={2} /> : <input {...shared} type="text" />}
          </label>
        );
      })}
    </fieldset>
  );
}
