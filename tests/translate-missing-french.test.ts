import { describe, expect, test } from 'bun:test';
import {
  CONTENT_SOURCES,
  emptyCounts,
  fillFrench,
  FROZEN_SOURCES,
  type Json,
} from '../scripts/translate-missing-french';

const translate = async (catalan: string) => `FR(${catalan})`;
const complete = { ca: 'Hola', es: 'Hola', en: 'Hello', ar: 'مرحبا', fa: 'سلام' };

describe('the French backfill (RAPP-781)', () => {
  test('fills French where every other language is written, and nothing else', async () => {
    const counts = emptyCounts();
    const filled = await fillFrench(complete, translate, counts);
    expect(filled).toEqual({ changed: true, value: { ...complete, fr: 'FR(Hola)' } });
    expect(counts.translated).toBe(1);
  });

  test('never touches a French already there, even a blank one', async () => {
    for (const value of [
      { ...complete, fr: 'Bonjour' },
      { ...complete, fr: '' },
    ]) {
      expect(await fillFrench(value, translate, emptyCounts())).toEqual({ changed: false, value });
    }
  });

  test('leaves a text written in Catalan only to its fallback', async () => {
    const counts = emptyCounts();
    const value = { ca: 'Hola', es: 'Hola' };
    expect(await fillFrench(value, translate, counts)).toEqual({ changed: false, value });
    expect(counts.incomplete).toBe(1);
  });

  test('a Catalan left blank on purpose gives a blank French without a translation', async () => {
    const counts = emptyCounts();
    const blank = { ca: '', es: '', en: '', ar: '', fa: '' };
    expect((await fillFrench(blank, translate, counts)).value).toEqual({ ...blank, fr: '' });
    expect(counts).toEqual({ translated: 0, blank: 1, incomplete: 0, tooLong: 0 });
  });

  test('finds language records anywhere inside a value', async () => {
    const value = {
      fields: [{ key: 'kind', label: complete, options: ['a'] }],
      texts: { help: complete },
      points: [{ title: complete, body: { ca: 'Només català' } }],
      url: 'https://example.test/doc.pdf',
    };
    const { value: filled } = await fillFrench(value, translate, emptyCounts());
    expect(filled).toEqual({
      fields: [{ key: 'kind', label: { ...complete, fr: 'FR(Hola)' }, options: ['a'] }],
      texts: { help: { ...complete, fr: 'FR(Hola)' } },
      points: [{ title: { ...complete, fr: 'FR(Hola)' }, body: { ca: 'Només català' } }],
      url: 'https://example.test/doc.pdf',
    });
  });

  test('translates a knowledge body block by block and keeps its images', async () => {
    const blocks: Json[] = [
      { type: 'paragraph', text: 'Primer' },
      {
        type: 'step',
        title: 'Pas',
        text: 'Fes-ho',
        imageUrl: 'https://x.test/a.jpg',
        imageAlt: 'Foto',
      },
    ];
    const body = { ca: blocks, es: blocks, en: blocks, ar: blocks, fa: blocks };
    const { value } = await fillFrench(body, translate, emptyCounts());
    expect((value as { fr: unknown }).fr).toEqual([
      { type: 'paragraph', text: 'FR(Primer)' },
      {
        type: 'step',
        title: 'FR(Pas)',
        text: 'FR(Fes-ho)',
        imageUrl: 'https://x.test/a.jpg',
        imageAlt: 'FR(Foto)',
      },
    ]);
  });

  test('leaves strings, nulls and other records alone', async () => {
    for (const value of [null, 'text', 3, { answer: 'yes' }, { ca: true }] as Json[]) {
      expect((await fillFrench(value, translate, emptyCounts())).changed).toBe(false);
    }
  });

  test('never writes a published legal version', () => {
    const written = new Set(CONTENT_SOURCES.map((source) => source.table));
    for (const frozen of FROZEN_SOURCES) expect(written.has(frozen)).toBe(false);
  });
});
