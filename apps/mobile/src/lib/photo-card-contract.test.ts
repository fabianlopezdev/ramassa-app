import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

function readSource(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const raisedCard = readSource('components/layout/raised-card.tsx');
const raisedCardPhoto = readSource('components/layout/raised-card-photo.tsx');
const footer = readSource('components/layout/raised-card-footer.tsx');
const forumPostCard = readSource('components/forum/forum-post-card.tsx');
const announcementCard = readSource('components/announcements/announcement-card.tsx');

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
    expect(raisedCard).toContain('linear-gradient(to bottom, ${panelColor}00');
    expect(raisedCard).toContain('marginTop: -PHOTO_FADE_HEIGHT');
    expect(raisedCard).toContain('backgroundColor: panelColor');
    expect(raisedCard).toContain('text-2xl font-bold ${panelInk.textClassName}');
    expect(raisedCard).toContain('border-s ${panelInk.dividerClassName}');
    // On the brand panel the text, lines and arrow stay white.
    expect(footer).toContain("textClassName: 'text-white'");
    expect(footer).toContain("dividerClassName: 'border-white/50'");
    expect(footer).toContain('iconColor: tokens.colors.white');
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

describe('a photo card in the colour of its topic, with its title at the foot (RAPP-930)', () => {
  test('the panel and the fade take the wash of the tone, and the brand without one', () => {
    expect(raisedCard).toContain('const panelWash = useSectionWash(hasMedia ? tone : undefined);');
    expect(raisedCard).toContain('const panelColor = panelWash ?? brandColor;');
    expect(raisedCard).toContain('photoFadeStyle(panelColor, fadeHoldsText)');
    expect(raisedCard).toContain('PHOTO_BLEND_HEIGHT');
    expect(raisedCard).not.toContain('photoFadeStyle(brandColor)');
    // A tone with a colour puts the panel on its wash; no tone keeps the brand.
    expect(footer).toContain(
      "return tone !== undefined && sectionHue(tone) !== undefined ? 'onWash' : 'onBrand';",
    );
  });

  test('on a wash the text is the dark ink of the plain cards and the arrow the brand', () => {
    expect(footer).toContain("textClassName: 'text-neutral-900'");
    expect(footer).toContain('iconColor: tokens.colors.neutral[900]');
    expect(raisedCard).toContain(
      'color={panelWash === undefined ? panelInk.iconColor : brandColor}',
    );
    // The footer pieces read the ink from the card, so none is white for good.
    expect(raisedCard).toContain('<RaisedCardPanelInkContext.Provider value={panelInkName}>');
    expect(footer).not.toMatch(/className=\{`[^`]*text-white/);
    expect(footer).not.toContain('color={tokens.colors.white}');
  });

  test('the "Nou" badge turns white only on the brand, and stays on the photo', () => {
    expect(raisedCard).toContain(
      "return tone === 'brand' && panelInk === 'onBrand' ? 'inverse' : tone;",
    );
    expect(raisedCard).toContain('tone={badgeToneOnPhoto(badge.tone, panelInkName)}');
    expect(raisedCard).toContain('const edgeBadge = hasMedia ? null : badge;');
  });

  test('a card with no footer pieces puts its title in the foot row beside the arrow', () => {
    expect(raisedCard).toContain(
      'const titleInFooter = hasMediaTitle && footerPieces.length === 0;',
    );
    expect(raisedCard).toContain('{hasMediaTitle && !titleInFooter ? (');
    expect(raisedCard).toMatch(
      /\{titleInFooter \? \(\s*<Text[\s\S]*?\{mediaTitle\}\s*<\/Text>\s*\) : \(\s*<View className="flex-1 flex-row flex-wrap/,
    );
  });

  test('the avís photo card passes the colour of its kind and no footer pieces', () => {
    expect(announcementCard).toContain('tone={announcementCategoryTone(category)}');
    expect(announcementCard).toContain('mediaTitle={title}');
    expect(announcementCard).not.toContain('footer=');
  });

  test('a forum preview on a coloured panel takes the dark ink', () => {
    expect(forumPostCard).toContain(
      "ink={raisedCardPanelInk(tone) === 'onWash' ? 'default' : 'onBrand'}",
    );
  });

  test('the relief, the crop, the zoom source and the link stay as they were', () => {
    expect(raisedCard).toContain('<SelectionChoiceSurface');
    expect(raisedCardPhoto).toContain('<PhotoZoomSource>');
    expect(raisedCardPhoto).toContain('aspectRatio: tokens.photoCard.aspectRatio');
    expect(raisedCard).toContain('<PhotoZoomLink href={props.href} hasPhoto={hasMedia}>');
  });
});
