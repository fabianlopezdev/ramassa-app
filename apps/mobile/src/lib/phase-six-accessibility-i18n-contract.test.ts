import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

const mobileRoot = fileURLToPath(new URL('../', import.meta.url));
const readMobileSource = (path: string) => readFile(`${mobileRoot}${path}`, 'utf8');

describe('Phase 6 accessibility and i18n contract', () => {
  test('gallery lists and meaningful media expose translated accessible names', async () => {
    const gallery = await readMobileSource('app/(app)/gallery/index.tsx');
    const galleryItem = await readMobileSource('app/(app)/gallery/[id].tsx');

    expect(gallery).toMatch(
      /<FlashList[\s\S]*?accessibilityRole="list"[\s\S]*?accessibilityLabel=\{t\('title'\)\}/,
    );
    expect(galleryItem).toMatch(
      /<VideoView[\s\S]*?accessibilityLabel=\{[\s\S]*?item\.caption \?\? t\('gallery:mediaBy'/,
    );
  });

  test('stateful upload controls announce translated state and progress', async () => {
    const upload = await readMobileSource('app/(app)/gallery/upload.tsx');
    const composer = await readMobileSource('app/(app)/forum/create.tsx');

    expect(upload).toMatch(
      /<Switch[\s\S]*?accessibilityRole="switch"[\s\S]*?accessibilityLabel=\{t\('gallery:consentReminder'\)\}[\s\S]*?accessibilityState=/,
    );
    expect(upload).toMatch(
      /accessibilityRole="progressbar"[\s\S]*?accessibilityLabel=\{uploadProgressLabel\}/,
    );
    expect(composer).toMatch(
      /<ActivityIndicator[\s\S]*?accessibilityRole="progressbar"[\s\S]*?accessibilityLabel=\{t\('forum:processingPhoto'\)\}/,
    );
  });

  test('player media configuration and dimensions use named values', async () => {
    const composer = await readMobileSource('app/(app)/forum/create.tsx');
    const forumDetail = await readMobileSource('app/(app)/forum/[id].tsx');
    const forumPostCard = await readMobileSource('components/forum/forum-post-card.tsx');
    const gallery = await readMobileSource('app/(app)/gallery/index.tsx');
    const galleryTile = await readMobileSource('components/gallery/gallery-tile.tsx');
    const galleryItem = await readMobileSource('app/(app)/gallery/[id].tsx');
    const upload = await readMobileSource('app/(app)/gallery/upload.tsx');

    expect(composer).toContain('IMAGE_PICKER_ORIGINAL_QUALITY');
    expect(composer).toContain('FORUM_COMPOSER_TEXT_LINES');
    expect(composer).toContain('FORUM_PREVIEW_HEIGHT');
    expect(forumDetail).toContain('FORUM_DETAIL_IMAGE_HEIGHT');
    expect(forumPostCard).toContain('FORUM_POST_IMAGE_HEIGHT');
    expect(forumPostCard).toContain('FORUM_POST_PREVIEW_LINES');
    expect(gallery).toContain('GALLERY_COLUMN_COUNT');
    expect(galleryTile).toContain('GALLERY_TILE_ASPECT_RATIO');
    expect(galleryTile).toContain('motionTokens.duration.fast');
    expect(galleryItem).toContain('GALLERY_MEDIA_ASPECT_RATIO');
    expect(upload).toContain('IMAGE_PICKER_ORIGINAL_QUALITY');
    expect(upload).toContain('MEDIA_CAPTION_MAX_LENGTH');
    expect(upload).toContain('PROGRESS_PERCENT_MAX');
  });

  test('gallery upload pipeline names thumbnail and progress configuration', async () => {
    const uploadPipeline = await readMobileSource('lib/gallery-upload.ts');
    const uploadPolicy = await readMobileSource('lib/media-upload-policy.ts');

    expect(uploadPipeline).toContain('VIDEO_THUMBNAIL_TIME_SECONDS');
    expect(uploadPipeline).toContain('tokens.upload.maxImageDimension');
    expect(uploadPipeline).not.toContain('VIDEO_THUMBNAIL_MAX_DIMENSION');
    expect(uploadPipeline).toContain('VIDEO_THUMBNAIL_JPEG_QUALITY');
    expect(uploadPipeline).toContain('UPLOAD_PROGRESS.FILE_TRANSFER_WEIGHT');
    expect(uploadPipeline).toContain('UPLOAD_PROGRESS.THUMBNAIL_TRANSFER_WEIGHT');
    expect(uploadPolicy).toContain('MIN_UPLOAD_PROGRESS');
    expect(uploadPolicy).toContain('MAX_UPLOAD_PROGRESS');
    expect(uploadPolicy).not.toContain('readonly progress: 0');
  });

  test('forum dimensions and query timing use named values', async () => {
    const composer = await readMobileSource('app/(app)/forum/create.tsx');
    const flagDialog = await readMobileSource('components/forum/forum-flag-dialog.tsx');
    const forumPostCard = await readMobileSource('components/forum/forum-post-card.tsx');
    const playerForum = await readMobileSource('lib/player-forum.ts');

    expect(composer).toContain('FORUM_COMPOSER_INPUT_MIN_HEIGHT');
    expect(flagDialog).toContain('FORUM_FLAG_COMMENT_MIN_HEIGHT');
    expect(forumPostCard).toContain('FORUM_POST_CARD_BORDER_WIDTH');
    expect(playerForum).toContain('FORUM_POSTING_STATUS_STALE_TIME_MS');
  });

  test('player-authored forum and gallery text supports mixed Arabic and Latin direction', async () => {
    const composer = await readMobileSource('app/(app)/forum/create.tsx');
    const forumDetail = await readMobileSource('app/(app)/forum/[id].tsx');
    const flagDialog = await readMobileSource('components/forum/forum-flag-dialog.tsx');
    const galleryItem = await readMobileSource('app/(app)/gallery/[id].tsx');
    const galleryUpload = await readMobileSource('app/(app)/gallery/upload.tsx');

    expect(composer).toContain("writingDirection: 'auto'");
    expect(forumDetail).toContain("writingDirection: 'auto'");
    expect(forumDetail).toMatch(
      /testID="forum-edit-content"[\s\S]*?style=\{styles\.mixedDirectionInput\}/,
    );
    expect(flagDialog).toContain("writingDirection: 'auto'");
    expect(galleryItem).toContain("writingDirection: 'auto'");
    expect(galleryUpload).toContain("writingDirection: 'auto'");
  });

  test('player-facing alert text remains selectable for support and error reporting', async () => {
    const paths = [
      'app/(app)/forum/[id].tsx',
      'app/(app)/forum/create.tsx',
      'app/(app)/gallery/upload.tsx',
      'components/forum/forum-flag-dialog.tsx',
    ] as const;

    for (const path of paths) {
      const source = await readMobileSource(path);
      const alertTextTags = source.match(/<Text\b(?=[^>]*accessibilityRole="alert")[^>]*>/g) ?? [];
      expect(alertTextTags.length, path).toBeGreaterThan(0);
      for (const alertTextTag of alertTextTags) {
        expect(alertTextTag, path).toMatch(/<Text\s+selectable\b/);
      }
    }
  });
});
