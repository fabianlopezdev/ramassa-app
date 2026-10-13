/**
 * Deletion requests and the GDPR actions in the app (RAPP-286), through the
 * web build: the open request shows with her name, staff anonymize one
 * participant, and an admin erases another, files first and then the record,
 * so nothing that points at her is left.
 */
import { expect, test, type Page } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer, STAFF_EMAIL } from './session';

test.setTimeout(240_000);

const ADMIN_EMAIL = 'laia.ferrer@example.test';
const RUN_TAG = `app${Date.now().toString(36)}`;
const minted: string[] = [];

/** A participant of this run, invited the real way, with an open deletion request. */
function mintParticipant(firstName: string): string {
  const email = `rgpd.${firstName.toLowerCase()}.${RUN_TAG}@example.test`;
  queryDatabase(`
    begin;
    set local role authenticated;
    set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
    select public.create_participant_invite('{"email": "${email}"}'::jsonb);
    commit;
  `);
  const id = queryDatabase(`select id from auth.users where email = '${email}';`).trim();
  minted.push(id);
  queryDatabase(`
    insert into public.profiles (id, org_id, role, first_name, last_name, terms_accepted_at)
      values ('${id}', '5eed0000-0000-4000-8000-000000000000', 'player', '${firstName}',
              'Rgpd ${RUN_TAG}', now());
    insert into public.deletion_requests (profile_id, reason)
      values ('${id}', 'Esborreu les meves dades ${RUN_TAG}');
  `);
  return id;
}

test.afterAll(() => {
  if (minted.length === 0) return;
  const ids = minted.map((id) => `'${id}'`).join(', ');
  queryDatabase(`
    delete from public.audit_log where target_id in (${ids});
    delete from public.invites where email like '%.${RUN_TAG}@example.test';
    delete from auth.users where id in (${ids});
  `);
});

async function openRecordFromRequests(page: Page, email: string, id: string): Promise<void> {
  await signInPlayer(page, email);
  await completeSecondFactor(page, email);
  await page.getByTestId('team-sidebar-participants').click({ timeout: 30_000 });
  await page.getByTestId('participants-deletion-requests').click({ timeout: 30_000 });
  const request = page.locator('[data-testid^="deletion-request-"]', { hasText: RUN_TAG }).first();
  await expect(request).toBeVisible({ timeout: 30_000 });
  const requestId = queryDatabase(
    `select id from public.deletion_requests where profile_id = '${id}';`,
  ).trim();
  await expect(page.getByTestId(`deletion-request-${requestId}`)).toContainText(`Rgpd ${RUN_TAG}`);
  await page.getByTestId(`deletion-request-open-${requestId}`).click();
  await expect(page.getByTestId('participant-rgpd')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('rgpd-open-request')).toContainText(RUN_TAG);
}

async function confirmWithPhrase(page: Page): Promise<void> {
  const field = page.getByTestId('rgpd-confirm-phrase');
  // The word is read off the sheet, so the spec follows the screen's language.
  const label = (await page.getByText(/Type this word to confirm:/).textContent()) ?? '';
  const phrase = label.replace(/.*:\s*/, '').trim();
  await field.fill(phrase);
  await page.getByTestId('rgpd-confirm').click();
}

test('staff anonymize a participant who asked for it', async ({ page }) => {
  const id = mintParticipant('Anna');
  await openRecordFromRequests(page, STAFF_EMAIL, id);
  // Staff hold rgpd.erase without team.manage, so only anonymizing is theirs.
  await expect(page.getByTestId('rgpd-erase')).toHaveCount(0);
  await page.getByTestId('rgpd-anonymize').click();
  await confirmWithPhrase(page);
  await expect
    .poll(
      () =>
        queryDatabase(
          `select anonymized_at is not null from public.profiles where id = '${id}';`,
        ).trim(),
      { timeout: 30_000 },
    )
    .toBe('t');
});

test('an admin erases a participant, files first and then the record', async ({ page }) => {
  const id = mintParticipant('Berta');
  await openRecordFromRequests(page, ADMIN_EMAIL, id);
  await page.getByTestId('rgpd-erase').click();
  await confirmWithPhrase(page);
  await expect
    .poll(
      () =>
        Number(
          queryDatabase(`
            select
              (select count(*) from public.profiles where id = '${id}') +
              (select count(*) from public.deletion_requests where profile_id = '${id}') +
              (select count(*) from auth.users where id = '${id}');
          `).trim(),
        ),
      { timeout: 30_000 },
    )
    .toBe(0);
  expect(
    queryDatabase(
      `select count(*) from public.audit_log where action = 'profile.media_purged' and target_id = '${id}';`,
    ).trim(),
  ).not.toBe('0');
});
