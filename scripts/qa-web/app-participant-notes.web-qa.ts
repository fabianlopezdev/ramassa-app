/**
 * The team's notes on a participant's card in the app (RAPP-282), through the
 * web build: a note is added and shows first with its author, an empty note
 * is refused, and a team member without `participants.notes` sees no notes.
 */
import { expect, test, type Page } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer, STAFF_EMAIL } from './session';

test.setTimeout(240_000);

const OTHER_EMAIL = 'nuria.serra@example.test';

const participantId = () =>
  queryDatabase(`
    select id from public.profiles
     where first_name = 'Aissatou' and last_name = 'Diallo' and role = 'player';
  `).trim();

async function openCard(page: Page, email: string): Promise<void> {
  await signInPlayer(page, email);
  await completeSecondFactor(page, email);
  await page.getByTestId('team-sidebar-participants').click({ timeout: 30_000 });
  await page.getByTestId('participant-search').fill('Diallo');
  await page.getByTestId(`participant-result-${participantId()}`).click({ timeout: 30_000 });
  await expect(page.getByTestId('participant-profile')).toBeVisible({ timeout: 30_000 });
}

test('a note is added from the card and shows first, with its author', async ({ page }) => {
  const id = participantId();
  const body = `Boots size checked ${Date.now()}`;
  try {
    await openCard(page, STAFF_EMAIL);
    await page.getByTestId('participant-note-open').click();
    await page.getByTestId('participant-note-add').click();
    await expect(page.getByText('Write something before adding the note.')).toBeVisible();

    await page.getByTestId('participant-note-input').fill(body);
    await page.getByTestId('participant-note-add').click();
    await expect(page.getByTestId('participant-note-sheet')).toHaveCount(0, { timeout: 30_000 });
    const first = page.getByTestId('participant-note').first();
    await expect(first).toContainText(body, { timeout: 30_000 });
    await expect(first).toContainText('Marta Puig');
    expect(
      queryDatabase(`
        select count(*) from public.participant_notes
         where profile_id = '${id}' and body = '${body}'
           and author_id = (select id from auth.users where email = '${STAFF_EMAIL}');
      `).trim(),
    ).toBe('1');
  } finally {
    queryDatabase(`delete from public.participant_notes where body = '${body}';`);
  }
});

test('without participants.notes the card shows no notes', async ({ page }) => {
  const condition = `
    profile_id = (select id from auth.users where email = '${OTHER_EMAIL}')
    and permission_code = 'participants.notes'`;
  const had = queryDatabase(
    `select count(*) from public.team_member_permissions where ${condition};`,
  ).trim();
  queryDatabase(`delete from public.team_member_permissions where ${condition};`);
  try {
    await openCard(page, OTHER_EMAIL);
    await expect(page.getByTestId('participant-notes')).toHaveCount(0);
  } finally {
    if (had !== '0') {
      queryDatabase(`
        insert into public.team_member_permissions (profile_id, org_id, permission_code)
        select id, '5eed0000-0000-4000-8000-000000000000', 'participants.notes'
          from auth.users where email = '${OTHER_EMAIL}'
        on conflict do nothing;
      `);
    }
  }
});
