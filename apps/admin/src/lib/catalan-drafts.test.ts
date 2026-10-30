import { describe, expect, test } from 'bun:test';
import type { LanguageCode } from '@ramassa/shared/schemas';
import { catalanTextsIn, withCatalanDrafts } from './catalan-drafts';

type Text = Partial<Record<LanguageCode, string>>;

const content: {
  title: Text;
  sections: { key: string; title: Text; body: Text }[];
  attachments: { label: Text; url: string }[];
  version: number;
} = {
  title: { ca: 'Autorització', es: 'Autorización antigua' },
  sections: [
    { key: 'section_1', title: { ca: 'Dades' }, body: { ca: 'Cos del text ' } },
    { key: 'section_2', title: {}, body: { es: 'Solo en castellano' } },
  ],
  attachments: [{ label: { ca: 'Full' }, url: 'https://example.test/full.pdf' }],
  version: 3,
};

describe('catalan drafts', () => {
  test('every Catalan text is read, at any depth, and nothing else', () => {
    expect(catalanTextsIn(content)).toEqual(['Autorització', 'Dades', 'Cos del text ', 'Full']);
  });

  test('each draft replaces the target language and keeps the rest', () => {
    const drafts = new Map([
      ['Autorització', 'Autorización'],
      ['Dades', 'Datos'],
      ['Cos del text', 'Cuerpo del texto'],
    ]);
    const drafted = withCatalanDrafts(content, 'es', drafts);
    expect(drafted.title).toEqual({ ca: 'Autorització', es: 'Autorización' });
    expect(drafted.sections[0]?.body).toEqual({ ca: 'Cos del text ', es: 'Cuerpo del texto' });
    // No Catalan, or no draft for it: left as it was.
    expect(drafted.sections[1]?.body).toEqual({ es: 'Solo en castellano' });
    expect(drafted.attachments[0]).toEqual(content.attachments[0]);
    expect(drafted.version).toBe(3);
  });
});
