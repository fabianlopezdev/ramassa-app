/**
 * The feedback inbox in the app (RAPP-383), through the web build: a player's
 * idea shows in the inbox, the filters find it, it moves to read, in progress
 * and resolved, and the answer opens the chat it started. Expected values come
 * from the database.
 */
import { expect, test } from '@playwright/test';
import {
  accessTokenFor,
  completeSecondFactor,
  queryDatabase,
  SEED_PASSWORD,
  signInPlayer,
  STAFF_EMAIL,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from './session';

test.setTimeout(240_000);

async function submitIdea(content: string): Promise<string> {
  const token = await accessTokenFor('amina.alhassan@example.test', SEED_PASSWORD);
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_feedback_submission`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ p_type: 'idea', p_content: content, p_image_url: null }),
  });
  const body = await response.text();
  expect(response.ok, body).toBe(true);
  return JSON.parse(body) as string;
}

const statusOf = (id: string) =>
  queryDatabase(`select status from public.feedback_submissions where id = '${id}';`).trim();

test('an idea is found, moved to resolved, and answered in its chat', async ({ page }) => {
  const content = `Taller de cuina ${Date.now().toString(36)}`;
  const id = await submitIdea(content);
  try {
    await signInPlayer(page, STAFF_EMAIL);
    await completeSecondFactor(page, STAFF_EMAIL);
    await page.getByTestId('team-sidebar-more').click({ timeout: 30_000 });
    await page.getByTestId('team-more-feedback').click({ timeout: 30_000 });
    const card = page.getByTestId(`feedback-submission-${id}`);
    await expect(card).toContainText(content, { timeout: 30_000 });

    // The filters keep it under its kind and status only.
    await page.getByTestId('team-feedback-type-problem').click();
    await expect(card).toHaveCount(0);
    await page.getByTestId('team-feedback-type-idea').click();
    await page.getByTestId('team-feedback-status-new').click();
    await expect(card).toBeVisible();
    await page.getByTestId('team-feedback-status-all').click();

    await page.getByTestId(`feedback-read-${id}`).click();
    await expect.poll(() => statusOf(id), { timeout: 30_000 }).toBe('read');
    await page.getByTestId(`feedback-in_progress-${id}`).click({ timeout: 30_000 });
    await expect.poll(() => statusOf(id), { timeout: 30_000 }).toBe('in_progress');
    await page.getByTestId(`feedback-resolved-${id}`).click({ timeout: 30_000 });
    await expect
      .poll(
        () =>
          queryDatabase(
            `select status || '|' || (resolved_at is not null) from public.feedback_submissions where id = '${id}';`,
          ).trim(),
        { timeout: 30_000 },
      )
      .toBe('resolved|true');
    await expect(page.getByTestId(`feedback-resolved-${id}`)).toHaveCount(0);

    await page.getByTestId(`feedback-chat-${id}`).click();
    await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}/, { timeout: 30_000 });
  } finally {
    queryDatabase(`delete from public.feedback_submissions where id = '${id}';`);
  }
});
