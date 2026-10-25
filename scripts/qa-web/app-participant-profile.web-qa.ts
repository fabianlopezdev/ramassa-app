/**
 * The full participant record in the app (RAPP-281), through the web build:
 * an admin edits a field and changes her status from the card, and a team
 * member with only the Basic level sees the Basic fields and no actions.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  appAnswerSql,
  completeSecondFactor,
  queryDatabase,
  signInPlayer,
  STAFF_EMAIL,
  writeAppAnswerSql,
} from './session';

test.setTimeout(240_000);

const BASIC_EMAIL = 'nuria.serra@example.test';
const LEVEL_PERMISSIONS = [
  'participants.view_personal',
  'participants.view_sensitive',
  'participants.deactivate',
  'forum.moderate',
];

const participantId = () =>
  queryDatabase(`
    select id from public.profiles
     where first_name = 'Aissatou' and last_name = 'Diallo' and role = 'player';
  `).trim();

const placeOfBirth = (id: string) =>
  queryDatabase(`select ${appAnswerSql(`'${id}'`, 'place_of_birth')};`).trim();

async function openCard(page: Page, email: string): Promise<void> {
  await signInPlayer(page, email);
  await completeSecondFactor(page, email);
  await page.getByTestId('team-sidebar-participants').click({ timeout: 30_000 });
  await page.getByTestId('participant-search').fill('Diallo');
  await page.getByTestId(`participant-result-${participantId()}`).click({ timeout: 30_000 });
  await expect(page.getByTestId('participant-profile')).toBeVisible({ timeout: 30_000 });
}

test('an admin edits the record and changes her status from the card', async ({ page }) => {
  const id = participantId();
  const original = placeOfBirth(id);
  try {
    await openCard(page, STAFF_EMAIL);
    const profile = page.getByTestId('participant-profile');
    await expect(profile).toContainText('Phone');
    await expect(profile).toContainText(original);

    await page.getByTestId('participant-edit').click();
    const place = page.getByTestId('participant-edit-place-of-birth');
    await expect(place).toBeVisible({ timeout: 30_000 });
    await place.fill('Dakar Medina');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => placeOfBirth(id), { timeout: 30_000 }).toBe('Dakar Medina');
    await expect(page.getByTestId('participant-profile')).toContainText('Dakar Medina', {
      timeout: 30_000,
    });

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByTestId('participant-status').click();
    await expect(page.getByTestId('participant-status')).toHaveText('Reactivate', {
      timeout: 30_000,
    });
    await page.getByTestId('participant-status').click();
    await expect(page.getByTestId('participant-status')).toHaveText('Deactivate', {
      timeout: 30_000,
    });
  } finally {
    queryDatabase(`
      begin;
      ${writeAppAnswerSql(`'${id}'`, 'place_of_birth', original === '' ? null : original, 'player')}
      update public.profiles set is_active = true where id = '${id}';
      commit;
    `);
  }
});

test('the Basic level sees the Basic fields and no actions', async ({ page }) => {
  const codes = LEVEL_PERMISSIONS.map((code) => `'${code}'`).join(', ');
  const kept = queryDatabase(`
    select string_agg(permission_code, ',') from public.team_member_permissions
     where profile_id = (select id from auth.users where email = '${BASIC_EMAIL}')
       and permission_code in (${codes});
  `).trim();
  queryDatabase(`
    delete from public.team_member_permissions
     where profile_id = (select id from auth.users where email = '${BASIC_EMAIL}')
       and permission_code in (${codes});
  `);
  try {
    await openCard(page, BASIC_EMAIL);
    const profile = page.getByTestId('participant-profile');
    await expect(profile).toContainText('App language');
    await expect(profile).toContainText('Entity');
    await expect(profile).not.toContainText('Phone');
    await expect(profile).not.toContainText('Date of birth');
    await expect(page.getByTestId('participant-edit')).toHaveCount(0);
    await expect(page.getByTestId('participant-status')).toHaveCount(0);
    await expect(page.getByTestId('participant-forum')).toHaveCount(0);
  } finally {
    for (const code of kept.split(',').filter(Boolean)) {
      queryDatabase(`
        insert into public.team_member_permissions (profile_id, org_id, permission_code)
        select id, '5eed0000-0000-4000-8000-000000000000', '${code}'
          from auth.users where email = '${BASIC_EMAIL}'
        on conflict do nothing;
      `);
    }
  }
});
