import { DataTable } from '@/components/data-table/data-table';
import { DataTablePager } from '@/components/data-table/data-table-pager';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAnnouncementLifecycle } from '@ramassa/shared/announcements';
import type { AppErrorCode } from '@ramassa/shared/errors';
import {
  deleteEvent,
  EVENT_PAGE_SIZE,
  parseWeeklyRecurrenceRule,
  type EventCategoryRow,
  type EventLifecycle,
  type EventListRow,
  type EventPage,
  type EventSearch,
  type EventSortColumn,
} from '@ramassa/shared/events';
import { EventCategoryBadge } from './event-category-badge';

export interface EventsTableProps {
  readonly page: EventPage;
  readonly categories: readonly EventCategoryRow[];
  readonly search: EventSearch;
}

export function EventsTable({ page, categories, search }: EventsTableProps) {
  const { t, i18n } = useTranslation(['events', 'errors']);
  const navigate = useNavigate({ from: '/content/events/' });
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const locale = i18n.resolvedLanguage ?? 'ca';
  const pages = Math.max(1, Math.ceil(page.total / EVENT_PAGE_SIZE));

  function applySearch(next: Partial<EventSearch>) {
    void navigate({ search: (previous) => ({ ...previous, page: 1, ...next }) });
  }

  const remove = useCallback(
    async (rowId: string) => {
      setBusyId(rowId);
      setErrorCode(null);
      const result = await safeAsync(
        async () => {
          await deleteEvent(supabase, rowId);
          await router.invalidate({ sync: true });
        },
        { code: 'DB-1', context: { operation: 'delete-event' } },
      );
      if (!result.ok) setErrorCode(result.error.code);
      setBusyId(null);
    },
    [router],
  );

  const columns = useMemo<ColumnDef<EventListRow, unknown>[]>(
    () => [
      {
        id: 'title',
        header: t('events:columnTitle'),
        enableSorting: false,
        cell: ({ row }) => (
          <Link
            to="/content/events/$eventId"
            params={{ eventId: row.original.id }}
            className="font-medium underline-offset-4 hover:underline"
            data-testid={`event-link-${row.original.id}`}
          >
            {row.original.title.ca}
          </Link>
        ),
      },
      {
        id: 'category',
        header: t('events:columnCategory'),
        enableSorting: false,
        cell: ({ row }) => <EventCategoryBadge category={row.original.category} />,
      },
      {
        accessorKey: 'starts_at' satisfies EventSortColumn,
        header: t('events:columnStart'),
        cell: ({ row }) => formatMadrid(row.original.starts_at, locale),
      },
      {
        id: 'recurrence',
        header: t('events:columnRecurrence'),
        enableSorting: false,
        cell: ({ row }) => {
          const recurrence =
            row.original.recurrence_rule === null
              ? null
              : parseWeeklyRecurrenceRule(row.original.recurrence_rule);
          return recurrence?.kind === 'weekly'
            ? t('events:recurrenceWeeklySummary', {
                interval: recurrence.interval,
                count: recurrence.count,
              })
            : t('events:recurrenceOneOff');
        },
      },
      {
        id: 'capacity',
        header: t('events:columnCapacity'),
        enableSorting: false,
        cell: ({ row }) => row.original.max_participants ?? t('events:unlimited'),
      },
      {
        id: 'signup',
        header: t('events:columnSignup'),
        enableSorting: false,
        cell: ({ row }) => t(`events:signup${capitalize(row.original.signup_mode)}`),
      },
      {
        id: 'status',
        header: t('events:columnStatus'),
        enableSorting: false,
        cell: ({ row }) => {
          const lifecycle = getAnnouncementLifecycle({
            status: row.original.status,
            publishedAt: row.original.published_at,
            expiresAt: row.original.expires_at,
          });
          return <LifecycleBadge lifecycle={lifecycle} />;
        },
      },
      {
        id: 'actions',
        header: t('events:columnActions'),
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={busyId === row.original.id}
            data-testid={`event-delete-${row.original.id}`}
            onClick={() => {
              if (window.confirm(t('events:deleteConfirm'))) void remove(row.original.id);
            }}
          >
            {t('events:delete')}
          </Button>
        ),
      },
    ],
    [busyId, locale, remove, t],
  );
  const sorting: SortingState = [{ id: search.sort, desc: search.dir === 'desc' }];

  return (
    <section className="flex flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t('events:title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('events:summary', { count: page.total })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/content/events/categories">{t('events:manageCategories')}</Link>
          </Button>
          <Button asChild size="lg">
            <Link to="/content/events/new">{t('events:newAction')}</Link>
          </Button>
        </div>
      </header>

      <div className="grid max-w-2xl gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('events:filterStatus')}</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            data-testid="event-status-filter"
            value={search.status}
            onChange={(changeEvent) =>
              applySearch({ status: changeEvent.target.value as EventSearch['status'] })
            }
          >
            <option value="all">{t('events:filterAllStatuses')}</option>
            {(['draft', 'published', 'scheduled', 'expired'] as const).map((status) => (
              <option key={status} value={status}>
                {t(`events:status${capitalize(status)}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('events:filterCategory')}</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            data-testid="event-category-filter"
            value={search.category}
            onChange={(changeEvent) => applySearch({ category: changeEvent.target.value })}
          >
            <option value="all">{t('events:filterAllCategories')}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name.ca}
              </option>
            ))}
          </select>
        </label>
      </div>

      <DataTable
        columns={columns}
        rows={page.rows}
        sorting={sorting}
        onSortingChange={(next) => {
          const first = next[0];
          if (first === undefined) return;
          applySearch({ sort: first.id as EventSortColumn, dir: first.desc ? 'desc' : 'asc' });
        }}
        empty={
          <div className="flex flex-col items-start gap-3 rounded-md border border-dashed p-8">
            <p className="font-medium">{t('events:emptyTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('events:emptyBody')}</p>
            <Button
              variant="outline"
              onClick={() => applySearch({ status: 'all', category: 'all' })}
            >
              {t('events:clearFilters')}
            </Button>
          </div>
        }
      />

      {errorCode === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors:${errorCode}`)}
        </p>
      )}
      <DataTablePager
        page={search.page}
        pages={pages}
        onPageChange={(next) =>
          void navigate({ search: (previous) => ({ ...previous, page: next }) })
        }
      />
    </section>
  );
}

function LifecycleBadge({ lifecycle }: { readonly lifecycle: EventLifecycle }) {
  const { t } = useTranslation('events');
  return (
    <Badge variant={lifecycle === 'expired' ? 'outline' : 'secondary'}>
      {t(`status${capitalize(lifecycle)}`)}
    </Badge>
  );
}

function formatMadrid(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Madrid',
  }).format(new Date(value));
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
