/**
 * The staff-written explanation under the wizard's document step (RAPP-302).
 * Empty languages fall back to Catalan, an empty explanation shows nothing, and
 * a failed read is a typed error the wizard can retry.
 */
import { describe, expect, test } from 'bun:test';
import {
  documentExplanationDraftSchema,
  documentExplanationFor,
  fetchDocumentStepExplanation,
  saveDocumentStepExplanation,
} from './document-explanation';

function clientReturning(result: { data: unknown; error: unknown }) {
  const calls: unknown[] = [];
  const client = {
    rpc: (name: string, args?: unknown) => {
      calls.push(args === undefined ? [name] : [name, args]);
      return Promise.resolve(result);
    },
  };
  return { client: client as never, calls };
}

describe('fetchDocumentStepExplanation', () => {
  test('reads the explanation of her organization', async () => {
    const { client, calls } = clientReturning({ data: { ca: 'Per als cursos.' }, error: null });
    expect(await fetchDocumentStepExplanation(client)).toEqual({ ca: 'Per als cursos.' });
    expect(calls).toEqual([['get_document_step_explanation']]);
  });

  test('none written is null', async () => {
    const { client } = clientReturning({ data: null, error: null });
    expect(await fetchDocumentStepExplanation(client)).toBeNull();
  });

  test('a failed read is a typed DB-1 error', async () => {
    const { client } = clientReturning({ data: null, error: { message: 'boom' } });
    await expect(fetchDocumentStepExplanation(client)).rejects.toMatchObject({ code: 'DB-1' });
  });
});

describe('documentExplanationFor', () => {
  test('her language first, then Catalan', () => {
    const text = { ca: 'Per als cursos.', ar: 'للدورات.' };
    expect(documentExplanationFor(text, 'ar')).toBe('للدورات.');
    expect(documentExplanationFor(text, 'fa')).toBe('Per als cursos.');
  });

  test('nothing written shows nothing', () => {
    expect(documentExplanationFor(null, 'ca')).toBeNull();
  });
});

describe('documentExplanationDraftSchema', () => {
  test('all empty clears the explanation', () => {
    expect(documentExplanationDraftSchema.parse({ ca: ' ', es: '' })).toBeNull();
  });

  test('another language without Catalan is refused', () => {
    expect(documentExplanationDraftSchema.safeParse({ ca: '', es: 'Para cursos.' }).success).toBe(
      false,
    );
  });

  test('empty languages are dropped and the rest trimmed', () => {
    expect(documentExplanationDraftSchema.parse({ ca: ' Per als cursos. ', en: '' })).toEqual({
      ca: 'Per als cursos.',
    });
  });

  test('each text is at most 1000 characters', () => {
    expect(documentExplanationDraftSchema.safeParse({ ca: 'a'.repeat(1001) }).success).toBe(false);
  });
});

describe('saveDocumentStepExplanation', () => {
  test('sends the cleaned explanation', async () => {
    const { client, calls } = clientReturning({ data: { ca: 'Per als cursos.' }, error: null });
    await saveDocumentStepExplanation(client, { ca: 'Per als cursos.' });
    expect(calls).toEqual([
      ['set_document_step_explanation', { p_explanation: { ca: 'Per als cursos.' } }],
    ]);
  });

  test('a refused save is a typed error', async () => {
    const { client } = clientReturning({ data: null, error: { message: 'denied', code: '42501' } });
    await expect(saveDocumentStepExplanation(client, null)).rejects.toBeInstanceOf(Error);
  });
});
