/**
 * Avui's "Pendent" list (RAPP-795): one raised card per queue, its count at the
 * end, each opening its queue. It replaces the large cards that once pushed
 * the day's sessions off a phone screen (RAPP-481).
 *
 * The rule for every row: it shows whenever her permissions open its queue
 * (`pendingQueues`), with the count at the end, muted at zero, as the cards it
 * replaces did. A fixed set of rows keeps each queue in the same place every
 * day. Each row is its own component, so a queue is only fetched when she may
 * see it. Rows about a specific item (late loans, stock below zero, the
 * monthly count) list that item under the row while something is due.
 */
import { useCheckoutDate } from '@/components/equipment/staff-checkouts';
import { ScreenSection } from '@/components/layout/screen-section';
import { useContentKnowledge } from '@/lib/content-knowledge';
import { useServiceReviewCount } from '@/lib/content-service-reviews';
import { useStockAlerts } from '@/lib/handover';
import { useItemLabel } from '@/lib/item-label';
import { useUnreadMessages } from '@/lib/messaging';
import { useOpenDeletionRequests } from '@/lib/rgpd';
import { useMonthlyCount, useOpenCheckouts } from '@/lib/stock';
import { useStaffFeedback } from '@/lib/team-feedback';
import { useForumModerationQueue } from '@/lib/team-forum';
import { useStaffMentoringRequests } from '@/lib/team-mentoring';
import { teamAreas } from '@/lib/team-shell';
import { pendingQueues, type PendingQueue } from '@/lib/today';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { TeamListRow } from './team-list-row';

/** The testIDs the cards these rows replace had, plus the three new queues. */
const TEST_IDS: Readonly<Record<PendingQueue, string>> = {
  serviceReviews: 'today-reviews',
  stories: 'today-stories',
  reports: 'today-forum',
  feedback: 'today-feedback',
  mentoring: 'today-mentoring',
  erasure: 'today-erasure',
  messages: 'today-messages',
  lateLoans: 'today-checkouts',
  stockAlerts: 'today-material',
  monthlyCount: 'today-monthly-count',
};

function usePendingLabel(queue: PendingQueue): string {
  const { t } = useTranslation('nav');
  const { t: tParticipants } = useTranslation('participants');
  switch (queue) {
    case 'serviceReviews':
      return t('team.pendingRow.serviceReviews');
    case 'stories':
      return t('team.pendingRow.stories');
    case 'reports':
      return t('team.pendingRow.reports');
    case 'feedback':
      return t('team.pendingRow.feedback');
    case 'mentoring':
      return t('team.pendingRow.mentoring');
    case 'erasure':
      return t('team.pendingRow.erasure');
    case 'messages':
      return t('team.pendingRow.messages');
    case 'lateLoans':
      return tParticipants('checkout.todayTitle');
    case 'stockAlerts':
      return t('team.pendingRow.stockAlerts');
    case 'monthlyCount':
      return tParticipants('count.monthlyTitle');
  }
}

function CountRow({
  queue,
  count,
  onPress,
  children,
}: {
  readonly queue: PendingQueue;
  readonly count: number | undefined;
  readonly onPress?: () => void;
  readonly children?: ReactNode;
}) {
  const label = usePendingLabel(queue);
  return (
    <TeamListRow
      testID={TEST_IDS[queue]}
      label={label}
      value={count === undefined ? undefined : String(count)}
      isValueHighlighted={count !== undefined && count > 0}
      onPress={onPress}
    >
      {children}
    </TeamListRow>
  );
}

function DetailLine({ testID, text }: { readonly testID?: string; readonly text: string }) {
  const fontClass = useLanguageFontClass();
  return (
    <Text
      testID={testID}
      className={`text-start text-md font-semibold text-neutral-800 ${fontClass}`}
    >
      {text}
    </Text>
  );
}

/** A new time on every tap, so the Content tab switches even when it is already open. */
function useOpenContent(kind: 'reviews' | 'knowledge') {
  const { navigate } = useRouter();
  return () => navigate({ pathname: '/content', params: { kind, at: String(Date.now()) } } as Href);
}

function ServiceReviewsRow() {
  const open = useOpenContent('reviews');
  return <CountRow queue="serviceReviews" count={useServiceReviewCount().data} onPress={open} />;
}

function StoriesRow() {
  const open = useOpenContent('knowledge');
  const total = useContentKnowledge('stories', 'submitted').data?.pages[0]?.total;
  return <CountRow queue="stories" count={total} onPress={open} />;
}

function ReportsRow() {
  const { push } = useRouter();
  const count = useForumModerationQueue().data?.length;
  return (
    <CountRow queue="reports" count={count} onPress={() => push('/forum-moderation' as Href)} />
  );
}

function FeedbackRow() {
  const { push } = useRouter();
  const data = useStaffFeedback().data;
  const count = data?.filter((submission) => submission.status === 'new').length;
  return <CountRow queue="feedback" count={count} onPress={() => push('/team-feedback' as Href)} />;
}

