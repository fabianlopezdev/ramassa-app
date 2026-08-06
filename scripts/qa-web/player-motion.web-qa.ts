/** Browser regression coverage for NativeWind classes on shared player press targets. */

import { expect, test, type Locator, type Page } from '@playwright/test';
import { PARTICIPANT_FIXTURES, SEED_ACCOUNT_PASSWORD } from '@ramassa/shared/testing';

const playerOrigin = `http://localhost:${process.env.RAMASSA_QA_PLAYER_PORT ?? '4194'}`;
const player = PARTICIPANT_FIXTURES[0]!;

interface PressTargetMeasurements {
  readonly backgroundColor: string;
  readonly borderRadius: string;
  readonly borderWidth: string;
  readonly height: number;
}

async function measurePressTarget(target: Locator): Promise<PressTargetMeasurements> {
  return target.evaluate((element) => {
    const browser = globalThis as unknown as {
      getComputedStyle: (node: unknown) => {
        backgroundColor: string;
        borderRadius: string;
        borderTopWidth: string;
      };
    };
    const measuredElement = element as unknown as {
      getBoundingClientRect: () => { height: number };
    };
    const styles = browser.getComputedStyle(element);
    return {
      backgroundColor: styles.backgroundColor,
      borderRadius: styles.borderRadius,
      borderWidth: styles.borderTopWidth,
      height: measuredElement.getBoundingClientRect().height,
    };
  });
}

async function openPasswordForm(page: Page): Promise<void> {
  await page.goto(`${playerOrigin}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const usePassword = page.getByRole('button', { name: /password/i }).first();
  await expect(usePassword).toBeVisible({ timeout: 30_000 });
  await usePassword.click();
  await expect(page.locator('input[type="password"]')).toBeVisible();
}

test.setTimeout(180_000);

test('login press targets retain their NativeWind size and surface in the exported web app', async ({
  page,
}) => {
  await page.goto(`${playerOrigin}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  const primaryAction = page.getByRole('button', { name: 'Send me a link', exact: true });
  const passwordLink = page.getByRole('button', { name: /password/i }).first();
  await expect(primaryAction).toBeVisible({ timeout: 30_000 });
  await expect(passwordLink).toBeVisible();

  const primary = await measurePressTarget(primaryAction);
  const link = await measurePressTarget(passwordLink);

  expect(primary.height).toBeGreaterThanOrEqual(56);
  expect(primary.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(primary.borderRadius).not.toBe('0px');
  expect(link.height).toBeGreaterThanOrEqual(48);
});

test('a signed-in press target keeps its 56px minimum, border, radius, and background', async ({
  page,
}) => {
  await openPasswordForm(page);
  await page.locator('input[type="email"]').fill(player.email);
  await page.locator('input[type="password"]').fill(SEED_ACCOUNT_PASSWORD);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();

  const knowledgeAction = page.getByTestId('open-knowledge-base');
  await expect(knowledgeAction).toBeVisible({ timeout: 30_000 });
  const target = await measurePressTarget(knowledgeAction);

  expect(target.height).toBeGreaterThanOrEqual(56);
  expect(target.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(target.borderRadius).not.toBe('0px');
  expect(target.borderWidth).toBe('1px');
});
