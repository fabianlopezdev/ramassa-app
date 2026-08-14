import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

const mobileRoot = fileURLToPath(new URL('../', import.meta.url));
const readMobileSource = (path: string) => readFile(`${mobileRoot}${path}`, 'utf8');

describe('Phase 6 component architecture contract', () => {
  test('passes named zero-argument actions directly instead of wrapping them', async () => {
    const forumDetail = await readMobileSource('app/(app)/forum/[id].tsx');
    const forumComposer = await readMobileSource('app/(app)/forum/create.tsx');
    const gallery = await readMobileSource('app/(app)/gallery/index.tsx');
    const galleryItem = await readMobileSource('app/(app)/gallery/[id].tsx');
    const galleryUpload = await readMobileSource('app/(app)/gallery/upload.tsx');

    expect(forumDetail).toContain('onPress={saveEdit}');
    expect(forumDetail).toContain('onPress={performDelete}');
    expect(forumDetail).toContain('onPress={submitReply}');
    expect(forumComposer).toContain('onPress={choosePhoto}');
    expect(forumComposer).toContain('onPress={submit}');
    expect(gallery).toContain('onRefresh={refresh}');
    expect(gallery).toContain('const refresh = useCallback');
    expect(galleryItem).not.toContain('const setPrivacy = useCallback');
    expect(galleryItem).toContain('onPress={privacyActions[value]}');
    expect(galleryUpload).toContain('onPress={pick}');
    expect(galleryUpload).toContain('onPress={submit}');
  });
});
