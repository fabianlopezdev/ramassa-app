/**
 * What is waiting for her right now (RAPP-635): one count per queue she can
 * act on, for the bell in the top bar and the sidebar's Messages badge.
 *
 * Counts come from data that already exists, with each queue's own "pending"
 * definition, so the bell matches the page it links to:
 *   - unread messages: `get_unread_message_count`, the sidebar badge's source,
 *     live through the message activity channel (`messages.inbox`);
 *   - referrals to review: `entity_referrals.status = 'pending'`, the
 *     referrals queue's filter (`referrals.manage`);
 *   - deletion requests: `deletion_requests.state = 'open'`, the requests
 *     page's filter (`rgpd.erase`);
 *   - new signatures: `walk_in_signings.status = 'pending'`, what
 *     `list_walk_in_signings` returns (`participants.invite`);
 *   - mentoring requests: `mentoring_requests.status = 'requested'`, not yet
 *     scheduled (`mentoring.manage`);
 *   - new feedback: `list_staff_feedback_submissions` with status `new`
 *     (`feedback.view`);
 *   - reports to moderate: the rows of `list_forum_moderation_queue`, one per
 *     flagged post, reply or photo (`forum.moderate` or `gallery.moderate`).
 *
 * A queue is asked only when she holds its permission, so the onboarding
 * design role (RAPP-615) asks nothing and sees an empty bell. A failed count
 * is left out silently: the bell is a hint, and the page itself reports
 * errors. Counts refresh on window focus, every minute while the tab is
 * visible, and when the bell opens.
 */
import { useUnreadMessageCount } from '@/lib/messaging';
import { supabase } from '@/lib/supabase';
import {
  FileX,
  Flag,
  HeartHandshake,
  Inbox,
  MessageSquare,
  PenLine,
  Share2,
  type LucideIcon,
} from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@ramassa/shared/auth';
import { fetchStaffFeedbackSubmissions } from '@ramassa/shared/feedback';
import { fetchForumModerationQueue } from '@ramassa/shared/forum';
import type { PermissionCode } from '@ramassa/shared/permissions';

export type TodoKey =
  | 'messages'
  | 'referrals'
  | 'deletionRequests'
  | 'walkIns'
  | 'mentoring'
  | 'feedback'
  | 'forumReports';

type PolledTodoKey = Exclude<TodoKey, 'messages'>;

export interface TodoCategory {
  readonly key: TodoKey;
  /** Where the queue is handled. */
  readonly to: string;
  readonly icon: LucideIcon;
  /** In the `admin` namespace. */
  readonly labelKey: `todos.${TodoKey}`;
  /** Shown when she holds ANY of these. */
  readonly anyPermission: readonly PermissionCode[];
}

/** The bell's rows, in this order. */
export const TODO_CATEGORIES: readonly TodoCategory[] = [
  {
    key: 'messages',
    to: '/messages',
    icon: MessageSquare,
    labelKey: 'todos.messages',
    anyPermission: ['messages.inbox'],
  },
  {
    key: 'referrals',
    to: '/participants/referrals',
    icon: Share2,
    labelKey: 'todos.referrals',
    anyPermission: ['referrals.manage'],
  },
  {
    key: 'walkIns',
    to: '/participants/walk-ins',
    icon: PenLine,
    labelKey: 'todos.walkIns',
    anyPermission: ['participants.invite'],
  },
  {
    key: 'deletionRequests',
    to: '/participants/deletion-requests',
    icon: FileX,
    labelKey: 'todos.deletionRequests',
    anyPermission: ['rgpd.erase'],
  },
  {
    key: 'mentoring',
    to: '/mentoring',
    icon: HeartHandshake,
    labelKey: 'todos.mentoring',
    anyPermission: ['mentoring.manage'],
  },
  {
    key: 'feedback',
    to: '/feedback',
    icon: Inbox,
    labelKey: 'todos.feedback',
    anyPermission: ['feedback.view'],
  },
  {
    key: 'forumReports',
    to: '/forum',
    icon: Flag,
    labelKey: 'todos.forumReports',
    anyPermission: ['forum.moderate', 'gallery.moderate'],
  },
];

