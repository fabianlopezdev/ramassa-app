/**
 * Gallery moderation in the app (RAPP-381), through the web build: a photo
 * nobody reported is hidden, shows under Hidden, and is shown again, each
 * change audited; another is removed with its row and file. Expected values
 * come from the database.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  accessTokenFor,
  completeSecondFactor,
  queryDatabase,
  SEED_PASSWORD,
  signInPlayer,
  STAFF_EMAIL,
  uploadObjectAs,
} from './session';

test.setTimeout(240_000);

const SEEDED_ITEM = '5eed0000-0000-4000-8014-000000000001';
const REMOVABLE_ITEM = '5eed0000-0000-4000-8014-000000000097';

async function openGallery(page: Page): Promise<void> {
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);
  await page.getByTestId('team-sidebar-more').click({ timeout: 30_000 });
  await page.getByTestId('team-more-gallery').click({ timeout: 30_000 });
  await expect(page.getByTestId('team-gallery-total')).toBeVisible({ timeout: 30_000 });
}

const stateOf = (id: string) =>
  queryDatabase(`select moderation_state from public.media_items where id = '${id}';`).trim();

test.afterAll(() => {
  queryDatabase(`
    update public.media_items set moderation_state = 'visible', flag_count = 0 where id = '${SEEDED_ITEM}';
    delete from public.media_items where id = '${REMOVABLE_ITEM}';
  `);
});

test('a photo nobody reported is hidden, then shown again', async ({ page }) => {
  await openGallery(page);
  await page.getByTestId(`team-gallery-item-${SEEDED_ITEM}`).click({ timeout: 30_000 });
  await page.getByTestId('team-gallery-hide').click();
  await expect.poll(() => stateOf(SEEDED_ITEM), { timeout: 30_000 }).toBe('hidden');

  await page.getByTestId('team-gallery-filter-hidden').click();
  await page.getByTestId(`team-gallery-item-${SEEDED_ITEM}`).click({ timeout: 30_000 });
  await expect(page.getByTestId('team-gallery-sheet-state')).toBeVisible();
  await page.getByTestId('team-gallery-show').click();
  await expect.poll(() => stateOf(SEEDED_ITEM), { timeout: 30_000 }).toBe('visible');
  expect(
    queryDatabase(`
      select string_agg(action, ',' order by created_at) from public.audit_log
       where target_id = '${SEEDED_ITEM}' and action like 'gallery.%';
    `).trim(),
  ).toMatch(/gallery\.hide,gallery\.show$/);
});

test('a photo is removed with its file', async ({ page }) => {
  const playerToken = await accessTokenFor('amina.alhassan@example.test', SEED_PASSWORD);
  const { objectKey } = await uploadObjectAs(
    playerToken,
    new Uint8Array([255, 216, 255, 217]),
    'gallery',
  );
  queryDatabase(`
    insert into public.media_items (
      id, org_id, uploaded_by, uploader_first_name, file_url, thumbnail_url,
      file_type, file_size, caption, privacy_level, moderation_state, flag_count,
      consent_acknowledged_at, consent_version
    ) values (
      '${REMOVABLE_ITEM}', '5eed0000-0000-4000-8000-000000000000',
      '5eed0000-0000-4000-8000-000000000011', 'Amina', '${objectKey}', '${objectKey}',
      'image', 4, 'Gallery moderation QA', 'community', 'visible', 0,
      now(), 'gallery-consent-v1'
    );
  `);
  await openGallery(page);
  await page.getByTestId(`team-gallery-item-${REMOVABLE_ITEM}`).click({ timeout: 30_000 });
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByTestId('team-gallery-remove').click();
  await expect
    .poll(
      () =>
        queryDatabase(
          `select count(*) from public.media_items where id = '${REMOVABLE_ITEM}';`,
        ).trim(),
      { timeout: 30_000 },
    )
    .toBe('0');
  await expect(page.getByTestId(`team-gallery-item-${REMOVABLE_ITEM}`)).toHaveCount(0);
});
