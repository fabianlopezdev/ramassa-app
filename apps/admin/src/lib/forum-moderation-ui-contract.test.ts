import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'bun:test';

const adminRoot = fileURLToPath(new URL('../', import.meta.url));
const readAdminSource = (path: string) => readFile(`${adminRoot}${path}`, 'utf8');

test('the staff forum route loads the moderation queue and categories in parallel', async () => {
  const source = await readAdminSource('routes/_staff.forum.tsx');
  expect(source).toContain('ssr: false');
  expect(source).toContain('Promise.all');
  expect(source).toContain('fetchForumModerationQueue');
  expect(source).toContain('fetchForumCategories');
});

test('the queue exposes every required staff moderation action', async () => {
  const source = await readAdminSource('components/forum/forum-moderation.tsx');
  for (const action of ['dismiss', 'hide', 'delete'] as const) {
    expect(source).toContain(`'${action}'`);
  }
  expect(source).toContain('contactForumAuthor');
  expect(source).toContain('setForumPostPinned');
  expect(source).toContain('setForumPostCategory');
  expect(source).toContain('ForumCategoryManager');
});

test('participant detail exposes the forum posting toggle', async () => {
  const source = await readAdminSource('components/participants/participant-detail.tsx');
  expect(source).toContain('setForumPostingDisabled');
  expect(source).toContain('forumPostingDisableAction');
  expect(source).toContain('forumPostingEnableAction');
});
