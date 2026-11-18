/**
 * Xat (RAPP-789): everything private between her and the team, in one tab.
 * Three large cards and nothing else: the chat with its unread count, mentoring
 * with the state of the request she is waiting on, and suggestions. Each opens
 * the screen it always opened (`team-chat`, `mentoring`, `feedback`). The cards
 * are the raised card of Per fer (RAPP-842). The unread count sits in a circle
 * on the top edge near the end, and the state of her request is a badge on the
 * top edge near the start, like "Nou". Both are in the brand colour.
 */
import { PageWidth } from '@/components/layout/content-width';
import type { RaisedCardBadge } from '@/components/layout/raised-card';
import { RaisedIconCard } from '@/components/layout/raised-icon-card';
import { PlayerTabHeader } from '@/components/profile/player-tab-header';
import { useUnreadMessages } from '@/lib/messaging';
import { latestOpenMentoringRequest } from '@/lib/player-chat-tab';
import { usePlayerMentoringRequests } from '@/lib/player-mentoring';
import { playerNavIcons } from '@/lib/player-nav-icons';
import { formatUnreadBadge } from '@/lib/unread-badge';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
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

function stateBadge(label: string | null): RaisedCardBadge | null {
  return label === null ? null : { label, tone: 'brand' };
}

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
  const languageFontClass = useLanguageFontClass();
  const teamChatTitle = t('messaging:playerTitle');
  const mentoringTitle = t('mentoring:title');
  const feedbackTitle = t('feedback:title');
  const unreadLabel = formatUnreadBadge(unread);
  const mentoringState = openRequest === null ? null : t(MENTORING_STATUS_KEYS[openRequest.status]);
  const openTeamChat = useCallback(() => push('/team-chat' as Href), [push]);
  const openMentoring = useCallback(() => push('/mentoring' as Href), [push]);
  const openFeedback = useCallback(() => push('/feedback' as Href), [push]);

  return (
    <ScrollView
      testID="player-chat-tab"
      className="flex-1 bg-surface-page"
      contentContainerClassName="grow px-lg pb-lg"
      contentContainerStyle={tabInsets}
      contentInsetAdjustmentBehavior="automatic"
    >
      <PageWidth className="gap-lg">
        <PlayerTabHeader title={t('nav:tabs.chat')} />
        <RaisedIconCard
          testID="chat-open-team-chat"
          icon={playerNavIcons.teamChat}
          title={teamChatTitle}
          accessibilityLabel={
            unreadLabel === null
              ? teamChatTitle
              : `${teamChatTitle}, ${t('messaging:unread', { count: unread })}`
          }
          count={unreadLabel}
          languageFontClass={languageFontClass}
          onOpen={openTeamChat}
        />
        <RaisedIconCard
          testID="chat-open-mentoring"
          icon={playerNavIcons.mentoring}
          title={mentoringTitle}
          accessibilityLabel={
            mentoringState === null ? mentoringTitle : `${mentoringTitle}, ${mentoringState}`
          }
          badge={stateBadge(mentoringState)}
          languageFontClass={languageFontClass}
          onOpen={openMentoring}
        />
        <RaisedIconCard
          testID="chat-open-feedback"
          icon={playerNavIcons.feedback}
          title={feedbackTitle}
          accessibilityLabel={feedbackTitle}
          languageFontClass={languageFontClass}
          onOpen={openFeedback}
        />
      </PageWidth>
    </ScrollView>
  );
}
