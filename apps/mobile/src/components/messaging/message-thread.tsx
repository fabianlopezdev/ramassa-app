import { ErrorCodeLine } from '@/components/error-code-line';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { messageListKeyboardDismissMode, staffConversationTitle } from '@/lib/message-thread-state';
import { useOwnConversation, useStaffConversation } from '@/lib/messaging';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import {
  MESSAGE_CONTENT_MAX_LENGTH,
  type ChatMessage,
  type MessageDeliveryState,
} from '@ramassa/shared/messaging';
import { tokens } from '@ramassa/shared/tokens';

type TimelineRow =
  | { readonly kind: 'day'; readonly id: string; readonly label: string }
  | { readonly kind: 'message'; readonly id: string; readonly message: ChatMessage };

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
const busyAccessibilityState = { busy: true } as const;
const timelineKeyExtractor = (row: TimelineRow) => row.id;
const timelineItemType = (row: TimelineRow) => row.kind;
const timelineVisibleContentPosition = {
  autoscrollToBottomThreshold: 0.2,
  startRenderingFromBottom: true,
} as const;

const MessageBubble = memo(function MessageBubble({
  content,
  deliveryState,
  isOwn,
  status,
  languageClass,
  accessibilityLabel,
  statusAccessibilityLabel,
}: {
  readonly content: string | null;
  readonly deliveryState: MessageDeliveryState;
  readonly isOwn: boolean;
  readonly status: string;
  readonly languageClass: string;
  readonly accessibilityLabel: string;
  readonly statusAccessibilityLabel: string;
}) {
  return (
    <View
      style={messageBubbleWidthStyle}
      className={`gap-xs pb-sm ${isOwn ? 'self-end' : 'self-start'}`}
    >
      <View
        style={continuousCorners}
        className={`rounded-2xl px-md py-sm ${
          isOwn ? 'rounded-ee-sm bg-primary-600' : 'rounded-es-sm bg-white'
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
          className={`text-end text-xs text-neutral-500 ${languageClass}`}
        >
          {status}
        </Text>
      ) : null}
    </View>
  );
});

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
        placeholder={placeholder}
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
        className="min-h-recommended justify-center rounded-2xl bg-primary-600 px-lg"
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
  const { messages, send, isOnline, isPending, isError, errorCode, isRefetching, refetch } =
    controller;
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, { dateStyle: 'medium' }),
    [i18n.resolvedLanguage],
  );
  const rows = useMemo(() => {
    const result: TimelineRow[] = [];
    let previousDay = '';
    for (const message of messages) {
      const day = message.createdAt.slice(0, 10);
      if (day !== previousDay) {
        result.push({
          kind: 'day',
          id: `day:${day}`,
          label: dateFormatter.format(new Date(message.createdAt)),
        });
        previousDay = day;
      }
      result.push({ kind: 'message', id: message.id, message });
    }
    return result;
  }, [dateFormatter, messages]);
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
      return (
        <MessageBubble
          content={item.message.content}
          deliveryState={item.message.deliveryState}
          isOwn={isOwn}
          status={t(item.message.deliveryState)}
          languageClass={fontClass}
          accessibilityLabel={t('messageFrom', {
            sender: isOwn ? t('messageSenderYou') : title,
            content: item.message.content,
          })}
          statusAccessibilityLabel={t('messageStatus', {
            status: t(item.message.deliveryState),
          })}
        />
      );
    },
    [fontClass, t, title, user?.id],
  );

  if (isPending) {
    return (
      <SafeAreaView style={screenStyle} edges={['top', 'left', 'right']}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator
            accessibilityRole="progressbar"
            accessibilityLabel={t('loadingConversation')}
            accessibilityState={busyAccessibilityState}
          />
        </View>
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
          {errorCode === null ? null : <ErrorCodeLine code={errorCode} />}
          <PressableScale
            accessibilityLabel={t('retry')}
            onPress={() => void refetch()}
            isBusy={isRefetching}
            haptic="tapLight"
            style={continuousCorners}
            className="rounded-xl bg-primary-600 px-lg py-md"
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
              accessibilityRole="list"
              accessibilityLabel={t('messageList')}
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
}: {
  readonly conversationId: string;
  readonly title: string;
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
      headerAccessory={backAction}
    />
  );
}
