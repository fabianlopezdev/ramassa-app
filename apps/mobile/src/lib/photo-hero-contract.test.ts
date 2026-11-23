import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
    // A card photo has one fixed shape (RAPP-921), so only the hero measures.
    expect(raisedCardPhoto).not.toContain('useRememberedPhotoShape');
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

const photoZoom = readSource('components/media/photo-zoom.tsx');
const raisedCard = readSource('components/layout/raised-card.tsx');
const galleryTile = readSource('components/gallery/gallery-tile.tsx');

/** Every list that shows the photo cards above, and the screen each card opens. */
const photoCardCallers = [
  { path: 'app/(app)/(tabs)/community.tsx', card: '<ForumPostCard', href: '`/forum/${item.id}`' },
  {
    path: 'app/(app)/(tabs)/index.tsx',
    card: '<AnnouncementCard',
    href: '`/announcement/${item.id}`',
  },
  {
    path: 'components/knowledge/community-story-list.tsx',
    card: '<KnowledgeArticleCard',
    href: '`/knowledge/${item.id}`',
  },
  {
    path: 'app/(app)/guides/[categoryId].tsx',
    card: '<KnowledgeArticleCard',
    href: '`/knowledge/${item.id}`',
  },
  {
    path: 'app/(app)/service-category/[categoryId].tsx',
    card: '<ServiceCard',
    href: '`/service/${item.id}`',
  },
  {
    path: 'components/gallery/gallery-grid.tsx',
    card: '<GalleryTile',
    href: '`/gallery/${item.id}`',
  },
] as const;

describe('a card photo grows into the photo of the screen it opens (RAPP-916)', () => {
  test('the zoom is expo-router’s native one, on iOS only, and never with reduce motion', () => {
    expect(photoZoom).toMatch(/<Link href=\{href\} push asChild>/);
    expect(photoZoom).toContain('<Link.AppleZoom>');
    expect(photoZoom).toContain('<Link.AppleZoomTarget>');
    expect(photoZoom).toContain("process.env.EXPO_OS === 'ios'");
    expect(photoZoom).toContain('const movesPhoto = hasPhoto && !isReducedMotion;');
    // The web keeps the push the cards always made; Android moves the photo itself (RAPP-920).
    expect(photoZoom).toContain('if (!ZOOMS_ON_THIS_PLATFORM) return children(open);');
  });

  test('every card photo is the zoom source, inside the link of its card', () => {
    expect(raisedCardPhoto).toMatch(/<PhotoZoomSource photoKey=\{recyclingKey\}>\s*<Image/);
    // The source copies its child, which must not carry a style array.
    expect(raisedCardPhoto).toContain('style={photoStyle}');
    expect(raisedCard).toContain('<PhotoZoomLink href={props.href} hasPhoto={hasMedia}>');
    expect(galleryTile).toMatch(/<PhotoZoomSource photoKey=\{photoKey\}>\s*<Image/);
    expect(galleryTile).toContain(
      '<PhotoZoomLink href={href} hasPhoto={isPhoto && source !== null}>',
    );
    for (const path of photoCards) {
      const source = readSource(path);
      expect(source, path).toContain('href={href}');
      expect(source, path).not.toContain('onOpen');
    }
  });

  test('every list opens its photo cards by the screen they open', () => {
    for (const { path, card, href } of photoCardCallers) {
      const source = readSource(path);
      expect(source, path).toContain(card);
      expect(source, path).toContain(`href={${href} as Href}`);
    }
    expect(readSource('components/gallery/gallery-grid.tsx')).toContain(
      "isPhoto={item.file_type !== 'video'}",
    );
  });

  test('the target is the photo of the shared hero alone, with no fade of its own', () => {
    expect(photoHero).toMatch(
      /<PhotoZoomTarget photoKey=\{photoKey\}>\s*<Image[\s\S]*?transition=\{0\}/,
    );
    expect(photoHero).not.toMatch(/<PhotoZoomTarget>\s*<(View|Pressable)/);
  });

  test('a screen that grows out of a photo skips the first-visit entrance (RAPP-875)', () => {
    const entrance = readSource('components/motion/screen-entrance.tsx');
    expect(entrance).toContain('arrivesByZoom={arrivesByPhotoZoom(route.params)}');
    expect(entrance).toContain("skip: mode === 'none' || isTakenOver || arrivesByZoom");
  });
});

/** Every card that opens a screen with a photo, and the key its photo goes by on both screens. */
const sharedPhotoKeys = [
  {
    card: 'components/forum/forum-post-card.tsx',
    cardKey: 'recyclingKey={post.image_url ?? post.id}',
    hero: 'app/(app)/forum/[id].tsx',
    heroKey: 'photoKey={post.image_url ?? post.id}',
  },
  {
    card: 'components/knowledge/knowledge-article-card.tsx',
    cardKey: 'recyclingKey={article.image_url ?? article.id}',
    hero: 'app/(app)/knowledge/[id].tsx',
    heroKey: 'photoKey={article.image_url ?? article.id}',
  },
  {
    card: 'app/(app)/(tabs)/index.tsx',
    cardKey: 'imageObjectKey={item.image_url}',
    hero: 'app/(app)/announcement/[id].tsx',
    heroKey: 'photoKey={announcement.image_url ?? announcement.id}',
  },
  {
    card: 'app/(app)/service-category/[categoryId].tsx',
    cardKey: 'imageObjectKey={firstImage?.url ?? null}',
    hero: 'app/(app)/service/[id].tsx',
    heroKey: 'photoKey={heroImage.url}',
  },
  {
    card: 'components/gallery/gallery-grid.tsx',
    cardKey: 'photoKey={item.file_url}',
    hero: 'app/(app)/gallery/[id].tsx',
    heroKey: 'photoKey={item.file_url}',
  },
] as const;

