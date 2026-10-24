/**
 * Questions after the old builder left (RAPP-307, RAPP-656): the old Settings
 * Questions tab opens the Fitxa, a question the app needs cannot be hidden on
 * its onboarding screen and the form says why, and staff read a player's
 * answers on her page with an archived option marked. Every expected value
 * comes from psql.
 */

import { expect, test } from '@playwright/test';
import { signIn, STAFF_EMAIL } from './session';

const ADMIN_EMAIL = 'laia.ferrer@example.test';
const PLAYER_ID = '5eed0000-0000-4000-8000-000000000011';

test('the old Questions tab of Settings opens the Fitxa', async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  await page.goto('/settings?tab=questions');
  await expect(page).toHaveURL(/\/profile-layout$/, { timeout: 15_000 });
  await page.goto('/settings');
  await expect(page.getByRole('tab', { name: /^(questions|preguntes)$/i })).toHaveCount(0);
});

test('a question the app needs cannot be hidden, and the form says why', async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  await page.goto('/onboarding/screens/identity');
  const row = page.getByTestId('builtin-row-first_name');
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByTestId('builtin-row-first_name-edit').click();
  const form = page.getByTestId('builtin-form');
  await expect(form.locator('[name="builtin-hidden"]')).toBeDisabled();
  // A required question is never hidden (RAPP-611): the form says so.
  await expect(form).toContainText(/is required|és obligatòria|es obligatoria/i);
});

test("staff read a player's answers, an archived option marked", async ({ page }) => {
  await signIn(page, STAFF_EMAIL);
  await page.goto(`/participants/${PLAYER_ID}`);
  // Her answers sit on their Fitxa fields (RAPP-653).
  const section = page.getByTestId('participant-fitxa');
  await expect(section).toBeVisible({ timeout: 15_000 });
  await expect(
    section.getByTestId('fitxa-field-5eed0000-0000-4000-8045-000000000002-value'),
  ).toContainText(/(Un cartell \(arxivada\)|A poster \(archived\))/);
  // The seeded staff hold the Sensitive level: her seasonal answer is read, decrypted.
  await expect(
    section.getByTestId('fitxa-field-5eed0000-0000-4000-8045-000000000003-value'),
  ).toContainText('Treballo els dijous a la tarda.');
});
