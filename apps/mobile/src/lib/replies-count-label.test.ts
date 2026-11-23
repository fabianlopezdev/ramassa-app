import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import { repliesCountLabel } from './replies-count-label';

function readSource(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function readForumCatalog(language: string): Record<string, string> {
  const url = new URL(
    `../../../../packages/shared/i18n/locales/${language}/forum.json`,
    import.meta.url,
  );
  return JSON.parse(readFileSync(url, 'utf8')) as Record<string, string>;
}

const format = (count: number) => (count === 1 ? `${count} resposta` : `${count} respostes`);
const forumPostCard = readSource('components/forum/forum-post-card.tsx');

describe('a card says nothing about replies when there are none (RAPP-922)', () => {
  test('zero replies gives no label, so the card draws no icon and no text', () => {
    expect(repliesCountLabel(0, format)).toBeNull();
  });

  test('one reply or more gives the label in its plural form', () => {
    expect(repliesCountLabel(1, format)).toBe('1 resposta');
    expect(repliesCountLabel(2, format)).toBe('2 respostes');
  });

  test('the forum list hands the card no replies label at zero', () => {
    expect(readSource('app/(app)/(tabs)/community.tsx')).toContain(
      'repliesLabel={repliesCountLabel(item.reply_count, formatRepliesCount)}',
    );
    expect(forumPostCard).toContain('readonly repliesLabel: string | null;');
  });

  test('without a label the card draws neither the bubble nor the line', () => {
    expect(forumPostCard).toMatch(/\{repliesLabel === null \? null : \(\s*<Text/);
  });

  test('one reply reads in the singular in every language', () => {
    for (const language of ['ca', 'es', 'en', 'ar', 'fa', 'fr']) {
      const catalog = readForumCatalog(language);
      expect(catalog.repliesCount_one, language).toContain('{{count}}');
      expect(catalog.repliesCount_other, language).toContain('{{count}}');
    }
    expect(readForumCatalog('ca').repliesCount_one).toBe('{{count}} resposta');
  });
});
