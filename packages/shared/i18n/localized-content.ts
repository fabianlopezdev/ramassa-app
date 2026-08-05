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
