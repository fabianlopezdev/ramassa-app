import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Link, useNavigate } from '@tanstack/react-router';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { CheckCircle2, Circle, Clock3 } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AttendanceOverviewRow,
  AttendanceOverviewSearch,
  AttendanceOverviewState,
} from '@ramassa/shared/attendance';
import { resolveLocalizedText, type SupportedLanguage } from '@ramassa/shared/i18n';

const noSorting: SortingState = [];
const ignoreSorting = () => undefined;

function statusIcon(state: AttendanceOverviewState) {
  if (state === 'complete') return CheckCircle2;
  if (state === 'in_progress') return Clock3;
  return Circle;
}

function statusKey(state: AttendanceOverviewState) {
  if (state === 'complete') return 'stateComplete' as const;
  if (state === 'in_progress') return 'stateInProgress' as const;
  return 'stateEmpty' as const;
}

export function AttendanceOverview({
  rows,
  search,
}: {
  readonly rows: readonly AttendanceOverviewRow[];
  readonly search: AttendanceOverviewSearch;
}) {
  const { t, i18n } = useTranslation('attendance');
  const navigate = useNavigate({ from: '/attendance' });
  const language = (i18n.resolvedLanguage ?? 'ca') as SupportedLanguage;
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Europe/Madrid',
      }),
    [language],
  );

  function applySearch(next: Partial<AttendanceOverviewSearch>, replace = false) {
    void navigate({ search: (previous) => ({ ...previous, ...next }), replace });
  }

  const columns = useMemo<ColumnDef<AttendanceOverviewRow, unknown>[]>(
    () => [
      {
        id: 'event',
        header: t('columnEvent'),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex min-w-52 flex-col gap-1">
            <Link
              to="/attendance/$occurrenceId"
              params={{ occurrenceId: row.original.occurrence_id }}
              className="font-medium underline-offset-4 hover:underline"
            >
              {resolveLocalizedText(row.original.title, language)?.text ?? row.original.title.ca}
            </Link>
            <span className="text-sm text-muted-foreground">{row.original.location}</span>
          </div>
        ),
      },
      {
        id: 'start',
        header: t('columnStart'),
        enableSorting: false,
        cell: ({ row }) => (
          <time dateTime={row.original.starts_at}>
            {dateFormatter.format(new Date(row.original.starts_at))}
          </time>
        ),
      },
      {
        id: 'progress',
        header: t('columnProgress'),
        enableSorting: false,
        cell: ({ row }) => (
          <span
            className="tabular-nums"
            data-testid={`attendance-progress-${row.original.occurrence_id}`}
          >
            {row.original.marked_count} / {row.original.expected_count}
          </span>
        ),
      },
      {
        id: 'status',
        header: t('columnStatus'),
        enableSorting: false,
        cell: ({ row }) => {
          const Icon = statusIcon(row.original.state);
          return (
            <Badge
              variant={row.original.state === 'complete' ? 'default' : 'outline'}
              data-testid={`attendance-status-${row.original.occurrence_id}`}
            >
              <Icon aria-hidden="true" />
              {t(statusKey(row.original.state))}
            </Badge>
          );
        },
      },
    ],
    [dateFormatter, language, t],
  );

  return (
    <section className="flex flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('overviewTitle')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('overviewSummary', { count: rows.length })}
        </p>
      </header>

      <div className="grid max-w-3xl gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('searchLabel')}</span>
          <Input
            type="search"
            value={search.q}
            placeholder={t('searchPlaceholder')}
            data-testid="attendance-search"
            onChange={(event) => applySearch({ q: event.target.value }, true)}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('filterLabel')}</span>
          <select
            value={search.status}
            data-testid="attendance-status-filter"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            onChange={(event) =>
              applySearch({ status: event.target.value as AttendanceOverviewSearch['status'] })
            }
          >
            <option value="all">{t('filterAll')}</option>
            <option value="empty">{t('stateEmpty')}</option>
            <option value="in_progress">{t('stateInProgress')}</option>
            <option value="complete">{t('stateComplete')}</option>
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <DataTable
          columns={columns}
          rows={rows}
          sorting={noSorting}
          onSortingChange={ignoreSorting}
          empty={
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-6 text-center">
              <h2 className="text-lg font-semibold">{t('emptyTitle')}</h2>
              <p className="max-w-prose text-sm text-muted-foreground">{t('emptyBody')}</p>
            </div>
          }
        />
      </div>
    </section>
  );
}
