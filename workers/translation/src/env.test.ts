import { describe, expect, test } from 'bun:test';
import { parseTranslationWorkerEnv } from './env';

const baseEnv = {
  TRANSLATION_PROVIDER: 'mock',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  ALLOWED_ORIGINS: 'http://localhost:4192',
  SENTRY_RELEASE: '',
};

describe('translation Worker environment', () => {
  test('local mock mode needs no provider credentials', () => {
    expect(parseTranslationWorkerEnv(baseEnv).providerMode).toBe('mock');
  });

  test('DeepL mode requires its secret and accepts the current all-language default', () => {
    expect(() => parseTranslationWorkerEnv({ ...baseEnv, TRANSLATION_PROVIDER: 'deepl' })).toThrow(
      /DEEPL_API_KEY/,
    );
    expect(
      parseTranslationWorkerEnv({
        ...baseEnv,
        TRANSLATION_PROVIDER: 'deepl',
        DEEPL_API_KEY: 'deepl-key',
        DEEPL_COST_PER_MILLION_CHARACTERS_USD: '0',
      }).providerMode,
    ).toBe('deepl');
  });

  test('hybrid mode requires both providers and pins the inexpensive Claude model', () => {
    expect(() =>
      parseTranslationWorkerEnv({
        ...baseEnv,
        TRANSLATION_PROVIDER: 'hybrid',
        DEEPL_API_KEY: 'deepl-key',
      }),
    ).toThrow(/ANTHROPIC_API_KEY/);

    const config = parseTranslationWorkerEnv({
      ...baseEnv,
      TRANSLATION_PROVIDER: 'hybrid',
      DEEPL_API_KEY: 'deepl-key',
      DEEPL_COST_PER_MILLION_CHARACTERS_USD: '0',
      ANTHROPIC_API_KEY: 'claude-key',
      ANTHROPIC_MODEL: 'claude-haiku-4-5-20251001',
    });
    expect(config.anthropicModel).toBe('claude-haiku-4-5-20251001');
  });
});
