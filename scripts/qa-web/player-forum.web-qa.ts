import { expect, test } from '@playwright/test';
import { PARTICIPANT_FIXTURES, SEED_ACCOUNT_PASSWORD } from '@ramassa/shared/testing';
import { queryDatabase } from './session';

const playerOrigin = `http://localhost:${process.env.RAMASSA_QA_PLAYER_PORT ?? '4194'}`;
const player = PARTICIPANT_FIXTURES[0]!;
const runTag = `rapp50-forum-${Date.now().toString(36)}`;
let createdPostId: string | null = null;

test.setTimeout(180_000);

test.afterAll(() => {
  if (createdPostId === null) return;
  const id = createdPostId.replaceAll("'", "''");
  queryDatabase(`delete from public.forum_replies where post_id = '${id}'`);
  queryDatabase(`delete from public.forum_posts where id = '${id}'`);
});

async function signInPlayer(page: import('@playwright/test').Page) {
  await page.goto(`${playerOrigin}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const usePassword = page.getByRole('button', { name: /password/i }).first();
  await expect(usePassword).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await usePassword.click();
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await page.locator('input[type="email"]').fill(player.email);
  await page.locator('input[type="password"]').fill(SEED_ACCOUNT_PASSWORD);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Home', exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

test('player creates, replies to, edits, and tombstones a plain-text forum post', async ({
  page,
}) => {
  await signInPlayer(page);
  await page.goto(`${playerOrigin}/community`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('forum-board')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('forum-new-post').click();
  await expect(page.getByTestId('forum-create-screen')).toBeVisible();
  await page.getByTestId('forum-compose-category-general').click();

  const hostile = `${runTag} <img src=x onerror=alert(1)> **not bold**`;
  await page.getByTestId('forum-post-content').fill(hostile);
  await page.getByTestId('forum-publish').click();
  await expect(page.getByTestId('forum-detail-screen')).toBeVisible({ timeout: 30_000 });
  createdPostId = new URL(page.url()).pathname.split('/').at(-1) ?? null;
  expect(createdPostId).not.toBeNull();
  const detail = page.getByTestId('forum-detail-screen');
  await expect(detail.getByText(hostile, { exact: true })).toBeVisible();
  await expect(page.locator('img[onerror]')).toHaveCount(0);
  await expect(page.locator('strong').filter({ hasText: 'not bold' })).toHaveCount(0);

  const reply = `${runTag} reply مرحبا`;
  await page.getByTestId('forum-reply-content').fill(reply);
  await page.getByTestId('forum-submit-reply').click();
  await expect(detail.getByText(reply, { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('forum-edit').click();
  const edited = `${runTag} edited safely`;
  await page.getByTestId('forum-edit-content').fill(edited);
  await page.getByTestId('forum-save-edit').click();
  await expect(detail.getByText(edited, { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('forum-delete').click();
  await page.getByTestId('forum-confirm-delete').click();
  await expect(detail.getByText('This post has been deleted.', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(detail.getByText(reply, { exact: true })).toBeVisible();
});
