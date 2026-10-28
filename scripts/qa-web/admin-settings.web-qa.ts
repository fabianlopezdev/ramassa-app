import { expect, test, type Page } from '@playwright/test';
import { PARTICIPANT_FIXTURES } from '@ramassa/shared/testing';
import {
  acceptInvitationFromEmail,
  PLAYER_ORIGIN,
  queryDatabase,
  signIn,
  signInPlayer as signInPlayerWithEmailCode,
  STAFF_EMAIL,
} from './session';

const ADMIN_EMAIL = 'laia.ferrer@example.test';
const runTag = `rapp64-${Date.now().toString(36)}`;
const invitedEmail = `${runTag}@example.test`;
const documentName = `Inventari ${runTag}.pdf`;
const startedAt = new Date().toISOString();
const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test.setTimeout(180_000);

// This suite runs on the main local stack, so it puts back the branding it
// found instead of the defaults, which would wipe the real ones (RAPP-551).
let savedBranding = '';

test.beforeAll(() => {
  savedBranding = queryDatabase(`
    select primary_color || '|' || secondary_color || '|' || coalesce(logo_url, '')
      from public.organizations
     where slug = 'ramassa';
  `);
});

test.afterAll(() => {
  const [primary = '#0077B6', secondary = '#FFD166', logo = ''] = savedBranding.split('|');
  queryDatabase(`
    update public.organizations
       set logo_url = nullif('${logo}', ''), primary_color = '${primary}', secondary_color = '${secondary}'
     where slug = 'ramassa';
    delete from public.internal_documents where name = '${documentName.replaceAll("'", "''")}';
    delete from public.staff_invitations where email = '${invitedEmail}';
    delete from public.audit_log
     where created_at >= '${startedAt}'::timestamptz
       and action in ('organization.settings_update', 'staff.invite', 'staff.role_change', 'staff.remove', 'internal_document.create', 'team.permissions_update');
    delete from public.profiles
     where id = (select id from auth.users where email = '${invitedEmail}');
    delete from auth.users where email = '${invitedEmail}';
  `);
});

