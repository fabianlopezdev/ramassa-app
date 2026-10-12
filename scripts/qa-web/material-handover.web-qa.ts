/**
 * Handover with signature and returns (RAPP-249), through the app's web build:
 * a staff member hands boots to a player who reads the statement in Arabic and
 * signs with a drag on the pad, then takes them back graded. A second handover
 * is recorded as refused with a reason. Today shows the stock alert the seed
 * left open.
 */
import { expect, test, type Page } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer, STAFF_EMAIL } from './session';

// مريم: Arabic, clothing size M, shoe size 37.
const PLAYER_ID = '5eed0000-0000-4000-8000-000000000013';

test.setTimeout(180_000);

function removeHerHandovers(): void {
  queryDatabase(`
    delete from public.stock_movements where equipment_delivery_id in
      (select id from public.equipment_deliveries where profile_id = '${PLAYER_ID}');
    delete from public.stock_alerts where size = '37';
    delete from public.equipment_deliveries where profile_id = '${PLAYER_ID}';
  `);
}

async function drawSignature(page: Page): Promise<void> {
  const pad = page.getByTestId('signature-pad');
  const box = await pad.boundingBox();
  if (box === null) throw new Error('signature pad not laid out');
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.6);
  await page.mouse.down();
  for (const step of [0.3, 0.4, 0.5, 0.6, 0.7]) {
    await page.mouse.move(
      box.x + box.width * step,
      box.y + box.height * (step % 0.2 < 0.1 ? 0.3 : 0.7),
      {
        steps: 4,
      },
    );
  }
  await page.mouse.up();
}

test.beforeAll(removeHerHandovers);
test.afterAll(removeHerHandovers);

test('a signed loan, a graded return and a refusal with a reason', async ({ page }) => {
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);

  // Today: the seed's shorts XL went below zero.
  await expect(page.getByTestId('today-material')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('today-stock-alert-shorts')).toContainText('Shorts XL');

  await page.goto(new URL(`/participant/${PLAYER_ID}`, page.url()).href);
  await expect(page.getByTestId('participant-material')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('participant-hand-over').click();

  // Her shoe size is chosen for boots; staff can still change it.
  await page.getByTestId('handover-item-boots').click();
  await expect(page.getByTestId('handover-size-37')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('handover-mode-lent').click();
  await page.getByTestId('handover-to-signature').click();

  // The statement is in her language, whatever the staff app's language.
  await expect(page.getByTestId('handover-statement')).toContainText('استلمتُ من راماسا');
  await expect(page.getByText('She signs, or choose why she does not')).toBeVisible();
  await drawSignature(page);
  await page.getByTestId('handover-save').click();
  await expect(page.getByTestId('handover-saved')).toContainText(/Unit code B-\d{4}/);

  const signature = queryDatabase(`
    select signature_state || ' ' || mode || ' ' || statement_language || ' ' || jsonb_array_length(signature)
      from public.equipment_deliveries where profile_id = '${PLAYER_ID}' and item = 'boots';
  `);
  expect(signature.trim()).toBe('signed lent ar 1');

  // A second item: she refuses to sign, and the reason is kept.
  await page.getByTestId('handover-another').click();
  await page.getByTestId('handover-item-water_bottle').click();
  await page.getByTestId('handover-to-signature').click();
  await page.getByTestId('handover-unsigned-refused').click();
  await page.getByTestId('handover-reason').fill('Prefers not to sign today');
  await page.getByTestId('handover-save').click();
  await expect(page.getByTestId('handover-saved')).toBeVisible();
  await page.getByTestId('handover-done').click();

  // Back on her card: both items, the loan waiting for its return.
  const material = page.getByTestId('participant-material');
  await expect(material).toContainText('Boots 37');
  await expect(material).toContainText('Refused to sign');
  await material.getByRole('button', { name: 'Record the return' }).click();
  await page.getByTestId('return-condition-good').click();
  await page.getByTestId('return-save').click();
  await expect(material).toContainText(/Returned on .+: Good/);
  await expect(material.getByRole('button', { name: 'Record the return' })).toHaveCount(0);
});
