import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@ramassa/shared';
import {
  getOrCreateOwnConversation,
  sendConversationMessage,
  subscribeToConversationMessages,
  type Conversation,
} from '@ramassa/shared/messaging';
import { PARTICIPANT_FIXTURES } from '@ramassa/shared/testing';
import {
  countInDatabase,
  queryDatabase,
  SEED_PASSWORD,
  signIn,
  signOut,
  STAFF_EMAIL,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from './session';

test.setTimeout(120_000);
test.describe.configure({ mode: 'serial' });

const amina = PARTICIPANT_FIXTURES.find((fixture) => fixture.email.startsWith('amina.'))!;
const oksana = PARTICIPANT_FIXTURES.find((fixture) => fixture.email.startsWith('oksana.'))!;
const maria = PARTICIPANT_FIXTURES.find((fixture) => fixture.email.startsWith('maria.'))!;

function client(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function ownConversation(email: string): Promise<Conversation> {
  const participant = client();
  const signedIn = await participant.auth.signInWithPassword({ email, password: SEED_PASSWORD });
  expect(signedIn.error).toBeNull();
  try {
    return await getOrCreateOwnConversation(participant);
  } finally {
    await participant.auth.signOut();
  }
}

async function waitForSearch(
  page: import('@playwright/test').Page,
  expected: string,
): Promise<void> {
  await expect
    .poll(() => new URL(page.url()).searchParams.get('q') ?? '', { timeout: 10_000 })
    .toBe(expected);
}

async function fillSearch(page: import('@playwright/test').Page, value: string): Promise<void> {
  await page.getByTestId('conversation-search').fill(value);
  await waitForSearch(page, value.trim());
}

async function setBooleanFilter(
  page: import('@playwright/test').Page,
  testId: string,
  parameter: 'unread' | 'assigned',
  checked: boolean,
): Promise<void> {
  await page.getByTestId(testId).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get(parameter), { timeout: 10_000 })
    .toBe(String(checked));
  if (checked) await expect(page.getByTestId(testId)).toBeChecked();
  else await expect(page.getByTestId(testId)).not.toBeChecked();
}

test.beforeAll(async () => {
  await Promise.all([ownConversation(oksana.email), ownConversation(maria.email)]);
});

test('staff list is unread first and its human filters match the database', async ({ page }) => {
  const participant = client();
  const signedIn = await participant.auth.signInWithPassword({
    email: oksana.email,
    password: SEED_PASSWORD,
  });
  expect(signedIn.error).toBeNull();
  const conversation = await getOrCreateOwnConversation(participant);
  const unreadMessageId = crypto.randomUUID();
  await sendConversationMessage(participant, {
    id: unreadMessageId,
    conversationId: conversation.id,
    content: 'rapp48-unread-order',
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, STAFF_EMAIL);
  await page.goto('/messages');

  const expectedTotal = countInDatabase('select count(*) from public.conversations');
  await expect(page.locator('[data-conversation-row="true"]')).toHaveCount(expectedTotal);
  const expectedFirstName = queryDatabase(
    `select concat_ws(' ', profile.first_name, profile.last_name)
     from public.messages as message
     join public.conversations as conversation on conversation.id = message.conversation_id
     join public.profiles as profile on profile.id = conversation.user_id
     where message.id = ${sqlLiteral(unreadMessageId)}`,
  );
  await expect(page.locator('[data-conversation-row="true"]').first()).toContainText(
    expectedFirstName,
  );
  await expect(
    page.locator('[data-conversation-row="true"]').first().getByTestId('conversation-unread-badge'),
  ).toBeVisible();

  await setBooleanFilter(page, 'conversation-filter-unread', 'unread', true);
  const staffId = queryDatabase(
    `select id from auth.users where email = ${sqlLiteral(STAFF_EMAIL)}`,
  );
  const expectedUnread = countInDatabase(`
    select count(*)
    from public.conversations as conversation
    where exists (
      select 1
      from public.messages as message
      left join public.conversation_read_states as state
        on state.conversation_id = conversation.id and state.user_id = ${sqlLiteral(staffId)}
      left join public.messages as read_message on read_message.id = state.last_read_message_id
      where message.conversation_id = conversation.id
        and message.sender_id <> ${sqlLiteral(staffId)}
        and (
          read_message.id is null
          or (message.created_at, message.id) > (read_message.created_at, read_message.id)
        )
    )`);
  await expect(page.locator('[data-conversation-row="true"]')).toHaveCount(expectedUnread);
  await setBooleanFilter(page, 'conversation-filter-unread', 'unread', false);

  await setBooleanFilter(page, 'conversation-filter-assigned', 'assigned', true);
  const expectedAssigned = countInDatabase(
    `select count(*) from public.conversations where assigned_staff_id = ${sqlLiteral(staffId)}`,
  );
  await expect(page.locator('[data-conversation-row="true"]')).toHaveCount(expectedAssigned);
  await setBooleanFilter(page, 'conversation-filter-assigned', 'assigned', false);

  await page.getByTestId('conversation-filter-participant').selectOption('entity');
  const expectedEntities = countInDatabase(`
    select count(*)
    from public.conversations as conversation
    join public.profiles as profile on profile.id = conversation.user_id
    where profile.role = 'entity'`);
  await expect(page.locator('[data-conversation-row="true"]')).toHaveCount(expectedEntities);
  await page.getByTestId('conversation-filter-participant').selectOption('all');

  for (const example of [
    { typed: 'Silv', databasePattern: 'Síl%', expectedEmail: 'silvia.bosch@example.test' },
    { typed: 'أمي', databasePattern: 'أمي%', expectedEmail: amina.email },
    { typed: 'Окс', databasePattern: 'Окс%', expectedEmail: oksana.email },
    { typed: 'María Fer', databasePattern: 'María Fer%', expectedEmail: maria.email },
  ]) {
    const expectedName = queryDatabase(`
      select concat_ws(' ', profile.first_name, profile.last_name)
      from public.profiles as profile
      join auth.users as account on account.id = profile.id
      join public.conversations as conversation on conversation.user_id = profile.id
      where account.email = ${sqlLiteral(example.expectedEmail)}
        and profile.first_name ilike ${sqlLiteral(example.databasePattern)}`);
    expect(expectedName).not.toBe('');
    await fillSearch(page, example.typed);
    await expect(page.locator('[data-conversation-row="true"]')).toHaveCount(1);
    await expect(page.locator('[data-conversation-row="true"]').first()).toContainText(
      expectedName,
    );
  }

  await fillSearch(page, 'name-that-does-not-exist');
  await expect(page.getByTestId('conversation-list-empty')).toBeVisible();
  await fillSearch(page, "'; DROP TABLE conversations; --");
  await expect(page.getByTestId('conversation-list-empty')).toBeVisible();
  expect(queryDatabase("select to_regclass('public.conversations')")).toBe('conversations');

  await fillSearch(page, 'أمي');
  await page.getByTestId('conversation-filter-participant').selectOption('player');
  const expectedName = queryDatabase(`
    select concat_ws(' ', profile.first_name, profile.last_name)
    from public.profiles as profile
    join auth.users as account on account.id = profile.id
    where account.email = ${sqlLiteral(amina.email)}`);
  await page.locator('[data-conversation-row="true"]').click();
  await page.reload();
  await expect(page.getByTestId('conversation-search')).toHaveValue('أمي');
  await expect(page.getByTestId('conversation-filter-participant')).toHaveValue('player');
  await page.goBack();
  await expect(page.getByTestId('conversation-search')).toHaveValue('أمي');
  await expect(page.locator('[data-conversation-row="true"]')).toContainText(expectedName);

  await participant.auth.signOut();
});

test('assignment, reply, push receipt and participant timeline complete one staff flow', async ({
  page,
}) => {
  const player = client();
  const signedIn = await player.auth.signInWithPassword({
    email: amina.email,
    password: SEED_PASSWORD,
  });
  expect(signedIn.error).toBeNull();
  const conversation = await getOrCreateOwnConversation(player);
  const historyBefore = countInDatabase(
    `select count(*) from public.conversation_assignment_history where conversation_id = ${sqlLiteral(conversation.id)}`,
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, STAFF_EMAIL);
  await page.goto(`/messages/${conversation.id}`);
  await expect(page.getByTestId('conversation-context')).toContainText(
    queryDatabase(`select city from public.profiles where id = ${sqlLiteral(conversation.userId)}`),
  );

  await page.getByTestId('conversation-assignment').selectOption({ label: 'Unassigned' });
  await expect
    .poll(() =>
      queryDatabase(
        `select coalesce(assigned_staff_id::text, '') from public.conversations where id = ${sqlLiteral(conversation.id)}`,
      ),
    )
    .toBe('');
  await page.getByTestId('conversation-assignment').selectOption({ label: 'Marta Puig' });
  const martaId = queryDatabase(
    `select id from auth.users where email = ${sqlLiteral(STAFF_EMAIL)}`,
  );
  await expect
    .poll(() =>
      queryDatabase(
        `select coalesce(assigned_staff_id::text, '') from public.conversations where id = ${sqlLiteral(conversation.id)}`,
      ),
    )
    .toBe(martaId);
  await expect(page.getByTestId('assignment-history').locator('li')).toHaveCount(historyBefore + 2);
  expect(
    countInDatabase(
      `select count(*) from public.conversation_assignment_history
       where conversation_id = ${sqlLiteral(conversation.id)}
         and changed_by = ${sqlLiteral(martaId)}`,
    ),
  ).toBeGreaterThanOrEqual(2);

  await page.goto('/messages?assigned=true');
  await expect(page.getByTestId(`conversation-row-${conversation.id}`)).toBeVisible();
  await page.getByTestId(`conversation-row-${conversation.id}`).click();

  const pushTokenId = crypto.randomUUID();
  queryDatabase(`
    insert into public.push_tokens (id, user_id, token, platform, device_id)
    values (
      ${sqlLiteral(pushTokenId)},
      ${sqlLiteral(conversation.userId)},
      ${sqlLiteral(`ExponentPushToken[rapp48-${pushTokenId}]`)},
      'android',
      ${sqlLiteral(`rapp48-${pushTokenId}`)}
    )`);
  expect(
    countInDatabase(
      `select count(*) from public.push_tokens where id = ${sqlLiteral(pushTokenId)} and user_id = ${sqlLiteral(conversation.userId)}`,
    ),
  ).toBe(1);

  const replyContent = `rapp48-staff-reply-${crypto.randomUUID()}`;
  let resolveReply!: () => void;
  let resolveSubscribed!: () => void;
  const replyArrived = new Promise<void>((resolve) => {
    resolveReply = resolve;
  });
  const subscribed = new Promise<void>((resolve) => {
    resolveSubscribed = resolve;
  });
  const unsubscribe = subscribeToConversationMessages(
    player,
    conversation.id,
    (message) => {
      if (message.senderId === martaId && message.content === replyContent) resolveReply();
    },
    (status) => {
      if (status === 'SUBSCRIBED') resolveSubscribed();
    },
  );
  try {
    await subscribed;
    await page.getByTestId('message-composer').fill(replyContent);
    await page.getByTestId('message-send').click();
    await Promise.race([
      replyArrived,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('player realtime reply timeout')), 20_000),
      ),
    ]);
  } finally {
    unsubscribe();
  }

  const messageId = queryDatabase(
    `select id from public.messages where conversation_id = ${sqlLiteral(conversation.id)} and content = ${sqlLiteral(replyContent)}`,
  );
  expect(messageId).not.toBe('');
  await expect
    .poll(() =>
      countInDatabase(
        `select count(*) from public.push_publications where content_type = 'message' and content_id = ${sqlLiteral(messageId)}`,
      ),
    )
    .toBe(1);
  await expect
    .poll(() =>
      countInDatabase(`
      select count(*)
      from public.push_deliveries as delivery
      join public.push_publications as publication on publication.id = delivery.publication_id
      where publication.content_id = ${sqlLiteral(messageId)}
        and delivery.recipient_id = ${sqlLiteral(conversation.userId)}`),
    )
    .toBeGreaterThanOrEqual(1);

  await page.getByTestId('conversation-participant-link').click();
  await expect(page.getByTestId(`participant-activity-message-${messageId}`)).toBeVisible();
  await player.auth.signOut();
});

test('conversation management works at a phone viewport and denies a player in the product', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, STAFF_EMAIL);
  await page.goto('/messages');
  await expect(page.getByTestId('conversation-list')).toBeVisible();
  const firstConversation = queryDatabase(
    `select id from public.conversations order by created_at desc, id limit 1`,
  );
  await page.goto(`/messages/${firstConversation}`);
  await expect(page.getByTestId('message-thread')).toBeVisible();
  await expect(page.getByTestId('message-composer')).toBeEditable();
  await expect(page.getByTestId('conversation-context')).toBeVisible();

  await signOut(page);
  await page.goto('/login');
  const usePassword = page.getByRole('button', { name: /contrasenya|password/i }).first();
  await expect(async () => {
    await usePassword.click();
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await page.locator('input[type="email"]').fill(amina.email);
  await page.locator('input[type="password"]').fill(SEED_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText('AUTH-3', { exact: false })).toBeVisible();
  await page.goto('/messages');
  await expect(page.getByText('AUTH-3', { exact: false })).toBeVisible();
  await expect(page.getByTestId('conversation-list')).toHaveCount(0);
});
