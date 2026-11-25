import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

const mobileRoot = fileURLToPath(new URL('../', import.meta.url));
const readMobileSource = (path: string) => readFile(`${mobileRoot}${path}`, 'utf8');

describe('Phase 6 component architecture contract', () => {
  test('passes named zero-argument actions directly instead of wrapping them', async () => {
    const forumDetail = await readMobileSource('app/(app)/forum/[id].tsx');
    const forumComposer = await readMobileSource('app/(app)/forum/create.tsx');
    const forumReplyComposer = await readMobileSource('components/forum/forum-reply-composer.tsx');
    const forumOwnPostActions = await readMobileSource(
      'components/forum/forum-own-post-actions.tsx',
    );
    const gallery = await readMobileSource('components/gallery/gallery-grid.tsx');
    const galleryItem = await readMobileSource('components/gallery/gallery-item-actions.tsx');
    const galleryUpload = await readMobileSource('app/(app)/gallery/upload.tsx');

    expect(forumDetail).toContain('onPress={saveEdit}');
    // Delete and send pass through the components that draw them (RAPP-884).
    expect(forumDetail).toContain('onConfirmDelete={performDelete}');
    expect(forumOwnPostActions).toContain('onPress={onConfirmDelete}');
    expect(forumDetail).toContain('onSubmit={submitReply}');
    expect(forumReplyComposer).toContain('onPress={onSubmit}');
    expect(forumComposer).toContain('onPress={choosePhoto}');
    expect(forumComposer).toContain('onPress={submit}');
    // The gallery hands its refresh to the list that draws it (RAPP-977).
    expect(gallery).toContain('onRefresh: refresh,');
    expect(gallery).toContain('const refresh = useCallback');
    expect(galleryItem).not.toContain('const setPrivacy = useCallback');
    expect(galleryItem).toContain('onPress={privacyActions[value]}');
    expect(galleryUpload).toContain('onPress={pick}');
    expect(galleryUpload).toContain('onPress={submit}');
  });
});
