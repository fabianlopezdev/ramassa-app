import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

function readSource(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const raisedCard = readSource('components/layout/raised-card.tsx');
const raisedCardPhoto = readSource('components/layout/raised-card-photo.tsx');
const footer = readSource('components/layout/raised-card-footer.tsx');
const forumPostCard = readSource('components/forum/forum-post-card.tsx');

/** Every preview card that can show a photo. */
const photoCards = [
  'components/forum/forum-post-card.tsx',
  'components/announcements/announcement-card.tsx',
  'components/knowledge/knowledge-article-card.tsx',
  'components/services/service-card.tsx',
] as const;

describe('every card with a photo: the photo fades into a brand panel (RAPP-921)', () => {
  test('every photo card uses the shared card photo and the shared photo layout', () => {
    for (const path of photoCards) {
      const source = readSource(path);
      expect(source, path).toContain('<RaisedCard');
      expect(source, path).toContain('<RaisedCardPhoto');
      expect(source, path).toContain('mediaTitle={');
      // The fade lives in the shared card alone: no card draws its own.
      expect(source, path).not.toContain('linear-gradient');
      expect(source, path).not.toContain("from 'expo-image'");
    }
  });

  test('the card photo fills one landscape shape from the tokens, cropped', () => {
    expect(raisedCardPhoto).toContain('aspectRatio: tokens.photoCard.aspectRatio');
    expect(raisedCardPhoto).toContain('contentFit="cover"');
    expect(raisedCardPhoto).not.toContain('contentFit="contain"');
    expect(raisedCardPhoto).not.toContain('maxHeight');
  });

  test('the shared card draws the fade, the title on the photo, the footer row and the arrow', () => {
    expect(raisedCard).toContain('linear-gradient(to bottom, ${brandColor}00');
    expect(raisedCard).toContain('marginTop: -PHOTO_FADE_HEIGHT');
    expect(raisedCard).toContain('backgroundColor: brandColor');
    expect(raisedCard).toContain('text-2xl font-bold text-white');
    expect(raisedCard).toContain('border-s border-white/50');
    expect(raisedCard).toContain('color={tokens.colors.white}');
    // The relief stays: the photo card is still the raised choice surface.
    expect(raisedCard).toContain('<SelectionChoiceSurface');
    expect(raisedCard).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  test('the footer names the author alone, never "Publicat per"', () => {
    expect(footer).toContain('{name}');
    expect(footer).not.toContain('byAuthor');
    expect(footer).toContain('name="chat"');
    expect(forumPostCard).toContain('<RaisedCardFooterAuthor');
    expect(forumPostCard).toContain('splitForumPostTitle(post.content)');
    expect(forumPostCard).toContain('mediaTitle={title}');
  });
});
