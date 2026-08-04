import { describe, expect, test } from 'bun:test';
import { isAppError } from '@ramassa/shared/errors';
import type { TranslationProvider } from '@ramassa/shared/translation';
import {
  createClaudeTranslationProvider,
  createDeepLTranslationProvider,
  createHybridTranslationProvider,
  createMockTranslationProvider,
} from './providers';

async function expectContract(provider: TranslationProvider): Promise<void> {
  const result = await provider.translate({
    text: 'Entrenament cancel·lat',
    from: 'ca',
    to: ['es', 'en', 'ar', 'fa'],
  });
  expect(Object.keys(result.translations).sort()).toEqual(['ar', 'en', 'es', 'fa']);
  expect(Object.values(result.translations).every((value) => value.length > 0)).toBe(true);
  expect(result.usage.estimatedCostUsd).toBeGreaterThanOrEqual(0);
}

describe('translation provider contract', () => {
  test('the deterministic mock conforms without credentials or a network', async () => {
    const provider = createMockTranslationProvider();
    await expectContract(provider);
    expect(
      (await provider.translate({ text: 'Hola', from: 'ca', to: ['en'] })).translations,
    ).toEqual({ en: '[en] Hola' });
  });

  test('DeepL translates Persian directly now that the provider supports it', async () => {
    const requestedTargets: string[] = [];
    const provider = createDeepLTranslationProvider({
      apiKey: 'deepl-key',
      costPerMillionCharactersUsd: 20,
      fetchImplementation: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { target_lang: string };
        requestedTargets.push(body.target_lang);
        return Response.json({
          translations: [{ detected_source_language: 'CA', text: 'ترجمه', billed_characters: 20 }],
        });
      },
    });

    const result = await provider.translate({ text: 'Text', from: 'ca', to: ['fa'] });
    expect(requestedTargets).toEqual(['FA']);
    expect(result.translations).toEqual({ fa: 'ترجمه' });
    expect(result.usage.estimatedCostUsd).toBe(0.0004);
  });

  test('the optional hybrid routes only configured fallback languages to Claude', async () => {
    const deepLTargets: string[][] = [];
    const claudeTargets: string[][] = [];
    const provider = createHybridTranslationProvider({
      deepL: {
        name: 'deepl',
        translate: async (request) => {
          deepLTargets.push([...request.to]);
          return {
            translations: Object.fromEntries(
              request.to.map((language) => [language, `d:${language}`]),
            ),
            usage: { provider: 'deepl', inputUnits: 4, outputUnits: 0, estimatedCostUsd: 0 },
          };
        },
      },
      claude: {
        name: 'claude',
        translate: async (request) => {
          claudeTargets.push([...request.to]);
          return {
            translations: Object.fromEntries(
              request.to.map((language) => [language, `c:${language}`]),
            ),
            usage: { provider: 'claude', inputUnits: 1, outputUnits: 1, estimatedCostUsd: 0 },
          };
        },
      },
      claudeLanguages: ['fa'],
    });

    const result = await provider.translate({ text: 'Text', from: 'ca', to: ['es', 'fa'] });
    expect(deepLTargets).toEqual([['es']]);
    expect(claudeTargets).toEqual([['fa']]);
    expect(result.translations).toEqual({ es: 'd:es', fa: 'c:fa' });
  });
});

describe('provider response validation', () => {
  test('a malformed DeepL response fails typed and returns no partial content', async () => {
    const provider = createDeepLTranslationProvider({
      apiKey: 'deepl-key',
      costPerMillionCharactersUsd: 0,
      fetchImplementation: async () => Response.json({ translations: [{ text: '' }] }),
    });

    try {
      await provider.translate({ text: 'Text', from: 'ca', to: ['es'] });
      throw new Error('expected translation to fail');
    } catch (error) {
      expect(isAppError(error) && error.code).toBe('TRANSLATION-2');
    }
  });

  test('Claude structured output is parsed and costed without logging content', async () => {
    const provider = createClaudeTranslationProvider({
      apiKey: 'claude-key',
      model: 'claude-haiku-4-5-20251001',
      inputCostPerMillionTokensUsd: 1,
      outputCostPerMillionTokensUsd: 5,
      fetchImplementation: async () =>
        Response.json({
          content: [{ type: 'text', text: '{"fa":"تمرین لغو شد"}' }],
          usage: { input_tokens: 100, output_tokens: 20 },
        }),
    });

    const result = await provider.translate({
      text: 'Entrenament cancel·lat',
      from: 'ca',
      to: ['fa'],
    });
    expect(result.translations).toEqual({ fa: 'تمرین لغو شد' });
    expect(result.usage.estimatedCostUsd).toBe(0.0002);
  });
});
