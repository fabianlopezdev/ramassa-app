import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'bun:test';

const mobileRoot = fileURLToPath(new URL('../', import.meta.url));
const readMobileSource = (path: string) => readFile(`${mobileRoot}${path}`, 'utf8');

test('forum routes keep the private team chat and player forum inside the signed-in guard', async () => {
  const layout = await readMobileSource('app/(app)/_layout.tsx');
  expect(layout).toContain('<Stack.Screen name="forum/create" />');
  expect(layout).toContain('<Stack.Screen name="forum/[id]" />');
  expect(layout).toContain('<Stack.Screen name="team-chat" />');
});

test('forum composer enforces limits, single compressed image, and online-only submission', async () => {
  const source = await readMobileSource('app/(app)/forum/create.tsx');
  expect(source).toContain('FORUM_POST_MAX_LENGTH');
  expect(source).toContain('compressNativeStoryImage');
  expect(source).toContain('allowsMultipleSelection: false');
  expect(source).toContain('!isOnline ||');
});

test('forum detail exposes replies and owner-only edit and delete controls', async () => {
  const source = await readMobileSource('app/(app)/forum/[id].tsx');
  expect(source).toContain('FORUM_REPLY_MAX_LENGTH');
  expect(source).toContain('post.author_id === user?.id');
  expect(source).toContain('useEditForumPost');
  expect(source).toContain('useDeleteForumPost');
  expect(source).toContain('ForumPlainText');
  expect(source).toContain('ForumFlagDialog');
  expect(source).toContain('forum-flag-post');
  expect(source).toContain('forum-flag-reply-');
});

test('forum flagging is a reason-first one-tap flow with optional context', async () => {
  const source = await readMobileSource('components/forum/forum-flag-dialog.tsx');
  expect(source).toContain('FORUM_FLAG_REASONS');
  expect(source).toContain('forum-flag-reason-');
  expect(source).toContain('forum-flag-comment');
  expect(source).toContain('forum-flag-submit');
  expect(source).toContain('flagConfirmation');
});

test('forum flag modal uses native pressables that remain interactive on Android', async () => {
  const source = await readMobileSource('components/forum/forum-flag-dialog.tsx');
  expect(source).toContain('ActivityIndicator,');
  expect(source).toContain('Pressable,');
  expect(source).toContain('A native Modal owns a separate Android root');
  expect(source).not.toContain('<PressableScale');
  expect(source).not.toContain('<AuthSubmitButton');
});

test('the posting soft ban disables both post and reply composers with non-shaming copy', async () => {
  const composer = await readMobileSource('app/(app)/forum/create.tsx');
  const detail = await readMobileSource('app/(app)/forum/[id].tsx');
  expect(composer).toContain('useOwnForumPostingStatus');
  expect(composer).toContain("t('forum:postingDisabled')");
  expect(detail).toContain('useOwnForumPostingStatus');
  expect(detail).toContain("t('forum:postingDisabled')");
});

test('the cumulative native flow proves the lifecycle in Catalan and Arabic', async () => {
  const source = await readFile(`${mobileRoot}../../../.maestro/forum.yaml`, 'utf8');
  expect(source).toContain('LOCALE: ca');
  expect(source).toContain('id: profile-language-ar');
  expect(source).toContain('ARABIC_TITLE: المجتمع');
  expect(source.match(/id: forum-publish/g)).toHaveLength(2);
  expect(source.match(/id: forum-submit-reply/g)).toHaveLength(2);
  expect(source.match(/id: forum-save-edit/g)).toHaveLength(2);
  expect(source.match(/id: forum-confirm-delete/g)).toHaveLength(2);
});
