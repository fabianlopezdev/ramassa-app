import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

function readSource(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const position = readSource('lib/photo-focus-position.ts');
const cardPhoto = readSource('components/layout/raised-card-photo.tsx');
const hero = readSource('components/layout/photo-hero.tsx');
const tile = readSource('components/gallery/gallery-tile.tsx');
const lightbox = readSource('components/media/photo-lightbox.tsx');

/** Every list that draws a card or a tile with a stored photo, and the field it reads. */
const focusReaders = [
  ['app/(app)/(tabs)/index.tsx', 'item.image_focus_x'],
  ['components/forum/forum-post-card.tsx', 'post.image_focus_x'],
  ['components/knowledge/knowledge-article-card.tsx', 'article.image_focus_x'],
  ['app/(app)/service-category/[categoryId].tsx', 'firstImage?.focus_x'],
  ['components/gallery/gallery-grid.tsx', 'item.focus_x'],
] as const;

/** Every detail screen that opens on its photo, and the field it reads. */
const heroScreens = [
  ['app/(app)/announcement/[id].tsx', 'image_focus_x'],
  ['app/(app)/forum/[id].tsx', 'image_focus_x'],
  ['app/(app)/knowledge/[id].tsx', 'image_focus_x'],
  ['app/(app)/service/[id].tsx', 'focus_x'],
] as const;

describe('a cropped photo keeps the part its uploader chose (RAPP-932)', () => {
  test('the focus becomes the photo position, with the default for its shape', () => {
    expect(position).toContain(
      'photoFocusPercentages(resolvePhotoFocus(focus, loadedAspectRatio))',
    );
    expect(position).toContain('useRememberedPhotoShape(photoKey)');
  });

  test('the card photo, the photo hero and the gallery tile place the photo by its focus', () => {
    for (const [name, source] of [
      ['card photo', cardPhoto],
      ['photo hero', hero],
      ['gallery tile', tile],
    ] as const) {
      expect(source, name).toContain('usePhotoFocusPosition(');
      expect(source, name).toContain('contentPosition={contentPosition}');
      // Without a chosen focus the photo learns its shape, for the default crop.
      expect(source, name).toContain('onLoad={rememberShape}');
    }
  });

  test('every list hands its cards and tiles the stored focus', () => {
    for (const [path, field] of focusReaders) {
      const source = readSource(path);
      expect(source, path).toContain('photoFocusFromColumns(');
      expect(source, path).toContain(field);
    }
  });

  test('every screen that opens on a photo hands its hero the stored focus', () => {
    for (const [path, field] of heroScreens) {
      const source = readSource(path);
      expect(source, path).toContain('focus={');
      expect(source, path).toContain(field);
    }
  });

  test('the lightbox shows the whole photo and ignores the focus', () => {
    expect(lightbox).toContain('contentFit="contain"');
    expect(lightbox).not.toContain('contentPosition');
    expect(lightbox).not.toContain('focus_x');
  });

  test('the zoom source and target and the card links stay as they were', () => {
    expect(cardPhoto).toContain('<PhotoZoomSource photoKey={recyclingKey}>');
    expect(hero).toContain('<PhotoZoomTarget photoKey={photoKey}>');
  });
});

describe('whoever adds a photo chooses its focus (RAPP-932)', () => {
  const picker = readSource('components/media/photo-focus-picker.tsx');

  test('one shared picker: the whole photo, the card frame from the shared rules, a reset', () => {
    expect(picker).toContain('contentFit="contain"');
    expect(picker).toContain('photoCropWindow(shownFocus, boxAspectRatio, frameAspectRatio)');
    expect(picker).toContain('photoFocusFromPoint(x, y, boxWidth, boxHeight)');
    expect(picker).toContain('frameAspectRatio = tokens.photoCard.aspectRatio');
    expect(picker).toContain("t('photoFocus.reset')");
    expect(picker).toContain('accessibilityRole="adjustable"');
    // The photo is never mirrored: its box runs left to right in every language.
    expect(picker).toContain("direction: 'ltr'");
  });

  test('every phone screen that adds or replaces a stored photo shows the picker', () => {
    for (const path of [
      'app/(app)/content-announcement-edit/[id].tsx',
      'components/content/service-images-field.tsx',
      'app/(app)/forum/create.tsx',
      'app/(app)/gallery/upload.tsx',
    ]) {
      expect(readSource(path), path).toContain('<PhotoFocusPicker');
    }
    // A gallery tile is square, so its frame is too.
    expect(readSource('app/(app)/gallery/upload.tsx')).toContain(
      'frameAspectRatio={GALLERY_TILE_ASPECT_RATIO}',
    );
  });

  test('a new photo starts again from the default crop', () => {
    for (const path of [
      'app/(app)/content-announcement-edit/[id].tsx',
      'components/content/service-form.tsx',
      'app/(app)/forum/create.tsx',
      'app/(app)/gallery/upload.tsx',
    ]) {
      expect(readSource(path), path).toContain('A new photo starts from the default crop');
    }
  });
});
