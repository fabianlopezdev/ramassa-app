/**
 * Xat (RAPP-789): everything private between her and the team, in one tab.
 * Three large rows and nothing else: the chat with its unread count, mentoring
 * with the state of the request she is waiting on, and suggestions. Each opens
 * the screen it always opened (`team-chat`, `mentoring`, `feedback`).
 */
import { PageWidth } from '@/components/layout/content-width';
import { NavRow } from '@/components/layout/nav-row';
import { PlayerTabHeader } from '@/components/profile/player-tab-header';
import { useUnreadMessages } from '@/lib/messaging';
import { latestOpenMentoringRequest } from '@/lib/player-chat-tab';
import { usePlayerMentoringRequests } from '@/lib/player-mentoring';
import { playerNavIcons } from '@/lib/player-nav-icons';
import { formatUnreadBadge } from '@/lib/unread-badge';
import { usePlayerTabContentInsets } from '@/lib/use-player-tab-content-insets';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import type { MentoringStatus } from '@ramassa/shared/mentoring';

const MENTORING_STATUS_KEYS: Readonly<Record<MentoringStatus, string>> = {
  requested: 'mentoring:statusRequested',
  scheduled: 'mentoring:statusScheduled',
  completed: 'mentoring:statusCompleted',
  cancelled: 'mentoring:statusCancelled',
};

export default function ChatTabScreen() {
  const { t } = useTranslation(['nav', 'messaging', 'mentoring', 'feedback']);
  const { push } = useRouter();
  const unread = useUnreadMessages().data ?? 0;
  const mentoring = usePlayerMentoringRequests();
  const openRequest = useMemo(
    () => latestOpenMentoringRequest(mentoring.data ?? []),
    [mentoring.data],
  );
  const tabInsets = usePlayerTabContentInsets();
  const openTeamChat = useCallback(() => push('/team-chat' as Href), [push]);
  const openMentoring = useCallback(() => push('/mentoring' as Href), [push]);
  const openFeedback = useCallback(() => push('/feedback' as Href), [push]);

  return (
    <ScrollView
      testID="player-chat-tab"
      className="flex-1 bg-neutral-50"
      contentContainerClassName="grow px-lg pb-lg"
      contentContainerStyle={tabInsets}
      contentInsetAdjustmentBehavior="automatic"
    >
      <PageWidth className="gap-lg">
        <PlayerTabHeader title={t('nav:tabs.chat')} />
        <NavRow
          testID="chat-open-team-chat"
          icon={playerNavIcons.teamChat}
          label={t('messaging:playerTitle')}
          badge={formatUnreadBadge(unread)}
          badgeAccessibilityLabel={t('messaging:unread', { count: unread })}
          onPress={openTeamChat}
        />
        <NavRow
          testID="chat-open-mentoring"
          icon={playerNavIcons.mentoring}
          label={t('mentoring:title')}
          detail={openRequest === null ? null : t(MENTORING_STATUS_KEYS[openRequest.status])}
          onPress={openMentoring}
        />
        <NavRow
          testID="chat-open-feedback"
          icon={playerNavIcons.feedback}
          label={t('feedback:title')}
          onPress={openFeedback}
        />
      </PageWidth>
    </ScrollView>
  );
}
