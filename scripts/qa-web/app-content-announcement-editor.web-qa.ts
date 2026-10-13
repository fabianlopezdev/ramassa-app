/**
 * The announcement editor in the app (RAPP-341), through the web build: a new
 * announcement is published only once every translation is approved, its five
 * languages are stored, an edit saves, and text left unsaved is kept on the
 * device and offered again. Expected values come from the database.
 */
import { expect, test, type Page } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer, STAFF_EMAIL } from './session';

test.setTimeout(240_000);

async function openContent(page: Page): Promise<void> {
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);
  await page.getByTestId('team-sidebar-content').click({ timeout: 30_000 });
  await expect(page.getByTestId('content-announcements-total')).toBeVisible({ timeout: 30_000 });
}

test('a new announcement is published with five approved languages, then edited', async ({
  page,
}) => {
  const tag = `app${Date.now().toString(36)}`;
  const title = `Avís ${tag}`;
  try {
    await openContent(page);
    await page.getByTestId('content-announcement-new').click();
    await page.getByTestId('announcement-category-training').click();
    await page.getByTestId('title-source').fill(title);
    await page.getByTestId('body-source').fill(`Text de prova ${tag}`);
    await page.getByTestId('announcement-mode-now').click();

    // Publishing before approving is refused at the button.
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(
      page.getByText('Generate and approve every translation before publishing.'),
    ).toBeVisible();

    await page.getByTestId('announcement-generate').click();
    await expect(page.getByTestId('title-draft-es')).toHaveValue(`[es] ${title}`, {
      timeout: 30_000,
    });
    await page.getByTestId('title-approve-all').click();
    await page.getByTestId('body-approve-all').click();
    await page.getByRole('button', { name: 'Publish', exact: true }).click();

    await expect
      .poll(
        () =>
          queryDatabase(`
            select status || '|' || category || '|' ||
                   (select count(*) from jsonb_object_keys(title)) || '|' ||
                   (title ->> 'es')
              from public.announcements where title ->> 'ca' = '${title}';
          `).trim(),
        { timeout: 30_000 },
      )
      .toBe(`published|training|5|[es] ${title}`);

    const id = queryDatabase(
      `select id from public.announcements where title ->> 'ca' = '${title}';`,
    ).trim();
    await page.getByTestId(`content-announcement-${id}`).click();
    await page.getByTestId('announcement-edit').click();
    await page.getByTestId('announcement-pinned').click();
    await page.getByTestId('announcement-mode-draft').click();
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect
      .poll(
        () =>
          queryDatabase(
            `select status || '|' || is_pinned from public.announcements where id = '${id}';`,
          ).trim(),
        { timeout: 30_000 },
      )
      .toBe('draft|true');
  } finally {
    queryDatabase(`delete from public.announcements where title ->> 'ca' = '${title}';`);
  }
});

test('text left unsaved is kept on the device and offered again', async ({ page }) => {
  const tag = `app${Date.now().toString(36)}`;
  await openContent(page);
  await page.getByTestId('content-announcement-new').click();
  await page.getByTestId('title-source').fill(`Esborrany ${tag}`);
  await page.goBack();
  await page.getByTestId('content-announcement-new').click();
  await expect(page.getByTestId('announcement-draft-restored')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('title-source')).toHaveValue(`Esborrany ${tag}`);
});
