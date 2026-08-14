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

describe('Phase 6 data fetching contract', () => {
  test('uses established clients and validated configuration across every target', async () => {
    const sources = await Promise.all(phaseSixTargets.map(readMobileSource));
    const combined = sources.join('\n');

    expect(combined).not.toContain('axios');
    expect(combined).not.toContain('AsyncStorage');
    expect(combined).not.toMatch(/https?:\/\//);
    expect(combined).not.toMatch(/process\.env\.EXPO_PUBLIC_/);
    expect(combined).toContain('mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL');
  });

  test('forum and gallery queries forward React Query cancellation signals', async () => {
    const forum = await readMobileSource('lib/player-forum.ts');
    const gallery = await readMobileSource('lib/player-gallery.ts');

    expect(forum.match(/queryFn: \(\{ signal \}\)/g)).toHaveLength(5);
    expect(forum.match(/, \{ signal \}\)/g)).toHaveLength(5);
    expect(gallery.match(/queryFn: \(\{ signal \}\)/g)).toHaveLength(2);
    expect(gallery.match(/, \{ signal \}\)/g)).toHaveLength(2);
  });

  test('gallery writes execute immediately and reject offline instead of queueing', async () => {
    const gallery = await readMobileSource('lib/player-gallery.ts');
    const upload = await readMobileSource('app/(app)/gallery/upload.tsx');

    expect(gallery.match(/networkMode: 'always'/g)).toHaveLength(3);
    expect(gallery.match(/requireGalleryWriteOnline\(isOnline\)/g)).toHaveLength(3);
    expect(upload).toContain('requireGalleryWriteOnline(isOnline)');
  });
});
