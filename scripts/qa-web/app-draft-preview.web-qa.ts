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

test('a new event is previewed with its place, places and sign-up, in Spanish', async ({
  page,
}) => {
  const title = `Taller ${Date.now().toString(36)}`;
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);
  await page.getByTestId('team-sidebar-content').click({ timeout: 30_000 });
  await page.getByTestId('content-kind-events').click({ timeout: 30_000 });
  await page.getByTestId('content-event-new').click({ timeout: 30_000 });
  await page.getByTestId('event-title-source').fill(title);
  await page.getByTestId('event-location').fill('Casal del barri');
  await page.getByTestId('event-starts-at').fill('2027-03-01T18:30');
  await page.getByTestId('event-capacity').fill('15');
  await page.getByTestId('event-signup-confirm').click();
  await page.getByTestId('event-generate').click();
  await expect(page.getByTestId('event-title-draft-es')).toHaveValue(`[es] ${title}`, {
    timeout: 30_000,
  });

  await page.getByTestId('event-preview').click();
  await page.getByTestId('draft-preview-language-es').click();
  const spanish = page.getByTestId('draft-preview-content-es');
  await expect(spanish.getByRole('heading', { name: `[es] ${title}` })).toBeVisible();
  await expect(spanish.getByText('Casal del barri')).toBeVisible();
  await expect(spanish.getByText('15 de 15 plazas disponibles')).toBeVisible();
  await expect(spanish.getByRole('button', { name: 'Confirmo que asistiré' })).toBeVisible();
  await page.getByTestId('draft-preview-close').click();
  expect(
    queryDatabase(`select count(*) from public.events where title ->> 'ca' = '${title}';`).trim(),
  ).toBe('0');
});

test('a new guide is previewed block by block, in Farsi right to left', async ({ page }) => {
  const title = `Guia ${Date.now().toString(36)}`;
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);
  await page.getByTestId('team-sidebar-content').click({ timeout: 30_000 });
  await page.getByTestId('content-kind-knowledge').click({ timeout: 30_000 });
  await page.getByTestId('content-knowledge-new').click({ timeout: 30_000 });
  await page.getByTestId('knowledge-type-tutorial').click();
  await page.getByTestId('knowledge-title-source').fill(title);
  await page.getByTestId('knowledge-block-0-edit').click();
  await page.getByTestId('knowledge-block-text').fill('Introducció a la guia.');
  await page.getByTestId('knowledge-block-done').click();
  await page.getByTestId('knowledge-add-step').click();
  await page.getByTestId('knowledge-block-title').fill('Prepara els documents');
  await page.getByTestId('knowledge-block-text').fill('Porta el passaport.');
  await page.getByTestId('knowledge-block-done').click();

  // Before the translations, Farsi has no text of its own.
  await page.getByTestId('knowledge-preview').click();
  const sheet = page.getByTestId('draft-preview-sheet');
  await expect(sheet.getByRole('heading', { name: title })).toBeVisible({ timeout: 30_000 });
  await expect(sheet.getByText('Prepara els documents')).toBeVisible();
  await page.getByTestId('draft-preview-language-fa').click();
  await expect(page.getByTestId('draft-preview-missing')).toBeVisible();
  await page.getByTestId('draft-preview-close').click();

  await page.getByTestId('knowledge-generate').click();
  await expect(page.getByTestId('knowledge-title-draft-es')).toHaveValue(`[es] ${title}`, {
    timeout: 30_000,
  });
  await page.getByTestId('knowledge-preview').click();
  await page.getByTestId('draft-preview-language-fa').click();
  const farsi = page.getByTestId('draft-preview-content-fa');
  await expect(farsi.getByRole('heading', { name: `[fa] ${title}` })).toBeVisible();
  await expect(farsi.getByText('[fa] Prepara els documents')).toBeVisible();
  await expect(farsi).toHaveCSS('direction', 'rtl');
  await expect(page.getByTestId('draft-preview-missing')).toHaveCount(0);
  await page.getByTestId('draft-preview-close').click();
  expect(
    queryDatabase(
      `select count(*) from public.knowledge_articles where title ->> 'ca' = '${title}';`,
    ).trim(),
  ).toBe('0');
});
