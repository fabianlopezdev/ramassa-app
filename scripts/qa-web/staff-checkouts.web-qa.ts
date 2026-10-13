/**
 * Staff checkout and check-in (RAPP-252), through the app's web build: Today
 * shows the seed's late checkout, five of its six balls come back with one
 * lost, and a new checkout of two jerseys goes out for a week.
 */
import { expect, test } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer, STAFF_EMAIL } from './session';

const SEED_CHECKOUT = '5eed0000-0000-4000-8000-000000000c01';
const NURIA = '5eed0000-0000-4000-8000-000000000003';

test.setTimeout(180_000);

// Back to the seed: only the late ball checkout, still out.
function restoreSeedCheckouts(): void {
  queryDatabase(`
    delete from public.stock_movements where checkout_id in
      (select id from public.staff_checkouts where id <> '${SEED_CHECKOUT}');
    delete from public.staff_checkouts where id <> '${SEED_CHECKOUT}';
    delete from public.stock_movements where checkout_id = '${SEED_CHECKOUT}' and kind <> 'checkout';
    update public.staff_checkouts
       set checked_in_at = null, checked_in_by = null, returned_quantity = null, return_condition = null
     where id = '${SEED_CHECKOUT}';
  `);
}

test.beforeAll(restoreSeedCheckouts);
test.afterAll(restoreSeedCheckouts);

test('a late checkout comes back short, and a new one goes out', async ({ page }) => {
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);

  await expect(page.getByTestId('today-checkouts')).toContainText('Ball: 6 with Núria', {
    timeout: 30_000,
  });

  await page.getByTestId('today-checkouts').click();
  await expect(page.getByTestId(`checkout-row-${SEED_CHECKOUT}`)).toContainText('Late: due', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('stock-item-ball')).toContainText('6');

  await page.getByTestId(`checkout-checkin-${SEED_CHECKOUT}`).click();
  await page.getByTestId('checkin-less').click();
  await expect(page.getByTestId('checkin-returned')).toHaveText('5');
  await expect(page.getByTestId('stock-checkouts')).toContainText('Missing: 1');
  await page.getByTestId('checkin-condition-good').click();
  await page.getByTestId('checkin-save').click();

  await expect(page.getByTestId(`checkout-row-${SEED_CHECKOUT}`)).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(page.getByTestId('stock-item-ball')).toContainText('11');

  await page.getByTestId('stock-check-out').click();
  await page.getByTestId('checkout-item-jersey').click();
  await page.getByTestId('checkout-size-M').click();
  await page.getByTestId('checkout-quantity-more').click();
  await page.getByTestId(`checkout-staff-${NURIA}`).click();
  await page.getByTestId('checkout-return-7').click();
  await page.getByTestId('checkout-note').fill('Trip to Andorra');
  await page.getByTestId('checkout-save').click();

  const rows = page.getByTestId('stock-checkouts');
  await expect(rows).toContainText('Jersey M: 2 with Núria', { timeout: 30_000 });
  await expect(rows).toContainText('Back by');

  const saved = queryDatabase(`
    select c.quantity || ' ' || (c.expected_return_on - current_date) || ' ' || m.quantity
      from public.staff_checkouts c join public.stock_movements m on m.checkout_id = c.id
     where c.id <> '${SEED_CHECKOUT}';
  `);
  expect(saved.trim()).toBe('2 7 -2');
});
