import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';
import { countInDatabase, queryDatabase, signIn, STAFF_EMAIL } from './session';

const ADMIN_EMAIL = 'laia.ferrer@example.test';
const startedAt = new Date().toISOString();
const { Workbook } = ExcelJS;

test.afterAll(() => {
  queryDatabase(`
    delete from public.audit_log
     where action like 'data_export.%'
       and actor_id = (select id from auth.users where email = '${ADMIN_EMAIL}')
       and created_at >= '${startedAt}'::timestamptz;
  `);
});

test.describe.serial('admin data exports and audit log', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ADMIN_EMAIL);
  });

  test('downloads minimized CSV and confirmed full Excel, then audits both', async ({ page }) => {
    await page.goto('/data');
    await expect(page.getByRole('heading', { name: 'Data exports and audit log' })).toBeVisible();

    const expectedParticipants = countInDatabase(
      "select count(*) from public.profiles where role = 'player'",
    );
    expect(expectedParticipants).toBeGreaterThan(0);

    const csvDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
    const csv = await csvDownload;
    const csvPath = await csv.path();
    if (csvPath === null) throw new Error('CSV download did not produce a local file');
    const csvBytes = await readFile(csvPath);
    const csvText = csvBytes.toString('utf8');
    expect(csvText.charCodeAt(0)).toBe(0xfeff);
    expect(csvText).toContain('أمينة');
    expect(csvText).toContain('Torelló');
    expect(csvText).not.toContain('document_number');
    expect(csvText).not.toContain('postal_code');
    expect(csvText.trimEnd().split('\r\n').length - 1).toBe(expectedParticipants);

    await page
      .getByLabel('Reason for full export')
      .fill('Participant access request for an authorized case');
    await page
      .getByLabel('I confirm this full export is necessary and will be handled securely.')
      .check();
    const xlsxDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download full Excel', exact: true }).click();
    const xlsx = await xlsxDownload;
    const workbook = new Workbook();
    const xlsxPath = await xlsx.path();
    if (xlsxPath === null) throw new Error('XLSX download did not produce a local file');
    const xlsxBytes = await readFile(xlsxPath);
    await workbook.xlsx.load(xlsxBytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.getWorksheet('participants');
    expect(sheet?.rowCount).toBe(expectedParticipants + 1);
    expect(sheet?.getRow(1).values).toContain('document_number');
    expect(
      Array.from({ length: sheet?.rowCount ?? 0 }, (_, index) =>
        String(sheet?.getRow(index + 1).getCell(1).value ?? ''),
      ).join(' '),
    ).not.toContain('<script>');

    await expect(page.getByRole('status')).toContainText(
      `Export downloaded with ${expectedParticipants} rows.`,
    );
    expect(
      countInDatabase(`select count(*) from public.audit_log
        where actor_id = (select id from auth.users where email = '${ADMIN_EMAIL}')
          and action in ('data_export.default', 'data_export.full')
          and created_at >= '${startedAt}'::timestamptz`),
    ).toBe(2);
  });

  test('filters survive reload and back, while hostile and empty input stay safe', async ({
    page,
  }) => {
    await page.goto('/data');
    await page.getByLabel('Action').fill('data_export.full');
    await page.getByRole('button', { name: 'Apply audit filters' }).click();
    await expect.poll(() => page.url()).toContain('action=data_export.full');
    await expect(page.getByRole('cell', { name: 'data_export.full' }).first()).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('Action')).toHaveValue('data_export.full');
    await expect(page.getByRole('cell', { name: 'data_export.full' }).first()).toBeVisible();

    await page.getByLabel('Action').fill("') <script>alert(63)</script> --");
    await page.getByRole('button', { name: 'Apply audit filters' }).click();
    await expect(page.getByText('No audit entries match these filters.')).toBeVisible();
    await expect(page.locator('script')).not.toContainText('alert(63)');

    await page.goBack();
    await expect(page.getByLabel('Action')).toHaveValue('data_export.full');
    await expect(page.getByRole('cell', { name: 'data_export.full' }).first()).toBeVisible();
  });
});

test('a staff member cannot see the admin export product or navigation item', async ({ page }) => {
  await signIn(page, STAFF_EMAIL);
  await page.goto('/data');

  await expect(page.getByRole('heading', { name: 'Data exports and audit log' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download CSV', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Data and audit' })).toHaveCount(0);
});