async function signInPlayer(page: Page): Promise<void> {
  const player = PARTICIPANT_FIXTURES[0]!;
  await signInPlayerWithEmailCode(page, player.email);
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
    await expect(page.getByRole('alert')).toContainText('4.5:1');
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
    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toContainText(
      'Settings saved.',
    );
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
    const adminLogo = page.getByRole('img', { name: 'AE Ramassà' }).first();
    await expect(adminLogo).toBeVisible();
    await expect
      .poll(() =>
        adminLogo.evaluate(
          (element) => (element as unknown as { readonly naturalWidth: number }).naturalWidth,
        ),
      )
      .toBeGreaterThan(0);

    // The player app shows the organization logo on the language screen, before sign-in.
    await page.goto(PLAYER_ORIGIN, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    // Selected by its source: the image is labelled with the app name, and the
    // branding endpoint is what proves the uploaded logo reached the player app.
    const playerLogo = page.locator('img[src*="/branding/"]').first();
    await expect(playerLogo).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(() =>
        playerLogo.evaluate(
          (element) => (element as unknown as { readonly naturalWidth: number }).naturalWidth,
        ),
      )
      .toBeGreaterThan(0);

    // Signed-in branding is read fresh from the organization, so colours are checked there.
    await signInPlayer(page);
    await page.getByRole('tab', { name: 'Profile' }).click();
    await expect(page.getByTestId('generalitat-credit')).toBeVisible({ timeout: 30_000 });
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
    await page.goto('/team');
    await page.getByLabel('First name').fill('نورا');
    await page.getByLabel('Last name').fill('Коваль');
    await page.getByLabel('Email').fill(invitedEmail);
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toContainText(
      'Invitation sent.',
    );
    expect(
      queryDatabase(`select p.role || '|' || p.is_active::text
        from public.profiles p join auth.users u on u.id = p.id where u.email = '${invitedEmail}'`),
    ).toBe('staff|true');

    const invitedContext = await browser.newContext({ locale: 'en-GB' });
    const invitedPage = await invitedContext.newPage();
    // The invitation email names the organization and opens the "I already
    // have a code" step, so its own code signs her in (RAPP-225).
    const invitation = await acceptInvitationFromEmail(invitedPage, invitedEmail);
    expect(invitation.subject).toBe("T'han convidat a Ramassà");
    expect(invitation.text).toContain('Organització: AE Ramassà');
    await expect.poll(() => new URL(invitedPage.url()).pathname).toBe('/dashboard');
    expect(
      Number(
        queryDatabase(`select count(*) from auth.sessions s join auth.users u on u.id = s.user_id
          where u.email = '${invitedEmail}'`),
      ),
    ).toBeGreaterThan(0);

    // Promotion is a preset since RAPP-231: the Admin preset gives every permission.
    await page.getByRole('button', { name: `Edit access for ${invitedEmail}` }).click();
    const accessDialog = page.getByRole('dialog');
    await accessDialog.getByRole('combobox', { name: 'Preset' }).selectOption({ label: 'Admin' });
    await accessDialog.getByRole('button', { name: 'Use this preset' }).click();
    await accessDialog.getByRole('button', { name: 'Save' }).click();
    await expect
      .poll(() =>
        queryDatabase(`select count(*) from public.team_member_permissions grant_row
          join auth.users u on u.id = grant_row.profile_id where u.email = '${invitedEmail}'`),
      )
      // Every permission in the catalog, however many it holds today.
      .toBe(queryDatabase('select count(*) from public.permissions'));
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

    // The documents are a Settings tab; the team has its own page (RAPP-654).
    await page.goto('/settings');
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
    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toContainText(
      'Document uploaded.',
    );
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

/**
 * The season authorization (RAPP-304): an admin saves a draft from the
 * current version (RAPP-614) and publishes it, after confirming, and it
 * becomes the current version. The new version is removed again, so the
 * seeded players stay signed.
 */
test('an admin publishes a new authorization version', async ({ page }) => {
  const before = Number(
    queryDatabase(
      'select count(*) from public.authorization_versions where published_at is not null',
    ),
  );
  try {
    await signIn(page, ADMIN_EMAIL);
    // The authorization is a board of screens (RAPP-696): its versions on the board.
    await page.goto('/forms/authorization');
    await expect(page.getByTestId('authorization-versions')).toContainText('2026/27');
    await page.goto('/forms/authorization/document');
    const editor = page.getByTestId('authorization-editor');
    await expect(editor).toBeVisible();

    await editor.getByTestId('editor-language').getByRole('radio', { name: 'Català' }).click();
    await editor.locator('#authorization-title').fill(`Autorització ${runTag}`);
    // Players signed this season, so Desa asks: a new version asks them again (RAPP-696).
    await editor.getByTestId('authorization-publish').click();
    await page.getByTestId('save-kind-new').click();
    await page.getByTestId('save-kind-confirm').click();

    await expect
      .poll(
        () =>
          Number(
            queryDatabase(
              'select count(*) from public.authorization_versions where published_at is not null',
            ),
          ),
        { timeout: 15_000 },
      )
      .toBe(before + 1);
    expect(
      queryDatabase(
        `select content -> 'title' ->> 'ca' from public.authorization_versions
          order by published_at desc limit 1`,
      ),
    ).toBe(`Autorització ${runTag}`);
  } finally {
    queryDatabase(`
      alter table public.authorization_versions disable trigger authorization_versions_immutable;
      delete from public.authorization_versions where content -> 'title' ->> 'ca' = 'Autorització ${runTag}';
      alter table public.authorization_versions enable trigger authorization_versions_immutable;
      delete from public.audit_log
       where created_at >= '${startedAt}'::timestamptz and action like 'authorization.%';
    `);
  }
});

test('a staff member cannot see the admin-only settings product or its navigation item', async ({
  page,
}) => {
  await signIn(page, STAFF_EMAIL);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Organization settings' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);
});
