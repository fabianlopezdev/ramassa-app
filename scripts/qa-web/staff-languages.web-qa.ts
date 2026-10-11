/**
 * The staff side's languages in the web admin (RAPP-238): Catalan, Spanish and
 * English. The picker changes the language at once and keeps it after a reload.
 */
import { expect, test } from '@playwright/test';
import { signIn } from './session';

const ADMIN_EMAIL = 'laia.ferrer@example.test';

test('the picker offers the three staff languages and the choice sticks', async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  const picker = page.getByTestId('language-picker').first();
  await expect(picker).toBeVisible({ timeout: 30_000 });
  await expect(picker.locator('option')).toHaveText(['Català', 'Español', 'English']);

  await picker.selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    page.getByRole('navigation').first().getByRole('link', { name: 'Participants' }),
  ).toBeVisible();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.getByTestId('language-picker').first().selectOption('ca');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ca');
});

test('the login page offers the same three', async ({ page }) => {
  await page
    .context()
    .addCookies([{ name: 'ramassa.language', value: 'fa', url: test.info().project.use.baseURL! }]);
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ca');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByTestId('language-picker').locator('option')).toHaveCount(3);
});
