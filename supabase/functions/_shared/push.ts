import {
  AppError,
  isAppError,
  toAppError,
  type PushAppErrorCode,
} from '../../../packages/shared/errors/runtime.ts';
import {
  PUSH_NOTIFICATION_FALLBACK_BODIES,
  type PushCatalogLanguage,
} from './push-catalog.generated.ts';

export { AppError, isAppError, toAppError, type PushAppErrorCode };

export const EXPO_SEND_BATCH_SIZE = 100;
export const EXPO_RECEIPT_BATCH_SIZE = 1000;
export const MAX_PUSH_ATTEMPTS = 8;
export const SUPPORTED_PUSH_LANGUAGES = Object.keys(
  PUSH_NOTIFICATION_FALLBACK_BODIES,
) as readonly PushCatalogLanguage[];

export type PushLanguage = PushCatalogLanguage;
export type PushContentType = 'announcement' | 'event' | 'message';
export type LocalizedPushText = Readonly<Partial<Record<PushLanguage, string>>>;

export interface PushContent {
  readonly contentType: PushContentType;
  readonly contentId: string;
  readonly title: LocalizedPushText | null;
  readonly body: LocalizedPushText | null;
  readonly expiresAt: string | null;
}

export interface ExpoPushMessage {
  readonly to: string;
  readonly title: string;
  readonly body: string;
  readonly sound: 'default';
  readonly channelId: 'default';
  readonly collapseId: string;
  readonly tag: string;
  readonly data: {
    readonly contentType: PushContentType;
    readonly contentId: string;
  };
  readonly expiration?: number;
}

export interface ExpoOutcome {
  readonly status?: unknown;
  readonly id?: unknown;
  readonly details?: { readonly error?: unknown } | null;
}

export type ExpoOutcomeClassification = 'delivered' | 'pruned' | 'retry' | 'failed';

export interface PushHttpRequest {
  readonly method: 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface PushHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type PushFetcher = (url: string, request: PushHttpRequest) => Promise<PushHttpResponse>;

export interface PostExpoJsonOptions {
  readonly accessToken?: string;
  readonly maxAttempts?: number;
  readonly fetcher?: PushFetcher;
  readonly sleeper?: (milliseconds: number) => Promise<void>;
}

function isPushLanguage(value: string): value is PushLanguage {
  return (SUPPORTED_PUSH_LANGUAGES as readonly string[]).includes(value);
}

function languageFallbacks(requestedLanguage: string): readonly PushLanguage[] {
  const requested = isPushLanguage(requestedLanguage) ? requestedLanguage : 'ca';
  return [
    requested,
    'ca',
    ...SUPPORTED_PUSH_LANGUAGES.filter(
      (candidate) => candidate !== requested && candidate !== 'ca',
    ),
  ];
}

function resolveLocalizedValue(
  content: LocalizedPushText,
  requestedLanguage: string,
): { readonly text: string; readonly language: PushLanguage } | null {
  for (const language of languageFallbacks(requestedLanguage)) {
    const text = content[language]?.trim();
    if (text !== undefined && text.length > 0) return { text, language };
  }
  return null;
}

export function resolvePushText(
  content: PushContent,
  requestedLanguage: string,
): { readonly title: string; readonly body: string; readonly language: PushLanguage } {
  const fallbackLanguage = isPushLanguage(requestedLanguage) ? requestedLanguage : 'ca';
  const fallbackCatalog = PUSH_NOTIFICATION_FALLBACK_BODIES[fallbackLanguage];
  if (content.contentType === 'message') {
    return {
      title: fallbackCatalog.messageTitle,
      body: fallbackCatalog.messageBody,
      language: fallbackLanguage,
    };
  }

  if (content.title === null) throw new AppError('PUSH-3');
  const resolvedTitle = resolveLocalizedValue(content.title, requestedLanguage);
  if (resolvedTitle === null) {
    throw new AppError('PUSH-3');
  }

  const resolvedBody =
    content.body === null ? null : resolveLocalizedValue(content.body, requestedLanguage);
  const fallbackBody =
    content.contentType === 'event'
      ? fallbackCatalog.eventFallbackBody
      : fallbackCatalog.announcementFallbackBody;

  return {
    title: resolvedTitle.text,
    body: resolvedBody?.text ?? fallbackBody,
    language: resolvedTitle.language,
  };
}

export function buildExpoMessage(
  token: string,
  content: PushContent,
  requestedLanguage: string,
): ExpoPushMessage {
  const localized = resolvePushText(content, requestedLanguage);
  const expiration =
    content.expiresAt === null
      ? undefined
      : Math.floor(new Date(content.expiresAt).getTime() / 1000);
  const collapseIdentity = `${content.contentType}:${content.contentId}`;

  return {
    to: token,
    title: localized.title,
    body: localized.body,
    sound: 'default',
    channelId: 'default',
    collapseId: collapseIdentity,
    tag: collapseIdentity,
    data: { contentType: content.contentType, contentId: content.contentId },
    ...(expiration === undefined ? {} : { expiration }),
  };
}

export function chunkItems<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  if (!Number.isInteger(size) || size < 1) {
    throw new AppError('PUSH-3');
  }

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function classifyExpoOutcome(outcome: ExpoOutcome): ExpoOutcomeClassification {
  if (outcome.status === 'ok') return 'delivered';

  const error = outcome.details?.error;
  if (error === 'DeviceNotRegistered') return 'pruned';
  if (error === 'MessageRateExceeded') return 'retry';
  return 'failed';
}

export function getAcceptedExpoTicketId(outcome: ExpoOutcome): string | null {
  if (outcome.status !== 'ok') return null;
  if (typeof outcome.id === 'string' && outcome.id.length > 0) return outcome.id;
  throw new AppError('PUSH-8');
}

export function isTransientExpoStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

const defaultPushFetcher: PushFetcher = (url, request) => fetch(url, request);

function defaultSleeper(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function postExpoJson(
  url: string,
  body: unknown,
  failureCode: 'PUSH-8' | 'PUSH-5',
  options: PostExpoJsonOptions = {},
): Promise<unknown> {
  const maxAttempts = options.maxAttempts ?? 3;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new AppError('PUSH-3');

  const fetcher = options.fetcher ?? defaultPushFetcher;
  const sleeper = options.sleeper ?? defaultSleeper;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetcher(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(options.accessToken === undefined
            ? {}
            : { authorization: `Bearer ${options.accessToken}` }),
        },
        body: JSON.stringify(body),
      });

      if (response.ok) return await response.json();
      if (!isTransientExpoStatus(response.status)) throw new AppError('PUSH-3');
      if (attempt === maxAttempts) throw new AppError(failureCode);
    } catch (error) {
      if (isAppError(error) && error.code === 'PUSH-3') throw error;
      if (attempt === maxAttempts) throw new AppError(failureCode, { cause: error });
    }

    await sleeper(getRetryDelayMs(attempt));
  }

  throw new AppError(failureCode);
}

export function shouldRetryPushDelivery(code: PushAppErrorCode, attemptCount: number): boolean {
  return (code === 'PUSH-2' || code === 'PUSH-8') && attemptCount < MAX_PUSH_ATTEMPTS;
}

export function getRetryDelayMs(attempt: number): number {
  const normalizedAttempt = Math.max(1, Math.floor(attempt));
  return Math.min(300_000, 1000 * 2 ** (normalizedAttempt - 1));
}