async function headCount(
  table: 'entity_referrals' | 'deletion_requests' | 'walk_in_signings' | 'mentoring_requests',
  column: 'status' | 'state',
  value: string,
  signal: AbortSignal,
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column as never, value as never)
    .abortSignal(signal);
  if (error) throw error;
  return count ?? 0;
}

const POLLED_COUNTS: Record<PolledTodoKey, (signal: AbortSignal) => Promise<number>> = {
  referrals: (signal) => headCount('entity_referrals', 'status', 'pending', signal),
  deletionRequests: (signal) => headCount('deletion_requests', 'state', 'open', signal),
  walkIns: (signal) => headCount('walk_in_signings', 'status', 'pending', signal),
  mentoring: (signal) => headCount('mentoring_requests', 'status', 'requested', signal),
  feedback: async (signal) =>
    (await fetchStaffFeedbackSubmissions(supabase, { status: 'new' }, signal)).length,
  forumReports: async (signal) => (await fetchForumModerationQueue(supabase, { signal })).length,
};

/** The categories she may act on. */
export function visibleTodoCategories(
  permissions: ReadonlySet<PermissionCode>,
): readonly TodoCategory[] {
  return TODO_CATEGORIES.filter((category) =>
    category.anyPermission.some((code) => permissions.has(code)),
  );
}

export interface TodoRow {
  readonly category: TodoCategory;
  readonly count: number;
}

export interface TodoCountsState {
  /** One row per category she may act on that has something waiting. */
  readonly rows: readonly TodoRow[];
  readonly total: number;
  /** The sidebar's Messages badge. */
  readonly unreadMessages: number;
  /** Asks every count again, as when the bell opens. */
  readonly refresh: () => void;
}

const REFRESH_INTERVAL_MS = 60_000;

const TodoCountsContext = createContext<TodoCountsState | null>(null);

export function TodoCountsProvider({ children }: { readonly children: ReactNode }) {
  const { permissions } = useAuth();
  const visible = useMemo(() => visibleTodoCategories(permissions), [permissions]);
  const canReadMessages = visible.some((category) => category.key === 'messages');
  const unreadMessages = useUnreadMessageCount(canReadMessages);
  const polledKeys = useMemo(
    () =>
      visible
        .map((category) => category.key)
        .filter((key): key is PolledTodoKey => key !== 'messages'),
    [visible],
  );
  const [counts, setCounts] = useState<Partial<Record<PolledTodoKey, number>>>({});
  const controller = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    if (polledKeys.length === 0) {
      setCounts({});
      return;
    }
    void Promise.allSettled(polledKeys.map((key) => POLLED_COUNTS[key](current.signal))).then(
      (results) => {
        if (current.signal.aborted) return;
        const next: Partial<Record<PolledTodoKey, number>> = {};
        results.forEach((result, index) => {
          const key = polledKeys[index];
          if (key !== undefined && result.status === 'fulfilled') next[key] = result.value;
        });
        setCounts(next);
      },
    );
  }, [polledKeys]);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, REFRESH_INTERVAL_MS);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      controller.current?.abort();
    };
  }, [refresh]);

  const value = useMemo<TodoCountsState>(() => {
    const rows = visible
      .map((category) => ({
        category,
        count:
          category.key === 'messages'
            ? unreadMessages
            : (counts[category.key as PolledTodoKey] ?? 0),
      }))
      .filter((row) => row.count > 0);
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    return { rows, total, unreadMessages: canReadMessages ? unreadMessages : 0, refresh };
  }, [visible, unreadMessages, canReadMessages, counts, refresh]);

  return <TodoCountsContext.Provider value={value}>{children}</TodoCountsContext.Provider>;
}

export function useTodoCounts(): TodoCountsState {
  const value = useContext(TodoCountsContext);
  if (value === null) throw new Error('useTodoCounts needs a TodoCountsProvider');
  return value;
}

/** A badge's text: the count, or 99+. */
export function badgeCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}
