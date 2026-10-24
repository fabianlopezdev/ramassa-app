/**
 * The invitation's last step, a board of her screens (RAPP-643): each card
 * opens a sheet with its questions and a choice per question. Shared by the
 * specs that invite a woman.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * A question's row, in the sheet of the screen card that asks it (RAPP-643):
 * the cards open one sheet at a time, so each is opened until one holds it.
 */
export async function questionRow(page: Page, question: string): Promise<Locator> {
  const sheet = page.getByTestId('invite-screen-sheet');
  const opens = page
    .getByTestId('invite-questions-review')
    .locator('[data-testid^="invite-screen-open-"]');
  for (let index = 0; index < (await opens.count()); index += 1) {
    if (await sheet.isVisible()) {
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
    }
    await opens.nth(index).click();
    await expect(sheet).toBeVisible();
    const row = sheet.getByTestId(`invite-question-${question}`);
    if ((await row.count()) > 0) return row;
  }
  throw new Error(`no screen asks ${question}`);
}

export async function choose(page: Page, question: string, state: 'auto' | 'ask' | 'skip') {
  await (
    await questionRow(page, question)
  )
    .getByTestId(`invite-question-${question}-${state}`)
    .click();
}

export async function expectAsking(page: Page, question: string, asking: string) {
  await expect(await questionRow(page, question)).toHaveAttribute('data-asking', asking);
}
