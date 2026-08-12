import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@ramassa/shared';
import {
  getOrCreateOwnConversation,
  sendConversationMessage,
  subscribeToConversationMessages,
} from '@ramassa/shared/messaging';
import { PARTICIPANT_FIXTURES } from '@ramassa/shared/testing';
import {
  countInDatabase,
  ENTITY_EMAIL,
  SEED_PASSWORD,
  signIn,
  STAFF_EMAIL,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from './session';

test.setTimeout(120_000);

function client() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

test('player and browser staff exchange realtime messages with unread badges', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const player = client();
  const signInResult = await player.auth.signInWithPassword({
    email: PARTICIPANT_FIXTURES[0]!.email,
    password: SEED_PASSWORD,
  });
  expect(signInResult.error).toBeNull();
  const conversation = await getOrCreateOwnConversation(player);

  await signIn(page, STAFF_EMAIL);
  await page.goto('/dashboard');
  const playerMessage = await sendConversationMessage(player, {
    id: crypto.randomUUID(),
    conversationId: conversation.id,
    content: 'rapp47-browser-realtime-player',
  });
  await expect(page.getByTestId('staff-message-badge')).toBeVisible({ timeout: 20_000 });

  await page.goto(`/messages/${conversation.id}`);
  await expect(page.getByTestId('message-thread')).toBeVisible();
  await expect(
    page.getByTestId('message-row').filter({ hasText: playerMessage.content ?? '' }),
  ).toBeVisible();
  await expect
    .poll(() =>
      countInDatabase(`
        select count(*)
        from public.conversation_read_states as state
        join auth.users as account on account.id = state.user_id
        where state.conversation_id = ${sqlLiteral(conversation.id)}
          and state.last_read_message_id = ${sqlLiteral(playerMessage.id)}
          and account.email = ${sqlLiteral(STAFF_EMAIL)}`),
    )
    .toBe(1);
  await page.goto('/messages');
  await expect(
    page
      .getByTestId(`conversation-row-${conversation.id}`)
      .getByTestId('conversation-unread-badge'),
  ).toHaveCount(0);
  await page.goto(`/messages/${conversation.id}`);
  await expect(
    page.getByTestId('message-row').filter({ hasText: playerMessage.content ?? '' }),
  ).toBeVisible();
  const beforeReply = await page.getByTestId('message-row').count();
  let resolveReply!: () => void;
  let resolveSubscribed!: () => void;
  const reply = new Promise<void>((resolve) => {
    resolveReply = resolve;
  });
  const subscribed = new Promise<void>((resolve) => {
    resolveSubscribed = resolve;
  });
  const unsubscribe = subscribeToConversationMessages(
    player,
    conversation.id,
    (message) => {
      if (message.senderId !== signInResult.data.user?.id) resolveReply();
    },
    (status) => {
      if (status === 'SUBSCRIBED') resolveSubscribed();
    },
  );
  try {
    await subscribed;
    await page.getByTestId('message-composer').fill('rapp47-browser-realtime-staff');
    await page.getByTestId('message-send').click();
    await Promise.race([
      reply,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('realtime reply timeout')), 20_000),
      ),
    ]);
    await expect(page.getByTestId('message-row')).toHaveCount(beforeReply + 1);
  } finally {
    unsubscribe();
    await player.auth.signOut();
  }
});

test('entity general chat is usable at phone and desktop web viewports', async ({ page }) => {
  await signIn(page, ENTITY_EMAIL);
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/portal/messages');
    await expect(page.getByTestId('message-thread')).toBeVisible();
    await expect(page.getByTestId('message-composer')).toBeEditable();
    await expect(page.getByTestId('message-send')).toBeDisabled();
  }
});

test('staff send failure preserves the draft and the same action retries successfully', async ({
  page,
}) => {
  const player = client();
  const signInResult = await player.auth.signInWithPassword({
    email: PARTICIPANT_FIXTURES[0]!.email,
    password: SEED_PASSWORD,
  });
  expect(signInResult.error).toBeNull();
  const conversation = await getOrCreateOwnConversation(player);
  const content = `rapp49-retry-${crypto.randomUUID()}`;

  await signIn(page, STAFF_EMAIL);
  await page.goto(`/messages/${conversation.id}`);
  await expect(page.getByTestId('message-composer')).toBeEditable();
  await page.route('**/rest/v1/rpc/send_message', (route) => route.abort('failed'));
  await page.getByTestId('message-composer').fill(content);
  await page.getByTestId('message-send').click();
  await expect(page.getByTestId('message-send-error')).toBeVisible();
  await expect(page.getByTestId('message-composer')).toHaveValue(content);
  expect(
    countInDatabase(
      `select count(*) from public.messages where conversation_id = ${sqlLiteral(conversation.id)} and content = ${sqlLiteral(content)}`,
    ),
  ).toBe(0);

  await page.unroute('**/rest/v1/rpc/send_message');
  await page.getByTestId('message-send').click();
  await expect(page.getByTestId('message-composer')).toHaveValue('');
  await expect
    .poll(() =>
      countInDatabase(
        `select count(*) from public.messages where conversation_id = ${sqlLiteral(conversation.id)} and content = ${sqlLiteral(content)}`,
      ),
    )
    .toBe(1);

  await player.auth.signOut();
});
