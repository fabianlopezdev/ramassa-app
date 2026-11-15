/**
 * Her bell's notifications (RAPP-640): the latest 30 with the name each
 * shows, her unread count, opening one (marks it read) and deleting some.
 * The rows are written by database triggers when a queue gets work
 * (`staff_notifications`); the text is rendered here from the event, so a
 * copy change reaches old rows too. Refreshed on load, on window focus,
 * every minute while the tab is visible, and after each action.
 */
import { supabase } from '@/lib/supabase';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { useAuth } from '@ramassa/shared/auth';
import { AppError } from '@ramassa/shared/errors';

const STAFF_NOTIFICATION_EVENTS = [
  'message',
  'referral',
  'walk_in',
  'deletion_request',
  'mentoring_request',
  'feedback',
  'forum_report',
  'gallery_report',
  'field_created',
  // A repeating form to renew before the next season (RAPP-701).
  'form_renewal',
] as const;
type StaffNotificationEvent = (typeof STAFF_NOTIFICATION_EVENTS)[number];

const BELL_LIMIT = 30;
const REFRESH_INTERVAL_MS = 60_000;

const rowSchema = z.object({
  id: z.uuid(),
  event: z.enum(STAFF_NOTIFICATION_EVENTS),
  params: z.record(z.string(), z.unknown()).nullable(),
  path: z.string().startsWith('/'),
  name: z.string().nullable(),
  created_at: z.string(),
  read_at: z.string().nullable(),
});

export interface StaffNotification {
  readonly id: string;
  readonly event: StaffNotificationEvent;
  /** The person or entity the event is about, or null (erased, or a report). */
  readonly name: string | null;
  /** How many messages a chat notification stands for. */
  readonly count: number;
  readonly path: string;
  readonly createdAt: Date;
  readonly readAt: Date | null;
}

type StaffNotificationsStatus = 'loading' | 'error' | 'ready';

export interface StaffNotificationsState {
  readonly items: readonly StaffNotification[];
  readonly unread: number;
  readonly status: StaffNotificationsStatus;
  readonly refresh: () => Promise<void>;
  readonly markRead: (id: string) => Promise<void>;
  /** Hides them from her bell; resolves with how many were deleted. */
  readonly remove: (ids: readonly string[]) => Promise<number>;
}

async function fetchBell(signal: AbortSignal) {
  const [list, unread] = await Promise.all([
    supabase.rpc('list_staff_notifications', { p_limit: BELL_LIMIT }).abortSignal(signal),
    supabase
      .from('staff_notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null)
      .abortSignal(signal),
  ]);
  if (list.error) throw new AppError('DB-1', { message: list.error.message });
  if (unread.error) throw new AppError('DB-1', { message: unread.error.message });
  const items = z
    .array(rowSchema)
    .parse(list.data ?? [])
    .map((row): StaffNotification => ({
      id: row.id,
      event: row.event,
      name: row.name,
      count: Math.max(1, Number(row.params?.['count'] ?? 1) || 1),
      path: row.path,
      createdAt: new Date(row.created_at),
      readAt: row.read_at === null ? null : new Date(row.read_at),
    }));
  return { items, unread: unread.count ?? 0 };
}

export function useStaffNotifications(): StaffNotificationsState {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [items, setItems] = useState<readonly StaffNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [status, setStatus] = useState<StaffNotificationsStatus>('loading');
  const controller = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    controller.current?.abort();
    if (userId === null) {
      setItems([]);
      setUnread(0);
      setStatus('ready');
      return;
    }
    const current = new AbortController();
    controller.current = current;
    try {
      const next = await fetchBell(current.signal);
      if (current.signal.aborted) return;
      setItems(next.items);
      setUnread(next.unread);
      setStatus('ready');
    } catch {
      if (current.signal.aborted) return;
      // Keep what she already sees; the empty bell shows the error only.
      setStatus('error');
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, REFRESH_INTERVAL_MS);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      controller.current?.abort();
    };
  }, [refresh]);

  const markRead = useCallback(
    async (id: string) => {
      await supabase.rpc('mark_staff_notification_read', { p_id: id });
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (ids: readonly string[]) => {
      try {
        const { data, error } = await supabase.rpc('delete_staff_notifications', {
          p_ids: [...ids],
        });
        if (error) throw new AppError('DB-1', { message: error.message });
        return typeof data === 'number' ? data : 0;
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  return { items, unread, status, refresh, markRead, remove };
}

/** "5 min ago", in her language, from the nearest unit. */
export function formatTimeAgo(at: Date, now: Date, locale: string): string {
  const seconds = Math.round((at.getTime() - now.getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const steps: readonly [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 7],
    ['week', 4.35],
    ['month', 12],
    ['year', Number.POSITIVE_INFINITY],
  ];
  let value = seconds;
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) return format.format(Math.round(value), unit);
    value /= size;
  }
  return format.format(Math.round(value), 'year');
}
