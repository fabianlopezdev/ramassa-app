/**
 * Player knowledge browsing and story submission through the Expo web build.
 */

import { expect, test } from '@playwright/test';
import { PARTICIPANT_FIXTURES, SEED_ACCOUNT_PASSWORD } from '@ramassa/shared/testing';
import { queryDatabase } from './session';

const playerOrigin = `http://localhost:${process.env.RAMASSA_QA_PLAYER_PORT ?? '4194'}`;
const player = PARTICIPANT_FIXTURES[0]!;
const runTag = `player-story-${Date.now().toString(36)}`;

test.setTimeout(180_000);

test.afterAll(() => {
  queryDatabase(
    `delete from public.knowledge_articles where title->>'en' = '${runTag.replaceAll("'", "''")}'`,
  );
});

async function signInPlayer(page: import('@playwright/test').Page) {
  await page.goto(`${playerOrigin}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const usePassword = page.getByRole('button', { name: /password/i }).first();
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

test('browses a structured resource and submits a consented story for review', async ({ page }) => {
  await signInPlayer(page);

  await page.getByTestId('open-knowledge-base').click();
  await expect(page.getByTestId('knowledge-base-screen')).toBeVisible();
  await expect(page.getByText('Explore by topic')).toBeVisible();
  await expect(page.getByTestId('knowledge-filter-stories')).toBeVisible();
  await page.getByTestId('knowledge-article-5eed0000-0000-4000-8005-000000000001').click();
  await expect(page.getByTestId('knowledge-detail-screen')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Protect your account' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '1. Use a secure code' })).toBeVisible();

  await page.goto(playerOrigin, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByTestId('open-story-submission').click();
  await expect(page.getByTestId('story-submission-screen')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('story-title-input').fill(runTag);
  await page
    .getByTestId('story-body-input')
    .fill('Joining the team helped me feel safe, supported, and ready to learn.');
  await page.getByTestId('story-publication-consent').click();
  await expect(page.getByTestId('story-publication-consent')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('button', { name: 'Send story' }).click();

  await expect(page.getByTestId('story-submission-confirmation')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('story-status-submitted').first()).toBeVisible();
  expect(
    queryDatabase(
      `select story_status || '|' || submission_language || '|' || publication_consent::text || '|' || (publication_consent_at is not null)::text
       from public.knowledge_articles where title->>'en' = '${runTag.replaceAll("'", "''")}'`,
    ),
  ).toBe('submitted|en|true|true');
});
