import { AnnouncementFeedSkeleton } from '@/components/announcements/feed-states';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { PERSON_AVATAR_SIZE, PersonAvatar } from '@/components/people/person-avatar';
import { continuousCorners } from '@/lib/continuous-corners';
import { messageListKeyboardDismissMode, staffConversationTitle } from '@/lib/message-thread-state';
import { useOwnConversation, useStaffConversation } from '@/lib/messaging';
import { usePersonCards } from '@/lib/person-cards';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import {
  MESSAGE_CONTENT_MAX_LENGTH,
  type ChatMessage,
  type MessageDeliveryState,
} from '@ramassa/shared/messaging';
import { tokens } from '@ramassa/shared/tokens';

/**
 * Where a message sits in a run: consecutive messages from the same sender on
 * the same day (RAPP-639). Like WhatsApp, iMessage and Slack group chats, a
 * run from someone else shows the sender's name above its first bubble and
 * her avatar beside its last; her own messages show neither.
 */
interface MessageRun {
  readonly isFirst: boolean;
  readonly isLast: boolean;
}

type TimelineRow =
  | { readonly kind: 'day'; readonly id: string; readonly label: string }
  | {
      readonly kind: 'message';
      readonly id: string;
      readonly message: ChatMessage;
      readonly run: MessageRun;
    };

const screenStyle = { flex: 1, backgroundColor: tokens.colors.neutral[50] } as const;
const listStyle = { flex: 1 } as const;
const listContentStyle = {
  paddingHorizontal: tokens.spacing.lg,
  paddingVertical: tokens.spacing.lg,
} as const;
const composerStyle = {
  borderTopWidth: 1,
  borderTopColor: tokens.colors.neutral[200],
} as const;
const messageBubbleWidthStyle = { maxWidth: tokens.messaging.messageBubbleMaxWidth } as const;
/** Keeps a run's bubbles in one column where no avatar is drawn. */
const avatarSlotStyle = { width: PERSON_AVATAR_SIZE.small } as const;
const timelineKeyExtractor = (row: TimelineRow) => row.id;
const timelineItemType = (row: TimelineRow) => row.kind;
const timelineVisibleContentPosition = {
  autoscrollToBottomThreshold: 0.2,
  startRenderingFromBottom: true,
} as const;

const MessageBubble = memo(function MessageBubble({
  id,
  content,
  deliveryState,
  isOwn,
  status,
  languageClass,
  accessibilityLabel,
  statusAccessibilityLabel,
  retryLabel,
  discardLabel,
  onRetry,
  onDiscard,
  senderName,
  senderAvatarKey,
  showSenderName,
  showSenderAvatar,
}: {
  readonly id: string;
  readonly content: string | null;
  readonly deliveryState: MessageDeliveryState;
  readonly isOwn: boolean;
  readonly status: string;
  readonly languageClass: string;
  readonly accessibilityLabel: string;
  readonly statusAccessibilityLabel: string;
  /** For a refused message only (RAPP-237). */
  readonly retryLabel: string;
  readonly discardLabel: string;
  readonly onRetry: (id: string) => void;
  readonly onDiscard: (id: string) => void;
  /** Someone else's message only (RAPP-639). */
  readonly senderName: string;
  readonly senderAvatarKey: string | null;
  /** Above the first bubble of her run. */
  readonly showSenderName: boolean;
  /** Beside the last bubble of her run. */
  readonly showSenderAvatar: boolean;
}) {
  const isRejected = deliveryState === 'rejected';
  const handleRetry = useCallback(() => onRetry(id), [id, onRetry]);
  const handleDiscard = useCallback(() => onDiscard(id), [id, onDiscard]);
  if (!isOwn) {
    return (
      <View className="flex-row items-end gap-sm self-start pb-sm">
        {showSenderAvatar ? (
          <PersonAvatar name={senderName} avatarKey={senderAvatarKey} size="small" />
        ) : (
          <View style={avatarSlotStyle} />
        )}
        <View style={messageBubbleWidthStyle} className="gap-xs">
          {showSenderName ? (
            <Text
              className={`ps-sm text-start text-xs font-semibold text-neutral-600 ${languageClass}`}
            >
              {senderName}
            </Text>
          ) : null}
          <View
            style={continuousCorners}
            className={`rounded-2xl bg-white px-md py-sm ${showSenderAvatar ? 'rounded-es-sm' : ''}`}
          >
            <Text
              selectable
              accessibilityLabel={accessibilityLabel}
              className={`text-neutral-900 ${languageClass}`}
            >
              {content}
            </Text>
          </View>
        </View>
      </View>
    );
  }
  return (
    <View
      style={messageBubbleWidthStyle}
      className={`gap-xs pb-sm ${isOwn ? 'self-end' : 'self-start'}`}
    >
      <View
        style={continuousCorners}
        className={`rounded-2xl px-md py-sm ${
          isOwn ? 'rounded-ee-sm bg-primary-dark' : 'rounded-es-sm bg-white'
        }`}
      >
        <Text
          selectable
          accessibilityLabel={accessibilityLabel}
          className={`${isOwn ? 'text-white' : 'text-neutral-900'} ${languageClass}`}
        >
          {content}
        </Text>
      </View>
      {isOwn ? (
        <Text
          testID={`message-sync-${deliveryState}`}
          accessibilityLabel={statusAccessibilityLabel}
          accessibilityLiveRegion="polite"
          className={`text-end text-xs ${
            isRejected ? 'font-semibold text-error' : 'text-neutral-500'
          } ${languageClass}`}
        >
          {status}
        </Text>
      ) : null}
      {isOwn && isRejected ? (
        <View className="flex-row items-center justify-end gap-sm">
          <PressableScale
            testID={`message-retry-${id}`}
            accessibilityRole="button"
            accessibilityLabel={retryLabel}
            onPress={handleRetry}
            haptic="tapLight"
            className="min-h-recommended justify-center rounded-md border border-primary px-md"
          >
            <Text className={`text-sm font-semibold text-primary-dark ${languageClass}`}>
              {retryLabel}
            </Text>
          </PressableScale>
          <PressableScale
            testID={`message-discard-${id}`}
            accessibilityRole="button"
            accessibilityLabel={discardLabel}
            onPress={handleDiscard}
            haptic="selection"
            className="min-h-recommended justify-center px-md"
          >
            <Text className={`text-sm font-medium text-neutral-700 ${languageClass}`}>
              {discardLabel}
            </Text>
          </PressableScale>
        </View>
      ) : null}
    </View>
  );
});

