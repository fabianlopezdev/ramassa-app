/**
 * Collaborating entities in the app (RAPP-407), through the web build: an
 * entity is added, a collaborator invited with the sign-in code by email,
 * their access removed and restored, and the entity deactivated and
 * reactivated. Expected values come from the database.
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

const ADMIN_EMAIL = 'laia.ferrer@example.test';
const tag = Date.now().toString(36);
const entityName = `Entitat app ${tag}`;
const collaboratorEmail = `app-entity-${tag}@example.test`;

const sql = (value: string) => `'${value.replaceAll("'", "''")}'`;

test.afterAll(() => {
  queryDatabase(`
    begin;
    delete from auth.refresh_tokens
     where user_id = (select id::text from auth.users where email = ${sql(collaboratorEmail)});
    delete from auth.sessions
     where user_id = (select id from auth.users where email = ${sql(collaboratorEmail)});
    delete from public.audit_log
     where target_id in (
       (select id from public.collaborating_entities where name = ${sql(entityName)}),
       (select id from auth.users where email = ${sql(collaboratorEmail)})
     );
    delete from public.entity_invitations
     where collaborating_entity_id = (select id from public.collaborating_entities where name = ${sql(entityName)});
    delete from public.profiles
     where id = (select id from auth.users where email = ${sql(collaboratorEmail)});
    delete from auth.identities
     where user_id = (select id from auth.users where email = ${sql(collaboratorEmail)});
    delete from auth.users where email = ${sql(collaboratorEmail)};
    delete from public.collaborating_entities where name = ${sql(entityName)};
    commit;
  `);
});

async function answerStepUpIfAsked(page: Page): Promise<void> {
  const prompt = page.getByTestId('step-up-code');
  if (await prompt.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await prompt.fill(totpCode(SEED_TOTP_SECRET));
    await page.getByTestId('step-up-confirm').click();
  }
}

const entityActive = () =>
  queryDatabase(
    `select is_active from public.collaborating_entities where name = ${sql(entityName)};`,
  ).trim();

test('an entity is added, a collaborator invited, removed and restored, and the entity paused', async ({
  page,
}) => {
  page.on('dialog', (dialog) => void dialog.accept());
  await signInPlayer(page, ADMIN_EMAIL);
  await completeSecondFactor(page, ADMIN_EMAIL);
  await page.getByTestId('team-sidebar-more').click({ timeout: 30_000 });
  await page.getByTestId('team-more-entities').click({ timeout: 30_000 });

  await page.getByTestId('entity-name').fill(entityName);
  await page.getByTestId('entity-add').click();
  await expect(page.getByTestId('team-entity')).toBeVisible({ timeout: 30_000 });
  expect(entityActive()).toBe('t');

  await page.getByTestId('entity-invite-first-name').fill('Pau');
  await page.getByTestId('entity-invite-last-name').fill(`Prova ${tag}`);
  await page.getByTestId('entity-invite-email').fill(collaboratorEmail);
  await page.getByTestId('entity-invite-submit').click();
  await answerStepUpIfAsked(page);
  await expect(page.getByTestId('entity-notice')).toHaveText('Invitation sent.', {
    timeout: 30_000,
  });
  const profileId = queryDatabase(
    `select id from auth.users where email = ${sql(collaboratorEmail)};`,
  ).trim();
  await expect(page.getByTestId(`collaborator-${profileId}`)).toContainText('Pending', {
    timeout: 30_000,
  });
  await expect
    .poll(
      async () => {
        const response = await fetch(`${MAILPIT_URL}/api/v1/search?query=to:${collaboratorEmail}`);
        return ((await response.json()) as { messages_count: number }).messages_count;
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);

  const isActive = () =>
    queryDatabase(`select is_active from public.profiles where id = '${profileId}';`).trim();
  await page.getByTestId(`collaborator-toggle-${profileId}`).click();
  await answerStepUpIfAsked(page);
  await expect(page.getByTestId('entity-notice')).toHaveText('Collaborator access removed.', {
    timeout: 30_000,
  });
  expect(isActive()).toBe('f');
  await page.getByTestId(`collaborator-toggle-${profileId}`).click();
  await expect(page.getByTestId('entity-notice')).toHaveText('Collaborator access restored.', {
    timeout: 30_000,
  });
  expect(isActive()).toBe('t');

  await page.getByTestId('entity-toggle-active').click();
  await expect(page.getByTestId('entity-notice')).toHaveText('Entity deactivated.', {
    timeout: 30_000,
  });
  expect(entityActive()).toBe('f');
  await expect(page.getByTestId('entity-invite-submit')).toHaveCount(0);
  await page.getByTestId('entity-toggle-active').click();
  await expect(page.getByTestId('entity-notice')).toHaveText('Entity reactivated.', {
    timeout: 30_000,
  });
  expect(entityActive()).toBe('t');
});
