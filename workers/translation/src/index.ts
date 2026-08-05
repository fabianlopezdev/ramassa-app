import * as Sentry from '@sentry/cloudflare';
import type { TranslationProvider } from '@ramassa/shared/translation';
import { parseTranslationWorkerEnv, type TranslationWorkerConfig } from './env';
import { buildCorsHeaders, errorResponse } from './http';
import { createWorkerObservability } from './observability';
import {
  createClaudeTranslationProvider,
  createDeepLTranslationProvider,
  createHybridTranslationProvider,
  createMockTranslationProvider,
} from './providers';
import { resolveCallerIdentity } from './supabase-identity';
import { handleTranslationRequest } from './translate';

const TRANSLATION_PATH = '/translations';

interface TranslationEnv extends Env {
  readonly SENTRY_DSN?: string;
  readonly DEEPL_API_KEY?: string;
  readonly ANTHROPIC_API_KEY?: string;
  readonly ANTHROPIC_MODEL?: string;
  readonly ANTHROPIC_INPUT_COST_PER_MILLION_TOKENS_USD?: string;
  readonly ANTHROPIC_OUTPUT_COST_PER_MILLION_TOKENS_USD?: string;
}

function createProvider(config: TranslationWorkerConfig): TranslationProvider {
  if (config.providerMode === 'mock') {
    return createMockTranslationProvider();
  }
  const deepL = createDeepLTranslationProvider({
    apiKey: config.deepLApiKey,
    costPerMillionCharactersUsd: config.deepLCostPerMillionCharactersUsd,
  });
  if (config.providerMode === 'deepl') {
    return deepL;
  }
  const claude = createClaudeTranslationProvider({
    apiKey: config.anthropicApiKey,
    model: config.anthropicModel,
    inputCostPerMillionTokensUsd: config.anthropicInputCostPerMillionTokensUsd,
    outputCostPerMillionTokensUsd: config.anthropicOutputCostPerMillionTokensUsd,
  });
  if (config.providerMode === 'claude') {
    return claude;
  }
  return createHybridTranslationProvider({ deepL, claude, claudeLanguages: ['fa'] });
}

const handler: ExportedHandler<TranslationEnv> = {
  async fetch(request, env) {
    let config: TranslationWorkerConfig;
    try {
      config = parseTranslationWorkerEnv(env as unknown as Record<string, unknown>);
    } catch (thrown) {
      createWorkerObservability({ sentryDsn: env.SENTRY_DSN, isLocal: false }).reportError(thrown, {
        stage: 'env',
      });
      return errorResponse('TRANSLATION-5');
    }

    const observability = createWorkerObservability({
      sentryDsn: config.sentryDsn,
      isLocal: config.providerMode === 'mock',
    });
    const corsHeaders = buildCorsHeaders(request, config.allowedOrigins);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (url.pathname === '/health') {
      return new Response('ok', { status: 200, headers: corsHeaders });
    }
    if (url.pathname !== TRANSLATION_PATH) {
      return new Response(null, { status: 404, headers: corsHeaders });
    }

    const provider = createProvider(config);
    return handleTranslationRequest(request, {
      resolveIdentity: (incoming) =>
        resolveCallerIdentity({
          request: incoming,
          supabaseUrl: config.supabaseUrl,
          supabasePublishableKey: config.supabasePublishableKey,
        }),
      rateLimiter: env.TRANSLATION_RATE_LIMITER,
      provider,
      corsHeaders,
      onError: (thrown, context) => observability.reportError(thrown, context),
      onUsage: (usage, context) =>
        observability.logger.info('Translation request completed', {
          ...context,
          provider: usage.provider,
          inputUnits: usage.inputUnits,
          outputUnits: usage.outputUnits,
          estimatedCostUsd: usage.estimatedCostUsd,
        }),
    });
  },
};

export default Sentry.withSentry(
  (env: TranslationEnv) => ({
    dsn: (env.SENTRY_DSN?.length ?? 0) > 0 ? env.SENTRY_DSN : undefined,
    release: env.SENTRY_RELEASE.length > 0 ? env.SENTRY_RELEASE : env.CF_VERSION_METADATA.id,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  }),
  handler,
);
