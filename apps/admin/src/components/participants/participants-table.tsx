/**
 * The participants roster (RAPP-23).
 *
 * This file owns what is SPECIFIC to participants: which columns exist, how a
 * row reads, and what its filters are. Everything generic — how a table
 * renders, sorts, announces its sort and pages — comes from the shared
 * `DataTable` and `DataTablePager`, so the announcements, events, knowledge
 * base and attendance lists that follow inherit the same behaviour instead of
 * re-deriving it.
 *
 * Every control writes to the URL and nothing else. There is no local copy of
 * "which filters are on", so the address bar and the table cannot disagree, and
 * a filtered view is a link a staff member can send to a colleague.
 */

import { DataTable } from '@/components/data-table/data-table';
import { DataTablePager } from '@/components/data-table/data-table-pager';
import {
  DataTableEmpty,
  DataTablePanel,
  DataTableSkeleton,
} from '@/components/data-table/data-table-panel';
import { Page, PageHeader } from '@/components/layout/page';
import {
  CLEARED_PARTICIPANT_FILTERS,
  hasParticipantFilters,
  ParticipantsFilters,
} from '@/components/participants/participants-filters';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import type { ParticipantListColumns } from '@/lib/participant-list';
import { Link, useNavigate } from '@tanstack/react-router';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Ellipsis, Plus, Users } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';
import {
  dependentsShown,
  PARTICIPANT_PAGE_SIZE,
  type ParticipantFilterOptions,
  type ParticipantListRow,
  type ParticipantPage,
  type ParticipantSearch,
  type ParticipantSortColumn,
} from '@ramassa/shared/participants';
import { isLimitedToTestPlayers } from '@ramassa/shared/permissions';

export interface ParticipantsTableProps {
  readonly page: ParticipantPage;
  readonly filterOptions: ParticipantFilterOptions;
  readonly search: ParticipantSearch;
  /** The columns the feature registry reads (RAPP-664); every one when absent. */
  readonly columns?: ParticipantListColumns;
}

const ALL_COLUMNS: ParticipantListColumns = {
  nationality: true,
  city: true,
  entity: true,
  dependents: true,
};

