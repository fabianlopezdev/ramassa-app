/**
 * Phase 3 closure proof: staff review -> scheduled publication -> player feed.
 *
 * The schedule is created through the product UI, asserted independently in
 * Postgres, then shortened in Postgres so the cumulative suite does not spend
 * up to two minutes waiting for a wall-clock minute boundary. The product path
 * under test after that point is unchanged: pg_cron discovers due content,
 * creates the durable publication, and the player query admits the row.
 */

import { expect, test, type Page } from '@playwright/test';
import { PARTICIPANT_FIXTURES, SEED_ACCOUNT_PASSWORD } from '@ramassa/shared/testing';
import { queryDatabase, signIn, STAFF_EMAIL } from './session';

const RUN_TAG = `phase3-closure-${Date.now().toString(36)}`;
const playerOrigin = `http://localhost:${process.env.RAMASSA_QA_PLAYER_PORT ?? '4194'}`;
const createdIds: string[] = [];

test.setTimeout(240_000);

test.afterAll(() => {
  if (createdIds.length === 0) return;
  queryDatabase(
    `delete from public.announcements where id in (${createdIds.map((id) => `'${id}'`).join(',')})`,
  );
});

function nextSafeMinute(): string {
  const scheduled = new Date(Math.ceil((Date.now() + 60_000) / 60_000) * 60_000);
  const offset = scheduled.getTimezoneOffset() * 60_000;
  return new Date(scheduled.getTime() - offset).toISOString().slice(0, 16);
}

function rememberAnnouncement(title: string): string {
  const id = queryDatabase(
    `select id from public.announcements where title->>'ca' = '${title.replaceAll("'", "''")}' order by created_at desc limit 1`,
  );
  if (!id) throw new Error(`Scheduled closure announcement was not stored: ${title}`);
  createdIds.push(id);
  return id;
}

async function signInPlayer(page: Page): Promise<void> {
  const player = PARTICIPANT_FIXTURES[0]!;
  await page.goto(`${playerOrigin}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const usePassword = page.getByRole('button', { name: /password/i }).first();
  await expect(usePassword).toBeVisible({ timeout: 30_000 });
  await usePassword.click();
  await page.locator('input[type="email"]').fill(player.email);
  await page.locator('input[type="password"]').fill(SEED_ACCOUNT_PASSWORD);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByTestId('open-knowledge-base')).toBeVisible({ timeout: 30_000 });
}

test('reviews five languages, schedules publication, and serves it to a player', async ({
  page,
}) => {
  await signIn(page, STAFF_EMAIL);
  await page.goto('/content/announcements/new');
  await expect(page.getByTestId('announcement-editor')).toBeVisible({ timeout: 20_000 });

  const title = `${RUN_TAG} avís programat`;
  await page.getByTestId('title-source').fill(title);
  await page
    .getByTestId('body-source')
    .fill('Aquest avís comprova la revisió, la programació i el consum de la jugadora.');
  await page.getByTestId('announcement-generate').click();

  for (const language of ['es', 'en', 'ar', 'fa'] as const) {
    await expect(page.getByTestId(`title-draft-${language}`)).not.toHaveValue('');
    await expect(page.getByTestId(`body-draft-${language}`)).not.toHaveValue('');
    await page.getByTestId(`title-approve-${language}`).click();
    await page.getByTestId(`body-approve-${language}`).click();
    await expect(page.getByTestId(`title-status-${language}-approved`)).toBeVisible();
    await expect(page.getByTestId(`body-status-${language}-approved`)).toBeVisible();
  }

  const scheduledLocal = nextSafeMinute();
  await page.getByTestId('announcement-mode').selectOption('scheduled');
  await page.getByTestId('announcement-published-at').fill(scheduledLocal);
  await page.getByTestId('announcement-save').click();
  await expect(page).toHaveURL(/\/content\/announcements(?:\?.*)?$/, { timeout: 30_000 });
  const id = rememberAnnouncement(title);

  expect(
    queryDatabase(
      `select status || '|' || (title ?& array['ca','es','en','ar','fa'])::text || '|' ||
              (body ?& array['ca','es','en','ar','fa'])::text || '|' || (published_at > now())::text
         from public.announcements where id = '${id}'`,
    ),
  ).toBe('published|true|true|true');

  // Preserve the UI-created scheduled state above as evidence, then move only
  // its clock close enough for a fast deterministic cron assertion.
  queryDatabase(
    `update public.announcements set published_at = now() + interval '3 seconds' where id = '${id}'`,
  );
  await expect
    .poll(
      () =>
        queryDatabase(
          `select count(*) from public.push_publications where content_type = 'announcement' and content_id = '${id}'`,
        ),
      { timeout: 90_000 },
    )
    .toBe('1');

  const playerTitle = queryDatabase(
    `select title->>'en' from public.announcements where id = '${id}'`,
  );
  expect(playerTitle).not.toBe('');

  const playerPage = await page.context().newPage();
  await signInPlayer(playerPage);
  await expect(async () => {
    await playerPage.reload({ waitUntil: 'domcontentloaded' });
    await expect(playerPage.getByText(playerTitle, { exact: true }).first()).toBeVisible({
      timeout: 5_000,
    });
  }).toPass({ timeout: 45_000 });
});
