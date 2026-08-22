import { describe, expect, test } from 'bun:test';

const threadPath = new URL('../components/messaging/message-thread.tsx', import.meta.url);
const conversationListPath = new URL('../app/(app)/messages/index.tsx', import.meta.url);
const conversationCardPath = new URL(
  '../components/messaging/staff-conversation-card.tsx',
  import.meta.url,
);
const messagingPath = new URL('./messaging.ts', import.meta.url);
const feedStatesPath = new URL('../components/announcements/feed-states.tsx', import.meta.url);
const messagingLocales = ['ca', 'es', 'en', 'ar', 'fa'] as const;

describe('native messaging UI contract', () => {
  test('keeps every thread state inside the top and horizontal safe areas', async () => {
    const source = await Bun.file(threadPath).text();

    expect(source).toContain("edges={['top', 'left', 'right']}");
    expect(source.match(/<SafeAreaView/g)).toHaveLength(3);
  });

  test('uses logical bubble corners and a shared width token for RTL layouts', async () => {
    const source = await Bun.file(threadPath).text();

    expect(source).toContain('rounded-ee-sm');
    expect(source).toContain('rounded-es-sm');
    expect(source).not.toContain('rounded-br-sm');
    expect(source).not.toContain('rounded-bl-sm');
    expect(source).toContain('tokens.messaging.messageBubbleMaxWidth');
    expect(source).not.toContain('max-w-[84%]');
  });

  test('caps staff badges and announces the real unread count', async () => {
    const source = await Bun.file(conversationListPath).text();

    expect(source).toContain('formatUnreadBadge(item.unreadCount)');
    expect(source).toContain("t('unread', { count: item.unreadCount })");
  });

  test('announces who sent every message in every supported language', async () => {
    const source = await Bun.file(threadPath).text();

    expect(source).toContain("t('messageFrom'");
    expect(source).toContain("t('messageSenderYou')");
    expect(source).toContain('accessibilityLabel={accessibilityLabel}');

    for (const locale of messagingLocales) {
      const messages = await Bun.file(
        new URL(
          `../../../../packages/shared/i18n/locales/${locale}/messaging.json`,
          import.meta.url,
        ),
      ).json();
      expect(messages.messageFrom).toContain('{{sender}}');
      expect(messages.messageFrom).toContain('{{content}}');
      expect(messages.messageSenderYou.length).toBeGreaterThan(0);
    }
  });

  test('announces thread loading, errors, offline state, dates, and delivery status semantically', async () => {
    const [source, sharedStateSource] = await Promise.all([
      Bun.file(threadPath).text(),
      Bun.file(feedStatesPath).text(),
    ]);

    expect(sharedStateSource).toContain('accessibilityRole="progressbar"');
    expect(sharedStateSource).toContain('accessibilityState={busyAccessibilityState}');
    expect(source).toContain('accessibilityRole="alert"');
    expect(source).toContain('<ErrorCodeLine code={errorCode} />');
    expect(source).toContain("t('messageStatus'");
    expect(source).toContain('status: t(item.message.deliveryState)');
    expect(source).toContain('accessibilityLabel={statusAccessibilityLabel}');
    expect(source).toContain('accessibilityRole="header"');
  });

  test('gives staff rows complete translated context and every back action a recommended touch target', async () => {
    const [threadSource, conversationListSource] = await Promise.all([
      Bun.file(threadPath).text(),
      Bun.file(conversationListPath).text(),
    ]);

    expect(conversationListSource).toContain("t('conversationRowLabel'");
    expect(conversationListSource).toContain('role: participantRole');
    expect(conversationListSource).toContain('preview: messagePreview');
    expect(conversationListSource).toContain('className="min-h-recommended self-start');
    expect(threadSource).toContain('className="min-h-recommended justify-center');
    expect(conversationListSource).not.toContain('min-h-min');
    expect(threadSource).not.toContain('min-h-min');
  });

  test('localizes row summaries, delivery status, and singular unread counts in every language', async () => {
    for (const locale of messagingLocales) {
      const messages = await Bun.file(
        new URL(
          `../../../../packages/shared/i18n/locales/${locale}/messaging.json`,
          import.meta.url,
        ),
      ).json();

      expect(messages.conversationRowLabel).toContain('{{name}}');
      expect(messages.conversationRowLabel).toContain('{{role}}');
      expect(messages.conversationRowLabel).toContain('{{preview}}');
      expect(messages.messageStatus).toContain('{{status}}');
      expect(messages.unread_one).toContain('{{count}}');
      expect(messages.unread_other).toContain('{{count}}');
    }
  });

  test('announces and blocks every messaging retry while its refetch is in flight', async () => {
    const [threadSource, conversationListSource, messagingSource, feedStatesSource] =
      await Promise.all([
        Bun.file(threadPath).text(),
        Bun.file(conversationListPath).text(),
        Bun.file(messagingPath).text(),
        Bun.file(feedStatesPath).text(),
      ]);

    expect(messagingSource).toContain('isRefetching:');
    expect(threadSource).toContain('isBusy={isRefetching}');
    expect(conversationListSource).toContain('isLoading={isFetching}');
    expect(feedStatesSource).toContain('isLoading={isLoading}');
  });

  test('defers read receipt sync until connectivity is explicit and retries on reconnect', async () => {
    const source = await Bun.file(messagingPath).text();
    const readSync = source.slice(source.indexOf('const latestId'), source.indexOf('const send ='));

    expect(readSync).toContain('if (!canDrainOutbox');
    expect(readSync).toContain('[canDrainOutbox, conversationId, latestId');
  });

  test('keeps composer updates isolated from the virtualized message timeline', async () => {
    const source = await Bun.file(threadPath).text();

    expect(source).toContain('const MessageComposer = memo');
    expect(source).toContain('const timelineKeyExtractor =');
    expect(source).toContain('const timelineItemType =');
    expect(source).toContain('const timelineVisibleContentPosition =');
    expect(source).toContain('keyExtractor={timelineKeyExtractor}');
    expect(source).toContain('getItemType={timelineItemType}');
    expect(source).toContain('maintainVisibleContentPosition={timelineVisibleContentPosition}');
    expect(source).not.toContain('keyExtractor={(item) => item.id}');
    expect(source).not.toContain('getItemType={(item) => item.kind}');
  });

  test('memoizes staff conversation rows with a stable root callback', async () => {
    const [source, cardSource] = await Promise.all([
      Bun.file(conversationListPath).text(),
      Bun.file(conversationCardPath).text(),
    ]);

    expect(source).toContain("from '@/components/messaging/staff-conversation-card'");
    expect(cardSource).toContain('export const StaffConversationCard = memo');
    expect(source).toContain('onOpen={open}');
    expect(source).not.toContain('onPress={() => open(item.conversationId)}');
  });

  test('guides an empty staff queue without impossible filter instructions', async () => {
    const source = await Bun.file(conversationListPath).text();

    expect(source).toContain("title={t('noStaffConversationsTitle')}");
    expect(source).toContain("body={t('noStaffConversationsBody')}");
    expect(source).not.toContain("body={t('noConversationsBody')}");

    for (const locale of messagingLocales) {
      const messages = await Bun.file(
        new URL(
          `../../../../packages/shared/i18n/locales/${locale}/messaging.json`,
          import.meta.url,
        ),
      ).json();
      expect(messages.noStaffConversationsTitle.length).toBeGreaterThan(0);
      expect(messages.noStaffConversationsBody.length).toBeGreaterThan(0);
    }
  });

  test('gives the empty thread a visual conversation cue and the composer recommended targets', async () => {
    const source = await Bun.file(threadPath).text();

    expect(source).toContain('function MessageThreadEmptyState');
    expect(source).toContain('<MessageThreadEmptyState');
    expect(source).toContain('accessible={false}');
    expect(source).toContain('className={`min-h-recommended flex-1');
    expect(source).toContain('className="min-h-recommended justify-center rounded-2xl');
    expect(source).not.toContain('className={`min-h-12 flex-1');
    expect(source).not.toContain('className="min-h-12 justify-center');
  });
});
