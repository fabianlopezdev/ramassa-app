import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

const gallery = readFileSync(
  new URL('../components/gallery/gallery-grid.tsx', import.meta.url),
  'utf8',
);
const galleryTile = readFileSync(
  new URL('../components/gallery/gallery-tile.tsx', import.meta.url),
  'utf8',
);
const upload = readFileSync(new URL('../app/(app)/gallery/upload.tsx', import.meta.url), 'utf8');
const item = readFileSync(new URL('../app/(app)/gallery/[id].tsx', import.meta.url), 'utf8');
const mediaStage = readFileSync(
  new URL('../components/gallery/gallery-media-stage.tsx', import.meta.url),
  'utf8',
);
const mediaTitle = readFileSync(
  new URL('../components/gallery/gallery-media-title.tsx', import.meta.url),
  'utf8',
);
const photoLightbox = readFileSync(
  new URL('../components/media/photo-lightbox.tsx', import.meta.url),
  'utf8',
);
const photoHero = readFileSync(
  new URL('../components/layout/photo-hero.tsx', import.meta.url),
  'utf8',
);
const photoRoute = readFileSync(
  new URL('../app/(app)/gallery/photo/[id].tsx', import.meta.url),
  'utf8',
);
const appLayout = readFileSync(new URL('../app/(app)/_layout.tsx', import.meta.url), 'utf8');
const sharedMedia = readFileSync(
  new URL('../../../../packages/shared/media.ts', import.meta.url),
  'utf8',
);

test('gallery uses FlashList with recycled lazy thumbnails', () => {
  expect(gallery).toContain('FlashList');
  expect(gallery).toContain('GalleryTile');
  expect(galleryTile).toContain('recyclingKey');
  expect(galleryTile).toContain('cachePolicy="memory-disk"');
});

test('a gallery tile shows the title in two lines at most and the date, at one height per row (RAPP-913)', () => {
  expect(galleryTile).toContain('testID="gallery-tile-title"');
  expect(galleryTile).toContain('numberOfLines={TILE_TITLE_MAX_LINES}');
  expect(galleryTile).toContain('const TILE_TITLE_MAX_LINES = 2;');
  expect(galleryTile).toContain('testID="gallery-tile-date"');
  // A tile without a title shows only the date.
  expect(galleryTile).toMatch(/title === null \? null : \(\s*<Text\s+testID="gallery-tile-title"/);
  // Unseen room for two title lines and the date keeps every tile the same height.
  expect(galleryTile).toContain('aria-hidden');
  expect(galleryTile).toContain('opacity-0');
  // The date is written in her language.
  expect(gallery).toContain('const locale = i18n.resolvedLanguage ?? DEFAULT_LANGUAGE;');
  expect(gallery).toContain('formatGalleryDate(item.created_at, locale)');
});

test('upload requires consent and exposes determinate progress plus retry', () => {
  expect(upload).toContain('gallery-consent-acknowledgment');
  expect(upload).toContain('gallery-upload-progress');
  expect(upload).toContain('gallery-upload-retry');
  expect(upload).toContain("t('gallery:consentReminder')");
  expect(upload).toMatch(
    /import \{[^}]*MEDIA_CAPTION_MAX_LENGTH[^}]*\} from '@ramassa\/shared\/media'/s,
  );
  expect(sharedMedia).toContain('export const MEDIA_CAPTION_MAX_LENGTH = 500');
  expect(sharedMedia).toContain('.max(MEDIA_CAPTION_MAX_LENGTH)');
  expect(upload).toMatch(
    /state\.draft === null \? null : \(\s*<RaisedActionButton\s*testID="gallery-upload-retry"/s,
  );
});

test('upload shows the selected media with clear replace, remove, and permission recovery actions', () => {
  expect(upload).toContain('gallery-selected-media-preview');
  expect(upload).toContain('gallery-change-media');
  expect(upload).toContain('gallery-remove-media');
  expect(upload).toContain('gallery-media-permission-error');
  expect(upload).toContain('gallery-open-settings');
  expect(upload).toContain("t('gallery:selectedMediaPreview')");
  expect(upload).toContain("t('gallery:mediaPermissionDenied')");
  expect(upload).toContain('Linking.openSettings');
  expect(upload).not.toContain('ErrorCodeLine');
});

test('item view exposes privacy editing, deletion, flagging, and video playback', () => {
  expect(mediaStage).toContain('VideoView');
  expect(mediaStage).toContain('nativeControls');
  expect(item).toContain('<NativeScreenHeader');
  expect(item).toContain('gallery-privacy-picker');
  expect(item).toContain('gallery-delete');
  expect(item).toContain('gallery-flag');
});

test('an opened photo or video runs across the full screen width, in its own shape (RAPP-897)', () => {
  // The scroll content has no side padding; the text under the media brings its own.
  expect(item).not.toContain('contentContainerClassName="grow px-lg py-lg"');
  // A photo opens on the shared story layout, its title and date on the sheet (RAPP-915).
  expect(item).toContain('<PhotoHeroScreen');
  expect(item).toContain('testID="gallery-detail-date"');
  expect(item).toContain('formatGalleryDate(item.created_at');
  expect(item).not.toContain('GalleryPhotoStage');
  expect(item).toContain('<GalleryVideoStage');
  expect(item).toMatch(/<View className="gap-lg px-lg[^"]*">/);
  expect(mediaStage).toContain('galleryMediaFrameHeight');
  expect(mediaStage).toContain('mediaAspectRatioOf');
  // The frame stops growing at the page width on a tablet or in a browser.
  expect(item).toContain('<PageWidth');
});

