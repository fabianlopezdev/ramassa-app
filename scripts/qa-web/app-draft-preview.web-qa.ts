/**
 * The player preview of an unsaved draft (RAPP-373), through the web build: a
 * new announcement is drawn as a player sees it before anything is saved. A
 * language with no text yet says so and shows the fallback a player gets; after
 * the drafts are made, each language shows its own text, and Arabic lays out
 * right to left inside the preview only. Nothing reaches the database, and the
 * app keeps its own language.
 */
import { expect, test } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer, STAFF_EMAIL } from './session';

test.setTimeout(240_000);

test('a new announcement is previewed per language before it is saved', async ({ page }) => {
  const title = `Avís ${Date.now().toString(36)}`;
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);
  await page.getByTestId('team-sidebar-content').click({ timeout: 30_000 });
  await page.getByTestId('content-announcement-new').click({ timeout: 30_000 });
  await page.getByTestId('announcement-category-training').click();
  await page.getByTestId('title-source').fill(title);
  await page.getByTestId('body-source').fill('Portau aigua.');

  // Before the translations: Spanish has no text, so a player sees Catalan.
  await page.getByTestId('announcement-preview').click();
  const sheet = page.getByTestId('draft-preview-sheet');
  await expect(sheet.getByRole('heading', { name: title })).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('draft-preview-language-es').click();
  await expect(page.getByTestId('draft-preview-missing')).toBeVisible();
  await expect(sheet.getByRole('heading', { name: title })).toBeVisible();
  await page.getByTestId('draft-preview-close').click();

  await page.getByTestId('announcement-generate').click();
  await expect(page.getByTestId('title-draft-es')).toHaveValue(`[es] ${title}`, {
    timeout: 30_000,
  });

  // After: each language has its own text, approved or not yet.
  await page.getByTestId('announcement-preview').click();
  await page.getByTestId('draft-preview-language-es').click();
  await expect(sheet.getByRole('heading', { name: `[es] ${title}` })).toBeVisible();
  await expect(page.getByTestId('draft-preview-missing')).toHaveCount(0);
  await page.getByTestId('draft-preview-language-ar').click();
  const arabic = page.getByTestId('draft-preview-content-ar');
  await expect(arabic.getByRole('heading', { name: `[ar] ${title}` })).toBeVisible();
  await expect(arabic).toHaveCSS('direction', 'rtl');
  await page.getByTestId('draft-preview-close').click();

  // The app kept its own language, and nothing was saved.
  await expect(page.getByTestId('announcement-generate')).toHaveText('Generate translations');
  expect(
    queryDatabase(
      `select count(*) from public.announcements where title ->> 'ca' = '${title}';`,
    ).trim(),
  ).toBe('0');
});
