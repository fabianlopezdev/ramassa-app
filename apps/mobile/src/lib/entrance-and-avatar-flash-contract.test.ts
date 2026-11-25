import { describe, expect, test } from 'bun:test';

const read = (path: string) => Bun.file(new URL(path, import.meta.url)).text();

describe('nothing flashes while a screen arrives or rebuilds', () => {
  test('Android draws a fading screen as one picture, so cards keep their white face (RAPP-976)', async () => {
    const entrance = await read('../components/motion/screen-entrance.tsx');
    expect(entrance).toContain('needsOffscreenAlphaCompositing={isMoving}');
    expect(entrance).toContain('renderToHardwareTextureAndroid={isMoving}');
  });

  test('a photo already shown comes back without the fade or the icon under it (RAPP-977)', async () => {
    const avatar = await read('../components/people/person-avatar.tsx');
    expect(avatar).toContain('transition={wasShown ? 0 : 150}');
    expect(avatar).toContain("{wasShown ? null : fallback === 'person' ? (");
    expect(avatar).toContain('onDisplay={rememberShown}');
  });

  // A header that is built again shows her photo blank for a moment on Android,
  // because a new picture view starts empty. So a tab with a switch keeps one
  // scrolling container, and only what is under the header changes (RAPP-977).
  test('Ajuda is one scrolling page whose header stays while the view changes (RAPP-977)', async () => {
    const ajuda = await read('../app/(app)/(tabs)/services.tsx');
    expect(ajuda.match(/<ScrollView\b/g)).toHaveLength(1);
    expect(ajuda).toContain('<PageWidth>{tabHeader}</PageWidth>\n        {body}');
    expect(ajuda).toContain('body = <PlayerBaseDocumentList />;');
    expect(ajuda).toContain('body = <PlayerGuideList />;');
    // The views are content of that page: none brings a scroll view or a header of its own.
    for (const path of [
      '../components/knowledge/player-guide-list.tsx',
      '../components/knowledge/player-base-document-list.tsx',
    ]) {
      const view = await read(path);
      expect(view, path).not.toContain('ScrollView');
      expect(view, path).not.toContain('readonly header');
    }
  });

  test('Comunitat is one list whose header stays while the view changes (RAPP-977)', async () => {
    const community = await read('../app/(app)/(tabs)/community.tsx');
    // The same list in the same place for every view, so React keeps it.
    expect(community.match(/segmentList = \(\n\s+<FlashList\n/g)).toHaveLength(3);
    expect(community.match(/ListHeaderComponent=\{header\}/g)).toHaveLength(3);
    expect(community).toContain('{...galleryList}');
    expect(community).toContain('{...storyList}');
    expect(community).not.toContain('<GalleryGrid');
    expect(community).not.toContain('<CommunityStoryList');
    // A view that is not on show must not count as seen (RAPP-873).
    expect(community).toContain("isOnShow: segment === 'gallery'");
    expect(community).toContain("isOnShow: segment === 'stories'");
    const gallery = await read('../components/gallery/gallery-grid.tsx');
    const stories = await read('../components/knowledge/community-story-list.tsx');
    expect(gallery).toContain("useListSeen('gallery', isOnShow && query.data !== undefined);");
    expect(stories).toContain("useListSeen('stories', isOnShow && query.data !== undefined);");
    expect(stories).not.toContain('<FlashList');
  });
});
