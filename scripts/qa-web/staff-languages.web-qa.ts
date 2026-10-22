/**
 * The staff side's languages in the web admin (RAPP-238): Catalan, Spanish and
 * English. The top bar's menu changes the language at once and keeps it after a
 * reload.
 */
import { expect, test } from '@playwright/test';
import { signIn } from './session';

const ADMIN_EMAIL = 'laia.ferrer@example.test';

test('the top bar offers the three staff languages and the choice sticks', async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  // The language menu in the top bar (RAPP-632).
  const menu = page.getByTestId('language-menu');
  await expect(menu).toBeVisible({ timeout: 30_000 });
  await menu.click();
  await expect(page.getByRole('menuitemradio')).toHaveText(['Català', 'Español', 'English']);

  await page.getByTestId('language-menu-en').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    page.getByRole('navigation').first().getByRole('link', { name: 'Participants' }),
  ).toBeVisible();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.getByTestId('language-menu').click();
  await expect(page.getByTestId('language-menu-en')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('language-menu-ca').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ca');
});

test('the login page offers the same three', async ({ page }) => {
  await page
    .context()
    .addCookies([{ name: 'ramassa.language', value: 'fa', url: test.info().project.use.baseURL! }]);
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ca');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByTestId('language-choice').getByRole('radio')).toHaveCount(3);
  await expect(page.getByRole('radio', { name: 'Català' })).toHaveAttribute('aria-checked', 'true');
});
