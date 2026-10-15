/**
 * The entity's Messages tab in the app (RAPP-415), through the web build: a
 * team reply shows as an unread count on the tab, opening the chat reads it
 * and clears the count, and the entity's own message reaches her one
 * conversation with the team. Expected values come from the database. Also
 * the team's thread beside the tablet sidebar, which grew without end on web
 * before its slot was bounded.
 */
import { expect, test } from '@playwright/test';
import {
  completeSecondFactor,
  ENTITY_EMAIL,
  queryDatabase,
  signInPlayer,
  STAFF_EMAIL,
} from './session';

test.setTimeout(240_000);

const tag = `rapp415-${Date.now().toString(36)}`;
const REPLY = `${tag}-team`;
const OWN = `${tag}-entity`;

const sql = (value: string) => `'${value.replaceAll("'", "''")}'`;

test.afterAll(() => {
  queryDatabase(`
    begin;
    create temporary table qa_messages on commit drop as
      select id from public.messages where content in (${sql(REPLY)}, ${sql(OWN)});
    delete from public.push_deliveries
     where publication_id in (
       select id from public.push_publications where content_id in (select id from qa_messages)
     );
    delete from public.push_publications where content_id in (select id from qa_messages);
    delete from public.conversation_read_states
     where last_read_message_id in (select id from qa_messages);
    delete from public.messages where id in (select id from qa_messages);
    commit;
  `);
});

test('a team reply is counted on the tab, read in the chat, and answered', async ({ page }) => {
  await signInPlayer(page, ENTITY_EMAIL);
  await completeSecondFactor(page, ENTITY_EMAIL);
  await expect(page.getByTestId('entity-home')).toBeVisible({ timeout: 30_000 });

  // Her one conversation with the team, made if it does not exist yet.
  const conversationId = queryDatabase(`
    insert into public.conversations (org_id, user_id)
    select org_id, id from public.profiles
     where id = (select id from auth.users where email = ${sql(ENTITY_EMAIL)})
    on conflict do nothing;
    select conversation.id from public.conversations as conversation
      join auth.users as account on account.id = conversation.user_id
     where account.email = ${sql(ENTITY_EMAIL)};
  `)
    .trim()
    .split('\n')
    .at(-1);
  expect(conversationId).toMatch(/^[0-9a-f-]{36}$/);
  queryDatabase(`
    insert into public.messages (id, org_id, conversation_id, sender_id, content)
    select gen_random_uuid(), conversation.org_id, conversation.id, staff.id, ${sql(REPLY)}
      from public.conversations as conversation, auth.users as staff
     where conversation.id = '${conversationId}' and staff.email = ${sql(STAFF_EMAIL)};
  `);

  const tab = page.getByTestId('entity-sidebar-messages');
  await expect(tab).toHaveAccessibleName(/, \d+$/, { timeout: 30_000 });
  await tab.click();
  await expect(page.getByText(REPLY)).toBeVisible({ timeout: 30_000 });
  await expect(tab).not.toHaveAccessibleName(/, \d+$/, { timeout: 30_000 });

  await page.getByTestId('message-composer').fill(OWN);
  await page.getByTestId('message-send').click();
  await expect(page.getByTestId('message-composer')).toHaveValue('');
  await expect
    .poll(
      () =>
        queryDatabase(`
          select count(*) from public.messages as message
            join auth.users as sender on sender.id = message.sender_id
           where message.conversation_id = '${conversationId}'
             and message.content = ${sql(OWN)}
             and sender.email = ${sql(ENTITY_EMAIL)};
        `).trim(),
      { timeout: 30_000 },
    )
    .toBe('1');
  await expect(page.getByText(OWN)).toBeVisible();
});

test('the team thread keeps its height beside the tablet sidebar', async ({ page }) => {
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);
  await page.getByTestId('team-sidebar-messages').click({ timeout: 30_000 });
  await page.locator('[data-testid^="staff-conversation-"]').first().click({ timeout: 30_000 });
  await expect(page.getByTestId('message-composer')).toBeVisible({ timeout: 30_000 });
  const viewport = page.viewportSize()?.height ?? 0;
  await expect
    .poll(
      () =>
        page
          .locator('html')
          .evaluate(
            (element) => (element as unknown as { readonly scrollHeight: number }).scrollHeight,
          ),
      {
        intervals: [500, 500, 500, 500],
        timeout: 3_000,
      },
    )
    .toBeLessThanOrEqual(viewport);
  const before = await page.getByTestId('message-send').boundingBox();
  await page.waitForTimeout(1_000);
  expect(await page.getByTestId('message-send').boundingBox()).toEqual(before);
});
