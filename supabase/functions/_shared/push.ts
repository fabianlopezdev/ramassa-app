export const EXPO_SEND_BATCH_SIZE = 100;
export const EXPO_RECEIPT_BATCH_SIZE = 1000;
export const MAX_PUSH_ATTEMPTS = 8;
export const SUPPORTED_PUSH_LANGUAGES = ['ca', 'es', 'en', 'ar', 'fa'] as const;

export type PushLanguage = (typeof SUPPORTED_PUSH_LANGUAGES)[number];
export type PushContentType = 'announcement' | 'event';
export type LocalizedPushText = Readonly<Partial<Record<PushLanguage, string>>>;
export type PushErrorCode =
  'PUSH-1' | 'PUSH-2' | 'PUSH-3' | 'PUSH-4' | 'PUSH-5' | 'PUSH-6' | 'PUSH-7';

export class PushError extends Error {
  readonly code: PushErrorCode;

  constructor(code: PushErrorCode, options: ErrorOptions = {}) {
    super(code, options);
    this.name = 'PushError';
    this.code = code;
  }
}

export function isPushError(value: unknown): value is PushError {
  return value instanceof PushError;
}

export function toPushError(value: unknown, fallbackCode: PushErrorCode): PushError {
  return isPushError(value) ? value : new PushError(fallbackCode, { cause: value });
}

export interface PushContent {
  readonly contentType: PushContentType;
  readonly contentId: string;
  readonly title: LocalizedPushText;
  readonly body: LocalizedPushText | null;
  readonly expiresAt: string | null;
}

export interface ExpoPushMessage {
  readonly to: string;
  readonly title: string;
  readonly body: string;
  readonly sound: 'default';
  readonly channelId: 'default';
  readonly data: {
    readonly contentType: PushContentType;
    readonly contentId: string;
  };
  readonly expiration?: number;
}

export interface ExpoOutcome {
  readonly status?: unknown;
  readonly details?: { readonly error?: unknown } | null;
}

export type ExpoOutcomeClassification = 'delivered' | 'pruned' | 'retry' | 'failed';

const eventFallbackBody: Readonly<Record<PushLanguage, string>> = {
  ca: "Toca per veure l'activitat.",
  es: 'Toca para ver la actividad.',
  en: 'Tap to view the activity.',
  ar: 'اضغطي لعرض النشاط.',
  fa: 'برای دیدن برنامه ضربه بزنید.',
};

const announcementFallbackBody: Readonly<Record<PushLanguage, string>> = {
  ca: "Toca per llegir l'avís.",
  es: 'Toca para leer el aviso.',
  en: 'Tap to read the notice.',
  ar: 'اضغطي لقراءة الإشعار.',
  fa: 'برای خواندن اطلاعیه ضربه بزنید.',
};

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
  const resolvedTitle = resolveLocalizedValue(content.title, requestedLanguage);
  if (resolvedTitle === null) {
    throw new PushError('PUSH-3');
  }

  const resolvedBody =
    content.body === null ? null : resolveLocalizedValue(content.body, requestedLanguage);
  const fallbackLanguage = isPushLanguage(requestedLanguage) ? requestedLanguage : 'ca';
  const fallbackBody =
    content.contentType === 'event'
      ? eventFallbackBody[fallbackLanguage]
      : announcementFallbackBody[fallbackLanguage];

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

  return {
    to: token,
    title: localized.title,
    body: localized.body,
    sound: 'default',
    channelId: 'default',
    data: { contentType: content.contentType, contentId: content.contentId },
    ...(expiration === undefined ? {} : { expiration }),
  };
}

export function chunkItems<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  if (!Number.isInteger(size) || size < 1) {
    throw new PushError('PUSH-3');
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

export function isTransientExpoStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export function shouldRetryPushDelivery(code: PushErrorCode, attemptCount: number): boolean {
  return code === 'PUSH-2' && attemptCount < MAX_PUSH_ATTEMPTS;
}

export function getRetryDelayMs(attempt: number): number {
  const normalizedAttempt = Math.max(1, Math.floor(attempt));
  return Math.min(300_000, 1000 * 2 ** (normalizedAttempt - 1));
}
