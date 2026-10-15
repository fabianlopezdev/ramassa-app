/**
 * The organization's settings in the app (RAPP-403), through the web build: a
 * colour under 4.5:1 contrast is explained and cannot be saved; a new contact
 * phone, a valid colour and a logo are saved. Expected values come from the
 * database, which is put back afterwards.
 */
import { deflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer } from './session';

test.setTimeout(240_000);

const ADMIN_EMAIL = 'laia.ferrer@example.test';
let saved = '';

test.beforeAll(() => {
  saved = queryDatabase(`
    select coalesce(contact_phone, '') || '|' || primary_color || '|' || coalesce(logo_url, '')
      from public.organizations;
  `).trim();
});

test.afterAll(() => {
  const [phone, primary, logo] = saved.split('|');
  queryDatabase(`
    update public.organizations
       set contact_phone = nullif('${phone ?? ''}', ''),
           primary_color = '${primary ?? '#0077B6'}',
           logo_url = nullif('${logo ?? ''}', '');
  `);
});

/** A small solid PNG, so the logo is a real image the phone can resize. */
function png(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const byte of bytes) c = (crcTable[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x33)]);
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('a low-contrast colour is refused, and a phone, a colour and a logo are saved', async ({
  page,
}) => {
  await signInPlayer(page, ADMIN_EMAIL);
  await completeSecondFactor(page, ADMIN_EMAIL);
  await page.getByTestId('team-sidebar-more').click({ timeout: 30_000 });
  await page.getByTestId('team-more-organization').click({ timeout: 30_000 });
  await expect(page.getByTestId('organization-name')).not.toHaveValue('', { timeout: 30_000 });

  await page.getByTestId('organization-primary-color').fill('#FFFF00');
  await expect(page.getByTestId('organization-primary-color-contrast')).toContainText(':1');

  const phone = `+34 600 ${Date.now().toString().slice(-6)}`;
  await page.getByTestId('organization-phone').fill(phone);
  await page.getByTestId('organization-primary-color').fill('#005A8C');
  await expect(page.getByTestId('organization-primary-color-contrast')).toHaveCount(0);

  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('organization-choose-logo').click();
  await (
    await chooser
  ).setFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png(600, 200) });
  await expect(page.getByTestId('organization-logo')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('organization-save').click();
  await expect(page.getByTestId('organization-notice')).toHaveText('Settings saved.', {
    timeout: 60_000,
  });
  const row = queryDatabase(`
    select contact_phone || '|' || primary_color || '|' || logo_url from public.organizations;
  `)
    .trim()
    .split('|');
  expect(row.slice(0, 2)).toEqual([phone, '#005A8C']);
  expect(row[2]).toMatch(/\/organization-branding\/.+\.png$/);
});
