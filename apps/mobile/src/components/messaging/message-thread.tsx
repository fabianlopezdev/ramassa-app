import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { useOwnConversation, useStaffConversation } from '@/lib/messaging';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import type { ChatMessage } from '@ramassa/shared/messaging';
import { tokens } from '@ramassa/shared/tokens';

type TimelineRow =
  | { readonly kind: 'day'; readonly id: string; readonly label: string }
  | { readonly kind: 'message'; readonly id: string; readonly message: ChatMessage };

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.neutral[50] },
  list: { flex: 1 },
  listContent: { paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.lg },
  composer: { borderTopWidth: 1, borderTopColor: tokens.colors.neutral[200] },
});

const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  status,
  languageClass,
}: {
  readonly message: ChatMessage;
  readonly isOwn: boolean;
  readonly status: string;
  readonly languageClass: string;
}) {
  return (
    <View className={`mb-sm max-w-[84%] ${isOwn ? 'self-end' : 'self-start'}`}>
      <View
        className={`rounded-2xl px-md py-sm ${
          isOwn ? 'rounded-br-sm bg-primary-600' : 'rounded-bl-sm bg-white'
        }`}
      >
        <Text className={`${isOwn ? 'text-white' : 'text-neutral-900'} ${languageClass}`}>
          {message.content}
        </Text>
      </View>
      {isOwn ? (
        <Text
          testID={`message-sync-${message.deliveryState}`}
          className={`mt-xs text-end text-xs text-neutral-500 ${languageClass}`}
        >
          {status}
        </Text>
      ) : null}
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
  const insets = useSafeAreaInsets();
  const { messages, send, isOnline, isPending, isError, refetch } = controller;
  const [draft, setDraft] = useState('');
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca', { dateStyle: 'medium' }),
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
  const submit = useCallback(() => {
    const content = draft.trim();
    if (content.length === 0) return;
    send(content);
    setDraft('');
  }, [draft, send]);
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<TimelineRow>) => {
      if (item.kind === 'day') {
        return (
          <Text className={`py-md text-center text-xs font-medium text-neutral-500 ${fontClass}`}>
            {item.label}
          </Text>
        );
      }
      return (
        <MessageBubble
          message={item.message}
          isOwn={item.message.senderId === user?.id}
          status={t(item.message.deliveryState)}
          languageClass={fontClass}
        />
      );
    },
    [fontClass, t, user?.id],
  );

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50">
        <ActivityIndicator accessibilityLabel={title} />
      </View>
    );
  }
  if (isError) {
    return (
      <View className="flex-1 items-center justify-center gap-md bg-neutral-50 px-lg">
        <Text className={`text-center text-neutral-700 ${fontClass}`}>{t('loadError')}</Text>
        <PressableScale
          accessibilityLabel={t('retry')}
          onPress={() => void refetch()}
          className="rounded-xl bg-primary-600 px-lg py-md"
        >
          <Text className={`font-semibold text-white ${fontClass}`}>{t('retry')}</Text>
        </PressableScale>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <PageWidth className="flex-1">
        <View className="border-b border-neutral-200 bg-white px-lg py-md">
          <View className="flex-row items-center gap-md">
            {headerAccessory}
            <Text
              accessibilityRole="header"
              className={`flex-1 text-xl font-semibold text-neutral-900 ${fontClass}`}
            >
              {title}
            </Text>
          </View>
          {!isOnline ? (
            <Text className={`mt-xs text-sm text-amber-800 ${fontClass}`}>{t('offline')}</Text>
          ) : null}
        </View>
        {rows.length === 0 ? (
          <View className="flex-1 items-center justify-center gap-sm px-xl">
            <Text className={`text-lg font-semibold text-neutral-900 ${fontClass}`}>
              {t('emptyTitle')}
            </Text>
            <Text className={`text-center text-neutral-600 ${fontClass}`}>{t('emptyBody')}</Text>
          </View>
        ) : (
          <FlashList
            data={rows}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            getItemType={(item) => item.kind}
            contentContainerStyle={styles.listContent}
            style={styles.list}
            maintainVisibleContentPosition={{
              autoscrollToBottomThreshold: 0.2,
              startRenderingFromBottom: true,
            }}
          />
        )}
        <View
          style={[styles.composer, { paddingBottom: Math.max(insets.bottom, tokens.spacing.sm) }]}
          className="flex-row items-end gap-sm bg-white px-lg pt-sm"
        >
          <TextInput
            testID="message-composer"
            value={draft}
            onChangeText={setDraft}
            placeholder={t('composerPlaceholder')}
            accessibilityLabel={t('composerPlaceholder')}
            multiline
            maxLength={4_000}
            textAlignVertical="top"
            className={`min-h-12 flex-1 rounded-2xl border border-neutral-300 bg-neutral-50 px-md py-sm text-neutral-900 ${fontClass}`}
          />
          <PressableScale
            testID="message-send"
            accessibilityLabel={t('send')}
            onPress={submit}
            isDisabled={draft.trim().length === 0}
            haptic="selection"
            className="min-h-12 justify-center rounded-2xl bg-primary-600 px-lg"
          >
            <Text className={`font-semibold text-white ${fontClass}`}>{t('send')}</Text>
          </PressableScale>
        </View>
      </PageWidth>
    </KeyboardAvoidingView>
  );
}

export function PlayerMessageThread({ title }: { readonly title: string }) {
  return <MessageThreadView title={title} controller={useOwnConversation()} />;
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
  const backAction = (
    <PressableScale
      testID="staff-message-back"
      accessibilityLabel={t('backToConversations')}
      onPress={back}
      haptic="tapLight"
      className="min-h-min justify-center px-sm"
    >
      <Text className={`font-semibold text-primary-dark ${fontClass}`}>{t('backShort')}</Text>
    </PressableScale>
  );
  return <MessageThreadView title={title} controller={controller} headerAccessory={backAction} />;
}