/** The status under one's own message; a refused one says why (RAPP-237). */
function deliveryStatusKey(message: ChatMessage) {
  if (message.deliveryState !== 'rejected') return message.deliveryState;
  return message.rejectionCode === 'AUTH-3' ? 'deliveryRejectedPermission' : 'deliveryRejected';
}

function MessageThreadEmptyState({
  title,
  body,
  languageClass,
}: {
  readonly title: string;
  readonly body: string;
  readonly languageClass: string;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-md px-xl">
      <View accessible={false} className="w-full max-w-form gap-sm px-xl">
        <View
          style={continuousCorners}
          className="h-xl w-2/3 self-start rounded-2xl rounded-es-sm border border-neutral-200 bg-white"
        />
        <View
          style={continuousCorners}
          className="h-xl w-1/2 self-end rounded-2xl rounded-ee-sm bg-primary-light"
        />
      </View>
      <Text
        accessibilityRole="header"
        className={`text-center text-lg font-semibold text-neutral-900 ${languageClass}`}
      >
        {title}
      </Text>
      <Text className={`text-center text-neutral-600 ${languageClass}`}>{body}</Text>
    </View>
  );
}

const MessageComposer = memo(function MessageComposer({
  languageClass,
  placeholder,
  sendLabel,
  send,
}: {
  readonly languageClass: string;
  readonly placeholder: string;
  readonly sendLabel: string;
  readonly send: (content: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const composerInsetStyle = useMemo(
    () => [composerStyle, { paddingBottom: Math.max(insets.bottom, tokens.spacing.sm) }],
    [insets.bottom],
  );
  const submit = useCallback(() => {
    const content = draft.trim();
    if (content.length === 0) return;
    send(content);
    setDraft('');
  }, [draft, send]);

  return (
    <View style={composerInsetStyle} className="flex-row items-end gap-sm bg-white px-lg pt-sm">
      <TextInput
        testID="message-composer"
        value={draft}
        onChangeText={setDraft}
        placeholder={Platform.OS === 'web' ? undefined : placeholder}
        placeholderTextColor={tokens.colors.neutral[600]}
        accessibilityLabel={placeholder}
        multiline
        maxLength={MESSAGE_CONTENT_MAX_LENGTH}
        textAlignVertical="top"
        style={continuousCorners}
        className={`min-h-recommended flex-1 rounded-2xl border border-neutral-300 bg-neutral-50 px-md py-sm text-neutral-900 ${languageClass}`}
      />
      <PressableScale
        testID="message-send"
        accessibilityLabel={sendLabel}
        onPress={submit}
        isDisabled={draft.trim().length === 0}
        haptic="selection"
        style={continuousCorners}
        className="min-h-recommended justify-center rounded-2xl bg-primary-dark px-lg"
      >
        <Text className={`font-semibold text-white ${languageClass}`}>{sendLabel}</Text>
      </PressableScale>
    </View>
  );
});

type MessageThreadController = ReturnType<typeof useOwnConversation>;

function MessageThreadView({
  title,
  controller,
  headerAccessory,
}: {
  readonly title: string;
  readonly controller: MessageThreadController;
  readonly headerAccessory?: ReactNode;
}) {
  const { t, i18n } = useTranslation('messaging');
  const { user } = useAuth();
  const fontClass = useLanguageFontClass();
  // The composer keeps the bottom inset clear (the home indicator, and the tab
  // bar when the thread is a tab). The keyboard covers that inset, so iOS lifts
  // the view only by the rest (RAPP-415); before, a tab left a gap the height
  // of the tab bar between the composer and the keyboard.
  const bottomInset = useSafeAreaInsets().bottom;
  const keyboardOffset =
    process.env.EXPO_OS === 'ios' ? -Math.max(bottomInset - tokens.spacing.sm, 0) : 0;
  const {
    messages,
    send,
    retryMessage,
    discardMessage,
    isOnline,
    isPending,
    isError,
    isRefetching,
    refetch,
  } = controller;
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, { dateStyle: 'medium' }),
    [i18n.resolvedLanguage],
  );
  // FlashList renders from the bottom, but it stopped short of the end (on
  // Android by a line, on iOS by half a bubble), so the newest message opened
  // behind the composer. Until she drags the list, it follows the end each
  // time the measured content grows (RAPP-433).
  const listRef = useRef<FlashListRef<TimelineRow>>(null);
  const followsNewest = useRef(true);
  const showNewest = useCallback(() => {
    if (followsNewest.current) void listRef.current?.scrollToEnd({ animated: false });
  }, []);
  const stopFollowing = useCallback(() => {
    followsNewest.current = false;
  }, []);
  const rows = useMemo(() => {
    const result: TimelineRow[] = [];
    let previousDay = '';
    messages.forEach((message, index) => {
      const day = message.createdAt.slice(0, 10);
      if (day !== previousDay) {
        result.push({
          kind: 'day',
          id: `day:${day}`,
          label: dateFormatter.format(new Date(message.createdAt)),
        });
        previousDay = day;
      }
      // A run ends at a different sender or at a new day.
      const before = messages[index - 1];
      const after = messages[index + 1];
      const sameRun = (other: ChatMessage | undefined) =>
        other !== undefined &&
        other.senderId === message.senderId &&
        other.createdAt.slice(0, 10) === day;
      result.push({
        kind: 'message',
        id: message.id,
        message,
        run: { isFirst: !sameRun(before), isLast: !sameRun(after) },
      });
    });
    return result;
  }, [dateFormatter, messages]);
  // Everyone else in the thread, looked up once (RAPP-639): a team member's
  // first name and photo. Anyone without a card keeps the thread's title.
  const otherSenderIds = useMemo(
    () => messages.filter((message) => message.senderId !== user?.id).map((m) => m.senderId),
    [messages, user?.id],
  );
  const personCards = usePersonCards(otherSenderIds);
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<TimelineRow>) => {
      if (item.kind === 'day') {
        return (
          <Text
            selectable
            accessibilityRole="header"
            className={`py-md text-center text-xs font-medium text-neutral-500 ${fontClass}`}
          >
            {item.label}
          </Text>
        );
      }
      const isOwn = item.message.senderId === user?.id;
      const card = isOwn ? undefined : personCards.get(item.message.senderId);
      const senderName = card?.firstName ?? title;
      return (
        <MessageBubble
          senderName={senderName}
          senderAvatarKey={card?.avatarKey ?? null}
          showSenderName={!isOwn && item.run.isFirst}
          showSenderAvatar={!isOwn && item.run.isLast}
          id={item.message.id}
          content={item.message.content}
          deliveryState={item.message.deliveryState}
          isOwn={isOwn}
          status={t(deliveryStatusKey(item.message))}
          retryLabel={t('retry')}
          discardLabel={t('discard')}
          onRetry={retryMessage}
          onDiscard={discardMessage}
          languageClass={fontClass}
          accessibilityLabel={t('messageFrom', {
            sender: isOwn ? t('messageSenderYou') : senderName,
            content: item.message.content,
          })}
          statusAccessibilityLabel={t('messageStatus', {
            status: t(deliveryStatusKey(item.message)),
          })}
        />
      );
    },
    [discardMessage, fontClass, retryMessage, personCards, t, title, user?.id],
  );

  if (isPending && isOnline) {
    return (
      <SafeAreaView style={screenStyle} edges={['top', 'left', 'right']}>
        <AnnouncementFeedSkeleton accessibilityLabel={t('loadingConversation')} />
      </SafeAreaView>
    );
  }
  if (isError) {
    return (
      <SafeAreaView style={screenStyle} edges={['top', 'left', 'right']}>
        <View className="flex-1 items-center justify-center gap-md px-lg">
          <Text
            selectable
            accessibilityRole="alert"
            className={`text-center text-neutral-700 ${fontClass}`}
          >
            {t('loadError')}
          </Text>
          <PressableScale
            accessibilityLabel={t('retry')}
            onPress={() => void refetch()}
            isBusy={isRefetching}
            haptic="tapLight"
            style={continuousCorners}
            className="rounded-xl bg-primary-dark px-lg py-md"
          >
            <Text className={`font-semibold text-white ${fontClass}`}>{t('retry')}</Text>
          </PressableScale>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={screenStyle} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={listStyle}
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={keyboardOffset}
      >
        <PageWidth className="flex-1">
          <View className="border-b border-neutral-200 bg-white px-lg py-md">
            <View className="flex-row items-center gap-md">
              {headerAccessory}
              <Text
                selectable
                accessibilityRole="header"
                className={`flex-1 text-xl font-semibold text-neutral-900 ${fontClass}`}
              >
                {title}
              </Text>
            </View>
            {!isOnline ? (
              <Text
                selectable
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                className={`mt-xs text-sm text-amber-800 ${fontClass}`}
              >
                {t('offline')}
              </Text>
            ) : null}
          </View>
          {rows.length === 0 ? (
            <MessageThreadEmptyState
              title={t('emptyTitle')}
              body={t('emptyBody')}
              languageClass={fontClass}
            />
          ) : (
            <FlashList
              ref={listRef}
              onLoad={showNewest}
              onContentSizeChange={showNewest}
              onScrollBeginDrag={stopFollowing}
              data={rows}
              renderItem={renderItem}
              keyExtractor={timelineKeyExtractor}
              getItemType={timelineItemType}
              keyboardDismissMode={messageListKeyboardDismissMode(process.env.EXPO_OS)}
              keyboardShouldPersistTaps="handled"
              contentInsetAdjustmentBehavior="automatic"
              contentContainerStyle={listContentStyle}
              style={listStyle}
              maintainVisibleContentPosition={timelineVisibleContentPosition}
            />
          )}
          <MessageComposer
            languageClass={fontClass}
            placeholder={t('composerPlaceholder')}
            sendLabel={t('send')}
            send={send}
          />
        </PageWidth>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function PlayerMessageThread({
  title,
  headerAccessory,
}: {
  readonly title: string;
  readonly headerAccessory?: ReactNode;
}) {
  return (
    <MessageThreadView
      title={title}
      controller={useOwnConversation()}
      headerAccessory={headerAccessory}
    />
  );
}

export function StaffMessageThread({
  conversationId,
  title,
  showBack = true,
}: {
  readonly conversationId: string;
  readonly title: string;
  /** False in the tablet split view, where the list stays beside it (RAPP-245). */
  readonly showBack?: boolean;
}) {
  const { back } = useRouter();
  const { t } = useTranslation('messaging');
  const fontClass = useLanguageFontClass();
  const controller = useStaffConversation(conversationId);
  const participantTitle = staffConversationTitle(controller.peer, title);
  const backAction = (
    <PressableScale
      testID="staff-message-back"
      accessibilityLabel={t('backToConversations')}
      onPress={back}
      haptic="tapLight"
      className="min-h-recommended justify-center px-sm"
    >
      <Text className={`font-semibold text-primary-dark ${fontClass}`}>{t('backShort')}</Text>
    </PressableScale>
  );
  return (
    <MessageThreadView
      title={participantTitle}
      controller={controller}
      headerAccessory={showBack ? backAction : undefined}
    />
  );
}