export function ParticipantsTable({
  page,
  filterOptions,
  search,
  columns: shown = ALL_COLUMNS,
}: ParticipantsTableProps) {
  const { permissions } = useAuth();
  const { t, i18n } = useTranslation(['participants', 'common', 'referrals', 'profile']);
  const navigate = useNavigate({ from: '/participants/' });
  const locale = i18n.resolvedLanguage ?? 'ca';

  const pages = Math.max(1, Math.ceil(page.total / PARTICIPANT_PAGE_SIZE));
  const none = t('rowNone');

  const columns = useMemo<ColumnDef<ParticipantListRow, unknown>[]>(() => {
    const all: (ColumnDef<ParticipantListRow, unknown> | null)[] = [
      {
        // `accessorKey`, not a bare id: a column with no accessor is a DISPLAY
        // column, and TanStack refuses to sort those, so the header renders as
        // dead text while still announcing aria-sort. The key doubles as the
        // column id, which is the database column, so the sort state and the
        // query speak the same language with nothing translated between them.
        accessorKey: 'last_name' satisfies ParticipantSortColumn,
        header: t('columnName'),
        // The name is the LINK to her record, rather than the whole row being
        // clickable. A row-level click handler is invisible to the keyboard and
        // to a screen reader, and it fights with selecting the text in a cell,
        // which is how a staff member copies a town into an email.
        cell: ({ row }) => (
          <span className="inline-flex flex-wrap items-center gap-2">
            <Link
              to="/participants/$participantId"
              params={{ participantId: row.original.id }}
              className="font-medium underline-offset-4 hover:underline"
            >
              {`${row.original.first_name} ${row.original.last_name}`}
            </Link>
            {/* A made-up player for designing the onboarding (RAPP-615). */}
            {row.original.is_test_account ? <Badge variant="muted">{t('testBadge')}</Badge> : null}
          </span>
        ),
      },
      shown.nationality
        ? {
            accessorKey: 'nationality' satisfies ParticipantSortColumn,
            header: t('columnNationality'),
            cell: ({ row }) => row.original.nationality ?? none,
          }
        : null,
      shown.city
        ? {
            accessorKey: 'city' satisfies ParticipantSortColumn,
            header: t('columnCity'),
            cell: ({ row }) => row.original.city ?? none,
          }
        : null,
      shown.entity
        ? {
            accessorKey: 'reference_entity' satisfies ParticipantSortColumn,
            header: t('columnEntity'),
            cell: ({ row }) => row.original.reference_entity ?? none,
          }
        : null,
      {
        accessorKey: 'created_at' satisfies ParticipantSortColumn,
        header: t('columnJoined'),
        cell: ({ row }) => new Date(row.original.created_at).toLocaleDateString(locale),
      },
      shown.dependents
        ? {
            id: 'dependents',
            header: t('columnDependents'),
            // Not sortable: the roster is not ordered by how many children someone
            // has, and offering it would suggest the team works that way.
            enableSorting: false,
            // Unknown is not "none" (RAPP-611): an optional dependants question
            // she did not answer reads as not given.
            cell: ({ row }) => {
              const shown = dependentsShown(
                row.original.has_dependents,
                row.original.num_dependents,
              );
              return shown.kind === 'count'
                ? shown.count
                : shown.kind === 'unknown'
                  ? t('profile:notProvided')
                  : none;
            },
          }
        : null,
      {
        id: 'status',
        header: t('columnStatus'),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge
            variant={
              !row.original.joined ? 'muted' : row.original.is_active ? 'secondary' : 'outline'
            }
          >
            {!row.original.joined
              ? t('rowInvited')
              : row.original.is_active
                ? t('rowActive')
                : t('rowInactive')}
          </Badge>
        ),
      },
    ];
    return all.filter(
      (column): column is ColumnDef<ParticipantListRow, unknown> => column !== null,
    );
  }, [t, none, locale, shown]);

  /**
   * Any change to a filter or the sort returns to page 1. Staying on page 7
   * after narrowing to three results shows an empty table and reads as "no
   * matches", which is the most common way a filtered table lies.
   */
  const applySearch = useCallback(
    (next: Partial<ParticipantSearch>) => {
      void navigate({ search: (previous) => ({ ...previous, page: 1, ...next }) });
    },
    [navigate],
  );

  const sorting: SortingState = [{ id: search.sort, desc: search.dir === 'desc' }];
  // The onboarding design role (RAPP-615) works with test players only: no
  // queues, invitations or season view, which all hold real participants.
  const testPlayersOnly = isLimitedToTestPlayers(permissions);

  const isFiltered = hasParticipantFilters(search);
  const newAction = testPlayersOnly ? t('newTestPlayerAction') : t('newAction');
  const createParticipant = (
    <Button asChild>
      <Link to="/participants/new">
        <Plus aria-hidden data-icon="inline-start" />
        {newAction}
      </Link>
    </Button>
  );

  return (
    <Page data-testid="participants-list-page">
      <PageHeader
        title={testPlayersOnly ? t('testPlayersTitle') : t('title')}
        description={t('summary', { count: page.total })}
        actions={
          <>
            {testPlayersOnly ? null : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t('listActions')}
                    title={t('listActions')}
                  >
                    <Ellipsis aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuItem asChild>
                    <Link to="/participants/referrals">{t('referrals:staffQueueAction')}</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/participants/deletion-requests">{t('deletionRequestsTitle')}</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/participants/invites">{t('invitesAction')}</Link>
                  </DropdownMenuItem>
                  {permissions.has('participants.invite') ? (
                    <DropdownMenuItem asChild>
                      <Link to="/participants/walk-ins">{t('walkIns.action')}</Link>
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem asChild>
                    <Link to="/participants/season">{t('seasonViewAction')}</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {createParticipant}
          </>
        }
      />
      <DataTablePanel
        toolbar={
          <ParticipantsFilters
            search={search}
            filterOptions={filterOptions}
            onChange={applySearch}
            shown={shown}
          />
        }
        footer={
          <DataTablePager
            page={search.page}
            pages={pages}
            onPageChange={(next) => void navigate({ search: (prev) => ({ ...prev, page: next }) })}
          />
        }
      >
        <DataTable
          columns={columns}
          rows={page.rows}
          sorting={sorting}
          onSortingChange={(next) => {
            const [first] = next;
            if (first === undefined) return;
            applySearch({
              sort: first.id as ParticipantSortColumn,
              dir: first.desc ? 'desc' : 'asc',
            });
          }}
          empty={
            <DataTableEmpty
              icon={<Users aria-hidden className="size-5" />}
              title={isFiltered ? t('emptyTitle') : t('emptyRosterTitle')}
              actions={
                isFiltered ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => applySearch(CLEARED_PARTICIPANT_FILTERS)}
                  >
                    {t('clearFilters')}
                  </Button>
                ) : (
                  createParticipant
                )
              }
            />
          }
        />
      </DataTablePanel>
    </Page>
  );
}

/** The same list card while the route loader is pending, without a false zero count. */
export function ParticipantsTablePending() {
  const { t } = useTranslation('common');
  return (
    <Page role="status" aria-label={t('loading')}>
      <div aria-hidden className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-48 motion-reduce:animate-none" />
          <Skeleton className="h-4 w-24 motion-reduce:animate-none" />
        </div>
        <Skeleton className="h-8 w-32 motion-reduce:animate-none" />
      </div>
      <DataTablePanel
        toolbar={
          <div aria-hidden className="flex flex-col gap-4">
            <Skeleton className="h-9 w-full motion-reduce:animate-none" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-14 w-full motion-reduce:animate-none" />
              ))}
            </div>
          </div>
        }
      >
        <DataTableSkeleton />
      </DataTablePanel>
    </Page>
  );
}
