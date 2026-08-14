import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

const mobileRoot = fileURLToPath(new URL('../', import.meta.url));
const readMobileSource = (path: string) => readFile(`${mobileRoot}${path}`, 'utf8');

describe('Phase 6 general React performance contract', () => {
  test('starts independent video thumbnail work alongside the primary upload', async () => {
    const uploadPipeline = await readMobileSource('lib/gallery-upload.ts');
    const thumbnailStart = uploadPipeline.indexOf('const thumbnailPromise:');
    const primaryUploadStart = uploadPipeline.indexOf('const uploadedFilePromise = uploadFile({');
    const concurrentJoin = uploadPipeline.indexOf(
      'await Promise.all([uploadedFilePromise, thumbnailPromise])',
    );

    expect(thumbnailStart).toBeGreaterThan(-1);
    expect(primaryUploadStart).toBeGreaterThan(thumbnailStart);
    expect(concurrentJoin).toBeGreaterThan(primaryUploadStart);
  });

  test('uses the project package boundaries and derives render state without effects', async () => {
    const targets = await Promise.all([
      readMobileSource('app/(app)/(tabs)/community.tsx'),
      readMobileSource('app/(app)/forum/[id].tsx'),
      readMobileSource('app/(app)/forum/create.tsx'),
      readMobileSource('app/(app)/gallery/[id].tsx'),
      readMobileSource('app/(app)/gallery/index.tsx'),
      readMobileSource('app/(app)/gallery/upload.tsx'),
      readMobileSource('components/gallery/gallery-tile.tsx'),
      readMobileSource('components/forum/forum-category-tabs.tsx'),
      readMobileSource('components/forum/forum-flag-dialog.tsx'),
      readMobileSource('components/forum/forum-plain-text.tsx'),
      readMobileSource('components/forum/forum-post-card.tsx'),
      readMobileSource('components/forum/forum-reply-card.tsx'),
      readMobileSource('lib/forum-write.ts'),
      readMobileSource('lib/gallery-upload.ts'),
      readMobileSource('lib/media-upload-policy.ts'),
      readMobileSource('lib/native-media-upload.ts'),
      readMobileSource('lib/player-forum.ts'),
      readMobileSource('lib/player-gallery.ts'),
      readMobileSource('lib/query-persistence.ts'),
    ]);
    const combined = targets.join('\n');

    expect(combined).not.toContain('useEffect');
    expect(combined).not.toMatch(/new (?:Intl|RegExp|Map|Set)\b/);
    expect(combined).not.toMatch(/from ['"]@ramassa\/shared['"]/);
  });
});
