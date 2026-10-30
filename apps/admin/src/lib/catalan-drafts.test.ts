import { describe, expect, test } from 'bun:test';
import type { LanguageCode } from '@ramassa/shared/schemas';
import { changedCatalanTexts, isSameContent, withCatalanDrafts } from './catalan-drafts';

type Text = Partial<Record<LanguageCode, string>>;

interface Content {
  title: Text;
  sections: { key: string; title: Text; body: Text }[];
  version: number;
}

const saved: Content = {
  title: { ca: 'Autorització', es: 'Autorización' },
  sections: [
    { key: 'section_1', title: { ca: 'Dades' }, body: { ca: 'Cos', es: 'Cuerpo corregido' } },
  ],
  version: 3,
};

const current: Content = {
  title: { ca: 'Autorització de la temporada', es: 'Autorización' },
  sections: [
    { key: 'section_1', title: { ca: 'Dades' }, body: { ca: 'Cos', es: 'Cuerpo corregido' } },
    { key: 'section_2', title: { ca: 'Salut' }, body: {} },
  ],
  version: 3,
};

describe('catalan drafts', () => {
  test('only the Catalan that changed against the saved content is sent', () => {
    expect(changedCatalanTexts(current, saved)).toEqual(['Autorització de la temporada', 'Salut']);
  });

  test('drafts land only where the Catalan changed; the rest is kept as written', () => {
    const drafts = new Map([
      ['Autorització de la temporada', 'Autorización de la temporada'],
      ['Salut', 'Salud'],
      // Same text as an unchanged place: that place keeps its hand-made Spanish.
      ['Cos', 'Cuerpo'],
    ]);
    const drafted = withCatalanDrafts(current, saved, 'es', drafts);
    expect(drafted.title.es).toBe('Autorización de la temporada');
    expect(drafted.sections[0]?.body.es).toBe('Cuerpo corregido');
    expect(drafted.sections[1]?.title).toEqual({ ca: 'Salut', es: 'Salud' });
    expect(drafted.version).toBe(3);
  });

  test('typing and deleting again is no change; a real word is', () => {
    expect(isSameContent(saved, { ...saved, title: { ...saved.title, en: '' } })).toBe(true);
    expect(isSameContent({ title: {} }, {})).toBe(true);
    expect(isSameContent(saved, current)).toBe(false);
  });
});
