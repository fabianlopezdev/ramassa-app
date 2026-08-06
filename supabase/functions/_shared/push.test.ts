import { describe, expect, test } from 'bun:test';
import {
  buildExpoMessage,
  chunkItems,
  classifyExpoOutcome,
  getRetryDelayMs,
  isTransientExpoStatus,
  resolvePushText,
  shouldRetryPushDelivery,
  type PushContent,
} from './push';

const announcement: PushContent = {
  contentType: 'announcement',
  contentId: '10000000-0000-4000-8000-000000000001',
  title: {
    ca: 'Entrenament cancel·lat',
    es: 'Entrenamiento cancelado',
    en: 'Training cancelled',
    ar: 'تم إلغاء التدريب',
    fa: 'تمرین لغو شد',
  },
  body: {
    ca: 'Avui no entrenem.',
    es: 'Hoy no entrenamos.',
    en: 'There is no training today.',
    ar: 'لا يوجد تدريب اليوم.',
    fa: 'امروز تمرین نداریم.',
  },
  expiresAt: null,
};

describe('Expo push batching', () => {
  test("keeps every message and never exceeds Expo's 100-message request limit", () => {
    const chunks = chunkItems(
      Array.from({ length: 205 }, (_, index) => index),
      100,
    );

    expect(chunks.map((chunk) => chunk.length)).toEqual([100, 100, 5]);
    expect(chunks.flat()).toEqual(Array.from({ length: 205 }, (_, index) => index));
  });

  test('rejects a non-positive batch size instead of looping forever', () => {
    expect(() => chunkItems([1], 0)).toThrow();
  });
});

describe('recipient language selection', () => {
  test.each([
    ['ar', 'تم إلغاء التدريب', 'لا يوجد تدريب اليوم.'],
    ['fa', 'تمرین لغو شد', 'امروز تمرین نداریم.'],
    ['es', 'Entrenamiento cancelado', 'Hoy no entrenamos.'],
  ] as const)('uses the approved %s translation for title and body', (language, title, body) => {
    expect(resolvePushText(announcement, language)).toEqual({ title, body, language });
  });

  test('falls back through Catalan and then the remaining supported languages', () => {
    expect(
      resolvePushText(
        { ...announcement, title: { ca: 'Català' }, body: { en: 'English body' } },
        'ar',
      ),
    ).toEqual({ title: 'Català', body: 'English body', language: 'ca' });
  });

  test('an event without a description gets a translated tap-through body', () => {
    expect(
      resolvePushText(
        {
          contentType: 'event',
          contentId: '20000000-0000-4000-8000-000000000001',
          title: announcement.title,
          body: null,
          expiresAt: null,
        },
        'es',
      ),
    ).toEqual({
      title: 'Entrenamiento cancelado',
      body: 'Toca para ver la actividad.',
      language: 'es',
    });
  });
});

describe('notification payloads and outcomes', () => {
  test('an announcement message carries only the validated detail route', () => {
    expect(buildExpoMessage('ExponentPushToken[test]', announcement, 'ca')).toEqual({
      to: 'ExponentPushToken[test]',
      title: 'Entrenament cancel·lat',
      body: 'Avui no entrenem.',
      sound: 'default',
      channelId: 'default',
      data: {
        contentType: 'announcement',
        contentId: announcement.contentId,
      },
    });
  });

  test.each([
    [{ status: 'ok' }, 'delivered'],
    [{ status: 'error', details: { error: 'DeviceNotRegistered' } }, 'pruned'],
    [{ status: 'error', details: { error: 'MessageRateExceeded' } }, 'retry'],
    [{ status: 'error', details: { error: 'InvalidCredentials' } }, 'failed'],
  ] as const)('classifies Expo ticket and receipt outcomes', (outcome, expected) => {
    expect(classifyExpoOutcome(outcome)).toBe(expected);
  });

  test('transient retry delay grows exponentially and stays capped', () => {
    expect([1, 2, 3, 20].map(getRetryDelayMs)).toEqual([1_000, 2_000, 4_000, 300_000]);
  });

  test('retries rate limits and server failures but not invalid requests', () => {
    expect([429, 500, 503].map(isTransientExpoStatus)).toEqual([true, true, true]);
    expect([400, 401, 403].map(isTransientExpoStatus)).toEqual([false, false, false]);
  });

  test('retries transient delivery failures only within the bounded attempt budget', () => {
    expect(shouldRetryPushDelivery('PUSH-2', 1)).toBe(true);
    expect(shouldRetryPushDelivery('PUSH-2', 8)).toBe(false);
    expect(shouldRetryPushDelivery('PUSH-3', 1)).toBe(false);
  });
});
