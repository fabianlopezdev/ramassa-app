/**
 * Seasons and re-registration on the dashboard (RAPP-306): an admin creates a
 * season, and staff see who has re-registered for the current one. Every
 * expected value comes from psql; the season created here is removed again.
 */

import { expect, test } from '@playwright/test';
import { queryDatabase, signIn, STAFF_EMAIL } from './session';

const ADMIN_EMAIL = 'laia.ferrer@example.test';
const runTag = `s${Date.now().toString(36)}`;

test.afterAll(() => {
  queryDatabase(`
    delete from public.seasons where name = '${runTag}';
    delete from public.audit_log where action = 'season.create' and changes ->> 'name' = '${runTag}';
  `);
});

test('an admin creates a season on the authorization board', async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  // The seasons sit with the authorization's board (RAPP-694, RAPP-696).
  await page.goto('/forms/authorization');
  const panel = page.getByTestId('seasons-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('2026/27');

  await panel.locator('#season-name').fill(runTag);
  await panel.locator('#season-starts-on').fill('2030-09-01');
  await panel.getByRole('button', { name: /create the season|crea la temporada/i }).click();

  await expect
    .poll(
      () =>
        queryDatabase(
          `select starts_on::text || '|' || is_current::text from public.seasons where name = '${runTag}'`,
        ),
      { timeout: 15_000 },
    )
    .toBe('2030-09-01|false');
  // A season that is not made current changes nothing for the players.
  expect(
    queryDatabase("select name from public.seasons where is_current and name = '2026/27'"),
  ).toBe('2026/27');
});

test('staff see who has registered for the current season', async ({ page }) => {
  await signIn(page, STAFF_EMAIL);
  await page.goto('/participants/season');
  const view = page.getByTestId('season-registrations');
  await expect(view).toBeVisible({ timeout: 15_000 });

  const pending = queryDatabase(
    `select count(*) from public.profiles p
      where p.role = 'player' and p.is_active
        and not exists (select 1 from public.authorization_signatures s
                         join public.seasons season on season.id = s.season_id and season.is_current
                        where s.profile_id = p.id)`,
  );
  await page.locator('#season-filter').selectOption('pending');
  await expect(view.getByTestId('season-registration-list').locator('li')).toHaveCount(
    Number(pending),
  );
  // Наталія has not signed 2026/27 in the seed.
  await expect(view.getByText(/Шевченко/)).toBeVisible();
});
