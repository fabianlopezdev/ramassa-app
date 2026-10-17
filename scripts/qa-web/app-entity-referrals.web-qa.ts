/**
 * The entity's referrals in the app (RAPP-413), through the web build: the
 * form says which fields it refuses, a referral is sent and opens with the
 * note that updates open after onboarding, the entity shares an update on a
 * referral with an account, and the list finds a referral by a search that
 * ignores accents. Expected values come from the database.
 */
import { expect, test } from '@playwright/test';
import { completeSecondFactor, ENTITY_EMAIL, queryDatabase, signInPlayer } from './session';

test.setTimeout(240_000);

const tag = Date.now().toString(36);
const lastName = `Martínez ${tag}`;
const UPDATE = `Ha trobat una habitació a Vic ${tag}.`;
const OWN_ENTITY = '5eed0000-0000-4000-8030-000000000001';

const sql = (value: string) => `'${value.replaceAll("'", "''")}'`;

test.afterAll(() => {
  queryDatabase(`
    begin;
    create temporary table qa_updates on commit drop as
      select id from public.referral_updates where public.decrypt_field(content) = ${sql(UPDATE)};
    delete from public.push_deliveries
     where publication_id in (
       select id from public.push_publications
        where content_type = 'referral_update' and content_id in (select id from qa_updates)
     );
    delete from public.push_publications
     where content_type = 'referral_update' and content_id in (select id from qa_updates);
    delete from public.referral_updates where id in (select id from qa_updates);
    delete from public.entity_referrals where referred_last_name = ${sql(lastName)};
    commit;
  `);
});

test('a referral is sent, opened, and found by search', async ({ page }) => {
  await signInPlayer(page, ENTITY_EMAIL);
  await completeSecondFactor(page, ENTITY_EMAIL);
  await page.getByTestId('entity-sidebar-referrals').click({ timeout: 30_000 });
  await page.getByTestId('entity-referral-new').click({ timeout: 30_000 });

  // The form says which fields it refuses.
  await page.getByTestId('entity-referral-save').click();
  await expect(page.getByText('Complete this field.')).toHaveCount(2);
  await page.getByTestId('entity-referral-first-name').fill('Aïcha');
  await page.getByTestId('entity-referral-last-name').fill(lastName);
  await page.getByTestId('entity-referral-email').fill('no-es-un-correu');
  await page.getByTestId('entity-referral-save').click();
  await expect(page.getByText('Enter a valid email.')).toBeVisible();
  await page.getByTestId('entity-referral-email').fill(`aicha-${tag}@example.test`);
  await page.getByTestId('entity-referral-phone').fill('+34 600 111 222');
  await page.getByTestId('entity-referral-documentation-in_progress').click();
  await page
    .getByTestId('entity-referral-notes')
    .fill('Necessita acompanyament per a la primera visita.');
  // She agreed that the entity shares her data (RAPP-303).
  await page.getByTestId('entity-referral-consent').click();
  await page.getByTestId('entity-referral-save').click();

  await expect(page.getByTestId('entity-referral')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('entity-referral-status')).toHaveText('Awaiting onboarding');
  const row = queryDatabase(`
    select id || '|' || collaborating_entity_id || '|' || documentation_status || '|' || status
      from public.entity_referrals where referred_last_name = ${sql(lastName)};
  `)
    .trim()
    .split('|');
  expect(row.slice(1)).toEqual([OWN_ENTITY, 'in_progress', 'pending']);

  await expect(page.getByTestId('entity-referral-updates-locked')).toBeVisible();
  await expect(page.getByTestId('entity-referral-update-submit')).toHaveCount(0);

  await page.getByTestId('entity-referral-back').click();
  await page.getByTestId('entity-referral-search').fill(`martinez ${tag}`);
  await expect(page.getByTestId(`entity-referral-${row[0]}`)).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('entity-referral-search').fill('zzzz-ningu');
  await expect(page.getByText('No referrals match this search.')).toBeVisible();
});

test('the entity shares an update on a referral with an account', async ({ page }) => {
  const referralId = queryDatabase(`
    select id from public.entity_referrals
     where collaborating_entity_id = '${OWN_ENTITY}' and referred_profile_id is not null
     order by created_at limit 1;
  `).trim();
  await signInPlayer(page, ENTITY_EMAIL);
  await completeSecondFactor(page, ENTITY_EMAIL);
  await page.getByTestId('entity-sidebar-referrals').click({ timeout: 30_000 });
  await page.getByTestId(`entity-referral-${referralId}`).click({ timeout: 30_000 });
  await page.getByTestId('entity-referral-update-type-housing').click();
  await page.getByTestId('entity-referral-update-content').fill(UPDATE);
  await page.getByTestId('entity-referral-update-submit').click();
  await expect(page.getByText(UPDATE)).toBeVisible({ timeout: 30_000 });
  expect(
    queryDatabase(`
      select update_type from public.referral_updates
       where referral_id = '${referralId}' and public.decrypt_field(content) = ${sql(UPDATE)};
    `).trim(),
  ).toBe('housing');
  await expect(page.getByTestId('entity-referral-update-content')).toHaveValue('');
});
