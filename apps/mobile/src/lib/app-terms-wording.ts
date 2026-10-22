/**
 * What the terms screens say (RAPP-613): the current published version from
 * the onboarding catalog, in her language or Catalan, or the bundled text
 * when there is none (a failed catalog read, an organization without
 * versions). The screens are never blank.
 */
import {
  resolveAppTerms,
  type CurrentAppTerms,
  type ResolvedAppTerms,
} from '@ramassa/shared/intake';
import type { LanguageCode } from '@ramassa/shared/schemas';

export interface AppTermsWording extends ResolvedAppTerms {
  /** What her acceptance names: the version number she was shown. */
  readonly termsVersion: string;
  /** The version she accepts again from the terms screen alone; null for the bundled text. */
  readonly versionId: string | null;
}

/** The bundled text is version 1 of every organization. */
const BUNDLED_VERSION = '1';

const BUNDLED_POINTS = ['Purpose', 'Protected', 'Private', 'Control'] as const;

export function appTermsWording(
  terms: CurrentAppTerms | null | undefined,
  language: LanguageCode,
  bundled: (key: string) => string,
): AppTermsWording {
  if (terms != null) {
    return {
      ...resolveAppTerms(terms.content, language),
      termsVersion: String(terms.versionNumber),
      versionId: terms.id,
    };
  }
  return {
    title: bundled('termsTitle'),
    body: bundled('termsBody'),
    introTitle: bundled('termsIntroTitle'),
    intro: bundled('termsIntro'),
    points: BUNDLED_POINTS.map((point) => ({
      title: bundled(`termsPoint${point}Title`),
      body: bundled(`termsPoint${point}Body`),
    })),
    acceptLabel: bundled('termsAcceptLabel'),
    mediaLabel: bundled('mediaConsentLabel'),
    mediaHint: bundled('mediaConsentHint'),
    localeShown: language,
    termsVersion: BUNDLED_VERSION,
    versionId: null,
  };
}
