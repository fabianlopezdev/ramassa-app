/**
 * A form's texts and their Catalan drafts (RAPP-750): the translate button
 * reads every Catalan text of an editor's content, at any depth, and writes
 * each draft back in the chosen language. Pure, so it is tested on its own.
 */

import { SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n/languages';
import type { LanguageCode } from '@ramassa/shared/schemas';

const LANGUAGE_KEYS = new Set<string>(SUPPORTED_LANGUAGES);

type LanguageText = Partial<Record<LanguageCode, string>>;

function isLanguageText(value: unknown): value is LanguageText {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length > 0 &&
    entries.every(([key, text]) => LANGUAGE_KEYS.has(key) && typeof text === 'string')
  );
}

/** Every Catalan text in a form's content: its titles, bodies, labels, at any depth. */
export function catalanTextsIn(value: unknown): readonly string[] {
  if (isLanguageText(value)) return value.ca === undefined ? [] : [value.ca];
  if (Array.isArray(value)) return value.flatMap(catalanTextsIn);
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).flatMap(catalanTextsIn);
  }
  return [];
}

/** The same content with each Catalan text's draft written in the target language. */
export function withCatalanDrafts<Value>(
  value: Value,
  target: LanguageCode,
  drafts: ReadonlyMap<string, string>,
): Value {
  if (isLanguageText(value)) {
    const draft = value.ca === undefined ? undefined : drafts.get(value.ca.trim());
    return (draft === undefined ? value : { ...value, [target]: draft }) as Value;
  }
  if (Array.isArray(value)) {
    return value.map((each: unknown) => withCatalanDrafts(each, target, drafts)) as Value;
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, each]) => [key, withCatalanDrafts(each, target, drafts)]),
    ) as Value;
  }
  return value;
}
