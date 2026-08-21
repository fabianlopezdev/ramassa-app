import { expect, test, type Page } from '@playwright/test';
import { PARTICIPANT_FIXTURES, SEED_ACCOUNT_PASSWORD, seedUserId } from '@ramassa/shared/testing';
import {
  accessTokenFor,
  queryDatabase,
  signIn,
  STAFF_EMAIL,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from './session';

const playerOrigin = `http://localhost:${process.env.RAMASSA_QA_PLAYER_PORT ?? '4194'}`;
const player = PARTICIPANT_FIXTURES.find((fixture) => fixture.ordinal === 23)!;
const otherPlayer = PARTICIPANT_FIXTURES.find((fixture) => fixture.ordinal === 20)!;
const runTag = `rapp58-${Date.now().toString(36)}`;
const types = ['activity_proposal', 'idea', 'problem', 'general'] as const;
const ids: string[] = [];
const reply = `${runTag}-staff-reply`;
let replyId = '';

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function signInPlayer(page: Page): Promise<void> {
  await page.goto(`${playerOrigin}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const usePassword = page
    .getByRole('button', { name: /password|contrasenya|contraseña/i })
    .first();
  await expect(usePassword).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await usePassword.click();
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await page.locator('input[type="email"]').fill(player.email);
  await page.locator('input[type="password"]').fill(SEED_ACCOUNT_PASSWORD);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByTestId('open-knowledge-base')).toBeVisible({ timeout: 30_000 });
}

test.afterAll(() => {
  if (ids.length === 0) return;
  queryDatabase(
    `delete from public.messages where id = nullif(${sqlLiteral(replyId)}, '')::uuid;
     delete from public.feedback_submissions where id in (${ids.map(sqlLiteral).join(',')})`,
  );
});

test('player feedback reaches the staff inbox, transitions, filters, and existing chat', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signInPlayer(page);
  await page.getByTestId('home-open-feedback').click();
  await expect(page.getByTestId('feedback-screen')).toBeVisible({ timeout: 30_000 });

  for (const type of types) {
    const content = `${runTag}-${type}`;
    await page.getByTestId(`feedback-type-${type}`).click();
    await page.getByLabel('Short message').fill(content);
    await page.getByTestId('feedback-submit').click();
    await expect(page.getByTestId('feedback-confirmation')).toContainText(
      'The team reads these weekly.',
    );
    const id = queryDatabase(
      `select id from public.feedback_submissions
       where author_id = ${sqlLiteral(seedUserId(player.ordinal))}
         and public.decrypt_field(content_encrypted) = ${sqlLiteral(content)}`,
    );
    expect(id).not.toBe('');
    ids.push(id);
    if (type !== 'general') await page.getByRole('button', { name: 'Send another' }).click();
  }

  await page.goto(`${playerOrigin}/profile`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('profile-open-feedback').click();
  await expect(page.getByTestId('feedback-screen')).toBeVisible({ timeout: 30_000 });

  const otherToken = await accessTokenFor(otherPlayer.email, SEED_ACCOUNT_PASSWORD);
  const hidden = await fetch(
    `${SUPABASE_URL}/rest/v1/feedback_submissions?select=id&id=in.(${ids.join(',')})`,
    {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${otherToken}` },
    },
  );
  expect(hidden.ok).toBe(true);
  expect(await hidden.json()).toEqual([]);

  await signIn(page, STAFF_EMAIL);
  await page.goto('/feedback');
  const firstId = ids[0]!;
  const firstRow = page.getByTestId(`feedback-row-${firstId}`);
  await expect(firstRow).toContainText(`${runTag}-activity_proposal`, { timeout: 30_000 });
  await page.getByTestId('feedback-type-filter').selectOption('activity_proposal');
  await expect(firstRow).toBeVisible();
  await page.getByTestId('feedback-status-filter').selectOption('new');
  await expect(firstRow).toBeVisible();
  await page.getByTestId('feedback-status-filter').selectOption('all');

  await page.getByTestId(`feedback-read-${firstId}`).click();
  await expect(page.getByTestId(`feedback-in_progress-${firstId}`)).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId(`feedback-in_progress-${firstId}`).click();
  await expect(page.getByTestId(`feedback-resolved-${firstId}`)).toBeVisible({ timeout: 30_000 });
  await page.getByTestId(`feedback-resolved-${firstId}`).click();
  await expect(firstRow).toContainText('Resolved', { timeout: 30_000 });

  const expectedConversationId = queryDatabase(
    `select id from public.conversations where user_id = ${sqlLiteral(seedUserId(player.ordinal))}`,
  );
  const chatLink = page.getByTestId(`feedback-chat-${firstId}`);
  await expect(chatLink).toHaveAttribute('href', `/messages/${expectedConversationId}`);
  await chatLink.click();
  await expect(page).toHaveURL(new RegExp(`/messages/${expectedConversationId}(?:\\?|$)`));
  await page.getByTestId('message-composer').fill(reply);
  await page.getByTestId('message-send').click();
  await expect(page.getByTestId('message-row').filter({ hasText: reply })).toBeVisible();
  replyId = queryDatabase(
    `select id from public.messages
     where conversation_id = ${sqlLiteral(expectedConversationId)} and content = ${sqlLiteral(reply)}`,
  );
  expect(replyId).not.toBe('');

  await page.goto(`${playerOrigin}/team-chat`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(reply, { exact: true })).toBeVisible({ timeout: 30_000 });
});
