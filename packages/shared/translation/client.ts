/**
 * Asking the translation Worker for machine drafts (RAPP-341), shared by the
 * web admin and the phone so both read the same response the same way. The
 * caller passes the Worker address and the session's access token; the Worker
 * checks that the person may write player content. Throws an AppError, so
 * each app wraps it in its own `safeAsync` (the one that reports to Sentry).
 */
import { AppError, errorCodeRegistry, type AppErrorCode } from '../errors';
import type { LanguageCode } from '../schemas/language';
import {
  translationRequestSchema,
  translationWorkerResponseSchema,
  type TranslationReview,
} from './index';

type FetchImplementation = (input: string, init: RequestInit) => Promise<Response>;

export interface RequestTranslationOptions {
  readonly workerUrl: string | undefined;
  readonly accessToken: string | undefined;
  readonly text: string;
  readonly from: LanguageCode;
  readonly to: readonly LanguageCode[];
  readonly fetchImplementation?: FetchImplementation;
}

export const CATALAN_TRANSLATION_TARGETS = ['es', 'en', 'ar', 'fa'] as const;

function isAppErrorCode(value: unknown): value is AppErrorCode {
  return typeof value === 'string' && value in errorCodeRegistry;
}

async function workerError(response: Response): Promise<AppError> {
  const body: unknown = await response.json().catch(() => undefined);
  const code = (body as { error?: { code?: unknown } } | undefined)?.error?.code;
  return new AppError(isAppErrorCode(code) ? code : 'TRANSLATION-1', {
    context: { status: response.status },
  });
}

export async function requestTranslationDrafts(
  options: RequestTranslationOptions,
): Promise<TranslationReview> {
  const performFetch = options.fetchImplementation ?? fetch;
  if (options.workerUrl === undefined) throw new AppError('TRANSLATION-5');
  if (options.accessToken === undefined) throw new AppError('AUTH-2');
  const request = translationRequestSchema.parse({
    text: options.text,
    from: options.from,
    to: options.to,
  });
  const response = await performFetch(`${options.workerUrl}/translations`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${options.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(request),
  }).catch((cause: unknown) => {
    throw new AppError('NETWORK-1', { cause });
  });
  if (!response.ok) throw await workerError(response);
  const parsed = translationWorkerResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new AppError('TRANSLATION-2');
  return parsed.data.review;
}
