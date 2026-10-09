import { expect, test } from '@playwright/test';
import { signIn } from './session';

test('settings feedback stays in the viewport after saving a scrolled form', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await signIn(page, 'laia.ferrer@example.test');
  await page.goto('/settings?tab=organization');
  const save = page.getByRole('button', { name: 'Save changes', exact: true });
  await save.click();
  const success = page.getByRole('status');
  await expect(success).toContainText('Settings saved.');
  await expect(success).toBeInViewport({ ratio: 1 });
  await success.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(success).toBeEmpty();

  const primary = page.getByLabel('Primary color hex');
  const originalColor = await primary.inputValue();
  await primary.fill('#FFFFFF');
  await save.click();
  const error = page.getByRole('alert');
  await expect(error).toContainText('4.5:1');
  await expect(error).toBeInViewport({ ratio: 1 });
  await expect(success).toBeEmpty();
  await primary.fill(originalColor);
  await expect(error).toBeEmpty();
});
