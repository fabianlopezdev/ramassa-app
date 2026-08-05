import { z } from 'zod';
import { parseAllowedOrigins } from './http';

const nonEmpty = z.string().min(1);
const cost = z.coerce.number().min(0);

const baseEnvSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: nonEmpty,
  ALLOWED_ORIGINS: z.string(),
  SENTRY_DSN: z.string().optional(),
  SENTRY_RELEASE: z.string().optional(),
});

const deepLEnvSchema = z.object({
  DEEPL_API_KEY: nonEmpty,
  DEEPL_COST_PER_MILLION_CHARACTERS_USD: cost,
});

const claudeEnvSchema = z.object({
  ANTHROPIC_API_KEY: nonEmpty,
  ANTHROPIC_MODEL: z.literal('claude-haiku-4-5-20251001'),
  ANTHROPIC_INPUT_COST_PER_MILLION_TOKENS_USD: cost.default(1),
  ANTHROPIC_OUTPUT_COST_PER_MILLION_TOKENS_USD: cost.default(5),
});

const workerEnvSchema = z.discriminatedUnion('TRANSLATION_PROVIDER', [
  baseEnvSchema.extend({ TRANSLATION_PROVIDER: z.literal('mock') }),
  baseEnvSchema.extend({ TRANSLATION_PROVIDER: z.literal('deepl'), ...deepLEnvSchema.shape }),
  baseEnvSchema.extend({ TRANSLATION_PROVIDER: z.literal('claude'), ...claudeEnvSchema.shape }),
  baseEnvSchema.extend({
    TRANSLATION_PROVIDER: z.literal('hybrid'),
    ...deepLEnvSchema.shape,
    ...claudeEnvSchema.shape,
  }),
]);

export class TranslationWorkerEnvironmentValidationError extends Error {
  readonly missingOrInvalidKeys: readonly string[];

  constructor(issues: z.core.$ZodIssue[]) {
    const lines = issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
    super(`Translation Worker environment is invalid:\n${lines.join('\n')}`);
    this.name = 'TranslationWorkerEnvironmentValidationError';
    this.missingOrInvalidKeys = issues.map((issue) => String(issue.path[0] ?? ''));
  }
}

export interface TranslationWorkerConfig {
  readonly providerMode: 'mock' | 'deepl' | 'claude' | 'hybrid';
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
  readonly allowedOrigins: readonly string[];
  readonly sentryDsn: string;
  readonly sentryRelease: string;
  readonly deepLApiKey: string;
  readonly deepLCostPerMillionCharactersUsd: number;
  readonly anthropicApiKey: string;
  readonly anthropicModel: 'claude-haiku-4-5-20251001';
  readonly anthropicInputCostPerMillionTokensUsd: number;
  readonly anthropicOutputCostPerMillionTokensUsd: number;
}

export function parseTranslationWorkerEnv(
  source: Record<string, unknown>,
): TranslationWorkerConfig {
  const result = workerEnvSchema.safeParse(source);
  if (!result.success) {
    throw new TranslationWorkerEnvironmentValidationError(result.error.issues);
  }
  const env = result.data;
  const hasDeepL = env.TRANSLATION_PROVIDER === 'deepl' || env.TRANSLATION_PROVIDER === 'hybrid';
  const hasClaude = env.TRANSLATION_PROVIDER === 'claude' || env.TRANSLATION_PROVIDER === 'hybrid';
  return {
    providerMode: env.TRANSLATION_PROVIDER,
    supabaseUrl: env.SUPABASE_URL.replace(/\/+$/, ''),
    supabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY,
    allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS),
    sentryDsn: env.SENTRY_DSN ?? '',
    sentryRelease: env.SENTRY_RELEASE ?? '',
    deepLApiKey: hasDeepL ? env.DEEPL_API_KEY : '',
    deepLCostPerMillionCharactersUsd: hasDeepL ? env.DEEPL_COST_PER_MILLION_CHARACTERS_USD : 0,
    anthropicApiKey: hasClaude ? env.ANTHROPIC_API_KEY : '',
    anthropicModel: hasClaude ? env.ANTHROPIC_MODEL : 'claude-haiku-4-5-20251001',
    anthropicInputCostPerMillionTokensUsd: hasClaude
      ? env.ANTHROPIC_INPUT_COST_PER_MILLION_TOKENS_USD
      : 0,
    anthropicOutputCostPerMillionTokensUsd: hasClaude
      ? env.ANTHROPIC_OUTPUT_COST_PER_MILLION_TOKENS_USD
      : 0,
  };
}