const screenEntrance = readSource('components/motion/screen-entrance.tsx');

describe('on Android too, a card photo moves into the photo of the screen it opens (RAPP-920)', () => {
  test('Android moves the photo with a Reanimated shared transition, and iOS keeps its zoom', () => {
    expect(photoZoom).toContain(
      "const MOVES_PHOTO_ON_THIS_PLATFORM = process.env.EXPO_OS === 'android';",
    );
    expect(photoZoom).toContain(
      'const SharedPhotoImage = Animated.createAnimatedComponent(Image);',
    );
    expect(photoZoom).toContain('sharedTransitionTag={tag}');
    expect(photoZoom).toContain('sharedTransitionStyle={sharedPhotoTransition}');
    // The source and the target are the same native image, both ends tagged by the same key.
    expect(photoZoom.match(/<SharedPhoto\b/g)?.length).toBe(2);
    expect(photoZoom).toContain('tag={movesPhoto ? sharedPhotoTag(photoKey) : undefined}');
    expect(photoZoom).toContain('tag={isReducedMotion ? undefined : sharedPhotoTag(photoKey)}');
    // The timing comes from the motion tokens, and reduce motion turns the move off.
    expect(photoZoom).toMatch(
      /SharedTransition\.duration\(motionTokens\.duration\.slow\)\.reduceMotion\(\s*ReduceMotion\.System,?\s*\)/,
    );
    expect(photoZoom).toContain('<Link.AppleZoom>{children}</Link.AppleZoom>');
    expect(photoZoom).toContain('<Link.AppleZoomTarget>{children}</Link.AppleZoomTarget>');
  });

  test('a card photo and its hero go by the same key on both screens', () => {
    for (const { card, cardKey, hero, heroKey } of sharedPhotoKeys) {
      expect(readSource(card), card).toContain(cardKey);
      expect(readSource(hero), hero).toContain(heroKey);
    }
    expect(readSource('components/announcements/announcement-card.tsx')).toContain(
      'recyclingKey={imageObjectKey ?? id}',
    );
    expect(readSource('components/services/service-card.tsx')).toContain(
      'recyclingKey={imageObjectKey ?? id}',
    );
    expect(readSource('app/(app)/service/[id].tsx')).toContain(
      'const heroImage = service?.images[0];',
    );
    expect(readSource('app/(app)/service-category/[categoryId].tsx')).toContain(
      'const firstImage = item.images[0];',
    );
  });

  test('the press of a card sinks its face and never dims the photo that moves', () => {
    const depth = readSource('components/motion/pressable-depth.tsx');
    expect(depth).toContain(
      'opacity: reduced ? 1 - pressed.get() * (1 - motionTokens.press.opacity) : 1',
    );
  });

  test('the Android push marks the screen, so its first-visit entrance does not fade the photo', () => {
    expect(photoZoom).toContain('push(withPhotoZoomArrival(href))');
  });

  test('every screen sits inside its own boundary, active while it is in front', () => {
    expect(photoZoom).toContain('<SharedTransitionBoundary isActive={isFocused}>');
    expect(photoZoom).toContain(
      "import { Link, useIsFocused, useRouter, type Href } from 'expo-router';",
    );
    // The stack wraps each screen; a group of tabs leaves it to its tabs.
    expect(screenEntrance).toContain(
      'isNavigatorGroup(route.name) ? screen : <PhotoZoomBoundary>{screen}</PhotoZoomBoundary>',
    );
    expect(screenEntrance).toMatch(/<PhotoZoomBoundary>\s*<ScreenEntrance screenId=\{screenId\}>/);
    expect(readSource('app/(app)/_layout.tsx')).toContain('screenLayout={screenEntranceLayout}');
  });

  test('every nested navigator of the signed-in stack is a group of tabs, or shows no photo to move', () => {
    const appDirectory = new URL('../app/(app)/', import.meta.url);
    const nestedNavigators = readdirSync(appDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => existsSync(new URL(`${name}/_layout.tsx`, appDirectory)));
    expect(nestedNavigators.length).toBeGreaterThan(0);
    for (const name of nestedNavigators) {
      if (/^\(.+\)$/.test(name)) continue;
      const screens = readdirSync(new URL(`${name}/`, appDirectory), { recursive: true })
        .map(String)
        .filter((file) => file.endsWith('.tsx'));
      for (const screen of screens) {
        const source = readFileSync(new URL(`${name}/${screen}`, appDirectory), 'utf8');
        expect(source, `${name}/${screen}`).not.toMatch(
          /PhotoHero|RaisedCardPhoto|GalleryGrid|PhotoZoom/,
        );
      }
    }
  });

  test('every tab that lists photo cards is a screen with the entrance, and so its own boundary', () => {
    for (const tab of ['index', 'community']) {
      expect(readSource(`app/(app)/(tabs)/${tab}.tsx`)).toContain(`withScreenEntrance('${tab}',`);
    }
  });
});
