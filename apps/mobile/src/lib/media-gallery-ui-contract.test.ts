import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

const gallery = readFileSync(new URL('../app/(app)/gallery/index.tsx', import.meta.url), 'utf8');
const galleryTile = readFileSync(
  new URL('../components/gallery/gallery-tile.tsx', import.meta.url),
  'utf8',
);
const upload = readFileSync(new URL('../app/(app)/gallery/upload.tsx', import.meta.url), 'utf8');
const item = readFileSync(new URL('../app/(app)/gallery/[id].tsx', import.meta.url), 'utf8');
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
    /state\.draft === null \? null : \(\s*<PressableScale\s*testID="gallery-upload-retry"/s,
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
  expect(upload).toContain('<ErrorCodeLine code="UPLOAD-2" />');
});

test('item view exposes privacy editing, deletion, flagging, and video playback', () => {
  expect(item).toContain('VideoView');
  expect(item).toContain('gallery-detail-back');
  expect(item).toContain('gallery-privacy-picker');
  expect(item).toContain('gallery-delete');
  expect(item).toContain('gallery-flag');
});

test('item load failure exposes actionable feedback, an error code, and a large retry action', () => {
  expect(item).toContain('gallery-detail-load-error');
  expect(item).toContain('gallery-detail-retry');
  expect(item).toContain("t('gallery:loadFailedHelp')");
  expect(item).toContain('<ErrorCodeLine code={loadErrorCode} />');
  expect(item).toContain('onPress={retryLoad}');
  expect(item).toContain('min-h-recommended');
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
