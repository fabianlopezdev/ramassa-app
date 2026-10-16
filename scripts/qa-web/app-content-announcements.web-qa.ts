/**
 * The Content area in the app (RAPP-340), through the web build: the
 * announcements list with its total and status chips, one announcement beside
 * the list, pinning, and deleting. Counts come from the database.
 */
import { expect, test } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer, STAFF_EMAIL } from './session';

test.setTimeout(240_000);

const ORG = '5eed0000-0000-4000-8000-000000000000';
const count = (where: string) =>
  Number(
    queryDatabase(
      `select count(*) from public.announcements where org_id = '${ORG}' ${where};`,
    ).trim(),
  );

test('the announcements list, one announcement, pin and delete', async ({ page }) => {
  const tag = `app${Date.now().toString(36)}`;
  const id = queryDatabase(`
    insert into public.announcements (org_id, title, body, status)
    values ('${ORG}', '{"ca": "Prova ${tag}"}', '{"ca": "Cos ${tag}"}', 'draft')
    returning id;
  `)
    .trim()
    .split('\n')[0];
  try {
    await signInPlayer(page, STAFF_EMAIL);
    await completeSecondFactor(page, STAFF_EMAIL);
    await page.getByTestId('team-sidebar-content').click({ timeout: 30_000 });

    const total = page.getByTestId('content-announcements-total');
    await expect(total).toHaveText(`${count('')} announcements`, { timeout: 30_000 });
    await page.getByTestId('content-status-draft').click();
    await expect(total).toHaveText(new RegExp(`^${count("and status = 'draft'")} announcements?$`));

    await page.getByTestId(`content-announcement-${id}`).click();
    const detail = page.getByTestId('announcement-detail');
    await expect(detail).toContainText(`Prova ${tag}`, { timeout: 30_000 });
    await expect(detail).toContainText(`Cos ${tag}`);
    await expect(detail).toContainText('Draft');

    await page.getByTestId('announcement-pin').click();
    await expect
      .poll(
        () =>
          queryDatabase(`select is_pinned from public.announcements where id = '${id}';`).trim(),
        {
          timeout: 30_000,
        },
      )
      .toBe('t');
    await expect(page.getByTestId('announcement-pin')).toHaveText('Unpin');

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByTestId('announcement-delete').click();
    await expect(page.getByTestId(`content-announcement-${id}`)).toHaveCount(0, {
      timeout: 30_000,
    });
    expect(count(`and id = '${id}'`)).toBe(0);
  } finally {
    queryDatabase(`delete from public.announcements where id = '${id}';`);
  }
});
