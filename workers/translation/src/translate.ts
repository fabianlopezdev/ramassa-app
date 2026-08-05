import { AppError, isAppError, type AppErrorCode } from '@ramassa/shared/errors';
import {
  createTranslationReview,
  translationRequestSchema,
  type TranslationProvider,
  type TranslationUsage,
} from '@ramassa/shared/translation';
import { errorResponse, jsonResponse } from './http';
import type { CallerIdentity } from './supabase-identity';

export interface TranslationRequestDependencies {
  readonly resolveIdentity: (request: Request) => Promise<CallerIdentity>;
  readonly rateLimiter: { limit(options: { key: string }): Promise<{ success: boolean }> };
  readonly provider: TranslationProvider;
  readonly corsHeaders?: Record<string, string>;
  readonly onError?: (error: unknown, context: Record<string, unknown>) => void;
  readonly onUsage?: (
    usage: TranslationUsage,
    context: { readonly orgId: string; readonly userId: string; readonly targetCount: number },
  ) => void;
}

async function readJsonBody(request: Request): Promise<unknown | undefined> {
  try {
    return (await request.json()) as unknown;
  } catch {
    return undefined;
  }
}

export async function handleTranslationRequest(
  request: Request,
  dependencies: TranslationRequestDependencies,
): Promise<Response> {
  const corsHeaders = dependencies.corsHeaders ?? {};
  const fail = (code: AppErrorCode): Response => errorResponse(code, corsHeaders);

  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'POST', ...corsHeaders } });
  }

  let identity: CallerIdentity;
  try {
    identity = await dependencies.resolveIdentity(request);
  } catch (thrown) {
    dependencies.onError?.(thrown, { stage: 'identity' });
    return fail(isAppError(thrown) ? thrown.code : 'AUTH-2');
  }

  if (identity.role !== 'staff' && identity.role !== 'admin') {
    return fail('AUTH-3');
  }

  const rateLimit = await dependencies.rateLimiter.limit({
    key: `${identity.orgId}:${identity.userId}`,
  });
  if (!rateLimit.success) {
    return fail('TRANSLATION-3');
  }

  const body = await readJsonBody(request);
  if (body === undefined) {
    return fail('VALIDATION-1');
  }
  const parsed = translationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return fail('VALIDATION-1');
  }

  try {
    const result = await dependencies.provider.translate(parsed.data);
    const hasEveryTarget = parsed.data.to.every((language) => {
      const text = result.translations[language];
      return typeof text === 'string' && text.trim().length > 0 && text.length <= 10_000;
    });
    const usageValues = [
      result.usage.inputUnits,
      result.usage.outputUnits,
      result.usage.estimatedCostUsd,
    ];
    if (
      !hasEveryTarget ||
      result.usage.provider.length === 0 ||
      usageValues.some((value) => !Number.isFinite(value) || value < 0)
    ) {
      throw new AppError('TRANSLATION-2', {
        message: 'Provider result did not satisfy the translation contract',
        context: { provider: dependencies.provider.name },
      });
    }
    const review = createTranslationReview({
      sourceLanguage: parsed.data.from,
      sourceText: parsed.data.text,
      translations: result.translations,
    });
    dependencies.onUsage?.(result.usage, {
      orgId: identity.orgId,
      userId: identity.userId,
      targetCount: parsed.data.to.length,
    });
    return jsonResponse(
      {
        review,
        usage: {
          provider: result.usage.provider,
          estimatedCostUsd: result.usage.estimatedCostUsd,
        },
      },
      { status: 200, headers: corsHeaders },
    );
  } catch (thrown) {
    dependencies.onError?.(thrown, {
      stage: 'provider',
      provider: dependencies.provider.name,
      targetCount: parsed.data.to.length,
      orgId: identity.orgId,
      userId: identity.userId,
    });
    return fail(isAppError(thrown) ? thrown.code : 'TRANSLATION-1');
  }
}
