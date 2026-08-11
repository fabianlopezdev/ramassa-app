import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { useStaffConversationList } from '@/lib/messaging';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { toAppError } from '@ramassa/shared/errors';
import type { StaffConversationRow } from '@ramassa/shared/messaging';
import { tokens } from '@ramassa/shared/tokens';

const EMPTY_CONVERSATIONS: readonly StaffConversationRow[] = [];
const listContentStyle = {
  paddingHorizontal: tokens.spacing.lg,
  paddingBottom: tokens.spacing['3xl'],
} as const;
const keyExtractor = (row: StaffConversationRow) => row.conversationId;

export default function StaffConversationsScreen() {
  const { t } = useTranslation('messaging');
  const fontClass = useLanguageFontClass();
  const { back, push } = useRouter();
  const { data, isPending, isError, error, refetch } = useStaffConversationList();
  const open = useCallback(
    (conversationId: string) => push(`/messages/${conversationId}` as Href),
    [push],
  );
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<StaffConversationRow>) => (
      <PressableScale
        testID={`staff-conversation-${item.conversationId}`}
        accessibilityLabel={t('openConversation', {
          name: `${item.participantFirstName} ${item.participantLastName}`,
        })}
        onPress={() => open(item.conversationId)}
        haptic="selection"
        className="rounded-2xl border border-neutral-200 bg-white p-lg"
      >
        <View className="flex-row items-start justify-between gap-md">
          <View className="flex-1 gap-xs">
            <Text className={`text-lg font-semibold text-neutral-900 ${fontClass}`}>
              {`${item.participantFirstName} ${item.participantLastName}`}
            </Text>
            <Text className={`text-sm text-neutral-600 ${fontClass}`}>
              {t(item.participantRole === 'player' ? 'participantPlayer' : 'participantEntity')}
            </Text>
            <Text className={`text-sm text-neutral-600 ${fontClass}`} numberOfLines={1}>
              {item.latestMessagePreview ?? t('noMessagePreview')}
            </Text>
          </View>
          {item.unreadCount > 0 ? (
            <View className="min-h-8 min-w-8 items-center justify-center rounded-full bg-primary-600 px-sm">
              <Text className={`font-bold text-white ${fontClass}`}>{item.unreadCount}</Text>
            </View>
          ) : null}
        </View>
      </PressableScale>
    ),
    [fontClass, open, t],
  );

  if (isPending) return <AnnouncementFeedSkeleton accessibilityLabel={t('sending')} />;
  if (isError) {
    return (
      <AnnouncementFeedError
        message={t('loadError')}
        retryLabel={t('retry')}
        code={toAppError(error).code}
        languageFontClass={fontClass}
        onRetry={() => void refetch()}
      />
    );
  }
  const conversations = data ?? EMPTY_CONVERSATIONS;
  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right']}>
      <PageWidth className="flex-1">
        <View className="gap-sm px-lg pb-md pt-lg">
          <PressableScale
            testID="staff-conversations-back"
            accessibilityLabel={t('backToAttendance')}
            onPress={back}
            haptic="tapLight"
            className="min-h-min self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>{t('backShort')}</Text>
          </PressableScale>
          <Text
            accessibilityRole="header"
            className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
          >
            {t('managementTitle')}
          </Text>
          <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
            {t('staffMobileIntro')}
          </Text>
        </View>
        {conversations.length === 0 ? (
          <AnnouncementEmptyState
            title={t('noConversationsTitle')}
            body={t('noConversationsBody')}
            languageFontClass={fontClass}
          />
        ) : (
          <FlashList
            accessibilityRole="list"
            accessibilityLabel={t('managementTitle')}
            data={conversations}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={listContentStyle}
            ItemSeparatorComponent={ConversationSeparator}
          />
        )}
      </PageWidth>
    </SafeAreaView>
  );
}

function ConversationSeparator() {
  return <View className="h-md" />;
}
