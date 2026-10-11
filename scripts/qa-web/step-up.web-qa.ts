/**
 * Step-up checks in the web admin (RAPP-235): a risky action asks for a new
 * authenticator code when the session's last one is more than a few minutes
 * old. The browser clock is moved 11 minutes ahead to stand for that wait; the
 * database refusal itself is covered by pgTAP (0052_step_up_checks_test).
 */
import { expect, test, type Page } from '@playwright/test';
import { completeStepUp, queryDatabase, signIn } from './session';

const ADMIN_EMAIL = 'laia.ferrer@example.test';
const startedAt = new Date().toISOString();

test.setTimeout(150_000);

test.afterAll(() => {
  queryDatabase(`
    delete from public.audit_log
     where action like 'data_export.%'
       and actor_id = (select id from auth.users where email = '${ADMIN_EMAIL}')
       and created_at >= '${startedAt}'::timestamptz;
  `);
});

async function openExportsLater(page: Page): Promise<void> {
  await signIn(page, ADMIN_EMAIL);
  await page.clock.install({ time: Date.now() + 11 * 60_000 });
  await page.goto('/data');
  await expect(page.getByRole('heading', { name: 'Data exports and audit log' })).toBeVisible();
}

test('an export with an old code asks for a new one, then downloads', async ({ page }) => {
  await openExportsLater(page);
  const download = page.waitForEvent('download', { timeout: 90_000 });
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
  await completeStepUp(page);
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
});

test('cancelling the prompt stops the export and says why', async ({ page }) => {
  await openExportsLater(page);
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
  const prompt = page.getByTestId('step-up');
  await expect(prompt.getByRole('heading', { name: 'Confirm it is you' })).toBeVisible();
  await prompt.getByRole('button', { name: 'Cancel' }).click();
  await expect(prompt).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText(
    'For this action, enter a new code from your authenticator app.',
  );
});
