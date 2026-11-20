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
  const threadMessage = await readMobileSource('components/forum/forum-thread-message.tsx');
  expect(source).toContain('FORUM_REPLY_MAX_LENGTH');
  expect(source).toContain('post.author_id === user?.id');
  expect(source).toContain('useEditForumPost');
  expect(source).toContain('useDeleteForumPost');
  expect(source).toContain('ForumPlainText');
  expect(source).toContain('ForumFlagDialog');
  // The post and the answers are one thread message (RAPP-884), with the
  // report and reply buttons in it.
  expect(threadMessage).toContain('forum-flag-post');
  expect(threadMessage).toContain('forum-flag-reply-');
  expect(threadMessage).toContain('forum-reply-post');
  expect(source).toContain('<ForumThreadMessage');
});

test('forum flagging is a reason-first one-tap flow with optional context', async () => {
  const source = await readMobileSource('components/forum/forum-flag-dialog.tsx');
  expect(source).toContain('FORUM_FLAG_REASONS');
  expect(source).toContain('forum-flag-reason-');
  expect(source).toContain('forum-flag-comment');
  expect(source).toContain('forum-flag-submit');
  expect(source).toContain('flagConfirmation');
});

test('the forum report sheet sits in the shared sheet, whose controls answer on Android', async () => {
  // A native Modal owns a separate Android root. The shared sheet opens the
  // scope in which the app's press controls render the platform Pressable
  // (RAPP-812), so the report uses the same choice cards and call to action as
  // onboarding (RAPP-881) and no hand-made Modal.
  const source = await readMobileSource('components/forum/forum-flag-dialog.tsx');
  expect(source).toContain('<AppSheet');
  expect(source).not.toContain('<Modal');
  expect(source).toContain('<SelectionChoiceCard');
  expect(source).toContain('<AuthSubmitButton');
  // She leaves by dragging the sheet down: no cancel button.
  expect(source).not.toContain("t('cancel')");
  // The privacy line sits above the action, in the sheet's bottom area.
  expect(source).toMatch(/action=\{[\s\S]*flagPrivacy[\s\S]*<AuthSubmitButton/);
  const sheet = await readMobileSource('components/layout/app-sheet.tsx');
  expect(sheet).toContain('<NativeModalScope>');
  expect(sheet).toContain('keyboardDismissMode="on-drag"');
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
  const openApp = await readFile(`${mobileRoot}../../../.maestro/_open-app.yaml`, 'utf8');
  const setLanguage = await readFile(`${mobileRoot}../../../.maestro/_set-language.yaml`, 'utf8');
  expect(openApp).toContain("while:\n      notVisible: '.*${DEV_MENU_LABEL}.*'");
  expect(openApp.match(/openLink: \$\{DEV_CLIENT_URL\}/g)).toHaveLength(2);
  expect(source).toContain('LOCALE: ca');
  expect(source).toContain('file: _set-language.yaml\n    env:\n      LOCALE: ar');
  expect(source).not.toContain('file: _open-app.yaml\n    env:\n      LOCALE: ar');
  expect(setLanguage).not.toContain('env:\n  LOCALE: ca');
  expect(source).toContain('id: player-profile-button');
  expect(source).toContain('notVisible:\n        id: dev-menu-entry');
  expect(source).toContain('ARABIC_TITLE: المجتمع');
  expect(source).toContain("visible: '^${PUSH_DECLINE}$'");
  expect(source).toContain("tapOn: '^${PUSH_DECLINE}$'");
  expect(source).toContain('inputText: rapp50-cat-post català مرحبا');
  expect(source).toContain('inputText: rapp50-cat-reply resposta أهلا');
  expect(source).toContain("visible: '.*rapp50-cat-reply.*'");
  expect(source).toContain("visible: '.*rapp50-ar-reply.*'");
  expect(source).toContain('inputText: rapp50-ar-post مرحبا Ramassà');
  expect(source).toContain('inputText: rapp50-ar-reply رد resposta');
  expect(source.match(/id: forum-publish/g)).toHaveLength(2);
  expect(source.match(/id: forum-submit-reply/g)).toHaveLength(2);
  expect(source.match(/id: forum-save-edit/g)).toHaveLength(2);
  // Each delete taps until the confirmation opens (RAPP-500), then confirms once.
  expect(source.match(/^- tapOn:\n {4}id: forum-confirm-delete$/gm)).toHaveLength(2);
  expect(source.match(/notVisible:\n {8}id: forum-confirm-delete/g)).toHaveLength(2);
  // iOS 27 no longer drops the keyboard on a drag, so every field hides it
  // explicitly on both platforms instead of dragging on iOS.
  expect(source).not.toMatch(/platform: iOS\n {4}commands:\n {6}- swipe:/);
  expect(source.match(/^- hideKeyboard$/gm)?.length).toBeGreaterThanOrEqual(6);
  // The flag sheet fits without scrolling, so a drag cannot dismiss the iOS
  // keyboard over its submit button. Submission retries until it is confirmed.
  expect(source).toMatch(
    /while:\n {6}notVisible: '\^\$\{CATALAN_FLAG_CONFIRMATION\}\$'\n {4}commands:\n {6}- hideKeyboard[\s\S]*?id: forum-flag-submit/,
  );
});
