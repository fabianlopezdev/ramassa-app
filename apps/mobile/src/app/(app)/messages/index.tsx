import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { PageWidth } from '@/components/layout/content-width';
import { StaffConversationCard } from '@/components/messaging/staff-conversation-card';
import { PressableScale } from '@/components/motion/pressable-scale';
import { useStaffConversationList } from '@/lib/messaging';
import { formatUnreadBadge } from '@/lib/unread-badge';
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
  gap: tokens.spacing.md,
} as const;
const keyExtractor = (row: StaffConversationRow) => row.conversationId;

export default function StaffConversationsScreen() {
  const { t } = useTranslation('messaging');
  const fontClass = useLanguageFontClass();
  const { back, push } = useRouter();
  const { data, isPending, isError, isFetching, error, refetch } = useStaffConversationList();
  const open = useCallback(
    (conversationId: string) => push(`/messages/${conversationId}` as Href),
    [push],
  );
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<StaffConversationRow>) => {
      const unreadBadge = formatUnreadBadge(item.unreadCount);
      const participantName = `${item.participantFirstName} ${item.participantLastName}`;
      const participantRole = t(
        item.participantRole === 'player' ? 'participantPlayer' : 'participantEntity',
      );
      const messagePreview = item.latestMessagePreview ?? t('noMessagePreview');
      return (
        <StaffConversationCard
          conversationId={item.conversationId}
          participantName={participantName}
          participantRole={participantRole}
          messagePreview={messagePreview}
          unreadBadge={unreadBadge}
          accessibilityLabel={t('conversationRowLabel', {
            name: participantName,
            role: participantRole,
            preview: messagePreview,
          })}
          accessibilityHint={
            item.unreadCount > 0 ? t('unread', { count: item.unreadCount }) : undefined
          }
          languageClass={fontClass}
          onOpen={open}
        />
      );
    },
    [fontClass, open, t],
  );

  if (isPending) return <AnnouncementFeedSkeleton accessibilityLabel={t('loadingConversations')} />;
  if (isError) {
    return (
      <AnnouncementFeedError
        message={t('loadError')}
        retryLabel={t('retry')}
        code={toAppError(error).code}
        languageFontClass={fontClass}
        onRetry={() => void refetch()}
        isLoading={isFetching}
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
            className="min-h-recommended self-start justify-center"
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
            title={t('noStaffConversationsTitle')}
            body={t('noStaffConversationsBody')}
            languageFontClass={fontClass}
          />
        ) : (
          <FlashList
            accessibilityRole="list"
            accessibilityLabel={t('managementTitle')}
            data={conversations}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={listContentStyle}
          />
        )}
      </PageWidth>
    </SafeAreaView>
  );
}
