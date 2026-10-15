/**
 * Internal documents in the app (RAPP-406), through the web build, where the
 * share step downloads the file: a PDF is added from the device, found by a
 * search that ignores case, and opened with the same bytes. A search with no
 * match says so. Expected values come from the database.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer } from './session';

test.setTimeout(240_000);

const ADMIN_EMAIL = 'laia.ferrer@example.test';
const name = `Inventari ${Date.now().toString(36)}.pdf`;
const pdf = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

test.afterAll(() => {
  queryDatabase(`delete from public.internal_documents where name = '${name}';`);
});

test('a PDF is added, found by search and opened with the same bytes', async ({ page }) => {
  await signInPlayer(page, ADMIN_EMAIL);
  await completeSecondFactor(page, ADMIN_EMAIL);
  await page.getByTestId('team-sidebar-more').click({ timeout: 30_000 });
  await page.getByTestId('team-more-documents').click({ timeout: 30_000 });
  await expect(page.getByTestId('documents-search')).toBeVisible({ timeout: 30_000 });

  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('documents-upload').click();
  await (await chooser).setFiles({ name, mimeType: 'application/pdf', buffer: pdf });
  await expect(page.getByTestId('documents-notice')).toHaveText('Document uploaded.', {
    timeout: 60_000,
  });
  const id = queryDatabase(`
    select id || '|' || content_type || '|' || file_size
      from public.internal_documents where name = '${name}';
  `)
    .trim()
    .split('|');
  expect(id.slice(1)).toEqual(['application/pdf', String(pdf.byteLength)]);

  await page.getByTestId('documents-search').fill('zzzz-no-such-document');
  await expect(page.getByText('No documents match the search.')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('documents-search').fill(name.toUpperCase().slice(0, 12));
  await expect(page.getByTestId(`document-${id[0]}`)).toContainText(name, { timeout: 30_000 });

  const download = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByTestId(`document-open-${id[0]}`).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(name);
  expect(readFileSync((await file.path()) ?? '').equals(pdf)).toBe(true);
});
