import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

const mobileRoot = fileURLToPath(new URL('../', import.meta.url));
const readMobileSource = (path: string) => readFile(`${mobileRoot}${path}`, 'utf8');

// Comunitat's own presses moved into shared components (RAPP-852): the raised
// cards, the filter chips and the onboarding call to action.
const playerFacingSources = [
  'app/(app)/forum/[id].tsx',
  'app/(app)/forum/create.tsx',
  'app/(app)/gallery/[id].tsx',
  'app/(app)/gallery/index.tsx',
  'app/(app)/gallery/upload.tsx',
  'components/gallery/gallery-tile.tsx',
  'components/forum/forum-category-tabs.tsx',
] as const;

const scrollableSources = [
  'app/(app)/(tabs)/community.tsx',
  'app/(app)/forum/[id].tsx',
  'app/(app)/forum/create.tsx',
  'app/(app)/gallery/[id].tsx',
  'app/(app)/gallery/upload.tsx',
  'components/gallery/gallery-grid.tsx',
  'components/knowledge/community-story-list.tsx',
  // The report sheet scrolls inside this shared sheet (RAPP-881).
  'components/layout/app-sheet.tsx',
] as const;

describe('Phase 6 structural polish contract', () => {
  test('every player-facing scrollable uses automatic native insets', async () => {
    for (const path of scrollableSources) {
      const source = await readMobileSource(path);
      expect(source, path).toContain('contentInsetAdjustmentBehavior="automatic"');
    }
  });

  test('every shared press interaction has haptics and continuous non-capsule corners', async () => {
    for (const path of playerFacingSources) {
      const source = await readMobileSource(path);
      const openingTags = source.match(/<PressableScale\b[\s\S]*?\n\s*>/g) ?? [];
      // Its buttons and cards are the shared raised ones (RAPP-878), which carry
      // their own haptics and corners, or a PressableScale checked below.
      const sharedPressControls =
        source.match(
          /<(PressableScale|RaisedActionButton|AuthSubmitButton|RaisedCard|RaisedChip|FilterChips|SelectionChoiceCard|SelectionChoiceSurface)\b/g,
        ) ?? [];
      expect(sharedPressControls.length, path).toBeGreaterThan(0);

      for (const openingTag of openingTags) {
        expect(openingTag, path).toContain('haptic=');
        if (openingTag.includes('rounded-') && !openingTag.includes('rounded-full')) {
          expect(openingTag, path).toMatch(/style=\{(?:continuousCorners|cardStyle)\}/);
        }
      }
    }
  });

  test('native gallery and forum interactions use the shared haptic vocabulary', async () => {
    const galleryUpload = await readMobileSource('app/(app)/gallery/upload.tsx');
    const galleryItem = await readMobileSource('app/(app)/gallery/[id].tsx');
    const forumPlainText = await readMobileSource('components/forum/forum-plain-text.tsx');

    expect(galleryUpload).toContain("playHaptic('selection')");
    expect(galleryUpload).toContain('onValueChange={toggleConsent}');
    expect(galleryItem).toContain("playHaptic('warning')");
    expect(forumPlainText).toContain("playHaptic('tapLight')");
  });

  test('numeric forum and upload displays use tabular numerals', async () => {
    const forumDetail = await readMobileSource('app/(app)/forum/[id].tsx');
    const galleryUpload = await readMobileSource('app/(app)/gallery/upload.tsx');

    // The reply count is a section title (RAPP-872); the shared title takes the class.
    expect(forumDetail).toMatch(/<SectionTitle\s+className="tabular-nums"/);
    expect(galleryUpload).toContain('text-sm tabular-nums text-neutral-700');
  });

  test('Expo Router route files do not declare colocated components', async () => {
    const galleryItem = await readMobileSource('app/(app)/gallery/[id].tsx');
    expect(galleryItem).not.toContain('function GalleryVideo');
  });
});
