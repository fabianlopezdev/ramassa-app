import type { LanguageCode } from '../schemas/language';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './languages';

export type LocalizedContent = Readonly<Partial<Record<LanguageCode, string>>>;

export interface ResolvedLocalizedText {
  readonly language: LanguageCode;
  readonly text: string;
}

/**
 * One fallback chain for every player-facing content renderer.
 *
 * The requested language wins. Catalan follows because it is the grant-mandated
 * source language and the only translation every draft is required to carry.
 * The remaining supported languages provide a deterministic final safety net
 * for older or partially migrated rows.
 */
export function getContentLanguageFallbacks(language: LanguageCode): readonly LanguageCode[] {
  return [
    language,
    DEFAULT_LANGUAGE,
    ...SUPPORTED_LANGUAGES.filter(
      (candidate) => candidate !== language && candidate !== DEFAULT_LANGUAGE,
    ),
  ];
}

export function resolveLocalizedText(
  content: LocalizedContent,
  language: LanguageCode,
): ResolvedLocalizedText | undefined {
  for (const candidate of getContentLanguageFallbacks(language)) {
    const text = content[candidate]?.trim();
    if (text !== undefined && text.length > 0) {
      return { language: candidate, text };
    }
  }
  return undefined;
}

/**
 * A screen text staff word over the app's own text, in one language (RAPP-710):
 *
 *   - the text staff wrote;
 *   - '' when staff cleared an optional text on purpose, so her phone shows none;
 *   - null when staff never wrote that language, so her phone shows the app's
 *     bundled text in her language.
 *
 * A required text is never blank: a blank one reads as never written. Her phone
 * and the admin preview both read screen texts through this one rule.
 */
export function staffTextIn(
  text: LocalizedContent | null | undefined,
  language: LanguageCode,
  isOptional: boolean,
): string | null {
  const value = text?.[language];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed !== '') return trimmed;
  return isOptional ? '' : null;
}

/**
 * A screen text as staff save it (RAPP-710), from each language as the editor
 * shows it. A language that still reads as the app's bundled text stays
 * unwritten, so it keeps following the app. A blank optional text is kept as
 * '' (no text on her phone). Undefined when nothing is left to save.
 */
export function staffTextToSave(
  shown: LocalizedContent,
  bundled: (language: LanguageCode) => string,
  isOptional: boolean,
): LocalizedContent | undefined {
  const saved: Partial<Record<LanguageCode, string>> = {};
  for (const language of SUPPORTED_LANGUAGES) {
    const value = shown[language];
    if (value === undefined) continue;
    const trimmed = value.trim();
    if (trimmed === bundled(language).trim()) continue;
    if (trimmed === '' && !isOptional) continue;
    saved[language] = trimmed;
  }
  return Object.keys(saved).length > 0 ? saved : undefined;
}
