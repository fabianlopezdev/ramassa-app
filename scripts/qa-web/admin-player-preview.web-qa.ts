/**
 * "Preview as player" from the web admin (RAPP-372): a published announcement
 * opens in the player web app, in a new tab, as the organization's preview
 * account; leaving closes the tab and the admin stays signed in. The sidebar
 * opens the whole player app. A draft says players see it once it is
 * published, and the hand-off page refuses to start without the admin.
 */
import { expect, test, type Page } from '@playwright/test';
import { PLAYER_ORIGIN, queryDatabase, signIn, STAFF_EMAIL } from './session';

test.setTimeout(240_000);

const ORG = '5eed0000-0000-4000-8000-000000000000';
const PUBLISHED_ANNOUNCEMENT = '5eed0000-0000-4000-8001-000000000002';

const previewStarts = () =>
  Number(
    queryDatabase(
      `select count(*) from public.audit_log where action = 'player_preview.start';`,
    ).trim(),
  );

async function openPreview(page: Page, testId: string) {
  const tabOpened = page.context().waitForEvent('page');
  await page.getByTestId(testId).click();
  const tab = await tabOpened;
  await expect(tab.getByTestId('player-preview-bar')).toBeVisible({ timeout: 60_000 });
  return tab;
}

test('a published announcement opens in the player web app, and leaving closes the tab', async ({
  page,
}) => {
  const titles = queryDatabase(
    `select title->>'ca' || '|' || (title->>'en') from public.announcements where id = '${PUBLISHED_ANNOUNCEMENT}';`,
  )
    .trim()
    .split('|');
  await signIn(page, STAFF_EMAIL);
  await page.goto(`/content/announcements/${PUBLISHED_ANNOUNCEMENT}`);
  const before = previewStarts();
  const tab = await openPreview(page, 'admin-preview-as-player');

  const screen = tab.getByTestId('announcement-detail-screen');
  await expect(screen).toBeVisible({ timeout: 30_000 });
  await expect(
    screen.getByRole('heading', { name: new RegExp(titles.join('|')) }).first(),
  ).toBeVisible();
  expect(previewStarts()).toBe(before + 1);

  const closed = tab.waitForEvent('close');
  await tab.getByTestId('player-preview-exit').click();
  await closed;
  // Her own session in the admin is untouched.
  await page.reload();
  await expect(page.getByTestId('admin-preview-as-player')).toBeVisible({
    timeout: 30_000,
  });
});

test('the sidebar opens the whole player app', async ({ page }) => {
  await signIn(page, STAFF_EMAIL);
  await page.goto('/content/announcements');
  const tab = await openPreview(page, 'admin-preview-app');
  await expect(tab.getByTestId('home-open-feedback')).toBeVisible({ timeout: 30_000 });
  await tab.close();
});

test('a draft says players see it once it is published', async ({ page }) => {
  const id = queryDatabase(`
    insert into public.announcements (org_id, title, body, status)
    values ('${ORG}', '{"ca": "Esborrany ${Date.now().toString(36)}"}', '{"ca": "Cos"}', 'draft')
    returning id;
  `)
    .trim()
    .split('\n')[0];
  try {
    await signIn(page, STAFF_EMAIL);
    await page.goto(`/content/announcements/${id}`);
    await expect(page.getByTestId('admin-preview-unpublished')).toBeVisible({ timeout: 30_000 });
  } finally {
    queryDatabase(`delete from public.announcements where id = '${id}';`);
  }
});

test('the hand-off page does not start a preview on its own', async ({ page }) => {
  await page.goto(`${PLAYER_ORIGIN}/preview-handoff`);
  await expect(page.getByTestId('preview-handoff')).toContainText(
    /could not open the player view|No hem pogut obrir/,
    { timeout: 60_000 },
  );
  await expect(page.getByTestId('player-preview-bar')).toHaveCount(0);
});
