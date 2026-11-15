/**
 * The participant list in the app (RAPP-280), through the web build: the
 * total, the status chips, an entity from the filter sheet, and sorting on
 * the tablet table. Counts come from the database so the spec follows the seed.
 */
import { expect, test } from '@playwright/test';
import {
  appAnswerSql,
  completeSecondFactor,
  queryDatabase,
  signInPlayer,
  STAFF_EMAIL,
} from './session';

test.setTimeout(180_000);

// The roster lists invited women too, not joined yet (RAPP-300).
const count = (where: string) =>
  Number(
    queryDatabase(`
      select count(*) from public.profiles r
       where role in ('player', 'invited') and org_id = '5eed0000-0000-4000-8000-000000000000'
         and anonymized_at is null ${where};
    `).trim(),
  );

test('the roster with search, chips, filters and sorting', async ({ page }) => {
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);
  await page.getByTestId('team-sidebar-participants').click({ timeout: 30_000 });

  const total = page.getByTestId('participant-total');
  await expect(total).toHaveText(`${count('')} participants`, { timeout: 30_000 });

  await page.getByTestId('participant-status-inactive').click();
  await expect(total).toHaveText(
    new RegExp(`^${count("and role = 'player' and not is_active")} participants?$`),
  );
  await page.getByTestId('participant-status-all').click();

  await page.getByTestId('participant-filters').click();
  await page.getByTestId('filter-entity-Creu Roja Osona').click();
  await page.getByTestId('filter-done').click();
  await expect(page.getByTestId('participant-filters')).toHaveText('Filters (1)');
  await expect(total).toHaveText(
    `${count(`and ${appAnswerSql('r.id', 'reference_entity')} = 'Creu Roja Osona'`)} participants`,
  );

  // The tablet table sorts by its headers.
  await page.getByTestId('participant-sort-city').click();
  await expect(page.getByTestId('participant-sort-city')).toContainText('↑');
  await page.getByTestId('participant-sort-city').click();
  await expect(page.getByTestId('participant-sort-city')).toContainText('↓');

  await page.getByTestId('participant-clear-filters').click();
  await expect(total).toHaveText(`${count('')} participants`);

  // Opening a row shows her card beside the table.
  await page
    .getByTestId(/participant-result-/)
    .first()
    .click();
  await expect(page.getByTestId('participant-card')).toBeVisible({ timeout: 30_000 });
});
