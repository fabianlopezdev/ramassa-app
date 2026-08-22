import { expect, test, type Page } from '@playwright/test';
import { PARTICIPANT_FIXTURES, SEED_ACCOUNT_PASSWORD } from '@ramassa/shared/testing';
import { latestMagicLink, queryDatabase, signIn, STAFF_EMAIL } from './session';

const ADMIN_EMAIL = 'laia.ferrer@example.test';
const playerOrigin = `http://localhost:${process.env.RAMASSA_QA_PLAYER_PORT ?? '4194'}`;
const runTag = `rapp64-${Date.now().toString(36)}`;
const invitedEmail = `${runTag}@example.test`;
const documentName = `Inventari ${runTag}.pdf`;
const startedAt = new Date().toISOString();
const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test.setTimeout(180_000);

test.afterAll(() => {
  queryDatabase(`
    update public.organizations
       set logo_url = null, primary_color = '#0077B6', secondary_color = '#FFD166'
     where slug = 'ramassa';
    delete from public.internal_documents where name = '${documentName.replaceAll("'", "''")}';
    delete from public.staff_invitations where email = '${invitedEmail}';
    delete from public.audit_log
     where created_at >= '${startedAt}'::timestamptz
       and action in ('organization.settings_update', 'staff.invite', 'staff.role_change', 'staff.remove', 'internal_document.create');
    delete from public.profiles
     where id = (select id from auth.users where email = '${invitedEmail}');
    delete from auth.users where email = '${invitedEmail}';
  `);
});

