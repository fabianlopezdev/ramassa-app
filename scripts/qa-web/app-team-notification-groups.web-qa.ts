/**
 * Custom notification groups in the app (RAPP-389), through the web build: a
 * group is made from participants found by a search that ignores accents, it
 * is changed to add one more, and it then reaches exactly its members as an
 * audience. Expected values come from the database.
 */
import { expect, test, type Page } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer, STAFF_EMAIL } from './session';

test.setTimeout(240_000);

const MARIA = '5eed0000-0000-4000-8000-000000000024';
const BLANCA = '5eed0000-0000-4000-8000-000000000030';
const DANIELA = '5eed0000-0000-4000-8000-000000000027';
const name = `Grup app ${Date.now().toString(36)}`;

const sql = (value: string) => `'${value.replaceAll("'", "''")}'`;

test.afterAll(() => {
  queryDatabase(`delete from public.custom_notification_groups where name = ${sql(name)};`);
});

const members = () =>
  queryDatabase(`
    select coalesce(string_agg(member.participant_id::text, ',' order by member.participant_id), '')
      from public.custom_notification_groups as grouping
      join public.custom_notification_group_members as member on member.group_id = grouping.id
     where grouping.name = ${sql(name)};
  `).trim();

async function openNotifications(page: Page): Promise<void> {
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);
  await page.getByTestId('team-sidebar-more').click({ timeout: 30_000 });
  await page.getByTestId('team-more-notifications').click({ timeout: 30_000 });
  await expect(page.getByTestId('notification-group-new')).toBeEnabled({ timeout: 30_000 });
}

test('a group is picked by an accent-blind search, changed, and used as an audience', async ({
  page,
}) => {
  await openNotifications(page);
  await page.getByTestId('notification-group-new').click();
  await page.getByTestId('notification-group-name').fill(name);

  await page.getByTestId('notification-group-search').fill('maria');
  await expect(page.getByTestId(`notification-group-member-${MARIA}`)).toBeVisible();
  await expect(page.getByTestId(`notification-group-member-${BLANCA}`)).toHaveCount(0);
  await page.getByTestId(`notification-group-member-${MARIA}`).click();
  await page.getByTestId('notification-group-search').fill('zzzz');
  await expect(page.getByTestId('notification-group-empty')).toBeVisible();
  await page.getByTestId('notification-group-search').fill('BLANCA');
  await page.getByTestId(`notification-group-member-${BLANCA}`).click();
  await page.getByTestId('notification-group-search').fill('');
  await expect(page.getByTestId('notification-group-selected')).toHaveText('2 selected');
  await page.getByTestId('notification-group-save').click();
  await expect(page.getByTestId('notification-group-sheet')).toHaveCount(0, { timeout: 30_000 });
  expect(members()).toBe([MARIA, BLANCA].sort().join(','));

  const groupId = queryDatabase(
    `select id from public.custom_notification_groups where name = ${sql(name)};`,
  ).trim();
  await expect(page.getByTestId(`notification-group-${groupId}`)).toContainText('2 members', {
    timeout: 30_000,
  });
  await page.getByTestId(`notification-group-edit-${groupId}`).click();
  await expect(page.getByTestId('notification-group-selected')).toHaveText('2 selected');
  await page.getByTestId(`notification-group-member-${DANIELA}`).click();
  await page.getByTestId('notification-group-save').click();
  await expect.poll(members, { timeout: 30_000 }).toBe([MARIA, BLANCA, DANIELA].sort().join(','));
  await expect(page.getByTestId(`notification-group-${groupId}`)).toContainText('3 members', {
    timeout: 30_000,
  });

  await page.getByTestId('notification-audience-kind-custom_group').click();
  await page.getByTestId(`notification-audience-value-${groupId}`).click();
  await expect(page.getByTestId('notification-confirmation')).toContainText('3 recipients', {
    timeout: 30_000,
  });
});
