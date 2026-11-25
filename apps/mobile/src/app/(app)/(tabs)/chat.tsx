/**
 * Contacte, once called Xat (RAPP-789, RAPP-860): everything private between
 * her and the staff, in one tab.
 * Four cards and nothing else: reporting an incident (RAPP-973), the chat with
 * its unread count, mentoring with the state of the request she is waiting
 * on, and suggestions. Each opens the screen it always opened (`incident`,
 * `team-chat`, `mentoring`, `feedback`). Reporting an incident comes first, as
 * the red long card, under the title with the header's divider below it; the
 * chat is the raised card of Per fer (RAPP-842) under the divider;
 * mentoring and suggestions sit under them as a pair of half-width raised
 * cards (RAPP-874). The unread count sits in a circle
 * on the top edge near the end, and the state of her request is a badge on the
 * top edge near the start, like "Nou". Both are in the brand colour.
 * Mentoria and Suggeriments also count what the staff changed for her (RAPP-873),
 * so the cards add up to the tab's number. Each change stays counted until she
 * opens that request or taps that suggestion.
 */
import { PageWidth } from '@/components/layout/content-width';
import type { RaisedCardBadge } from '@/components/layout/raised-card';
import { RaisedHalfCard, RaisedHalfCardRow } from '@/components/layout/raised-half-card';
import { RaisedIconCard } from '@/components/layout/raised-icon-card';
import { withScreenEntrance } from '@/components/motion/screen-entrance';
import { PlayerTabHeader } from '@/components/profile/player-tab-header';
import { useUnreadMessages } from '@/lib/messaging';
import {
  contactCardAccessibilityLabel,
  contactCardNewsCounts,
  latestOpenMentoringRequest,
} from '@/lib/player-chat-tab';
import { usePlayerMentoringRequests } from '@/lib/player-mentoring';
import { playerNavIcons } from '@/lib/player-nav-icons';
import { formatUnreadBadge } from '@/lib/unread-badge';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { usePlayerTabContentInsets } from '@/lib/use-player-tab-content-insets';
import { useTabNews } from '@/lib/use-tab-news';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';
import type { MentoringStatus } from '@ramassa/shared/mentoring';
import { tokens } from '@ramassa/shared/tokens';

/** The page colour every tab shares (RAPP-847), set the same way as on the other tabs. */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.surface.page },
});

const MENTORING_STATUS_KEYS: Readonly<Record<MentoringStatus, string>> = {
  requested: 'mentoring:statusRequested',
  scheduled: 'mentoring:statusScheduled',
  completed: 'mentoring:statusCompleted',
  cancelled: 'mentoring:statusCancelled',
};

function stateBadge(label: string | null): RaisedCardBadge | null {
  return label === null ? null : { label, tone: 'brand' };
}

function ChatTabScreen() {
  const { t } = useTranslation([
    'nav',
    'messaging',
    'incidents',
    'mentoring',
    'feedback',
    'common',
  ]);
  const { push } = useRouter();
  const unread = useUnreadMessages().data ?? 0;
  const news = contactCardNewsCounts(useTabNews().data);
  const mentoring = usePlayerMentoringRequests();
  const openRequest = useMemo(
    () => latestOpenMentoringRequest(mentoring.data ?? []),
    [mentoring.data],
  );
  const tabInsets = usePlayerTabContentInsets();
  const languageFontClass = useLanguageFontClass();
  const teamChatTitle = t('messaging:playerTitle');
  const incidentTitle = t('incidents:title');
  const mentoringTitle = t('mentoring:title');
  const feedbackTitle = t('feedback:title');
  const unreadLabel = formatUnreadBadge(unread);
  const mentoringState = openRequest === null ? null : t(MENTORING_STATUS_KEYS[openRequest.status]);
  const sayNewCount = useCallback(
    (label: string, count: number) => t('common:newCount', { label, count }),
    [t],
  );
  const openTeamChat = useCallback(() => push('/team-chat' as Href), [push]);
  const openIncident = useCallback(() => push('/incident' as Href), [push]);
  const openMentoring = useCallback(() => push('/mentoring' as Href), [push]);
  const openFeedback = useCallback(() => push('/feedback' as Href), [push]);

  return (
    <ScrollView
      testID="player-chat-tab"
      style={styles.screen}
      contentContainerClassName="grow px-lg pb-lg"
      contentContainerStyle={tabInsets}
      contentInsetAdjustmentBehavior="automatic"
    >
      <PageWidth className="gap-lg">
        {/* Reporting an incident comes first, in red, and the header's divider
            sets it apart from the rest (RAPP-973). */}
        <PlayerTabHeader title={t('nav:tabs.chat')}>
          <RaisedIconCard
            testID="chat-open-incident"
            icon={playerNavIcons.incident}
            title={incidentTitle}
            accessibilityLabel={incidentTitle}
            languageFontClass={languageFontClass}
            tone="danger"
            onOpen={openIncident}
          />
        </PlayerTabHeader>
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
        <RaisedHalfCardRow>
          <RaisedHalfCard
            testID="chat-open-mentoring"
            icon={playerNavIcons.mentoring}
            title={mentoringTitle}
            accessibilityLabel={contactCardAccessibilityLabel(
              mentoringTitle,
              mentoringState,
              news.mentoring,
              sayNewCount,
            )}
            badge={stateBadge(mentoringState)}
            count={formatUnreadBadge(news.mentoring)}
            languageFontClass={languageFontClass}
            onOpen={openMentoring}
          />
          <RaisedHalfCard
            testID="chat-open-feedback"
            icon={playerNavIcons.feedback}
            title={feedbackTitle}
            accessibilityLabel={contactCardAccessibilityLabel(
              feedbackTitle,
              null,
              news.feedback,
              sayNewCount,
            )}
            count={formatUnreadBadge(news.feedback)}
            languageFontClass={languageFontClass}
            onOpen={openFeedback}
          />
        </RaisedHalfCardRow>
      </PageWidth>
    </ScrollView>
  );
}

export default withScreenEntrance('chat', ChatTabScreen);
