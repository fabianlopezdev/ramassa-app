/**
 * Stock counts and corrections (RAPP-251), through the app's web build: Today
 * asks for this month's small count, and a blind count of shorts finds two
 * pairs of XL that the ledger had at -1. The difference is saved as a
 * correction with its reason, and the open alert is answered.
 */
import { expect, test } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer, STAFF_EMAIL } from './session';

test.setTimeout(180_000);

// Back to the seed: no count this month, and the shorts XL alert open again.
function restoreSeedStock(): void {
  queryDatabase(`
    delete from public.stock_movements where count_id in
      (select id from public.stock_counts where counted_at > now() - interval '1 day');
    delete from public.stock_counts where counted_at > now() - interval '1 day';
    update public.stock_alerts set resolved_at = null, resolved_by = null where size = 'XL';
  `);
}

test.beforeAll(restoreSeedStock);
test.afterAll(restoreSeedStock);

test('a blind count corrects the stock with a reason', async ({ page }) => {
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);

  await expect(page.getByTestId('today-monthly-count')).toContainText(
    'Boots: count what is on the shelf.',
    { timeout: 30_000 },
  );

  await page.getByTestId('team-sidebar-more').click();
  await page.getByTestId('team-more-stock').click();
  await page.getByTestId('stock-count-shorts').click({ timeout: 30_000 });

  // The count is blind: the app's numbers appear only after it.
  await expect(page.getByTestId('count-input-XL')).toHaveValue('');
  for (const [size, counted] of [
    ['XS', '0'],
    ['S', '6'],
    ['M', '6'],
    ['L', '6'],
    ['XL', '2'],
    ['XXL', '0'],
  ] as const) {
    await page.getByTestId(`count-input-${size}`).fill(counted);
  }
  await page.getByTestId('count-to-review').click();

  await expect(page.getByTestId('count-differences')).toContainText(
    'XL: the stock says -1, the shelf has 2',
  );
  await page.getByTestId('count-reason-found').click();
  await page.getByTestId('count-note').fill('Two pairs were in the kit bag.');
  await page.getByTestId('count-save').click();

  await expect(page.getByTestId('stock-item-shorts')).toContainText('XL: 2', { timeout: 30_000 });

  const audit = queryDatabase(`
    select action || ' ' || (changes ->> 'reason') || ' ' || (changes ->> 'corrections')
      from public.audit_log where action = 'stock.count' order by created_at desc limit 1;
  `);
  expect(audit.trim()).toBe('stock.count found 1');
  const open = queryDatabase(`select count(*) from public.stock_alerts where resolved_at is null;`);
  expect(open.trim()).toBe('0');
});
