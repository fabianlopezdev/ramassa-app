import { describe, expect, test } from 'bun:test';
import { AppError, err, ok, type AppErrorCode, type Result } from '@ramassa/shared/errors';
import type { LanguageCode } from '@ramassa/shared/schemas';
import type { TranslationReview } from '@ramassa/shared/translation';
import {
  LANGUAGES_FROM_CATALAN,
  runCatalanTranslation,
  translationPlan,
  writtenLanguages,
  type CatalanText,
} from './catalan-translation';

const texts: CatalanText[] = [
  { text: 'Benvinguda', written: ['es', 'ar'] },
  { text: 'Dades', written: [] },
  { text: ' ', written: ['en'] },
];

function review(text: string, targets: readonly LanguageCode[]): TranslationReview {
  return {
    sourceLanguage: 'ca',
    sourceText: text,
    suggestions: targets.map((language) => ({
      language,
      machineText: `${language}:${text}`,
      reviewedText: `${language}:${text}`,
      status: 'draft',
    })),
  };
}

/** A Worker where the listed languages fail with the given code. */
function worker(failing: Partial<Record<LanguageCode, AppErrorCode>> = {}) {
  const calls: string[] = [];
  const request = async (
    text: string,
    targets: readonly LanguageCode[],
  ): Promise<Result<TranslationReview>> => {
    calls.push(`${text}>${targets.join(',')}`);
    const failure = targets.map((language) => failing[language]).find((code) => code !== undefined);
    return failure === undefined ? ok(review(text, targets)) : err(new AppError(failure));
  };
  return { calls, request };
}

describe('catalan translation run', () => {
  test('every language but Catalan is a target, French included', () => {
    expect(LANGUAGES_FROM_CATALAN).toEqual(['es', 'en', 'fr', 'ar', 'fa']);
  });

  test('the written languages are named in the tabs order; empty texts do not count', () => {
    expect(writtenLanguages(texts.slice(0, 2))).toEqual(['es', 'ar']);
    expect(writtenLanguages([{ text: 'Dades', written: [] }])).toEqual([]);
  });

  test('replacing asks every language; keeping asks only the empty ones', () => {
    const targets = LANGUAGES_FROM_CATALAN;
    expect(translationPlan(texts, targets, false)).toEqual(
      new Map([
        ['Benvinguda', targets],
        ['Dades', targets],
      ]),
    );
    expect(translationPlan(texts, targets, true)).toEqual(
      new Map([
        ['Benvinguda', ['en', 'fr', 'fa']],
        ['Dades', targets],
      ]),
    );
  });

  test('a text written everywhere is not asked when kept; the same text elsewhere still is', () => {
    const everywhere = { text: 'Hola', written: LANGUAGES_FROM_CATALAN };
    expect(translationPlan([everywhere], LANGUAGES_FROM_CATALAN, true).size).toBe(0);
    expect(
      translationPlan(
        [everywhere, { text: 'Hola', written: ['es'] }],
        LANGUAGES_FROM_CATALAN,
        true,
      ),
    ).toEqual(new Map([['Hola', ['en', 'fr', 'ar', 'fa']]]));
  });

  test('one request per text carries every language', async () => {
    const { calls, request } = worker();
    const run = await runCatalanTranslation(
      translationPlan(texts, LANGUAGES_FROM_CATALAN, false),
      request,
    );
    expect(calls).toEqual(['Benvinguda>es,en,fr,ar,fa', 'Dades>es,en,fr,ar,fa']);
    expect(run.failed.size).toBe(0);
    expect(run.drafts.get('fr')?.get('Dades')).toBe('fr:Dades');
  });

  test('a language the provider fails is named; the others keep their drafts', async () => {
    const { request } = worker({ fr: 'TRANSLATION-1' });
    const run = await runCatalanTranslation(
      translationPlan(texts, LANGUAGES_FROM_CATALAN, false),
      request,
    );
    expect([...run.failed.keys()]).toEqual(['fr']);
    expect(run.failed.get('fr')?.code).toBe('TRANSLATION-1');
    expect(run.drafts.has('fr')).toBe(false);
    expect([...run.drafts.keys()].sort()).toEqual(['ar', 'en', 'es', 'fa']);
    expect(run.drafts.get('es')?.get('Benvinguda')).toBe('es:Benvinguda');
    expect(run.drafts.get('fa')?.get('Dades')).toBe('fa:Dades');
  });

  test('a failure shared by every language is not retried language by language', async () => {
    const { calls, request } = worker({ es: 'TRANSLATION-3' });
    const run = await runCatalanTranslation(new Map([['Dades', ['es', 'en']]]), request);
    expect(calls).toEqual(['Dades>es,en']);
    expect([...run.failed.keys()]).toEqual(['es', 'en']);
    expect(run.drafts.size).toBe(0);
  });

  test('one language alone: its failure stops it, as the single-language button does', async () => {
    const { calls, request } = worker({ en: 'TRANSLATION-1' });
    const run = await runCatalanTranslation(
      new Map([
        ['Dades', ['en']],
        ['Benvinguda', ['en']],
        ['Salut', ['en']],
        ['Nom', ['en']],
      ]),
      request,
    );
    expect(run.failed.get('en')?.code).toBe('TRANSLATION-1');
    expect(run.drafts.size).toBe(0);
    // The three first are already on their way; the fourth is not asked.
    expect(calls).toHaveLength(3);
  });
});
