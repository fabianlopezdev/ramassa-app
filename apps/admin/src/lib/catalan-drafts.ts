/**
 * A form's texts against what is saved (RAPP-750, RAPP-751). Desa turns on
 * only when the content differs from the saved one, and the translate button
 * sends only the Catalan texts that changed, writing each draft back in the
 * chosen languages at the same place (RAPP-783). Pure, so it is tested on its own.
 */

import { SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n/languages';
import type { LanguageCode } from '@ramassa/shared/schemas';
import type { CatalanDrafts, CatalanText } from './catalan-translation';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The same place in the saved content: a key of an object, an index of a list. */
function savedAt(saved: unknown, key: string | number): unknown {
  if (Array.isArray(saved) && typeof key === 'number') return saved[key];
  return isRecord(saved) ? saved[key] : undefined;
}

/** A Catalan text that is there now and reads differently from the saved one. */
function changedCatalan(text: LanguageText, saved: unknown): string | null {
  const now = (text.ca ?? '').trim();
  const before = isLanguageText(saved) ? (saved.ca ?? '').trim() : '';
  return now !== '' && now !== before ? now : null;
}

/** The languages other than Catalan with words written in a text. */
function writtenIn(text: LanguageText): readonly LanguageCode[] {
  return SUPPORTED_LANGUAGES.filter(
    (language) => language !== 'ca' && (text[language] ?? '').trim() !== '',
  );
}

/** The Catalan texts that changed against the saved content, at any depth. */
export function changedCatalanTexts(current: unknown, saved: unknown): readonly CatalanText[] {
  if (isLanguageText(current)) {
    const text = changedCatalan(current, saved);
    return text === null ? [] : [{ text, written: writtenIn(current) }];
  }
  if (Array.isArray(current)) {
    return current.flatMap((each, index) => changedCatalanTexts(each, savedAt(saved, index)));
  }
  if (isRecord(current)) {
    return Object.entries(current).flatMap(([key, each]) =>
      changedCatalanTexts(each, savedAt(saved, key)),
    );
  }
  return [];
}

/**
 * The content with each language's draft wherever its Catalan changed. With
 * `keepWritten`, a language that already has words there keeps them.
 */
export function withCatalanDrafts<Value>(
  current: Value,
  saved: unknown,
  drafts: CatalanDrafts,
  keepWritten: boolean,
): Value {
  if (isLanguageText(current)) {
    const text = changedCatalan(current, saved);
    if (text === null) return current;
    const next: LanguageText = { ...current };
    for (const [language, byText] of drafts) {
      const draft = byText.get(text);
      if (draft === undefined) continue;
      if (keepWritten && (current[language] ?? '').trim() !== '') continue;
      next[language] = draft;
    }
    return next as Value;
  }
  if (Array.isArray(current)) {
    return current.map((each: unknown, index) =>
      withCatalanDrafts(each, savedAt(saved, index), drafts, keepWritten),
    ) as Value;
  }
  if (isRecord(current)) {
    return Object.fromEntries(
      Object.entries(current).map(([key, each]) => [
        key,
        withCatalanDrafts(each, savedAt(saved, key), drafts, keepWritten),
      ]),
    ) as Value;
  }
  return current;
}

/**
 * The content as it is compared: a language left empty counts as not written,
 * and an object with nothing written counts as absent, so typing a word and
 * deleting it again is no change.
 */
function comparable(value: unknown): unknown {
  if (typeof value === 'string') return value.trim() === '' ? undefined : value;
  if (Array.isArray(value)) return value.map((each) => comparable(each) ?? null);
  if (isRecord(value)) {
    const kept = Object.keys(value)
      .sort()
      .flatMap((key) => {
        const each = comparable(value[key]);
        return each === undefined ? [] : [[key, each] as const];
      });
    return kept.length === 0 ? undefined : Object.fromEntries(kept);
  }
  return value;
}

/** Whether two contents say the same, whatever empty boxes either has. */
export function isSameContent(a: unknown, b: unknown): boolean {
  return JSON.stringify(comparable(a) ?? null) === JSON.stringify(comparable(b) ?? null);
}