function MentoringRow() {
  const { push } = useRouter();
  const data = useStaffMentoringRequests().data;
  const count = data?.filter((request) => request.status === 'requested').length;
  return (
    <CountRow queue="mentoring" count={count} onPress={() => push('/team-mentoring' as Href)} />
  );
}

// Erasure requests are a segment of Participants; on tabs that is its tab.
function ErasureRow() {
  const { navigate } = useRouter();
  const count = useOpenDeletionRequests().data?.length;
  return (
    <CountRow
      queue="erasure"
      count={count}
      onPress={() =>
        navigate({ pathname: '/participants', params: { segment: 'deletion-requests' } } as Href)
      }
    />
  );
}

function MessagesRow() {
  const { navigate } = useRouter();
  return (
    <CountRow
      queue="messages"
      count={useUnreadMessages().data}
      onPress={() => navigate('/messages' as Href)}
    />
  );
}

/**
 * Late checkouts (RAPP-252): the storeroom sees every late one and opens
 * Stock; anyone else sees her own, listed under the row.
 */
function LateLoansRow({ hasStock }: { readonly hasStock: boolean }) {
  const { t } = useTranslation('participants');
  const { push } = useRouter();
  const itemLabel = useItemLabel();
  const formatDate = useCheckoutDate();
  const userId = useAuth().user?.id ?? null;
  const data = useOpenCheckouts().data;
  const late = useMemo(() => data?.filter((row) => row.isOverdue), [data]);
  return (
    <CountRow
      queue="lateLoans"
      count={late?.length}
      onPress={hasStock ? () => push('/stock' as Href) : undefined}
    >
      {late?.map((row) => {
        const item =
          row.size === null ? itemLabel(row.itemKey) : `${itemLabel(row.itemKey)} ${row.size}`;
        const values = {
          item,
          quantity: row.quantity,
          name: row.staffName,
          date: formatDate(row.expectedReturnOn),
        };
        return (
          <DetailLine
            key={row.id}
            text={
              row.staffId === userId
                ? t('checkout.todayMine', values)
                : t('checkout.todayRow', values)
            }
          />
        );
      })}
    </CountRow>
  );
}

/** Stock below zero (RAPP-249): each item asks for a count. */
function StockAlertsRow({ hasStock }: { readonly hasStock: boolean }) {
  const { t } = useTranslation('participants');
  const { push } = useRouter();
  const itemLabel = useItemLabel();
  const alerts = useStockAlerts(true).data;
  return (
    <CountRow
      queue="stockAlerts"
      count={alerts?.length}
      onPress={hasStock ? () => push('/stock' as Href) : undefined}
    >
      {alerts?.map((alert) => (
        <DetailLine
          key={alert.id}
          testID={`today-stock-alert-${alert.itemKey}`}
          text={t('material.stockAlert', {
            item:
              alert.size === null
                ? itemLabel(alert.itemKey)
                : `${itemLabel(alert.itemKey)} ${alert.size}`,
          })}
        />
      ))}
    </CountRow>
  );
}

/** This month's small count (RAPP-251), one tap from the count screen. */
function MonthlyCountRow() {
  const { t } = useTranslation('participants');
  const { push } = useRouter();
  const itemLabel = useItemLabel();
  const query = useMonthlyCount(true);
  const monthly = query.data ?? null;
  return (
    <CountRow
      queue="monthlyCount"
      count={query.isPending ? undefined : monthly === null ? 0 : 1}
      onPress={monthly === null ? undefined : () => push(`/count/${monthly.itemTypeId}` as Href)}
    >
      {monthly === null ? null : (
        <DetailLine text={t('count.monthlyItem', { item: itemLabel(monthly.itemKey) })} />
      )}
    </CountRow>
  );
}

export function TodayPendingList() {
  const { t } = useTranslation('nav');
  const { permissions } = useAccountAccess();
  const queues = useMemo(() => pendingQueues(permissions), [permissions]);
  const hasStock = teamAreas(permissions).includes('stock');
  return (
    <ScreenSection title={t('team.pending')} isLast>
      {queues.map((queue) => {
        switch (queue) {
          case 'serviceReviews':
            return <ServiceReviewsRow key={queue} />;
          case 'stories':
            return <StoriesRow key={queue} />;
          case 'reports':
            return <ReportsRow key={queue} />;
          case 'feedback':
            return <FeedbackRow key={queue} />;
          case 'mentoring':
            return <MentoringRow key={queue} />;
          case 'erasure':
            return <ErasureRow key={queue} />;
          case 'messages':
            return <MessagesRow key={queue} />;
          case 'lateLoans':
            return <LateLoansRow key={queue} hasStock={hasStock} />;
          case 'stockAlerts':
            return <StockAlertsRow key={queue} hasStock={hasStock} />;
          case 'monthlyCount':
            return <MonthlyCountRow key={queue} />;
        }
      })}
    </ScreenSection>
  );
}
