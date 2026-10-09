/** Browser regression coverage for NativeWind classes on shared player press targets. */

import { expect, test, type Locator } from '@playwright/test';
import { PARTICIPANT_FIXTURES } from '@ramassa/shared/testing';
import { PLAYER_ORIGIN, signInPlayer } from './session';

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

test.setTimeout(180_000);

test('sign-in press targets keep their NativeWind size and surface in the exported web app', async ({
  page,
}) => {
  // The email-only sign-in (RAPP-140): language choice, then the email form.
  await page.goto(PLAYER_ORIGIN, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const english = page.getByRole('radio', { name: 'English', exact: true });
  const continueAction = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(continueAction).toBeVisible({ timeout: 30_000 });

  // The rows fade and slide in, so sizes are read once the entrance has settled.
  await expect
    .poll(async () => (await measurePressTarget(english)).height)
    .toBeGreaterThanOrEqual(56);
  await expect
    .poll(async () => (await measurePressTarget(continueAction)).height)
    .toBeGreaterThanOrEqual(56);
  const proceed = await measurePressTarget(continueAction);
  expect(proceed.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(proceed.borderRadius).not.toBe('0px');

  await english.click();
  await continueAction.click();
  await expect(page).toHaveURL(`${PLAYER_ORIGIN}/email-login`);
  const sendCode = page.getByRole('button', { name: 'Send me a code', exact: true });
  const back = page.getByRole('button', { name: 'Back', exact: true });
  await expect(sendCode).toBeVisible();

  await expect
    .poll(async () => (await measurePressTarget(sendCode)).height)
    .toBeGreaterThanOrEqual(56);
  await expect.poll(async () => (await measurePressTarget(back)).height).toBeGreaterThanOrEqual(48);
  const primary = await measurePressTarget(sendCode);
  expect(primary.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(primary.borderRadius).not.toBe('0px');
});

test('a signed-in press target keeps its 56px minimum, border, radius, and background', async ({
  page,
}) => {
  await signInPlayer(page, player.email);

  const knowledgeAction = page.getByTestId('open-knowledge-base');
  await expect(knowledgeAction).toBeVisible({ timeout: 30_000 });
  const target = await measurePressTarget(knowledgeAction);

  expect(target.height).toBeGreaterThanOrEqual(56);
  expect(target.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(target.borderRadius).not.toBe('0px');
  expect(target.borderWidth).toBe('1px');
});
