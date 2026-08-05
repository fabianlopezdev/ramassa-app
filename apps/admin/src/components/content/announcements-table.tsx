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
import {
  ANNOUNCEMENT_PAGE_SIZE,
  deleteAnnouncement,
  getAnnouncementLifecycle,
  setAnnouncementPinned,
  type AnnouncementLifecycle,
  type AnnouncementListRow,
  type AnnouncementPage,
  type AnnouncementSearch,
  type AnnouncementSortColumn,
} from '@ramassa/shared/announcements';
import type { AppErrorCode } from '@ramassa/shared/errors';

export interface AnnouncementsTableProps {
  readonly page: AnnouncementPage;
  readonly search: AnnouncementSearch;
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

export function AnnouncementsTable({ page, search }: AnnouncementsTableProps) {
  const { t, i18n } = useTranslation(['announcements', 'errors']);
  const navigate = useNavigate({ from: '/content/announcements/' });
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const locale = i18n.resolvedLanguage ?? 'ca';
  const pages = Math.max(1, Math.ceil(page.total / ANNOUNCEMENT_PAGE_SIZE));

  function applySearch(next: Partial<AnnouncementSearch>) {
    void navigate({ search: (previous) => ({ ...previous, page: 1, ...next }) });
  }

  const mutateRow = useCallback(
    async (operation: () => Promise<void>, rowId: string) => {
      setBusyId(rowId);
      setErrorCode(null);
      const result = await safeAsync(
        async () => {
          await operation();
          await router.invalidate({ sync: true });
        },
        { code: 'DB-1', context: { operation: 'mutate-announcement' } },
      );
      if (!result.ok) setErrorCode(result.error.code);
      setBusyId(null);
    },
    [router],
  );

  const columns = useMemo<ColumnDef<AnnouncementListRow, unknown>[]>(
    () => [
      {
        accessorKey: 'created_at' satisfies AnnouncementSortColumn,
        header: t('columnTitle'),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {row.original.is_pinned ? <Badge variant="outline">{t('pin')}</Badge> : null}
            <Link
              to="/content/announcements/$announcementId"
              params={{ announcementId: row.original.id }}
              className="font-medium underline-offset-4 hover:underline"
              data-testid={`announcement-link-${row.original.id}`}
            >
              {row.original.title.ca}
            </Link>
          </div>
        ),
      },
      {
        accessorKey: 'category' satisfies AnnouncementSortColumn,
        header: t('columnCategory'),
        cell: ({ row }) => t(`category${capitalize(row.original.category)}`),
      },
      {
        id: 'status',
        header: t('columnStatus'),
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
        accessorKey: 'published_at' satisfies AnnouncementSortColumn,
        header: t('columnPublication'),
        cell: ({ row }) => formatDate(row.original.published_at, locale, t('none')),
      },
      {
        accessorKey: 'expires_at' satisfies AnnouncementSortColumn,
        header: t('columnExpiry'),
        cell: ({ row }) => formatDate(row.original.expires_at, locale, t('none')),
      },
      {
        id: 'actions',
        header: t('columnActions'),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busyId === row.original.id}
              data-testid={`announcement-pin-${row.original.id}`}
              onClick={() =>
                void mutateRow(
                  () => setAnnouncementPinned(supabase, row.original.id, !row.original.is_pinned),
                  row.original.id,
                )
              }
            >
              {row.original.is_pinned ? t('unpin') : t('pin')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={busyId === row.original.id}
              data-testid={`announcement-delete-${row.original.id}`}
              onClick={() => {
                if (!window.confirm(t('deleteConfirm'))) return;
                void mutateRow(
                  () => deleteAnnouncement(supabase, row.original.id),
                  row.original.id,
                );
              }}
            >
              {t('delete')}
            </Button>
          </div>
        ),
      },
    ],
    [busyId, locale, mutateRow, t],
  );

  const sorting: SortingState = [{ id: search.sort, desc: search.dir === 'desc' }];

  return (
    <section className="flex flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('summary', { count: page.total })}</p>
        </div>
        <Button asChild size="lg">
          <Link to="/content/announcements/new">{t('newAction')}</Link>
        </Button>
      </header>

      <label className="flex max-w-sm flex-col gap-2">
        <span className="text-sm font-medium">{t('filterStatus')}</span>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          data-testid="announcement-status-filter"
          value={search.status}
          onChange={(event) =>
            applySearch({ status: event.target.value as AnnouncementSearch['status'] })
          }
        >
          <option value="all">{t('filterAll')}</option>
          {(['draft', 'published', 'scheduled', 'expired'] as const).map((status) => (
            <option key={status} value={status}>
              {t(`status${capitalize(status)}`)}
            </option>
          ))}
        </select>
      </label>

      <DataTable
        columns={columns}
        rows={page.rows}
        sorting={sorting}
        onSortingChange={(next) => {
          const first = next[0];
          if (first === undefined) return;
          applySearch({
            sort: first.id as AnnouncementSortColumn,
            dir: first.desc ? 'desc' : 'asc',
          });
        }}
        empty={
          <div className="flex flex-col items-start gap-3 rounded-md border border-dashed p-8">
            <p className="font-medium">{t('emptyTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('emptyBody')}</p>
            <Button variant="outline" onClick={() => applySearch({ status: 'all' })}>
              {t('clearFilters')}
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

function LifecycleBadge({ lifecycle }: { readonly lifecycle: AnnouncementLifecycle }) {
  const { t } = useTranslation('announcements');
  return (
    <Badge variant={lifecycle === 'expired' ? 'outline' : 'secondary'}>
      {t(`status${capitalize(lifecycle)}`)}
    </Badge>
  );
}

function formatDate(value: string | null, locale: string, fallback: string): string {
  return value === null ? fallback : new Date(value).toLocaleString(locale);
}
