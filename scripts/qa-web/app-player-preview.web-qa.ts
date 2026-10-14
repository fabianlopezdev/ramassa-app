/**
 * The player preview in the app (RAPP-371, ADR-027), through the web build: a
 * team member opens the player app from More, and a published announcement as
 * a player sees it from its detail, in another language. The preview comes
 * back after a restart, and leaving returns to her own session. A draft says players see it once it is published. The
 * preview changes nothing; expected values come from the database.
 */
import { expect, test, type Page } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer, STAFF_EMAIL } from './session';

test.setTimeout(240_000);

const ORG = '5eed0000-0000-4000-8000-000000000000';
const PUBLISHED_ANNOUNCEMENT = '5eed0000-0000-4000-8001-000000000002';

const previewStarts = () =>
  Number(
    queryDatabase(
      `select count(*) from public.audit_log where action = 'player_preview.start';`,
    ).trim(),
  );

async function signInAsTeam(page: Page): Promise<void> {
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);
}

test('the player app from More, then back to her own session', async ({ page }) => {
  await signInAsTeam(page);
  const before = previewStarts();
  await page.getByTestId('team-sidebar-more').click({ timeout: 30_000 });
  await page.getByTestId('team-more-preview').click();

  await expect(page.getByTestId('player-preview-bar')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('home-open-feedback')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('team-sidebar-more')).toHaveCount(0);
  expect(previewStarts()).toBe(before + 1);

  // A right-to-left preview language restarts the app; the preview comes back.
  await page.reload();
  await expect(page.getByTestId('player-preview-bar')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('home-open-feedback')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('player-preview-exit').click();
  await expect(page.getByTestId('player-preview-bar')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId('team-sidebar-more')).toBeVisible({ timeout: 30_000 });
});

test('a published announcement as a player sees it, in Spanish', async ({ page }) => {
  const [titleEn, titleEs] = queryDatabase(
    `select title->>'en' || '|' || (title->>'es') from public.announcements where id = '${PUBLISHED_ANNOUNCEMENT}';`,
  )
    .trim()
    .split('|');
  await signInAsTeam(page);
  await page.getByTestId('team-sidebar-content').click({ timeout: 30_000 });
  await page
    .getByTestId(`content-announcement-${PUBLISHED_ANNOUNCEMENT}`)
    .click({ timeout: 30_000 });
  await page.getByTestId('preview-as-player').click({ timeout: 30_000 });

  const screen = page.getByTestId('announcement-detail-screen');
  await expect(screen).toBeVisible({ timeout: 30_000 });
  // The preview starts in her own language (English in this browser).
  await expect(screen.getByRole('heading', { name: titleEn })).toBeVisible();
  await page.getByTestId('player-preview-language-es').click();
  await expect(screen.getByRole('heading', { name: titleEs })).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('player-preview-exit').click();
  await expect(page.getByTestId('team-sidebar-content')).toBeVisible({ timeout: 30_000 });
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
    await signInAsTeam(page);
    await page.getByTestId('team-sidebar-content').click({ timeout: 30_000 });
    await page.getByTestId('content-status-draft').click({ timeout: 30_000 });
    await page.getByTestId(`content-announcement-${id}`).click({ timeout: 30_000 });
    await expect(page.getByTestId('preview-as-player-unpublished')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('preview-as-player')).toHaveCount(0);
  } finally {
    queryDatabase(`delete from public.announcements where id = '${id}';`);
  }
});
