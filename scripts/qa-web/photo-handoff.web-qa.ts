/**
 * Desktop to phone photo handoff (RAPP-254): at the desk, Laia asks for a
 * photo of a receipt; on a phone-sized browser signed in as her, the code's
 * page takes the photo; the desk sees it arrive and the document is listed.
 * The same code then reads as used.
 */
import { expect, test } from '@playwright/test';
import { queryDatabase, signIn } from './session';

const ADMIN_EMAIL = 'laia.ferrer@example.test';
const DOCUMENT = 'QA phone receipt';

test.setTimeout(180_000);

function removeQaHandoffs(): void {
  queryDatabase(`
    delete from public.internal_documents where name = '${DOCUMENT}';
    delete from public.photo_handoffs where document_name = '${DOCUMENT}';
  `);
}

test.beforeAll(removeQaHandoffs);
test.afterAll(removeQaHandoffs);

test('a photo taken on the phone lands in the desk documents', async ({ page, browser }) => {
  await signIn(page, ADMIN_EMAIL);
  await page.goto('/settings?tab=documents');
  await page.getByTestId('photo-handoff-open').click();
  await page.getByTestId('photo-handoff-name').fill(DOCUMENT);
  await page.getByTestId('photo-handoff-start').click();
  const qr = page.getByTestId('photo-handoff-qr');
  await expect(qr).toBeVisible({ timeout: 30_000 });
  const handoffId = await qr.getAttribute('data-handoff-id');
  expect(handoffId).toMatch(/^[0-9a-f-]{36}$/);

  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'en-GB',
  });
  const phonePage = await phone.newPage();
  await signIn(phonePage, ADMIN_EMAIL);
  await phonePage.goto(`/photo-handoff/${handoffId}`);
  await expect(phonePage.getByText(`This photo becomes the document “${DOCUMENT}”.`)).toBeVisible({
    timeout: 30_000,
  });
  await expect(phonePage.getByRole('link', { name: 'Open in the Ramassà app' })).toHaveAttribute(
    'href',
    `ramassa://photo-handoff/${handoffId}`,
  );
  await phonePage
    .getByTestId('photo-handoff-file')
    .setInputFiles('apps/mobile/assets/images/icon.png');
  await expect(phonePage.getByTestId('photo-handoff-sent')).toBeVisible({ timeout: 30_000 });

  await expect(page.getByTestId('photo-handoff-result')).toContainText('The photo arrived', {
    timeout: 30_000,
  });
  expect(
    queryDatabase(
      `select content_type from public.internal_documents where name = '${DOCUMENT}';`,
    ).trim(),
  ).toMatch(/^image\/(jpeg|png|webp)$/);

  // The code worked once.
  await phonePage.reload();
  await expect(phonePage.getByText('This code was already used.')).toBeVisible({ timeout: 30_000 });
  await phone.close();
});