async function signInPlayer(page: Page) {
  const player = PARTICIPANT_FIXTURES[0]!;
  await page.goto(`${playerOrigin}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const usePassword = page.getByRole('button', { name: /password/i }).first();
  await expect(usePassword).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await usePassword.click();
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await page.locator('input[type="email"]').fill(player.email);
  await page.locator('input[type="password"]').fill(SEED_ACCOUNT_PASSWORD);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Profile' })).toBeVisible({ timeout: 30_000 });
}

test.describe.serial('admin organization settings', () => {
  test('rejects low contrast, then propagates branding and the permanent funding credit to both apps', async ({
    page,
  }) => {
    await signIn(page, ADMIN_EMAIL);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Organization settings' })).toBeVisible();

    const original = queryDatabase(
      "select primary_color || '|' || secondary_color from public.organizations where slug = 'ramassa'",
    );
    await page.getByLabel('Primary color hex').fill('#FFFFFF');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status')).toContainText('4.5:1');
    expect(
      queryDatabase(
        "select primary_color || '|' || secondary_color from public.organizations where slug = 'ramassa'",
      ),
    ).toBe(original);

    await page.getByLabel('Primary color hex').fill('#005A8C');
    await page.getByLabel('Secondary color hex').fill('#FFE08A');
    await page.getByLabel('Logo').setInputFiles({
      name: `${runTag}.png`,
      mimeType: 'image/png',
      buffer: onePixelPng,
    });
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status')).toContainText('Settings saved.');
    expect(
      queryDatabase(
        "select primary_color || '|' || secondary_color || '|' || (logo_url is not null)::text from public.organizations where slug = 'ramassa'",
      ),
    ).toBe('#005A8C|#FFE08A|true');
    await expect
      .poll(
        async () => (await page.getByTestId('organization-theme-root').getAttribute('style')) ?? '',
      )
      .toContain('--ramassa-primary-rgb: 0 90 140');
    await expect(page.getByTestId('generalitat-credit')).toBeVisible();
    const adminLogo = page.getByRole('img', { name: 'AE Ramassà' }).first();
    await expect(adminLogo).toBeVisible();
    await expect
      .poll(() =>
        adminLogo.evaluate(
          (element) => (element as unknown as { readonly naturalWidth: number }).naturalWidth,
        ),
      )
      .toBeGreaterThan(0);

    await signInPlayer(page);
    await page.getByRole('tab', { name: 'Profile' }).click();
    await expect(page.getByTestId('generalitat-credit')).toBeVisible({ timeout: 30_000 });
    const playerLogo = page.getByRole('img', { name: 'AE Ramassà' }).first();
    await expect(playerLogo).toBeVisible();
    await expect
      .poll(() =>
        playerLogo.evaluate(
          (element) => (element as unknown as { readonly naturalWidth: number }).naturalWidth,
        ),
      )
      .toBeGreaterThan(0);
    await expect
      .poll(
        async () =>
          (await page.locator('[style*="--ramassa-primary-rgb"]').first().getAttribute('style')) ??
          '',
      )
      .toContain('--ramassa-primary-rgb: 0 90 140');
  });

  test('completes staff lifecycle and document upload with durable human search state', async ({
    page,
    browser,
  }) => {
    await signIn(page, ADMIN_EMAIL);
    await page.goto('/settings?tab=staff');
    await page.getByLabel('First name').fill('نورا');
    await page.getByLabel('Last name').fill('Коваль');
    await page.getByLabel('Email').fill(invitedEmail);
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByRole('status')).toContainText('Invitation sent.');
    expect(
      queryDatabase(`select p.role || '|' || p.is_active::text
        from public.profiles p join auth.users u on u.id = p.id where u.email = '${invitedEmail}'`),
    ).toBe('staff|true');

    const invitedContext = await browser.newContext({ locale: 'en-GB' });
    const invitedPage = await invitedContext.newPage();
    await invitedPage.goto(await latestMagicLink(invitedEmail));
    await expect.poll(() => new URL(invitedPage.url()).pathname).toBe('/dashboard');
    expect(
      Number(
        queryDatabase(`select count(*) from auth.sessions s join auth.users u on u.id = s.user_id
          where u.email = '${invitedEmail}'`),
      ),
    ).toBeGreaterThan(0);

    await page.getByLabel(`Role ${invitedEmail}`).selectOption('admin');
    await expect
      .poll(() =>
        queryDatabase(`select p.role from public.profiles p join auth.users u on u.id = p.id
          where u.email = '${invitedEmail}'`),
      )
      .toBe('admin');
    const memberRow = page.getByRole('row').filter({ hasText: invitedEmail });
    await memberRow.getByRole('button', { name: 'Remove access' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect
      .poll(() =>
        queryDatabase(`select p.is_active::text || '|' ||
          (select count(*) from auth.sessions s where s.user_id = p.id)::text
          from public.profiles p join auth.users u on u.id = p.id where u.email = '${invitedEmail}'`),
      )
      .toBe('false|0');
    await invitedPage.reload();
    await expect(invitedPage.getByRole('heading', { name: 'Staff dashboard' })).toHaveCount(0);
    await invitedContext.close();

    await page.getByRole('tab', { name: 'Documents' }).click();
    await expect(page).toHaveURL(/tab=documents/);
    const search = page.getByLabel('Search documents');
    await search.fill('asseg');
    await page.getByRole('button', { name: 'Search documents' }).click();
    await expect(page.getByText('Assegurança esportiva 2026.pdf')).toBeVisible();

    await page.getByLabel('Upload a document').setInputFiles({
      name: documentName,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n% Ramassa browser QA\n'),
    });
    await page.getByTestId('document-upload-form').locator('button[type="submit"]').click();
    await expect(page.getByRole('status')).toContainText('Document uploaded.');
    expect(
      queryDatabase(`select count(*) from public.internal_documents
        where name = '${documentName.replaceAll("'", "''")}'`),
    ).toBe('1');

    await search.fill(runTag.slice(0, -2));
    await page.getByRole('button', { name: 'Search documents' }).click();
    await expect(page.getByText(documentName)).toBeVisible();
    await search.fill("') <script>alert(64)</script> --");
    await page.getByRole('button', { name: 'Search documents' }).click();
    await expect(page.getByText('No documents match the search.')).toBeVisible();
    await expect(page.locator('script')).not.toContainText('alert(64)');
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Documents' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(search).toHaveValue("') <script>alert(64)</script> --");
    await page.goBack();
    await expect(search).toHaveValue(runTag.slice(0, -2));
    await expect(page.getByText(documentName)).toBeVisible();
  });
});

test('a staff member cannot see the admin-only settings product or its navigation item', async ({
  page,
}) => {
  await signIn(page, STAFF_EMAIL);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Organization settings' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);
});
