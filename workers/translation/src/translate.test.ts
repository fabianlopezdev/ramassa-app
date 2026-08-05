import { describe, expect, test } from 'bun:test';
import { AppError } from '@ramassa/shared/errors';
import type { TranslationProvider, TranslationRequest } from '@ramassa/shared/translation';
import { handleTranslationRequest, type TranslationRequestDependencies } from './translate';

const staff = {
  userId: '7b1d9c2e-3f4a-4b5c-8d6e-9f0a1b2c3d4e',
  orgId: '11111111-2222-3333-4444-555555555555',
  role: 'staff' as const,
};

function buildRequest(body: unknown): Request {
  return new Request('https://translation.example/translations', {
    method: 'POST',
    headers: { Authorization: 'Bearer token', 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const validBody: TranslationRequest = {
  text: 'Entrenament cancel·lat',
  from: 'ca',
  to: ['es', 'en', 'ar', 'fa'],
};

const successfulProvider: TranslationProvider = {
  name: 'mock',
  translate: async (request) => ({
    translations: Object.fromEntries(
      request.to.map((language) => [language, `[${language}] text`]),
    ),
    usage: {
      provider: 'mock',
      inputUnits: request.text.length,
      outputUnits: 0,
      estimatedCostUsd: 0,
    },
  }),
};

function buildDependencies(
  overrides: Partial<TranslationRequestDependencies> = {},
): TranslationRequestDependencies {
  return {
    resolveIdentity: async () => staff,
    rateLimiter: { limit: async () => ({ success: true }) },
    provider: successfulProvider,
    ...overrides,
  };
}

async function readErrorCode(response: Response): Promise<string> {
  return ((await response.json()) as { error: { code: string } }).error.code;
}

describe('translation request policy', () => {
  test('an unauthenticated request is refused', async () => {
    const response = await handleTranslationRequest(
      buildRequest(validBody),
      buildDependencies({
        resolveIdentity: async () => {
          throw new AppError('AUTH-2');
        },
      }),
    );
    expect(response.status).toBe(401);
    expect(await readErrorCode(response)).toBe('AUTH-2');
  });

  test('players cannot spend the staff translation quota', async () => {
    const response = await handleTranslationRequest(
      buildRequest(validBody),
      buildDependencies({ resolveIdentity: async () => ({ ...staff, role: 'player' }) }),
    );
    expect(response.status).toBe(403);
    expect(await readErrorCode(response)).toBe('AUTH-3');
  });

  test('rate limiting is keyed by organization and staff user before provider work', async () => {
    const seenKeys: string[] = [];
    let providerCalls = 0;
    const response = await handleTranslationRequest(
      buildRequest(validBody),
      buildDependencies({
        rateLimiter: {
          limit: async ({ key }) => {
            seenKeys.push(key);
            return { success: false };
          },
        },
        provider: {
          ...successfulProvider,
          translate: async () => {
            providerCalls += 1;
            return successfulProvider.translate(validBody);
          },
        },
      }),
    );
    expect(response.status).toBe(429);
    expect(await readErrorCode(response)).toBe('TRANSLATION-3');
    expect(seenKeys).toEqual([`${staff.orgId}:${staff.userId}`]);
    expect(providerCalls).toBe(0);
  });

  test('oversized and malformed requests are rejected without provider work', async () => {
    let providerCalls = 0;
    const dependencies = buildDependencies({
      provider: {
        ...successfulProvider,
        translate: async () => {
          providerCalls += 1;
          return successfulProvider.translate(validBody);
        },
      },
    });
    const oversized = await handleTranslationRequest(
      buildRequest({ ...validBody, text: 'a'.repeat(10_001) }),
      dependencies,
    );
    const malformed = await handleTranslationRequest(buildRequest('{not json'), dependencies);

    expect(oversized.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(providerCalls).toBe(0);
  });

  test('provider failures preserve typed error codes', async () => {
    const response = await handleTranslationRequest(
      buildRequest(validBody),
      buildDependencies({
        provider: {
          name: 'deepl',
          translate: async () => {
            throw new AppError('TRANSLATION-2');
          },
        },
      }),
    );
    expect(response.status).toBe(502);
    expect(await readErrorCode(response)).toBe('TRANSLATION-2');
  });

  test('a provider cannot return a partial set of requested languages', async () => {
    const response = await handleTranslationRequest(
      buildRequest(validBody),
      buildDependencies({
        provider: {
          name: 'broken',
          translate: async () => ({
            translations: { es: 'Entrenamiento cancelado' },
            usage: {
              provider: 'broken',
              inputUnits: 1,
              outputUnits: 1,
              estimatedCostUsd: 0,
            },
          }),
        },
      }),
    );

    expect(response.status).toBe(502);
    expect(await readErrorCode(response)).toBe('TRANSLATION-2');
  });
});

describe('translation request success', () => {
  test('staff receives four review drafts and provider usage, never approved content', async () => {
    const response = await handleTranslationRequest(buildRequest(validBody), buildDependencies());
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      review: { suggestions: { language: string; status: string }[] };
      usage: { provider: string; estimatedCostUsd: number };
    };

    expect(body.review.suggestions.map((item) => item.language)).toEqual(['es', 'en', 'ar', 'fa']);
    expect(body.review.suggestions.every((item) => item.status === 'draft')).toBe(true);
    expect(body.usage).toEqual({ provider: 'mock', estimatedCostUsd: 0 });
  });
});
