import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

const mobileRoot = fileURLToPath(new URL('../', import.meta.url));
const readMobileSource = (path: string) => readFile(`${mobileRoot}${path}`, 'utf8');

describe('Phase 6 accessibility and i18n contract', () => {
  test('shared press controls are native accessibility elements', async () => {
    const pressableScale = await readMobileSource('components/motion/pressable-scale.tsx');

    expect(pressableScale).toMatch(
      /<NativeWindAnimatedView[\s\S]*?accessible[\s\S]*?accessibilityRole=\{accessibilityRole\}/,
    );
  });

  test('shared press controls enforce the 48dp target in both dimensions', async () => {
    const pressableScale = await readMobileSource('components/motion/pressable-scale.tsx');

    expect(pressableScale).toContain('minHeight: tokens.tapTarget.min');
    expect(pressableScale).toContain('minWidth: tokens.tapTarget.min');
    expect(pressableScale).toContain('[styles.minimumTarget, animatedStyle, style]');
    // The platform press inside a sheet keeps the same minimum target (RAPP-812).
    expect(pressableScale).toContain('[styles.minimumTarget, style]');
    expect(pressableScale).toContain("role === 'switch'");
  });

  test('onboarding date fields stack before accessibility text reaches 200 percent', async () => {
    const background = await readMobileSource('app/(app)/onboarding/background.tsx');

    expect(background).toContain('useWindowDimensions');
    expect(background).toContain('LARGE_TEXT_STACK_THRESHOLD');
    expect(background).toContain("isLargeText ? 'gap-sm' : 'flex-row gap-sm'");
  });

  test('gallery controls and meaningful media expose translated accessible names', async () => {
    const gallery = await readMobileSource('app/(app)/gallery/index.tsx');
    const galleryGrid = await readMobileSource('components/gallery/gallery-grid.tsx');
    const galleryItem = await readMobileSource('app/(app)/gallery/[id].tsx');

    expect(galleryGrid).toContain("t('openItem', { name: item.uploader_first_name })");
    // The screen title is the native header's (RAPP-806).
    expect(gallery).toContain("<NativeScreenHeader title={t('title')} />");
    // The video is drawn by the media stage (RAPP-897): the screen names it and
    // the stage hands that name to the player.
    const galleryStage = await readMobileSource('components/gallery/gallery-media-stage.tsx');
    expect(galleryItem).toMatch(
      /<GalleryVideoStage[\s\S]*?accessibilityLabel=\{[\s\S]*?item\.caption \?\? t\('gallery:mediaBy'/,
    );
    expect(galleryStage).toMatch(/<VideoView[\s\S]*?accessibilityLabel=\{accessibilityLabel\}/);
  });

  test('stateful upload controls announce translated state and progress', async () => {
    const upload = await readMobileSource('app/(app)/gallery/upload.tsx');
    const composer = await readMobileSource('app/(app)/forum/create.tsx');

    // The consent is the shared switch card (RAPP-891): the card is the
    // switch and the tap target, and the drawn switch is hidden from readers.
    const switchCard = await readMobileSource('components/forms/switch-card.tsx');
    expect(upload).toMatch(
      /<SwitchCard[\s\S]*?testID="gallery-consent-acknowledgment"[\s\S]*?label=\{t\('gallery:consentReminder'\)\}[\s\S]*?value=\{consent\}/,
    );
    expect(upload).not.toContain('IOS_SWITCH_SCALE');
    expect(switchCard).toContain('accessibilityRole="switch"');
    expect(switchCard).toContain('isSelected={value}');
    expect(switchCard).toMatch(
      /pointerEvents="none"[\s\S]*?accessibilityElementsHidden[\s\S]*?<Switch/,
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
    const gallery = await readMobileSource('components/gallery/gallery-grid.tsx');
    const galleryTile = await readMobileSource('components/gallery/gallery-tile.tsx');
    const galleryStage = await readMobileSource('components/gallery/gallery-media-stage.tsx');
    const upload = await readMobileSource('app/(app)/gallery/upload.tsx');

    expect(composer).toContain('IMAGE_PICKER_ORIGINAL_QUALITY');
    expect(composer).toContain('FORUM_COMPOSER_TEXT_LINES');
    expect(composer).toContain('FORUM_PREVIEW_HEIGHT');
    expect(forumDetail).toContain('FORUM_DETAIL_IMAGE_HEIGHT');
    // The post's photo is the shared card photo, like an avís's (RAPP-911).
    expect(forumPostCard).toContain('<RaisedCardPhoto');
    expect(forumPostCard).toContain('FORUM_POST_PREVIEW_LINES');
    expect(gallery).toContain('GALLERY_COLUMN_COUNT');
    expect(galleryTile).toContain('GALLERY_TILE_ASPECT_RATIO');
    expect(galleryTile).toContain('motionTokens.duration.fast');
    // An opened photo or video keeps its own shape (RAPP-897); the named value
    // is the shape of its frame until the media has been measured.
    expect(galleryStage).toContain('GALLERY_MEDIA_FALLBACK_ASPECT_RATIO');
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
    // The post card draws its border through the shared raised card (RAPP-852).
    expect(forumPostCard).toContain('<RaisedCard');
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
      'components/forum/forum-own-post-actions.tsx',
      'components/forum/forum-reply-composer.tsx',
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

  test('player web route changes focus the destination heading', async () => {
    const root = await readMobileSource('app/_layout.tsx');

    expect(root).toContain('function WebRouteFocusManager()');
    expect(root).toContain('document.querySelectorAll<HTMLElement>(\'h1, [role="heading"]\')');
    expect(root).toContain("heading.setAttribute('tabindex', '-1')");
    expect(root).toContain('heading.focus()');
  });

  test('labeled busy profile states expose a progressbar role on web', async () => {
    const paths = [
      'app/(app)/profile-data.tsx',
      'app/(app)/profile-edit.tsx',
      'components/profile/attendance-history-section.tsx',
    ] as const;

    for (const path of paths) {
      const source = await readMobileSource(path);
      expect(source, path).toMatch(
        /accessible[\s\S]*?accessibilityRole="progressbar"[\s\S]*?accessibilityLabel=/,
      );
    }
  });
});
