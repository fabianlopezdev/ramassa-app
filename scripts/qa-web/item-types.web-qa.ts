/**
 * Item types management (RAPP-253), through the app's web build: the seeded
 * custom item is renamed, a new player-kit item is added with sizes and code
 * letters, and removing a boots size that has stock is refused by name.
 */
import { expect, test } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer, STAFF_EMAIL } from './session';

test.setTimeout(180_000);

function restoreSeedItems(): void {
  queryDatabase(`
    delete from public.equipment_item_types where not is_builtin and key <> 'custom_bibs';
    update public.equipment_item_types
       set name = '{"ca": "Petos", "es": "Petos", "en": "Bibs", "ar": "صدريات تدريب", "fa": "جلیقه تمرین"}'::jsonb
     where key = 'custom_bibs';
  `);
}

test.beforeAll(restoreSeedItems);
test.afterAll(restoreSeedItems);

test('the team keeps its item list', async ({ page }) => {
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);
  await page.getByTestId('team-sidebar-more').click({ timeout: 30_000 });
  await page.getByTestId('team-more-stock').click();
  await page.getByTestId('stock-items').click({ timeout: 30_000 });

  // A custom item shows its own name, never its key.
  await page.getByTestId('items-row-custom_bibs').click({ timeout: 30_000 });
  await expect(page.getByTestId('item-name-en')).toHaveValue('Bibs');
  await page.getByTestId('item-name-en').fill('Training bibs');
  await page.getByTestId('item-save').click();
  await expect(page.getByTestId('items-row-custom_bibs')).toContainText('Training bibs', {
    timeout: 30_000,
  });

  await page.getByTestId('items-add').click();
  await page.getByTestId('item-name-ca').fill('Armilla');
  await page.getByTestId('item-name-en').fill('Vest');
  await page.getByTestId('item-kind-player_kit').click();
  for (const size of ['S', 'M']) {
    await page.getByTestId('item-new-size').fill(size);
    await page.getByTestId('item-add-size').click();
  }
  await page.getByTestId('item-code').fill('av');
  await page.getByTestId('item-value').fill('15');
  await page.getByTestId('item-save').click();
  await expect(page.getByText('Vest', { exact: true })).toBeVisible({ timeout: 30_000 });

  const saved = queryDatabase(`
    select kind || ' ' || array_to_string(sizes, ',') || ' ' || code_prefix || ' ' || default_value_cents
      from public.equipment_item_types where name ->> 'ca' = 'Armilla';
  `);
  expect(saved.trim()).toBe('player_kit S,M AV 1500');

  // Boots size 40 has four pairs in stock: it cannot go.
  await page.getByTestId('items-row-boots').click();
  await page.getByTestId('item-size-remove-40').click();
  await page.getByTestId('item-save').click();
  await expect(page.getByText('Size 40 still has stock.')).toBeVisible({ timeout: 30_000 });
});
