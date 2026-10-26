/** Browser proof for municipality search, selection and persistence (RAPP-100). */

import { expect, test, type Page } from '@playwright/test';
import { PARTICIPANT_FIXTURES } from '@ramassa/shared/testing';
import {
  appAnswerSql,
  queryDatabase,
  signInPlayer as signInPlayerWithEmailCode,
  writeAppAnswerSql,
} from './session';

const playerOrigin = `http://localhost:${process.env.RAMASSA_QA_PLAYER_PORT ?? '4194'}`;
// Ordinal 21 deliberately has no accepted terms in seed.sql and belongs to the
// onboarding regression path. Ordinal 23 is the completed English profile this
// profile-edit proof needs.
const player = PARTICIPANT_FIXTURES.find((fixture) => fixture.ordinal === 23)!;

test.setTimeout(180_000);

// Her municipality is an answer by field since RAPP-666, read and put back
// through the app's own reader and writer.
const playerId = `(select id from auth.users where email = '${player.email.replaceAll("'", "''")}')`;

function storedMunicipality(): string {
  return queryDatabase(`select ${appAnswerSql(playerId, 'city')}`);
}

test.afterAll(() => {
  queryDatabase(writeAppAnswerSql(playerId, 'city', player.city));
});

async function signInPlayer(page: Page): Promise<void> {
  await signInPlayerWithEmailCode(page, player.email);
}

test('searches and persists one canonical municipality from profile edit', async ({ page }) => {
  await signInPlayer(page);
  await page.goto(`${playerOrigin}/profile-edit`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('profile-edit-first-name')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('municipality-picker-open').click();
  const search = page.getByTestId('municipality-search-input');
  await expect(search).toBeVisible();
  await search.fill('giro');
  const result = page.getByTestId('municipality-option-170792');
  await expect(result).toBeVisible();
  await result.click();
  await expect(page.getByTestId('municipality-picker-open')).toContainText('Girona');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(storedMunicipality, { timeout: 30_000 }).toBe('Girona');

  await page.goto(`${playerOrigin}/profile`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Girona', { exact: true })).toBeVisible({ timeout: 30_000 });
});
