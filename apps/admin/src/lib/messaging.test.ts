import { describe, expect, test } from 'bun:test';
import { AppError } from '@ramassa/shared/errors';
import { attemptWebMessageSend, isCurrentWebConversationRequest } from './messaging';

const webMessageThreadPath = new URL(
  '../components/messaging/web-message-thread.tsx',
  import.meta.url,
);
const messagingHookPath = new URL('./messaging.ts', import.meta.url);

const optimistic = {
  id: 'a4900000-0000-4000-8000-000000000001',
  conversationId: 'a4900000-0000-4000-8000-000000000002',
  senderId: 'a4900000-0000-4000-8000-000000000003',
  content: 'Please keep this draft',
  imageUrl: null,
  createdAt: '2026-08-11T16:30:00.000Z',
  deliveryState: 'sending' as const,
};

describe('admin message send recovery', () => {
  test('returns the delivered server row on success', async () => {
    const delivered = { ...optimistic, deliveryState: 'delivered' as const };

    await expect(attemptWebMessageSend(optimistic, async () => delivered)).resolves.toEqual({
      status: 'delivered',
      message: delivered,
    });
  });

  test('reports failure without inventing a retrying delivery state', async () => {
    await expect(
      attemptWebMessageSend(optimistic, async () => {
        throw new AppError('NETWORK-1');
      }),
    ).resolves.toEqual({ status: 'failed', errorCode: 'NETWORK-1' });
  });

  test('ignores stale or aborted conversation-load completions', () => {
    const active = new AbortController();
    const aborted = new AbortController();
    aborted.abort();

    expect(isCurrentWebConversationRequest(2, 2, active.signal)).toBe(true);
    expect(isCurrentWebConversationRequest(1, 2, active.signal)).toBe(false);
    expect(isCurrentWebConversationRequest(2, 2, aborted.signal)).toBe(false);
  });
});

describe('admin message thread UI contract', () => {
  test('uses logical bubble tails and the shared responsive width token', async () => {
    const source = await Bun.file(webMessageThreadPath).text();

    expect(source).toContain('rounded-ee-sm');
    expect(source).toContain('rounded-es-sm');
    expect(source).toContain('max-w-[var(--ramassa-messaging-message-bubble-max-width)]');
    expect(source).not.toContain('rounded-br-sm');
    expect(source).not.toContain('rounded-bl-sm');
    expect(source).not.toContain('max-w-[82%]');
  });

  test('retries read receipt sync when the realtime channel reconnects', async () => {
    const source = await Bun.file(messagingHookPath).text();

    expect(source).toContain('setReadSyncEpoch');
    expect(source).toMatch(/\[latestId, loadedConversationId, readSyncEpoch\]/);
  });

  test('announces conversation loading without implying that a message is sending', async () => {
    const source = await Bun.file(webMessageThreadPath).text();
    const loadingState = source.slice(
      source.indexOf("state === 'loading'"),
      source.indexOf("state === 'error'"),
    );

    expect(loadingState).toContain("t('loadingConversation')");
    expect(loadingState).not.toContain("t('sending')");
  });

  test('shows stable support codes for conversation load and send failures', async () => {
    const [threadSource, hookSource] = await Promise.all([
      Bun.file(webMessageThreadPath).text(),
      Bun.file(messagingHookPath).text(),
    ]);

    expect(threadSource).toContain('sendErrorCode');
    expect(threadSource).toContain('loadErrorCode');
    expect(threadSource).toContain("tErrors('errorCodeLabel')");
    expect(hookSource).toContain('toAppError(error).code');
  });
});
