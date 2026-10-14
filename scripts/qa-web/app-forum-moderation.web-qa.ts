/**
 * Forum moderation in the app (RAPP-380), through the web build: Today shows
 * the open reports and opens the moderation screen; a reported post is pinned
 * and moved to another category, its reports are dismissed, and once
 * reported again it is hidden. Contacting the author opens a conversation.
 * Expected values come from the database; the seeded report is restored.
 */
import { expect, test, type Page } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer, STAFF_EMAIL } from './session';

test.setTimeout(240_000);

const POST = '5eed0000-0000-4000-8010-000000000001';
const FLAG = '5eed0000-0000-4000-8012-000000000099';
const SEEDED_CATEGORY = '5eed0000-0000-4000-8006-000000000002';

function restoreSeededReport(): void {
  queryDatabase(`
    update public.forum_posts
    set category_id = '${SEEDED_CATEGORY}', is_pinned = true, visibility = 'visible', flag_count = 1
    where id = '${POST}';
    update public.forum_flags
    set state = 'pending', reviewed_by = null, reviewed_at = null
    where id = '${FLAG}';
  `);
}

async function openModeration(page: Page): Promise<void> {
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);
  await page.getByTestId('team-sidebar-more').click({ timeout: 30_000 });
  await page.getByTestId('team-more-forum').click({ timeout: 30_000 });
  await expect(page.getByTestId(`forum-report-post-${POST}`)).toBeVisible({ timeout: 30_000 });
}

test.beforeEach(restoreSeededReport);
test.afterAll(restoreSeededReport);

test('Today shows the open reports and opens the moderation screen', async ({ page }) => {
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);
  const card = page.getByTestId('today-forum');
  await expect(card).toContainText('Pending: 1', { timeout: 30_000 });
  await card.click();
  await expect(page.getByTestId(`forum-report-post-${POST}`)).toBeVisible({ timeout: 30_000 });
});

test('a reported post is pinned, moved, dismissed, then hidden when reported again', async ({
  page,
}) => {
  await openModeration(page);
  const other = queryDatabase(
    `select slug || '|' || id from public.forum_categories where id <> '${SEEDED_CATEGORY}' order by sort_order limit 1;`,
  )
    .trim()
    .split('|');

  await page.getByTestId(`forum-report-pin-${POST}`).click();
  await expect
    .poll(() =>
      queryDatabase(`select is_pinned from public.forum_posts where id = '${POST}';`).trim(),
    )
    .toBe('f');
  await page.getByTestId(`forum-report-category-${POST}-${other[0]}`).click();
  await expect
    .poll(() =>
      queryDatabase(`select category_id from public.forum_posts where id = '${POST}';`).trim(),
    )
    .toBe(other[1]);

  await page.getByTestId(`forum-report-dismiss-${POST}`).click();
  await expect
    .poll(() => queryDatabase(`select state from public.forum_flags where id = '${FLAG}';`).trim())
    .toBe('dismissed');
  await expect(page.getByTestId(`forum-report-post-${POST}`)).toHaveCount(0, { timeout: 30_000 });

  // Reported again: hidden from the forum.
  restoreSeededReport();
  await page.reload();
  await page.getByTestId(`forum-report-hide-${POST}`).click({ timeout: 60_000 });
  await expect
    .poll(() =>
      queryDatabase(
        `select p.visibility || '|' || f.state from public.forum_posts p, public.forum_flags f where p.id = '${POST}' and f.id = '${FLAG}';`,
      ).trim(),
    )
    .toBe('hidden|actioned');
});

test('contacting the author opens a conversation with her', async ({ page }) => {
  await openModeration(page);
  await page.getByTestId(`forum-report-contact-${POST}`).click();
  await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}/, { timeout: 30_000 });
});
