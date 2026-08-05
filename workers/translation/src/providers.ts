import { z } from 'zod';
import { AppError } from '@ramassa/shared/errors';
import { languageCodeSchema, type LanguageCode } from '@ramassa/shared/schemas';
import type {
  TranslationMap,
  TranslationProvider,
  TranslationRequest,
  TranslationResult,
} from '@ramassa/shared/translation';

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const deepLLanguageByRamassaLanguage: Record<LanguageCode, string> = {
  ca: 'CA',
  es: 'ES',
  en: 'EN-GB',
  ar: 'AR',
  fa: 'FA',
};

const deepLResponseSchema = z.object({
  translations: z
    .array(
      z.object({
        text: z.string().min(1),
        billed_characters: z.number().int().nonnegative(),
      }),
    )
    .length(1),
});

function providerFailure(message: string, context: Record<string, unknown> = {}): AppError {
  return new AppError('TRANSLATION-1', { message, context });
}

function invalidProviderResponse(message: string, cause?: unknown): AppError {
  return new AppError('TRANSLATION-2', { message, cause });
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch (cause) {
    throw invalidProviderResponse('Translation provider returned non-JSON content', cause);
  }
}

export function createMockTranslationProvider(): TranslationProvider {
  return {
    name: 'mock',
    async translate(request) {
      return {
        translations: Object.fromEntries(
          request.to.map((language) => [language, `[${language}] ${request.text}`]),
        ),
        usage: {
          provider: 'mock',
          inputUnits: request.text.length,
          outputUnits: 0,
          estimatedCostUsd: 0,
        },
      };
    },
  };
}

export function createDeepLTranslationProvider(options: {
  readonly apiKey: string;
  readonly costPerMillionCharactersUsd: number;
  readonly fetchImplementation?: FetchImplementation;
}): TranslationProvider {
  const performFetch: FetchImplementation =
    options.fetchImplementation ?? ((input, init) => fetch(input, init));
  const endpoint = options.apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';

  return {
    name: 'deepl',
    async translate(request) {
      const translated = await Promise.all(
        request.to.map(async (language) => {
          let response: Response;
          try {
            response = await performFetch(endpoint, {
              method: 'POST',
              headers: {
                Authorization: `DeepL-Auth-Key ${options.apiKey}`,
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                text: [request.text],
                source_lang: deepLLanguageByRamassaLanguage[request.from],
                target_lang: deepLLanguageByRamassaLanguage[language],
              }),
            });
          } catch (cause) {
            throw new AppError('TRANSLATION-1', {
              message: 'DeepL request failed',
              context: { targetLanguage: language },
              cause,
            });
          }

          if (!response.ok) {
            throw providerFailure('DeepL refused the translation request', {
              status: response.status,
              targetLanguage: language,
            });
          }

          const parsed = deepLResponseSchema.safeParse(await readJson(response));
          if (!parsed.success) {
            throw invalidProviderResponse('DeepL response did not match the expected shape');
          }
          const item = parsed.data.translations[0];
          if (item === undefined) {
            throw invalidProviderResponse('DeepL response contained no translation');
          }
          return { language, text: item.text, billedCharacters: item.billed_characters };
        }),
      );

      const billedCharacters = translated.reduce((total, item) => total + item.billedCharacters, 0);
      return {
        translations: Object.fromEntries(translated.map((item) => [item.language, item.text])),
        usage: {
          provider: 'deepl',
          inputUnits: billedCharacters,
          outputUnits: 0,
          estimatedCostUsd: (billedCharacters * options.costPerMillionCharactersUsd) / 1_000_000,
        },
      };
    },
  };
}

const anthropicResponseSchema = z.object({
  content: z.array(z.object({ type: z.literal('text'), text: z.string() })).min(1),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});

function parseClaudeTranslations(value: string, targets: readonly LanguageCode[]): TranslationMap {
  let decoded: unknown;
  try {
    decoded = JSON.parse(value) as unknown;
  } catch (cause) {
    throw invalidProviderResponse('Claude returned invalid structured JSON', cause);
  }

  const expectedShape = z.object(
    Object.fromEntries(targets.map((language) => [language, z.string().min(1)])) as Record<
      LanguageCode,
      z.ZodString
    >,
  );
  const parsed = expectedShape.safeParse(decoded);
  if (!parsed.success) {
    throw invalidProviderResponse('Claude response did not contain every requested language');
  }
  return parsed.data;
}