test('the title sits on the media, at most three lines; the first tap on a video hides it (RAPP-897)', () => {
  expect(mediaTitle).toContain('testID="gallery-media-title"');
  expect(mediaTitle).toContain('numberOfLines={GALLERY_MEDIA_TITLE_MAX_LINES}');
  expect(mediaTitle).toContain('onTextLayout');
  expect(mediaStage).toContain('<GalleryMediaTitle');
  expect(mediaStage).toContain('testID="gallery-video-first-tap"');
  expect(mediaStage).toContain('galleryVideoTitleVisibility');
  // The title lets touches through to the media; only the control at its end takes them.
  expect(mediaTitle).toContain('pointerEvents="box-none"');
  expect(mediaTitle).not.toContain('isVisible');
  // The full text is printed under the media only when the title was cut.
  expect(item).toMatch(/item\.caption === null \|\| !isTitleCut \? null : \(/);
});

test('a tap on an opened photo opens it at full screen in the lightbox (RAPP-913)', () => {
  // The photo at the top of the story layout opens it (RAPP-915).
  expect(photoHero).toContain('testID="photo-hero-open"');
  expect(photoHero).toContain('accessibilityRole="imagebutton"');
  expect(photoHero).toContain('onPress={onOpenPhoto}');
  expect(mediaStage).not.toContain('toggleTitle');
  expect(item).toContain("pathname: '/gallery/photo/[id]'");
  expect(item).toContain('onOpenPhoto={openPhoto}');
  expect(appLayout).toContain(
    '<Stack.Screen name="gallery/photo/[id]" options={photoLightboxOptions} />',
  );
  expect(appLayout).toContain("presentation: 'transparentModal', animation: 'fade'");
  expect(photoRoute).toContain('<PhotoLightbox');
  expect(photoRoute).toContain("closeLabel={t('common:close')}");
  // Pinch, double tap and drag, on the UI thread; a close button the screen reader reaches.
  expect(photoLightbox).toContain('Gesture.Pinch()');
  expect(photoLightbox).toContain('.numberOfTaps(2)');
  expect(photoLightbox).toContain('Gesture.Pan()');
  expect(photoLightbox).toContain('shouldDismissLightbox');
  expect(photoLightbox).toContain('testID="photo-lightbox-close"');
  expect(photoLightbox).toContain('label={closeLabel}');
  expect(photoLightbox).toContain('onAccessibilityEscape={onClose}');
  expect(photoLightbox).toContain('<StatusBar style="light" hidden');
  expect(photoLightbox).toContain('useSafeAreaInsets');
  expect(photoLightbox).toContain('useReducedMotion');
  expect(photoLightbox).toContain('tokens.colors.black');
});

test('the item keeps the report flag, the labels and the right-to-left layout (RAPP-897)', () => {
  // The flag ends the line of who shared it, under a photo or a video (RAPP-915).
  expect(item).toContain('testID="gallery-flag"');
  expect(mediaStage).toContain('containedPictureCornerOffsets');
  expect(mediaStage).toContain('accessibilityLabel={accessibilityLabel}');
  // The tap layers are not screen reader stops; the photo, the player and the flag are.
  expect(mediaStage).toContain('accessible={false}');
  for (const source of [mediaStage, mediaTitle, galleryTile, photoLightbox, photoHero]) {
    expect(source).not.toMatch(
      /\b(left|right|marginLeft|marginRight|paddingLeft|paddingRight)\b\s*:/,
    );
    expect(source).not.toMatch(/\b(ml|mr|pl|pr|left|right)-[a-z0-9]/);
    expect(source).not.toContain('allowFontScaling={false}');
  }
});

test('item load failure exposes actionable feedback without technical codes, and a large retry action', () => {
  expect(item).toContain('gallery-detail-load-error');
  expect(item).toContain('gallery-detail-retry');
  expect(item).toContain("t('gallery:loadFailedHelp')");
  expect(item).not.toContain('ErrorCodeLine');
  expect(item).toContain('onPress={retryLoad}');
  // The retry is the shared call to action, which keeps the large tap height.
  expect(item).toMatch(/<AuthSubmitButton\s+testID="gallery-detail-retry"/);
});

test('all gallery locales cover preview, permission recovery, and load recovery copy', () => {
  for (const locale of ['ca', 'es', 'en', 'ar', 'fa']) {
    const catalog = JSON.parse(
      readFileSync(
        new URL(`../../../../packages/shared/i18n/locales/${locale}/gallery.json`, import.meta.url),
        'utf8',
      ),
    ) as Record<string, unknown>;
    for (const key of [
      'selectedMediaPreview',
      'selectedPhotoPreview',
      'selectedVideoPreview',
      'removeMedia',
      'mediaPermissionDenied',
      'openSettings',
      'loadFailedHelp',
    ]) {
      expect(catalog[key], `${locale}:${key}`).toBeString();
    }
  }
});
