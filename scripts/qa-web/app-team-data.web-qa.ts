/**
 * Data exports and the audit log in the app (RAPP-401), through the web build,
 * where the share step downloads the file: a default events export and a full
 * participant export with its reason each give a CSV with every row the
 * database returned and an audit entry, and the audit log finds the full one.
 * Expected values come from the database.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
  completeSecondFactor,
  queryDatabase,
  SEED_TOTP_SECRET,
  signInPlayer,
  STAFF_EMAIL,
} from './session';
import { totpCode } from './totp';

test.setTimeout(240_000);

// The seeded admin holds every export permission and audit.view; Marta holds none.
const ADMIN_EMAIL = 'laia.ferrer@example.test';
const startedAt = new Date().toISOString();
const reason = `Justificació de la subvenció ${Date.now().toString(36)}`;

test.afterAll(() => {
  queryDatabase(`
    delete from public.audit_log
     where action like 'data_export.%' and created_at >= '${startedAt}'::timestamptz;
  `);
});

/** Answers the step-up prompt when the session has no recent second factor. */
async function answerStepUpIfAsked(page: Page): Promise<void> {
  const prompt = page.getByTestId('step-up-code');
  if (await prompt.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await prompt.fill(totpCode(SEED_TOTP_SECRET));
    await page.getByTestId('step-up-confirm').click();
  }
}

async function exportCsv(page: Page, button: string) {
  const download = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByTestId(button).click();
  await answerStepUpIfAsked(page);
  const file = await download;
  const text = readFileSync((await file.path()) ?? '', 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split('\r\n').filter((line) => line.length > 0);
  return { name: file.suggestedFilename(), header: lines[0] ?? '', rows: lines.length - 1 };
}

const today = () => new Date().toISOString().slice(0, 10);

test('a team member with no export permission does not see the data screen', async ({ page }) => {
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);
  await page.getByTestId('team-sidebar-more').click({ timeout: 30_000 });
  await expect(page.getByTestId('team-more-notifications')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('team-more-data')).toHaveCount(0);
});

test('a default and a full export are shared with every row and audited', async ({ page }) => {
  await signInPlayer(page, ADMIN_EMAIL);
  await completeSecondFactor(page, ADMIN_EMAIL);
  await page.getByTestId('team-sidebar-more').click({ timeout: 30_000 });
  await page.getByTestId('team-more-data').click({ timeout: 30_000 });
  await expect(page.getByTestId('data-exports')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('data-dataset-events').click();
  const events = await exportCsv(page, 'data-export-default');
  expect(events.name).toBe(`ramassa-events-default-${today()}.csv`);
  await expect(page.getByTestId('data-export-notice')).toContainText(String(events.rows));
  expect(
    queryDatabase(`
      select (changes->>'row_count')::int from public.audit_log
       where action = 'data_export.default' and created_at >= '${startedAt}'::timestamptz
       order by created_at desc limit 1;
    `).trim(),
  ).toBe(String(events.rows));

  await page.getByTestId('data-dataset-participants').click();
  await page.getByTestId('data-export-reason').fill(reason);
  await page.getByTestId('data-export-confirm').click();
  const participants = await exportCsv(page, 'data-export-full');
  expect(participants.name).toBe(`ramassa-participants-full-${today()}.csv`);
  expect(participants.header).toContain('"phone"');
  expect(
    queryDatabase(`
      select (changes->>'row_count')::int || '|' || (changes->>'reason')
        from public.audit_log
       where action = 'data_export.full' and created_at >= '${startedAt}'::timestamptz
       order by created_at desc limit 1;
    `).trim(),
  ).toBe(`${participants.rows}|${reason}`);

  await page.getByTestId('audit-filter-action').fill('data_export.full');
  await page.getByTestId('audit-filter-apply').click();
  const auditId = queryDatabase(`
    select id from public.audit_log
     where action = 'data_export.full' and created_at >= '${startedAt}'::timestamptz
     order by created_at desc limit 1;
  `).trim();
  await expect(page.getByTestId(`audit-row-${auditId}`)).toContainText('data_export.full', {
    timeout: 30_000,
  });
});
