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
    expect(changedCatalanTexts(current, saved)).toEqual([
      { text: 'Autorització de la temporada', written: ['es'] },
      { text: 'Salut', written: [] },
    ]);
  });

  test('drafts land only where the Catalan changed; the rest is kept as written', () => {
    const drafts = new Map([
      ['Autorització de la temporada', 'Autorización de la temporada'],
      ['Salut', 'Salud'],
      // Same text as an unchanged place: that place keeps its hand-made Spanish.
      ['Cos', 'Cuerpo'],
    ]);
    const drafted = withCatalanDrafts(current, saved, new Map([['es', drafts]]), false);
    expect(drafted.title.es).toBe('Autorización de la temporada');
    expect(drafted.sections[0]?.body.es).toBe('Cuerpo corregido');
    expect(drafted.sections[1]?.title).toEqual({ ca: 'Salut', es: 'Salud' });
    expect(drafted.version).toBe(3);
  });

  test('every language lands at once; keeping what is written fills only the empty ones', () => {
    const drafts = new Map<LanguageCode, Map<string, string>>([
      [
        'es',
        new Map([
          ['Autorització de la temporada', 'Autorización de la temporada'],
          ['Salut', 'Salud'],
        ]),
      ],
      [
        'fr',
        new Map([
          ['Autorització de la temporada', 'Autorisation de la saison'],
          ['Salut', 'Santé'],
        ]),
      ],
    ]);
    const replaced = withCatalanDrafts(current, saved, drafts, false);
    expect(replaced.title).toEqual({
      ca: 'Autorització de la temporada',
      es: 'Autorización de la temporada',
      fr: 'Autorisation de la saison',
    });
    expect(replaced.sections[1]?.title).toEqual({ ca: 'Salut', es: 'Salud', fr: 'Santé' });
    const kept = withCatalanDrafts(current, saved, drafts, true);
    expect(kept.title).toEqual({
      ca: 'Autorització de la temporada',
      es: 'Autorización',
      fr: 'Autorisation de la saison',
    });
    expect(kept.sections[1]?.title).toEqual({ ca: 'Salut', es: 'Salud', fr: 'Santé' });
  });

  test('typing and deleting again is no change; a real word is', () => {
    expect(isSameContent(saved, { ...saved, title: { ...saved.title, en: '' } })).toBe(true);
    expect(isSameContent({ title: {} }, {})).toBe(true);
    expect(isSameContent(saved, current)).toBe(false);
  });
});
