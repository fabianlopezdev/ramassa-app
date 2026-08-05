import { safeAsync } from '@/lib/observability';
import { adminClientEnv, supabase } from '@/lib/supabase';
import { AppError, errorCodeRegistry, type AppErrorCode } from '@ramassa/shared/errors';
import {
  translationRequestSchema,
  translationWorkerResponseSchema,
  type TranslationReview,
} from '@ramassa/shared/translation';

function isAppErrorCode(value: unknown): value is AppErrorCode {
  return typeof value === 'string' && value in errorCodeRegistry;
}

async function workerError(response: Response): Promise<AppError> {
  const body = await response.json().catch(() => undefined);
  const code = (body as { error?: { code?: unknown } } | undefined)?.error?.code;
  return new AppError(isAppErrorCode(code) ? code : 'TRANSLATION-1', {
    context: { status: response.status },
  });
}

export async function requestCatalanTranslation(text: string) {
  return safeAsync<TranslationReview>(
    async () => {
      const workerUrl = adminClientEnv.EXPO_PUBLIC_TRANSLATION_WORKER_URL;
      if (workerUrl === undefined) throw new AppError('TRANSLATION-5');

      const { data, error } = await supabase.auth.getSession();
      if (error || data.session === null) throw new AppError('AUTH-2');

      const request = translationRequestSchema.parse({
        text,
        from: 'ca',
        to: ['es', 'en', 'ar', 'fa'],
      });
      const response = await fetch(`${workerUrl}/translations`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${data.session.access_token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(request),
      }).catch((cause) => {
        throw new AppError('NETWORK-1', { cause });
      });
      if (!response.ok) throw await workerError(response);

      const parsed = translationWorkerResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new AppError('TRANSLATION-2');
      return parsed.data.review;
    },
    { code: 'TRANSLATION-1', context: { targetCount: 4 } },
  );
}
