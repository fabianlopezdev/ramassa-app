import { describe, expect, test } from 'bun:test';
import { AppError, errorCodeRegistry } from '../../../packages/shared/errors';
import {
  buildExpoMessage,
  chunkItems,
  classifyExpoOutcome,
  getAcceptedExpoTicketId,
  getRetryDelayMs,
  isTransientExpoStatus,
  postExpoJson,
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
    try {
      chunkItems([1], 0);
      throw new Error('expected chunkItems to reject the invalid size');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('PUSH-3');
      expect(errorCodeRegistry[(error as AppError).code].domain).toBe('PUSH');
    }
  });
});

describe('recipient language selection', () => {
  test('forum flag notifications use fixed localized moderation copy', () => {
    const forumFlag: PushContent = {
      contentType: 'forum_flag',
      contentId: '40000000-0000-4000-8000-000000000001',
      title: null,
      body: null,
      expiresAt: null,
    };

    expect(resolvePushText(forumFlag, 'ca')).toEqual({
      title: 'Nou avís al fòrum',
      body: 'Obre la cua de moderació per revisar-lo.',
      language: 'ca',
    });
    expect(buildExpoMessage('ExponentPushToken[test]', forumFlag, 'es').data).toEqual({
      contentType: 'forum_flag',
      contentId: forumFlag.contentId,
    });
  });

  test('message notifications use fixed localized copy and ignore message text', () => {
    const message: PushContent = {
      contentType: 'message',
      contentId: '30000000-0000-4000-8000-000000000001',
      title: { ca: 'private-message-title' },
      body: { ca: 'private-message-body' },
      expiresAt: null,
    };

    const resolved = buildExpoMessage('ExponentPushToken[test]', message, 'ca');
    expect(resolved.title).toBe('Nou missatge de l’equip');
    expect(resolved.body).toBe('Obre Ramassà per llegir-lo.');
    expect(JSON.stringify(resolved)).not.toContain('private-message');
  });

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
      collapseId: `announcement:${announcement.contentId}`,
      tag: `announcement:${announcement.contentId}`,
      data: {
        contentType: 'announcement',
        contentId: announcement.contentId,
      },
    });
  });

  test('every retry of one content item uses the same provider collapse identity', () => {
    const firstAttempt = buildExpoMessage('ExponentPushToken[test]', announcement, 'ar');
    const retryAttempt = buildExpoMessage('ExponentPushToken[test]', announcement, 'ar');

    expect(retryAttempt.collapseId).toBe(firstAttempt.collapseId);
    expect(retryAttempt.tag).toBe(firstAttempt.tag);
  });

  test('a lost response retries the same collapse-aware payload', async () => {
    const message = buildExpoMessage('ExponentPushToken[test]', announcement, 'ca');
    const attemptedBodies: unknown[] = [];
    const delays: number[] = [];

    const response = await postExpoJson('https://example.test/push', [message], 'PUSH-8', {
      maxAttempts: 2,
      fetcher: async (_url, request) => {
        attemptedBodies.push(JSON.parse(request.body));
        if (attemptedBodies.length === 1) throw new Error('response lost after request write');
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [{ status: 'ok', id: 'ticket-1' }] }),
        };
      },
      sleeper: async (delay) => {
        delays.push(delay);
      },
    });

    expect(response).toEqual({ data: [{ status: 'ok', id: 'ticket-1' }] });
    expect(attemptedBodies).toEqual([[message], [message]]);
    expect(delays).toEqual([1_000]);
  });

  test('a permanent provider rejection fails without retrying', async () => {
    let attempts = 0;

    await expect(
      postExpoJson('https://example.test/push', [], 'PUSH-8', {
        fetcher: async () => {
          attempts += 1;
          return { ok: false, status: 400, json: async () => ({}) };
        },
        sleeper: async () => {},
      }),
    ).rejects.toMatchObject({ code: 'PUSH-3' });
    expect(attempts).toBe(1);
  });

  test('an exhausted transient response does not sleep after its final attempt', async () => {
    const delays: number[] = [];

    await expect(
      postExpoJson('https://example.test/push', [], 'PUSH-8', {
        maxAttempts: 3,
        fetcher: async () => ({
          ok: false,
          status: 503,
          json: async () => ({}),
        }),
        sleeper: async (delay) => {
          delays.push(delay);
        },
      }),
    ).rejects.toMatchObject({ code: 'PUSH-8' });
    expect(delays).toEqual([1_000, 2_000]);
  });

  test.each([
    [{ status: 'ok' }, 'delivered'],
    [{ status: 'error', details: { error: 'DeviceNotRegistered' } }, 'pruned'],
    [{ status: 'error', details: { error: 'MessageRateExceeded' } }, 'retry'],
    [{ status: 'error', details: { error: 'InvalidCredentials' } }, 'failed'],
  ] as const)('classifies Expo ticket and receipt outcomes', (outcome, expected) => {
    expect(classifyExpoOutcome(outcome)).toBe(expected);
  });

  test('treats an accepted response without a ticket id as ambiguous', () => {
    expect(getAcceptedExpoTicketId({ status: 'ok', id: 'ticket-1' })).toBe('ticket-1');
    expect(getAcceptedExpoTicketId({ status: 'error' })).toBeNull();
    expect(() => getAcceptedExpoTicketId({ status: 'ok' })).toThrow(
      expect.objectContaining({ code: 'PUSH-8' }),
    );
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
    expect(shouldRetryPushDelivery('PUSH-8', 1)).toBe(true);
    expect(shouldRetryPushDelivery('PUSH-8', 8)).toBe(false);
    expect(shouldRetryPushDelivery('PUSH-3', 1)).toBe(false);
  });
});
