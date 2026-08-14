import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

const mobileRoot = fileURLToPath(new URL('../', import.meta.url));
const readMobileSource = (path: string) => readFile(`${mobileRoot}${path}`, 'utf8');

const phaseSixTargets = [
  'app/(app)/(tabs)/community.tsx',
  'app/(app)/forum/[id].tsx',
  'app/(app)/forum/create.tsx',
  'app/(app)/gallery/[id].tsx',
  'app/(app)/gallery/index.tsx',
  'app/(app)/gallery/upload.tsx',
  'components/gallery/gallery-tile.tsx',
  'components/forum/forum-category-tabs.tsx',
  'components/forum/forum-flag-dialog.tsx',
  'components/forum/forum-plain-text.tsx',
  'components/forum/forum-post-card.tsx',
  'components/forum/forum-reply-card.tsx',
  'lib/forum-write.ts',
  'lib/gallery-upload.ts',
  'lib/media-upload-policy.ts',
  'lib/native-media-upload.ts',
  'lib/player-forum.ts',
  'lib/player-gallery.ts',
  'lib/query-persistence.ts',
] as const;

describe('Phase 6 React Native performance contract', () => {
  test('unbounded player feeds use FlashList with memoized lightweight rows', async () => {
    const community = await readMobileSource('app/(app)/(tabs)/community.tsx');
    const forumDetail = await readMobileSource('app/(app)/forum/[id].tsx');
    const gallery = await readMobileSource('app/(app)/gallery/index.tsx');
    const forumPostCard = await readMobileSource('components/forum/forum-post-card.tsx');
    const forumReplyCard = await readMobileSource('components/forum/forum-reply-card.tsx');
    const galleryTile = await readMobileSource('components/gallery/gallery-tile.tsx');

    expect(community).toContain('<FlashList');
    expect(forumDetail).toContain('<FlashList');
    expect(gallery).toContain('<FlashList');
    expect(forumPostCard).toContain('memo(function ForumPostCard');
    expect(forumReplyCard).toContain('memo(function ForumReplyCard');
    expect(galleryTile).toContain('memo(function GalleryTile');
    expect(gallery).toContain('<GalleryTile');
    expect(gallery).not.toContain('onPress={() => openItem(item.id)}');
    expect(forumPostCard).not.toContain('useAuth()');
  });

  test('list and option callbacks are stable instead of allocated in mapped children', async () => {
    const forumDetail = await readMobileSource('app/(app)/forum/[id].tsx');
    const forumComposer = await readMobileSource('app/(app)/forum/create.tsx');
    const galleryItem = await readMobileSource('app/(app)/gallery/[id].tsx');
    const galleryUpload = await readMobileSource('app/(app)/gallery/upload.tsx');
    const flagDialog = await readMobileSource('components/forum/forum-flag-dialog.tsx');
    const replyCard = await readMobileSource('components/forum/forum-reply-card.tsx');

    expect(forumDetail).not.toContain("onPress={() => setFlagTarget({ targetType: 'reply'");
    expect(replyCard).toContain('const flag = useCallback');
    expect(replyCard).toContain('onPress={flag}');
    expect(forumComposer).not.toContain('onPress={() => setCategoryId(category.id)}');
    expect(galleryItem).not.toContain('onPress={() => privacyMutation.mutate(value)}');
    expect(galleryUpload).not.toContain('onPress={() => setPrivacy(value)}');
    expect(galleryItem).toContain('MEDIA_PRIVACY_OPTIONS.map');
    expect(galleryUpload).toContain('MEDIA_PRIVACY_OPTIONS.map');
    expect(flagDialog).toContain('memo(function ForumFlagReasonOption');
  });

  test('native event callbacks do not forward incompatible event objects to data functions', async () => {
    const gallery = await readMobileSource('app/(app)/gallery/index.tsx');

    expect(gallery).not.toContain('onRefresh={query.refetch}');
    expect(gallery).toContain('const refresh = useCallback');
    expect(gallery).toContain('onRefresh={refresh}');
  });

  test('bounded option collections reuse named render functions and stable empty arrays', async () => {
    const community = await readMobileSource('app/(app)/(tabs)/community.tsx');
    const forumComposer = await readMobileSource('app/(app)/forum/create.tsx');
    const categoryTabs = await readMobileSource('components/forum/forum-category-tabs.tsx');
    const flagDialog = await readMobileSource('components/forum/forum-flag-dialog.tsx');
    const forumPlainText = await readMobileSource('components/forum/forum-plain-text.tsx');
    const galleryItem = await readMobileSource('app/(app)/gallery/[id].tsx');
    const galleryUpload = await readMobileSource('app/(app)/gallery/upload.tsx');

    expect(community).toContain('categoriesQuery.data ?? EMPTY_CATEGORIES');
    expect(forumComposer).toContain('categoriesQuery.data ?? EMPTY_CATEGORIES');
    expect(forumComposer).toContain('.map(renderCategory)');
    expect(categoryTabs).toContain('categories.map(renderCategory)');
    expect(flagDialog).toContain('FORUM_FLAG_REASONS.map(renderReason)');
    expect(forumPlainText).toContain('segments.map(renderSegment)');
    expect(galleryItem).toContain('MEDIA_PRIVACY_OPTIONS.map(renderPrivacyOption)');
    expect(galleryUpload).toContain('MEDIA_PRIVACY_OPTIONS.map(renderPrivacyOption)');
  });

  test('render-time object props and unstable empty list fallbacks are eliminated', async () => {
    const sources = await Promise.all(phaseSixTargets.map(readMobileSource));
    const combined = sources.join('\n');
    const forumDetail = await readMobileSource('app/(app)/forum/[id].tsx');
    const forumComposer = await readMobileSource('app/(app)/forum/create.tsx');

    expect(combined).not.toContain('style={{');
    expect(forumComposer).not.toContain('source={{ uri: image.uri }}');
    expect(forumComposer).toContain('source={imageSource}');
    expect(forumDetail).toContain('const EMPTY_REPLIES');
    expect(forumDetail).toContain('data={repliesQuery.data ?? EMPTY_REPLIES}');
  });

  test('target rendering and animation paths remain GPU-safe and leak no falsy JSX values', async () => {
    const sources = await Promise.all(phaseSixTargets.map(readMobileSource));
    const combined = sources.join('\n');

    expect(combined).not.toMatch(/\{[^\n{}]*&&[^\n{}]*<[^>]+>/);
    expect(combined).not.toMatch(
      /useAnimatedStyle[\s\S]*?(?:width|height|top|left|margin|padding):/,
    );
    expect(combined).not.toMatch(/(?:FadeIn|FadeOut|SlideIn|SlideOut)\w*\.(?:delay|duration)\(/);
    expect(combined).not.toContain("from 'react-native-reanimated'");
  });
});
