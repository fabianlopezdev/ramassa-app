/**
 * A translation run from Catalan (RAPP-750, RAPP-783): which languages already
 * have words, what to ask the Worker for, and the drafts that come back.
 *
 * Each distinct Catalan text is asked once, with every language it needs in
 * the same request. When the provider fails such a request, each language is
 * asked alone, so a language that fails is named and the others are kept. A
 * failed language is asked no more, and none of its drafts are written.
 * The Worker call is passed in, so this is tested on its own.
 */

import type { AppError, AppErrorCode, Result } from '@ramassa/shared/errors';
import { SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n/languages';
import type { LanguageCode } from '@ramassa/shared/schemas';
import type { TranslationReview } from '@ramassa/shared/translation';

/** A Catalan text to translate, and the languages that already have words for it. */
export interface CatalanText {
  readonly text: string;
  readonly written: readonly LanguageCode[];
}

/** For each language, each Catalan text to its draft. */
export type CatalanDrafts = ReadonlyMap<LanguageCode, ReadonlyMap<string, string>>;

/** Every language a Catalan text is translated into. */
export const LANGUAGES_FROM_CATALAN: readonly LanguageCode[] = SUPPORTED_LANGUAGES.filter(
  (language) => language !== 'ca',
);

/** The target languages that already have words in any of the texts, in the tabs' order. */
export function writtenLanguages(
  texts: readonly CatalanText[],
  targets: readonly LanguageCode[] = LANGUAGES_FROM_CATALAN,
): readonly LanguageCode[] {
  const written = new Set(texts.flatMap((each) => each.written));
  return targets.filter((language) => written.has(language));
}

/**
 * The languages to ask for each distinct Catalan text. With `keepWritten`, a
 * language is asked only where some place with that text has no words in it.
 */
export function translationPlan(
  texts: readonly CatalanText[],
  targets: readonly LanguageCode[],
  keepWritten: boolean,
): ReadonlyMap<string, readonly LanguageCode[]> {
  const needed = new Map<string, Set<LanguageCode>>();
  for (const each of texts) {
    const text = each.text.trim();
    if (text === '') continue;
    const languages = needed.get(text) ?? new Set<LanguageCode>();
    needed.set(text, languages);
    for (const language of targets) {
      if (!keepWritten || !each.written.includes(language)) languages.add(language);
    }
  }
  const plan = new Map<string, readonly LanguageCode[]>();
  for (const [text, languages] of needed) {
    const ordered = targets.filter((language) => languages.has(language));
    if (ordered.length > 0) plan.set(text, ordered);
  }
  return plan;
}

export type RequestCatalanDrafts = (
  text: string,
  targets: readonly LanguageCode[],
) => Promise<Result<TranslationReview>>;

export interface CatalanTranslationRun {
  /** The drafts of every language that did not fail. */
  readonly drafts: CatalanDrafts;
  /** Each language that failed, with its first error. */
  readonly failed: ReadonlyMap<LanguageCode, AppError>;
}

/**
 * The provider's own failures, which can be one language's. Any other error
 * (the session, the network, too many requests) is the same for every language.
 */
const PROVIDER_FAILURES: ReadonlySet<AppErrorCode> = new Set<AppErrorCode>([
  'TRANSLATION-1',
  'TRANSLATION-2',
]);

/** At most this many texts are on their way to the Worker at once. */
const CONCURRENCY = 3;

export async function runCatalanTranslation(
  plan: ReadonlyMap<string, readonly LanguageCode[]>,
  request: RequestCatalanDrafts,
): Promise<CatalanTranslationRun> {
  const pending = [...plan];
  const drafts = new Map<LanguageCode, Map<string, string>>();
  const failed = new Map<LanguageCode, AppError>();

  async function ask(text: string, targets: readonly LanguageCode[]): Promise<void> {
    const live = targets.filter((language) => !failed.has(language));
    if (live.length === 0) return;
    const result = await request(text, live);
    if (result.ok) {
      for (const suggestion of result.value.suggestions) {
        if (!live.includes(suggestion.language)) continue;
        const byText = drafts.get(suggestion.language) ?? new Map<string, string>();
        byText.set(text, suggestion.machineText);
        drafts.set(suggestion.language, byText);
      }
      return;
    }
    if (live.length === 1 || !PROVIDER_FAILURES.has(result.error.code)) {
      for (const language of live) if (!failed.has(language)) failed.set(language, result.error);
      return;
    }
    for (const language of live) await ask(text, [language]);
  }

  async function work() {
    for (let next = pending.shift(); next !== undefined; next = pending.shift()) {
      await ask(...next);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, work));
  for (const language of failed.keys()) drafts.delete(language);
  return { drafts, failed };
}
