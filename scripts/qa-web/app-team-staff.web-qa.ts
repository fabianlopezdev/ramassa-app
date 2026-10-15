/**
 * The team's accounts in the app (RAPP-404), through the web build: a person
 * is invited on the Coach preset and gets a sign-in code by email, is signed
 * out everywhere, has the second factor reset, and loses access. Nobody resets
 * their own second factor. Expected values come from the database.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  completeSecondFactor,
  MAILPIT_URL,
  queryDatabase,
  SEED_TOTP_SECRET,
  signInPlayer,
} from './session';
import { totpCode } from './totp';

test.setTimeout(240_000);

// The seeded admin holds team.manage.
const ADMIN_EMAIL = 'laia.ferrer@example.test';
const tag = Date.now().toString(36);
const invitedEmail = `app-staff-${tag}@example.test`;
const startedAt = new Date().toISOString();

test.afterAll(() => {
  queryDatabase(`
    delete from public.staff_invitations where email = '${invitedEmail}';
    delete from public.audit_log
     where created_at >= '${startedAt}'::timestamptz
       and target_id = (select id from auth.users where email = '${invitedEmail}');
    delete from public.profiles where id = (select id from auth.users where email = '${invitedEmail}');
    delete from auth.users where email = '${invitedEmail}';
  `);
});

async function answerStepUpIfAsked(page: Page): Promise<void> {
  const prompt = page.getByTestId('step-up-code');
  if (await prompt.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await prompt.fill(totpCode(SEED_TOTP_SECRET));
    await page.getByTestId('step-up-confirm').click();
  }
}

const invitedId = () =>
  queryDatabase(`select id from auth.users where email = '${invitedEmail}';`).trim();

const auditActions = (id: string) =>
  queryDatabase(`
    select coalesce(string_agg(action, ',' order by created_at), '') from public.audit_log
     where target_id = '${id}' and created_at >= '${startedAt}'::timestamptz;
  `).trim();

test('a person is invited on a preset, signed out, reset and removed', async ({ page }) => {
  page.on('dialog', (dialog) => void dialog.accept());
  await signInPlayer(page, ADMIN_EMAIL);
  await completeSecondFactor(page, ADMIN_EMAIL);
  await page.getByTestId('team-sidebar-more').click({ timeout: 30_000 });
  await page.getByTestId('team-more-staff').click({ timeout: 30_000 });
  await expect(page.getByTestId('staff-invite-preset-coach')).toBeVisible({ timeout: 30_000 });

  const adminId = queryDatabase(`select id from auth.users where email = '${ADMIN_EMAIL}';`).trim();
  await expect(page.getByTestId(`staff-member-${adminId}`)).toBeVisible();
  await expect(page.getByTestId(`staff-reset-factor-${adminId}`)).toHaveCount(0);

  await page.getByTestId('staff-invite-first-name').fill('Núria');
  await page.getByTestId('staff-invite-last-name').fill(`Prova ${tag}`);
  await page.getByTestId('staff-invite-email').fill(invitedEmail);
  await page.getByTestId('staff-invite-preset-coach').click();
  await page.getByTestId('staff-invite-submit').click();
  await answerStepUpIfAsked(page);
  await expect(page.getByTestId('staff-notice')).toHaveText('Invitation sent.', {
    timeout: 30_000,
  });
  const id = invitedId();
  expect(
    queryDatabase(`
      select profile.role || '|' || preset.builtin_key
        from public.profiles as profile
        join public.team_member_access as access on access.profile_id = profile.id
        join public.permission_presets as preset on preset.id = access.preset_id
       where profile.id = '${id}';
    `).trim(),
  ).toBe('staff|coach');
  await expect
    .poll(
      async () => {
        const response = await fetch(`${MAILPIT_URL}/api/v1/search?query=to:${invitedEmail}`);
        return ((await response.json()) as { messages_count: number }).messages_count;
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  await expect(page.getByTestId(`staff-access-${id}`)).toContainText('Coach', { timeout: 30_000 });

  await page.getByTestId(`staff-sign-out-${id}`).click();
  await expect(page.getByTestId('staff-notice')).toHaveText('Signed out everywhere.', {
    timeout: 30_000,
  });
  await page.getByTestId(`staff-reset-factor-${id}`).click();
  await answerStepUpIfAsked(page);
  await expect(page.getByTestId('staff-notice')).toHaveText(
    'Second factor reset. They will set up a new one at the next sign-in.',
    { timeout: 30_000 },
  );
  await page.getByTestId(`staff-remove-${id}`).click();
  await answerStepUpIfAsked(page);
  await expect(page.getByTestId('staff-notice')).toHaveText('Access removed.', {
    timeout: 30_000,
  });
  await expect
    .poll(() => queryDatabase(`select is_active from public.profiles where id = '${id}';`).trim(), {
      timeout: 30_000,
    })
    .toBe('f');
  await expect(page.getByTestId(`staff-remove-${id}`)).toHaveCount(0);
  expect(auditActions(id)).toContain('sessions.sign_out_everywhere');
  expect(auditActions(id)).toContain('staff.remove');
});