export function createClaudeTranslationProvider(options: {
  readonly apiKey: string;
  readonly model: 'claude-haiku-4-5-20251001';
  readonly inputCostPerMillionTokensUsd: number;
  readonly outputCostPerMillionTokensUsd: number;
  readonly fetchImplementation?: FetchImplementation;
}): TranslationProvider {
  const performFetch: FetchImplementation =
    options.fetchImplementation ?? ((input, init) => fetch(input, init));
  return {
    name: 'claude',
    async translate(request) {
      const properties = Object.fromEntries(
        request.to.map((language) => [language, { type: 'string', minLength: 1 }]),
      );
      let response: Response;
      try {
        response = await performFetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': options.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: options.model,
            max_tokens: 4_096,
            system:
              'Translate faithfully for a community sports application. Preserve names, dates, formatting, tone, and meaning. Return only the requested JSON object.',
            messages: [
              {
                role: 'user',
                content: JSON.stringify({ from: request.from, to: request.to, text: request.text }),
              },
            ],
            output_config: {
              format: {
                type: 'json_schema',
                schema: {
                  type: 'object',
                  properties,
                  required: request.to,
                  additionalProperties: false,
                },
              },
            },
          }),
        });
      } catch (cause) {
        throw new AppError('TRANSLATION-1', {
          message: 'Claude request failed',
          context: { targetCount: request.to.length },
          cause,
        });
      }

      if (!response.ok) {
        throw providerFailure('Claude refused the translation request', {
          status: response.status,
          targetCount: request.to.length,
        });
      }
      const parsed = anthropicResponseSchema.safeParse(await readJson(response));
      if (!parsed.success) {
        throw invalidProviderResponse('Claude response did not match the expected shape');
      }
      const content = parsed.data.content[0];
      if (content === undefined) {
        throw invalidProviderResponse('Claude response contained no translation');
      }
      const translations = parseClaudeTranslations(content.text, request.to);
      const inputTokens = parsed.data.usage.input_tokens;
      const outputTokens = parsed.data.usage.output_tokens;
      return {
        translations,
        usage: {
          provider: 'claude',
          inputUnits: inputTokens,
          outputUnits: outputTokens,
          estimatedCostUsd:
            (inputTokens * options.inputCostPerMillionTokensUsd +
              outputTokens * options.outputCostPerMillionTokensUsd) /
            1_000_000,
        },
      };
    },
  };
}

function subsetRequest(
  request: TranslationRequest,
  targets: readonly LanguageCode[],
): TranslationRequest {
  return { ...request, to: [...targets] };
}

export function createHybridTranslationProvider(options: {
  readonly deepL: TranslationProvider;
  readonly claude: TranslationProvider;
  readonly claudeLanguages: readonly LanguageCode[];
}): TranslationProvider {
  const claudeLanguageSet = new Set(
    options.claudeLanguages.map((language) => languageCodeSchema.parse(language)),
  );
  return {
    name: 'hybrid',
    async translate(request): Promise<TranslationResult> {
      const deepLTargets = request.to.filter((language) => !claudeLanguageSet.has(language));
      const claudeTargets = request.to.filter((language) => claudeLanguageSet.has(language));
      const results = await Promise.all([
        deepLTargets.length > 0
          ? options.deepL.translate(subsetRequest(request, deepLTargets))
          : undefined,
        claudeTargets.length > 0
          ? options.claude.translate(subsetRequest(request, claudeTargets))
          : undefined,
      ]);
      const actualResults = results.filter((result) => result !== undefined);
      return {
        translations: Object.assign({}, ...actualResults.map((result) => result.translations)),
        usage: {
          provider: 'hybrid',
          inputUnits: actualResults.reduce((total, result) => total + result.usage.inputUnits, 0),
          outputUnits: actualResults.reduce((total, result) => total + result.usage.outputUnits, 0),
          estimatedCostUsd: actualResults.reduce(
            (total, result) => total + result.usage.estimatedCostUsd,
            0,
          ),
        },
      };
    },
  };
}
