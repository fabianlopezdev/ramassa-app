import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

function readSource(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const photoHero = readSource('components/layout/photo-hero.tsx');
const header = readSource('components/layout/native-screen-header.tsx');
const raisedCardPhoto = readSource('components/layout/raised-card-photo.tsx');

/** Every player detail screen with a main photo, and the piece it opens on. */
const heroScreens = [
  { path: 'app/(app)/announcement/[id].tsx', piece: '<PhotoHeroScreen' },
  { path: 'app/(app)/knowledge/[id].tsx', piece: '<PhotoHeroScreen' },
  { path: 'app/(app)/service/[id].tsx', piece: '<PhotoHeroScreen' },
  { path: 'app/(app)/gallery/[id].tsx', piece: '<PhotoHeroScreen' },
  // The thread scrolls a list of its own, so the hero heads its list.
  { path: 'app/(app)/forum/[id].tsx', piece: '<PhotoHero\n' },
] as const;

/** Every card that shows a photo, and so opens onto one of the screens above. */
const photoCards = [
  'components/forum/forum-post-card.tsx',
  'components/announcements/announcement-card.tsx',
  'components/knowledge/knowledge-article-card.tsx',
  'components/services/service-card.tsx',
] as const;

describe('a screen with a photo opens on the story layout (RAPP-915)', () => {
  test('every detail screen with a main photo uses the one shared photo hero', () => {
    for (const { path, piece } of heroScreens) {
      const source = readSource(path);
      expect(source, path).toContain(piece);
      expect(source, path).toContain("from '@/components/layout/photo-hero'");
      // The photo is the hero alone: no screen draws its own photo frame any more.
      expect(source, path).not.toContain("from 'expo-image'");
    }
  });

  test('the photo runs under the status bar, behind a header with no bar', () => {
    expect(header).toContain('headerTransparent: true');
    expect(photoHero).toContain('<NativeScreenHeader overPhoto />');
    expect(photoHero).toContain('contentInsetAdjustmentBehavior="never"');
    const forum = readSource('app/(app)/forum/[id].tsx');
    expect(forum).toContain('overPhoto={hasPhotoHero}');
    expect(forum).toContain('isUnderFloatingHeader={hasPhotoHero}');
  });

  test('the sheet overlaps the photo with large rounded top corners from the tokens', () => {
    expect(photoHero).toContain('const SHEET_CORNER_RADIUS = tokens.radius.xl;');
    expect(photoHero).toContain('marginTop: -SHEET_CORNER_RADIUS');
    expect(photoHero).toContain('borderTopStartRadius: SHEET_CORNER_RADIUS');
    expect(photoHero).toContain('borderTopEndRadius: SHEET_CORNER_RADIUS');
    expect(photoHero).toContain('...continuousCorners');
    expect(photoHero).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  test('the sheet keeps the wash each screen had (RAPP-893)', () => {
    expect(readSource('app/(app)/announcement/[id].tsx')).toContain('sheetColor={wash}');
    expect(readSource('app/(app)/forum/[id].tsx')).toContain(
      'sheetColor={wash ?? tokens.colors.neutral[50]}',
    );
  });

  test('the photo keeps its own shape, and a tall one fits inside a share of the screen', () => {
    expect(photoHero).toContain('useRememberedPhotoShape(photoKey)');
    expect(raisedCardPhoto).toContain('useRememberedPhotoShape(recyclingKey)');
    expect(photoHero).toContain('PHOTO_HERO_MAX_SHARE_OF_SCREEN');
    expect(photoHero).toContain("contentFit={isTall ? 'contain' : 'cover'}");
    expect(photoHero).toContain('blurRadius={BACKDROP_BLUR_RADIUS}');
  });

  test('the text under the photo does not repeat it', () => {
    expect(readSource('app/(app)/announcement/[id].tsx')).toContain('imageSource={null}');
    expect(readSource('app/(app)/knowledge/[id].tsx')).toContain(
      'imageUrl: coverSource === null ? article.image_url : null',
    );
    expect(readSource('app/(app)/service/[id].tsx')).toContain('service.images.slice(1)');
  });

  test('every card photo comes from the shared card photo', () => {
    for (const path of photoCards) {
      const source = readSource(path);
      expect(source, path).toContain('<RaisedCardPhoto');
      expect(source, path).not.toContain("from 'expo-image'");
    }
  });
});
