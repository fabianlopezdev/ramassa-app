/**
 * Stock and goods received (RAPP-250), through the app's web build: Stock
 * opens from More, shows the seed donation, and a purchase with two lines and
 * a problem note goes into stock. Photos are checked on the simulator: the
 * phone compresses them through expo-file-system, which has no web build.
 */
import { expect, test } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer, STAFF_EMAIL } from './session';

const SHOP = 'Botiga QA Esports';

test.setTimeout(180_000);

function removeQaArrivals(): void {
  queryDatabase(`
    delete from public.stock_movements where arrival_id in
      (select id from public.equipment_arrivals where source_name = '${SHOP}');
    delete from public.equipment_arrivals where source_name = '${SHOP}';
  `);
}

test.beforeAll(removeQaArrivals);
test.afterAll(removeQaArrivals);

test('a purchase goes into stock with its lines, cost and problem', async ({ page }) => {
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);

  await page.getByTestId('team-sidebar-more').click({ timeout: 30_000 });
  await page.getByTestId('team-more-stock').click();

  // The seed donation is the first arrival, and its boots are in stock.
  await expect(page.getByTestId('stock-arrivals')).toContainText('Donation from CF Vic', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('stock-item-boots')).toContainText('40: 4');

  await page.getByTestId('stock-record-arrival').click();
  await page.getByTestId('arrival-source-purchase').click();
  await page.getByTestId('arrival-source-name').fill(SHOP);

  await page.getByTestId('arrival-item-boots').click();
  await page.getByTestId('arrival-size-43').click();
  await page.getByTestId('arrival-quantity-more').click();
  await page.getByTestId('arrival-quantity-more').click();
  await page.getByTestId('arrival-value').fill('20');
  await page.getByTestId('arrival-add-line').click();
  await expect(page.getByTestId('arrival-line-0')).toContainText('Boots 43: 3');

  // A donation's usual value is filled in; on a purchase the price is typed.
  await page.getByTestId('arrival-item-ball').click();
  await expect(page.getByTestId('arrival-value')).toHaveValue('');
  await page.getByTestId('arrival-value').fill('10,50');
  await page.getByTestId('arrival-add-line').click();

  await page.getByTestId('arrival-total-cost').fill('81');
  await page.getByTestId('arrival-problems').fill('One box was wet.');

  await page.getByTestId('arrival-save').click();

  const arrivals = page.getByTestId('stock-arrivals');
  await expect(arrivals).toContainText(`Purchase from ${SHOP}`, { timeout: 30_000 });
  await expect(arrivals).toContainText('Problems: One box was wet.');
  await expect(page.getByTestId('stock-item-boots')).toContainText('43: 3');

  const saved = queryDatabase(`
    select a.total_cost_cents || ' ' || string_agg(m.quantity || 'x' || m.unit_value_cents, ',' order by m.quantity desc)
      from public.equipment_arrivals a join public.stock_movements m on m.arrival_id = a.id
     where a.source_name = '${SHOP}' group by a.id;
  `);
  expect(saved.trim()).toBe('8100 3x2000,1x1050');
});
