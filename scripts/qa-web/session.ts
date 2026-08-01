/**
 * What every web QA spec needs before it can assert anything: a real sign-in,
 * and a way to ask the DATABASE what the answer should be.
 *
 * Deliberately NOT a `*.web-qa.ts` file, so Playwright treats it as a module
 * rather than as a spec with no tests in it.
 *
 * It exists because the second spec would otherwise have copied the first one's
 * login helper, and a copied login helper is how one suite quietly keeps
 * passing against an auth flow the other one has already noticed is broken.
 */

import { execFileSync } from 'node:child_process';
import { expect, type Page } from '@playwright/test';

export const STAFF_EMAIL = 'marta.puig@example.test';
export const ENTITY_EMAIL = 'silvia.bosch@example.test';
export const SEED_PASSWORD = 'ramassa-dev-password';

/**
 * One scalar, straight from the local database through psql in the Supabase
 * container, rather than through the app's own client.
 *
 * Asking the app what it expects to show would be circular: the bugs this suite
 * exists to catch are exactly the ones where the app is confidently wrong. psql
 * connects as the owner, so it sees past RLS and past the app's own query
 * layer, which is what makes it an independent answer rather than a second
 * opinion from the same source.
 */
export function queryDatabase(sql: string): string {
  const container = execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' })
    .split('\n')
    .find((name) => name.startsWith('supabase_db_'));
  if (container === undefined) {
    throw new Error('No local Supabase database container is running: bunx supabase start');
  }
  return execFileSync(
    'docker',
    ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', sql],
    { encoding: 'utf8' },
  ).trim();
}

export function countInDatabase(sql: string): number {
  return Number(queryDatabase(sql));
}

/**
 * Signs in the way a person does: the password path, because local mail is not
 * wired up.
 *
 * The toggle is clicked with a RETRY, which is not paranoia. The admin is
 * server-rendered, so on a cold load the button exists in the markup before
 * React has attached its handler, and a click in that window does nothing at
 * all. A person never notices; an automated run hits it every time and reads
 * as "the login page is broken".
 */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  const usePassword = page.getByRole('button', { name: /contrasenya|password/i }).first();
  await expect(usePassword).toBeVisible();

  await expect(async () => {
    await usePassword.click();
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(SEED_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });
}
