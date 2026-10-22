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
import { Page } from '@/components/layout/page';
import { ParticipantsFilters } from '@/components/participants/participants-filters';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from '@tanstack/react-router';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { useMemo } from 'react';
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
}

export function ParticipantsTable({ page, filterOptions, search }: ParticipantsTableProps) {
  const { permissions } = useAuth();
  const { t, i18n } = useTranslation(['participants', 'common', 'referrals', 'profile']);
  const navigate = useNavigate({ from: '/participants/' });
  const locale = i18n.resolvedLanguage ?? 'ca';

  const pages = Math.max(1, Math.ceil(page.total / PARTICIPANT_PAGE_SIZE));
  const none = t('rowNone');

  const columns = useMemo<ColumnDef<ParticipantListRow, unknown>[]>(
    () => [
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
      {
        accessorKey: 'nationality' satisfies ParticipantSortColumn,
        header: t('columnNationality'),
        cell: ({ row }) => row.original.nationality ?? none,
      },
      {
        accessorKey: 'city' satisfies ParticipantSortColumn,
        header: t('columnCity'),
        cell: ({ row }) => row.original.city ?? none,
      },
      {
        accessorKey: 'reference_entity' satisfies ParticipantSortColumn,
        header: t('columnEntity'),
        cell: ({ row }) => row.original.reference_entity ?? none,
      },
      {
        accessorKey: 'created_at' satisfies ParticipantSortColumn,
        header: t('columnJoined'),
        cell: ({ row }) => new Date(row.original.created_at).toLocaleDateString(locale),
      },
      {
        id: 'dependents',
        header: t('columnDependents'),
        // Not sortable: the roster is not ordered by how many children someone
        // has, and offering it would suggest the team works that way.
        enableSorting: false,
        // Unknown is not "none" (RAPP-611): an optional dependants question
        // she did not answer reads as not given.
        cell: ({ row }) => {
          const shown = dependentsShown(row.original.has_dependents, row.original.num_dependents);
          return shown.kind === 'count'
            ? shown.count
            : shown.kind === 'unknown'
              ? t('profile:notProvided')
              : none;
        },
      },
      {
        id: 'status',
        header: t('columnStatus'),
        enableSorting: false,
        cell: ({ row }) =>
          !row.original.joined
            ? t('rowInvited')
            : row.original.is_active
              ? t('rowActive')
              : t('rowInactive'),
      },
    ],
    [t, none, locale],
  );

  /**
   * Any change to a filter or the sort returns to page 1. Staying on page 7
   * after narrowing to three results shows an empty table and reads as "no
   * matches", which is the most common way a filtered table lies.
   */
  function applySearch(next: Partial<ParticipantSearch>) {
    void navigate({ search: (previous) => ({ ...previous, page: 1, ...next }) });
  }

  const sorting: SortingState = [{ id: search.sort, desc: search.dir === 'desc' }];
  // The onboarding design role (RAPP-615) works with test players only: no
  // queues, invitations or season view, which all hold real participants.
  const testPlayersOnly = isLimitedToTestPlayers(permissions);

  return (
    <Page className="gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">
            {testPlayersOnly ? t('testPlayersTitle') : t('title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('summary', { count: page.total })}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {testPlayersOnly ? null : (
            <>
              <Button asChild size="lg" variant="outline">
                <Link to="/participants/referrals">{t('referrals:staffQueueAction')}</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/participants/deletion-requests">{t('deletionRequestsTitle')}</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/participants/invites">{t('invitesAction')}</Link>
              </Button>
              {/* Walk-ins who signed on a staff tablet (RAPP-305). */}
              {permissions.has('participants.invite') ? (
                <Button asChild size="lg" variant="outline">
                  <Link to="/participants/walk-ins">{t('walkIns.action')}</Link>
                </Button>
              ) : null}
              {/* Who has re-registered for the current season (RAPP-306). */}
              <Button asChild size="lg" variant="outline">
                <Link to="/participants/season">{t('seasonViewAction')}</Link>
              </Button>
            </>
          )}
          <Button asChild size="lg">
            <Link to="/participants/new">
              {testPlayersOnly ? t('newTestPlayerAction') : t('newAction')}
            </Link>
          </Button>
        </div>
      </header>

      <ParticipantsFilters search={search} filterOptions={filterOptions} onChange={applySearch} />

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
          // An empty state that says what to DO. "No results" alone leaves a
          // staff member wondering whether the roster is empty or her filters
          // are wrong, and those need different reactions.
          <div className="flex flex-col items-start gap-3 rounded-md border border-dashed p-8">
            <p className="font-medium">{t('emptyTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('emptyBody')}</p>
            <Button
              variant="outline"
              onClick={() =>
                void navigate({
                  search: () => ({
                    q: '',
                    entity: null,
                    nationality: null,
                    status: 'all' as const,
                    dependents: 'all' as const,
                    sort: search.sort,
                    dir: search.dir,
                    page: 1,
                  }),
                })
              }
            >
              {t('clearFilters')}
            </Button>
          </div>
        }
      />

      <DataTablePager
        page={search.page}
        pages={pages}
        onPageChange={(next) => void navigate({ search: (prev) => ({ ...prev, page: next }) })}
      />
    </Page>
  );
}
