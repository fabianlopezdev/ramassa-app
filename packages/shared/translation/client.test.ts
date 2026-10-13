import { describe, expect, test } from 'bun:test';
import { isAppError } from '../errors';
import { requestTranslationDrafts } from './client';

const review = {
  sourceLanguage: 'ca',
  sourceText: 'Hola',
  suggestions: [
    { language: 'es', machineText: '[es] Hola', reviewedText: '[es] Hola', status: 'draft' },
  ],
};

function respond(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImplementation = (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
  return { calls, fetchImplementation };
}

describe('requestTranslationDrafts', () => {
  test('posts the text with the token and reads the review', async () => {
    const { calls, fetchImplementation } = respond(200, {
      review,
      usage: { provider: 'mock', estimatedCostUsd: 0 },
    });
    const result = await requestTranslationDrafts({
      workerUrl: 'http://worker',
      accessToken: 'token',
      text: 'Hola',
      from: 'ca',
      to: ['es'],
      fetchImplementation,
    });
    expect(calls[0]?.url).toBe('http://worker/translations');
    expect((calls[0]?.init.headers as Record<string, string>).authorization).toBe('Bearer token');
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({
      text: 'Hola',
      from: 'ca',
      to: ['es'],
    });
    expect(result.suggestions[0]?.machineText).toBe('[es] Hola');
  });

  test('a refusal keeps the Worker code, and no address is TRANSLATION-5', async () => {
    const { fetchImplementation } = respond(403, { error: { code: 'AUTH-3' } });
    const refused = await requestTranslationDrafts({
      workerUrl: 'http://worker',
      accessToken: 'token',
      text: 'Hola',
      from: 'ca',
      to: ['es'],
      fetchImplementation,
    }).catch((error: unknown) => error);
    expect(isAppError(refused) && refused.code).toBe('AUTH-3');
    const missing = await requestTranslationDrafts({
      workerUrl: undefined,
      accessToken: 'token',
      text: 'Hola',
      from: 'ca',
      to: ['es'],
    }).catch((error: unknown) => error);
    expect(isAppError(missing) && missing.code).toBe('TRANSLATION-5');
  });
});
