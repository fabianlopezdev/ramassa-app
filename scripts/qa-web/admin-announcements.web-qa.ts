/**
 * Staff announcement publishing through the real admin, local Workers, and
 * local database. Assertions read Postgres independently of the screen.
 */

import { expect, test, type Page } from '@playwright/test';
import { ENTITY_EMAIL, queryDatabase, signIn, STAFF_EMAIL } from './session';

const RUN_TAG = `rapp30${Date.now().toString(36)}`;
const createdIds: string[] = [];

test.afterAll(() => {
  if (createdIds.length === 0) return;
  queryDatabase(
    `delete from public.announcements where id in (${createdIds.map((id) => `'${id}'`).join(',')})`,
  );
});

function remember(title: string): string {
  const id = queryDatabase(
    `select id from public.announcements where title->>'ca' = '${title}' order by created_at desc limit 1`,
  );
  if (id.length === 0) throw new Error('The announcement was not stored');
  if (!createdIds.includes(id)) createdIds.push(id);
  return id;
}

async function openEditor(page: Page, suffix: string) {
  await page.goto('/content/announcements/new');
  await expect(page.getByTestId('announcement-editor')).toBeVisible({ timeout: 20_000 });
  const title = `${RUN_TAG} ${suffix}`;
  await page.getByTestId('title-source').fill(title);
  await page.getByTestId('body-source').fill(`Cos de prova ${suffix}`);
  return title;
}

async function generateAndApprove(page: Page, fields: readonly string[]) {
  await page.getByTestId('announcement-generate').click();
  await expect(page.getByTestId('title-draft-es')).toBeVisible({ timeout: 20_000 });
  for (const field of fields) await page.getByTestId(`${field}-approve-all`).click();
}

test.describe('announcement lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, STAFF_EMAIL);
  });

  test('a Catalan draft persists without machine translations', async ({ page }) => {
    const title = await openEditor(page, 'draft');
    await page.getByTestId('announcement-save').click();
    await expect(page).toHaveURL(/\/content\/announcements(?:\?.*)?$/, { timeout: 20_000 });
    const id = remember(title);

    expect(
      queryDatabase(
        `select status || '|' || (select count(*) from jsonb_object_keys(a.title)) || '|' || (title->>'ca')
           from public.announcements a where id = '${id}'`,
      ),
    ).toBe(`draft|1|${title}`);

    await page.getByTestId(`announcement-link-${id}`).click();
    await expect(page.getByTestId('title-source')).toHaveValue(title);
  });

  test('publish now stores all five approved languages', async ({ page }) => {
    const title = await openEditor(page, 'live');
    await page.getByTestId('announcement-mode').selectOption('now');
    await generateAndApprove(page, ['title', 'body']);
    await page.getByTestId('announcement-save').click();
    await expect(page).toHaveURL(/\/content\/announcements(?:\?.*)?$/, { timeout: 20_000 });
    const id = remember(title);

    await expect
      .poll(
        () =>
          queryDatabase(
            `select status || '|' || (select count(*) from jsonb_object_keys(a.title)) || '|' ||
                    (select count(*) from jsonb_object_keys(a.body)) || '|' || (published_at <= now())::text
               from public.announcements a where id = '${id}'`,
          ),
        { timeout: 15_000 },
      )
      .toBe('published|5|5|true');
  });

  test('scheduling stores a future publication time and filters by lifecycle', async ({ page }) => {
    const title = await openEditor(page, 'scheduled');
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
    await page.getByTestId('announcement-mode').selectOption('scheduled');
    await page.getByTestId('announcement-published-at').fill(future);
    await generateAndApprove(page, ['title', 'body']);
    await page.getByTestId('announcement-save').click();
    await expect(page).toHaveURL(/\/content\/announcements(?:\?.*)?$/, { timeout: 20_000 });
    const id = remember(title);

    expect(
      queryDatabase(
        `select (status = 'published' and published_at > now())::text from public.announcements where id = '${id}'`,
      ),
    ).toBe('true');

    await page.getByTestId('announcement-status-filter').selectOption('scheduled');
    await expect(page).toHaveURL(/[?&]status=scheduled(?:&|$)/);
    await expect(page.getByTestId(`announcement-link-${id}`)).toBeVisible();
    const expectedScheduledCount = Number(
      queryDatabase(
        `select count(*) from public.announcements where status = 'published' and published_at > now()`,
      ),
    );
    await expect(page.locator('tbody tr')).toHaveCount(expectedScheduledCount);
  });

  test('an image needs approved multilingual alt text before publication', async ({ page }) => {
    const title = await openEditor(page, 'image');
    await page.getByTestId('announcement-image').setInputFiles({
      name: 'announcement.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    });
    await page.getByTestId('announcement-mode').selectOption('now');
    await expect(page.getByTestId('announcement-generate')).toBeDisabled();
    await page.getByTestId('announcement-save').click();
    await expect(page.getByRole('alert')).toContainText(/description|descripció|descripción/i);

    await page.getByTestId('image-alt-source').fill('Equip entrenant al camp');
    await generateAndApprove(page, ['title', 'body', 'image-alt']);
    await page.getByTestId('announcement-save').click();
    await expect(page).toHaveURL(/\/content\/announcements(?:\?.*)?$/, { timeout: 30_000 });
    const id = remember(title);

    expect(
      queryDatabase(
        `select (image_url like '%/announcements/%')::text || '|' ||
                (select count(*) from jsonb_object_keys(a.image_alt))
           from public.announcements a where id = '${id}'`,
      ),
    ).toBe('true|5');
  });

  test('pinning changes the database order and delete removes the exact row', async ({ page }) => {
    const title = await openEditor(page, 'actions');
    await page.getByTestId('announcement-save').click();
    await expect(page).toHaveURL(/\/content\/announcements(?:\?.*)?$/, { timeout: 20_000 });
    const id = remember(title);

    await page.getByTestId(`announcement-pin-${id}`).click();
    await expect
      .poll(() =>
        queryDatabase(`select is_pinned::text from public.announcements where id = '${id}'`),
      )
      .toBe('true');
    await expect(
      page.locator('tbody tr').first().getByTestId(`announcement-link-${id}`),
    ).toBeVisible();

    page.on('dialog', (dialog) => void dialog.accept());
    await page.getByTestId(`announcement-delete-${id}`).click();
    await expect
      .poll(() => queryDatabase(`select count(*) from public.announcements where id = '${id}'`))
      .toBe('0');
  });
});

test('an entity contact cannot reach announcement administration', async ({ page }) => {
  await signIn(page, ENTITY_EMAIL);
  await page.goto('/content/announcements');
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 20_000 })
    .not.toContain('/content');
  await expect(page.getByTestId('announcement-editor')).toHaveCount(0);
});
