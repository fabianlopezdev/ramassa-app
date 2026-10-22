/**
 * The staff side's languages in the web admin (RAPP-238): Catalan, Spanish and
 * English. Her account page (RAPP-634) changes the language at once and keeps
 * it after a reload.
 */
import { expect, test } from '@playwright/test';
import { signIn } from './session';

const ADMIN_EMAIL = 'laia.ferrer@example.test';

test('the account page offers the three staff languages and the choice sticks', async ({
  page,
}) => {
  await signIn(page, ADMIN_EMAIL);
  // The user menu in the top bar opens her account page (RAPP-634).
  const menu = page.getByTestId('user-menu-trigger');
  await expect(menu).toBeVisible({ timeout: 30_000 });
  await menu.click();
  await page.getByTestId('user-menu-account').click();
  const choice = page.getByTestId('account-language').getByRole('radio');
  await expect(choice).toHaveCount(3);
  await expect(page.getByTestId('account-language')).toContainText('Català');
  await expect(page.getByTestId('account-language')).toContainText('Español');
  await expect(page.getByTestId('account-language')).toContainText('English');

  await page.getByTestId('language-choice-en').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    page.getByRole('navigation').first().getByRole('link', { name: 'Participants' }),
  ).toBeVisible();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('language-choice-en')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('language-choice-ca').click();
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
